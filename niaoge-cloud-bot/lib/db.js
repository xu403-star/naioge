/**
 * SQLite 数据库层 - 使用 sql.js (纯JS/WebAssembly, 无需编译)
 */
import initSqlJs from "sql.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, "..", "data");
const DB_PATH = join(DB_DIR, "cloud-bot.db");

// 确保 data 目录存在
if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

let db = null;        // sql.js Database 实例 (异步初始化)
let dbReady = false;
let dbReadyPromise = null;

/**
 * 初始化数据库（异步，因为 sql.js 需要加载 WASM）
 */
export async function initDatabase() {
  if (dbReady) return db;
  if (dbReadyPromise) return dbReadyPromise;

  dbReadyPromise = (async () => {
    const SQL = await initSqlJs();

    // 如果已有数据库文件，加载它；否则创建新数据库
    if (existsSync(DB_PATH)) {
      const buf = readFileSync(DB_PATH);
      db = new SQL.Database(buf);
    } else {
      db = new SQL.Database();
    }

    // 建表
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA foreign_keys = ON");

    // ======== 用户表 ========
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        user_key TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        name TEXT DEFAULT '',
        max_accounts INTEGER DEFAULT 10,
        expiry TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);

    // ======== 账号表 ========
    db.run(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        user_key TEXT DEFAULT 'default',
        name TEXT NOT NULL,
        token TEXT NOT NULL,
        ws_url TEXT DEFAULT '',
        bin_base64 TEXT,
        platform TEXT DEFAULT 'hortor',
        server_id TEXT DEFAULT '',
        platform_ext TEXT DEFAULT 'mix',
        role_id TEXT DEFAULT '',
        role_name TEXT DEFAULT '',
        level INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        connected INTEGER DEFAULT 0,
        last_login TEXT,
        settings TEXT DEFAULT '{}',
        import_method TEXT DEFAULT 'manual',
        source_url TEXT DEFAULT '',
        upgraded_to_permanent INTEGER DEFAULT 0,
        upgraded_at TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);

    // ======== 定时任务表 ========
    db.run(`
      CREATE TABLE IF NOT EXISTS task_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_key TEXT DEFAULT 'default',
        name TEXT NOT NULL,
        cron_expression TEXT NOT NULL,
        task_list TEXT NOT NULL,
        account_ids TEXT DEFAULT '*',
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);

    // ======== 日志表 ========
    db.run(`
      CREATE TABLE IF NOT EXISTS task_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_key TEXT DEFAULT 'default',
        account_id TEXT,
        account_name TEXT,
        task_name TEXT,
        status TEXT,
        message TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);

    // ======== 任务模板表 ========
    db.run(`
      CREATE TABLE IF NOT EXISTS task_templates (
        id TEXT PRIMARY KEY,
        user_key TEXT DEFAULT 'default',
        name TEXT NOT NULL,
        settings TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);

    // ======== 用户级 KV 设置表 ========
    db.run(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_key TEXT NOT NULL,
        setting_key TEXT NOT NULL,
        value TEXT DEFAULT '{}',
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        PRIMARY KEY (user_key, setting_key)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_key TEXT NOT NULL,
        name TEXT DEFAULT '',
        max_accounts INTEGER DEFAULT 10,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);

    // ======== 数据库迁移：为旧表添加缺失字段 ========
    const accountsCols = queryAll("PRAGMA table_info(accounts)");
    if (accountsCols.length) {
      const colNames = accountsCols.map(c => c.name);
      if (!colNames.includes('user_key')) {
        db.run("ALTER TABLE accounts ADD COLUMN user_key TEXT DEFAULT 'default'");
      }
      if (!colNames.includes('import_method')) {
        db.run("ALTER TABLE accounts ADD COLUMN import_method TEXT DEFAULT 'manual'");
      }
      if (!colNames.includes('source_url')) {
        db.run("ALTER TABLE accounts ADD COLUMN source_url TEXT DEFAULT ''");
      }
      if (!colNames.includes('upgraded_to_permanent')) {
        db.run("ALTER TABLE accounts ADD COLUMN upgraded_to_permanent INTEGER DEFAULT 0");
      }
      if (!colNames.includes('upgraded_at')) {
        db.run("ALTER TABLE accounts ADD COLUMN upgraded_at TEXT");
      }
    }

    // ======== 数据库迁移：为其他旧表添加 user_key 字段 ========
    const migrateUserKey = (tableName) => {
      try {
        const cols = queryAll(`PRAGMA table_info(${tableName})`);
        if (cols.length && !cols.find(c => c.name === 'user_key')) {
          db.run(`ALTER TABLE ${tableName} ADD COLUMN user_key TEXT DEFAULT 'default'`);
        }
      } catch {}
    };
    migrateUserKey('task_schedules');
    migrateUserKey('task_logs');
    migrateUserKey('task_templates');
    migrateUserKey('user_settings');

    // 创建默认管理员（如果不存在）
    const adminExists = queryOne("SELECT * FROM users WHERE user_key = 'admin'");
    if (!adminExists) {
      exec("INSERT INTO users (user_key, password, name, max_accounts) VALUES ('admin', 'admin123', '管理员', 0)");
      console.log("[DB] 已创建默认管理员: admin / admin123");
    }

    // 迁移旧数据：把 user_key='default' 的数据归属到 admin
    const defaultAccounts = queryAll("SELECT COUNT(*) as cnt FROM accounts WHERE user_key = 'default'");
    if (defaultAccounts.length && defaultAccounts[0].cnt > 0) {
      db.run("UPDATE accounts SET user_key = 'admin' WHERE user_key = 'default'");
      db.run("UPDATE task_schedules SET user_key = 'admin' WHERE user_key = 'default'");
      db.run("UPDATE task_logs SET user_key = 'admin' WHERE user_key = 'default'");
      db.run("UPDATE task_templates SET user_key = 'admin' WHERE user_key = 'default'");
      console.log("[DB] 已迁移 default 数据到 admin");
    }

    // 管理员配额改为 0（表示无限）
    const adminUser = queryOne("SELECT * FROM users WHERE user_key = 'admin'");
    if (adminUser && adminUser.max_accounts !== 0) {
      db.run("UPDATE users SET max_accounts = 0 WHERE user_key = 'admin'");
    }

    saveToDisk(); // 初次写入
    dbReady = true;
    return db;
  })();

  return dbReadyPromise;
}

/**
 * 将数据库写入磁盘（sql.js 是内存数据库，需要手动保存）
 */
function saveToDisk() {
  if (!db) return;
  try {
    const data = db.export();
    const buf = Buffer.from(data);
    writeFileSync(DB_PATH, buf);
  } catch (e) {
    console.error("保存数据库失败:", e.message);
  }
}

/**
 * 自动保存（每次写操作后延迟保存，减少 IO）
 */
let saveTimer = null;
function autoSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToDisk, 2000);
}

// ======== 辅助：sql.js 查询结果转换 ========

export function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length ? rows[0] : null;
}

export function exec(sql, params = []) {
  db.run(sql, params);
  autoSave();
}

export function execGetId(sql, params = []) {
  db.run(sql, params);
  autoSave();
  const result = db.exec("SELECT last_insert_rowid() as id");
  return result.length ? result[0].values[0][0] : null;
}

export function getDb() {
  return db;
}

// ======== 账号操作 ========

export function getAllAccounts(userKey) {
  if (userKey) {
    return queryAll("SELECT * FROM accounts WHERE user_key = ? ORDER BY name", [userKey]);
  }
  return queryAll("SELECT * FROM accounts ORDER BY name");
}

export function getAccount(id, userKey) {
  if (userKey) {
    return queryOne("SELECT * FROM accounts WHERE id = ? AND user_key = ?", [id, userKey]);
  }
  return queryOne("SELECT * FROM accounts WHERE id = ?", [id]);
}

export function addAccount(data) {
  const existing = getAccount(data.id);
  if (existing) {
    // 更新：保留原有字段，除非显式传入新值
    const updates = {
      name: data.name,
      token: data.token,
      ws_url: data.wsUrl || '',
      bin_base64: data.binBase64 || existing.bin_base64 || '',
      platform: data.platform || existing.platform || 'hortor',
      server_id: data.serverId || existing.server_id || '',
      platform_ext: data.platformExt || existing.platform_ext || 'mix',
      enabled: data.enabled ?? existing.enabled ?? 1,
      role_id: data.role_id || existing.role_id || '',
      role_name: data.role_name || existing.role_name || '',
      level: data.level || existing.level || 0,
      user_key: data.userKey || existing.user_key || 'default',
      import_method: data.importMethod || existing.import_method || 'manual',
      source_url: data.sourceUrl || existing.source_url || '',
      upgraded_to_permanent: data.upgradedToPermanent ?? existing.upgraded_to_permanent ?? 0,
      upgraded_at: data.upgradedAt || existing.upgraded_at || null,
    };
    const fields = [];
    const values = [];
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) {
        fields.push(`${k} = ?`);
        values.push(v);
      }
    }
    fields.push("updated_at = datetime('now','localtime')");
    values.push(data.id);
    exec(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`, values);
    return { changes: 1 };
  }
  exec(`INSERT INTO accounts (id, user_key, name, token, ws_url, bin_base64, platform, server_id, platform_ext, enabled, import_method, source_url, upgraded_to_permanent, upgraded_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
    [data.id, data.userKey || 'default', data.name, data.token, data.wsUrl || '', data.binBase64 || '',
     data.platform || 'hortor', data.serverId || '', data.platformExt || 'mix', data.enabled ?? 1,
     data.importMethod || 'manual', data.sourceUrl || '', data.upgradedToPermanent ?? 0,
     data.upgradedAt || null]);
  return { changes: 1 };
}

export function updateAccount(id, data, userKey) {
  const fields = [];
  const values = [];
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      fields.push(`${k} = ?`);
      values.push(v);
    }
  }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now','localtime')");
  values.push(id);
  if (userKey) {
    values.push(userKey);
    exec(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ? AND user_key = ?`, values);
  } else {
    exec(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`, values);
  }
  // 立即写入磁盘（关键数据的更新需要即时持久化）
  saveToDisk();
}

export function removeAccount(id, userKey) {
  if (userKey) {
    exec("DELETE FROM accounts WHERE id = ? AND user_key = ?", [id, userKey]);
  } else {
    exec("DELETE FROM accounts WHERE id = ?", [id]);
  }
}

export function updateAccountConnection(id, connected, roleInfo, userKey) {
  const data = { connected: connected ? 1 : 0, last_login: new Date().toISOString() };
  if (roleInfo) {
    data.role_id = roleInfo.roleId || roleInfo.id || '';
    data.role_name = roleInfo.name || roleInfo.roleName || '';
    data.level = roleInfo.level || 0;
  }
  updateAccount(id, data, userKey);
}

/**
 * 获取账号 settings 字段（JSON 合并）
 */
export function getAccountSettings(id, userKey) {
  const account = getAccount(id, userKey);
  if (!account || !account.settings) return {};
  try {
    return JSON.parse(account.settings);
  } catch {
    return {};
  }
}

/**
 * 合并更新账号 settings 字段（JSON 合并，不覆盖其他字段）
 */
export function saveAccountSettings(id, settingsPatch, userKey) {
  const existing = getAccountSettings(id, userKey);
  const next = { ...existing, ...settingsPatch };
  updateAccount(id, { settings: JSON.stringify(next) }, userKey);
}

// ======== Token 过期清理 ========

/**
 * 清理手动导入且超过24小时未使用、未升级为永久的 token
 * @returns {number} 清理的账号数量
 */
export function cleanExpiredTokens() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = queryAll(
    `SELECT id FROM accounts
     WHERE import_method = 'manual'
       AND upgraded_to_permanent = 0
       AND COALESCE(last_login, created_at) < ?`,
    [oneDayAgo]
  );
  for (const row of rows) {
    removeAccount(row.id);
  }
  return rows.length;
}

/**
 * 将手动导入的 token 升级为长期有效
 */
export function upgradeTokenToPermanent(id, userKey) {
  const account = getAccount(id, userKey);
  if (!account) return false;
  if (account.import_method === 'bin' || account.import_method === 'url') return false;
  if (account.upgraded_to_permanent) return false;
  updateAccount(id, { upgraded_to_permanent: 1, upgraded_at: new Date().toISOString() }, userKey);
  return true;
}

// ======== 任务调度配置 ========

export function getAllSchedules(userKey) {
  if (userKey) {
    return queryAll("SELECT * FROM task_schedules WHERE user_key = ? ORDER BY id", [userKey]);
  }
  return queryAll("SELECT * FROM task_schedules ORDER BY id");
}

export function getEnabledSchedules(userKey) {
  if (userKey) {
    return queryAll("SELECT * FROM task_schedules WHERE user_key = ? AND enabled = 1", [userKey]);
  }
  return queryAll("SELECT * FROM task_schedules WHERE enabled = 1");
}

export function addSchedule(data) {
  if (data.id) {
    exec(`INSERT OR REPLACE INTO task_schedules (id, user_key, name, cron_expression, task_list, account_ids, enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
      [data.id, data.userKey || 'default', data.name, data.cronExpression, JSON.stringify(data.taskList),
       data.accountIds || '*', data.enabled ?? 1]);
    return { lastInsertRowid: data.id };
  }
  const id = execGetId(`INSERT INTO task_schedules (user_key, name, cron_expression, task_list, account_ids, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
    [data.userKey || 'default', data.name, data.cronExpression, JSON.stringify(data.taskList),
     data.accountIds || '*', data.enabled ?? 1]);
  return { lastInsertRowid: id };
}

export function updateSchedule(id, data, userKey) {
  const map = { cronExpression: "cron_expression", taskList: "task_list", accountIds: "account_ids" };
  const fields = [];
  const values = [];
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      const col = map[k] || k;
      fields.push(`${col} = ?`);
      values.push(k === "taskList" ? JSON.stringify(v) : v);
    }
  }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now','localtime')");
  values.push(id);
  if (userKey) {
    values.push(userKey);
    exec(`UPDATE task_schedules SET ${fields.join(', ')} WHERE id = ? AND user_key = ?`, values);
  } else {
    exec(`UPDATE task_schedules SET ${fields.join(', ')} WHERE id = ?`, values);
  }
}

export function removeSchedule(id, userKey) {
  if (userKey) {
    exec("DELETE FROM task_schedules WHERE id = ? AND user_key = ?", [id, userKey]);
  } else {
    exec("DELETE FROM task_schedules WHERE id = ?", [id]);
  }
}

// ======== 日志 ========

export function addLog(accountId, accountName, taskName, status, message, userKey) {
  exec("INSERT INTO task_logs (user_key, account_id, account_name, task_name, status, message) VALUES (?, ?, ?, ?, ?, ?)",
    [userKey || 'default', accountId, accountName, taskName, status, message]);
}

export function getRecentLogs(limit = 100, userKey) {
  if (userKey) {
    return queryAll("SELECT * FROM task_logs WHERE user_key = ? ORDER BY id DESC LIMIT ?", [userKey, limit]);
  }
  return queryAll("SELECT * FROM task_logs ORDER BY id DESC LIMIT ?", [limit]);
}

export function clearOldLogs(days = 7, userKey) {
  if (userKey) {
    exec(`DELETE FROM task_logs WHERE created_at < datetime('now','localtime', '-${days} days') AND user_key = ?`, [userKey]);
  } else {
    exec(`DELETE FROM task_logs WHERE created_at < datetime('now','localtime', '-${days} days')`);
  }
}

// ======== 任务模板 ========

export function getAllTemplates(userKey) {
  if (userKey) {
    return queryAll("SELECT * FROM task_templates WHERE user_key = ? ORDER BY created_at DESC", [userKey]);
  }
  return queryAll("SELECT * FROM task_templates ORDER BY created_at DESC");
}

export function addTemplate(id, userKey, name, settings) {
  exec(`INSERT OR REPLACE INTO task_templates (id, user_key, name, settings, created_at)
    VALUES (?, ?, ?, ?, datetime('now','localtime'))`,
    [id, userKey || 'default', name, typeof settings === 'string' ? settings : JSON.stringify(settings || {})]);
  return { lastInsertRowid: id };
}

export function deleteTemplate(id, userKey) {
  if (userKey) {
    exec("DELETE FROM task_templates WHERE id = ? AND user_key = ?", [id, userKey]);
  } else {
    exec("DELETE FROM task_templates WHERE id = ?", [id]);
  }
}

// ======== 用户级 KV 设置 ========

export function getUserSetting(userKey, settingKey) {
  const row = queryOne("SELECT value FROM user_settings WHERE user_key = ? AND setting_key = ?", [userKey || 'default', settingKey]);
  if (!row || !row.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

export function setUserSetting(userKey, settingKey, value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value || {});
  exec(`INSERT OR REPLACE INTO user_settings (user_key, setting_key, value, updated_at)
    VALUES (?, ?, ?, datetime('now','localtime'))`,
    [userKey || 'default', settingKey, json]);
}

/**
 * 关闭数据库（保存并释放）
 */
export function closeDatabase() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  saveToDisk();
  if (db) { db.close(); db = null; dbReady = false; dbReadyPromise = null; }
}

export default { initDatabase, closeDatabase };
