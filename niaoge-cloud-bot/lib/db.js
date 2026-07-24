/**
 * SQLite 数据库层 - 使用 sql.js (纯JS/WebAssembly, 无需编译)
 */
import initSqlJs from "sql.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, unlinkSync, statSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, "..", "data");
const DB_PATH = join(DB_DIR, "cloud-bot.db");
const BACKUP_DIR = join(DB_DIR, "backups");
const FULL_BACKUP_DIR = join(BACKUP_DIR, "_full");           // 全库备份（兜底，含 users/sessions 等公共表）
const MAX_BACKUPS = 20;                                       // 全库备份保留份数
const MAX_BACKUPS_PER_USER = 10;                              // 每用户备份保留份数
// 按用户备份的业务表清单（这些表都有 user_key 字段）
const PER_USER_TABLES = ["accounts", "task_schedules", "task_templates", "user_settings", "task_logs"];

// 确保 data 目录存在
if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

let db = null;        // sql.js Database 实例 (异步初始化)
let dbReady = false;
let dbReadyPromise = null;
let SQLModule = null;  // sql.js 模块（initDatabase 后保存，供按用户备份创建新 Database 用）

/**
 * 初始化数据库（异步，因为 sql.js 需要加载 WASM）
 */
export async function initDatabase() {
  if (dbReady) return db;
  if (dbReadyPromise) return dbReadyPromise;

  dbReadyPromise = (async () => {
    const SQL = await initSqlJs();
    SQLModule = SQL; // 保存供 backupUserDatabase 创建新 Database 用

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
        schedule_type TEXT DEFAULT 'cron',
        fixed_time TEXT DEFAULT '',
        cron_expression TEXT NOT NULL,
        task_list TEXT NOT NULL,
        account_ids TEXT DEFAULT '*',
        max_active INTEGER DEFAULT 2,
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
      if (!colNames.includes('role_name')) {
        db.run("ALTER TABLE accounts ADD COLUMN role_name TEXT DEFAULT ''");
      }
    }

    // ======== 数据修复：为老账号补 role_name ========
    try {
      const rows = queryAll("SELECT id, name, role_name FROM accounts WHERE role_name = '' OR role_name IS NULL");
      for (const row of rows) {
        const name = row.name || '';
        if (!name.includes('-')) continue;
        // 按最后一个 '-' 分割，前面作为角色名，后面作为区服
        const parts = name.split('-');
        const roleName = parts.slice(0, -1).join('-');
        if (roleName) {
          db.run("UPDATE accounts SET role_name = ? WHERE id = ?", [roleName, row.id]);
        }
      }
    } catch {}

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

    // ======== 数据库迁移：为 task_schedules 添加新字段 ========
    const scheduleCols = queryAll("PRAGMA table_info(task_schedules)");
    if (scheduleCols.length) {
      const colNames = scheduleCols.map(c => c.name);
      if (!colNames.includes('schedule_type')) {
        db.run("ALTER TABLE task_schedules ADD COLUMN schedule_type TEXT DEFAULT 'cron'");
      }
      if (!colNames.includes('fixed_time')) {
        db.run("ALTER TABLE task_schedules ADD COLUMN fixed_time TEXT DEFAULT ''");
      }
      if (!colNames.includes('max_active')) {
        db.run("ALTER TABLE task_schedules ADD COLUMN max_active INTEGER DEFAULT 2");
      }
    }

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
 * 清理旧的全库备份，只保留最近 MAX_BACKUPS 份
 * 兼容旧版：迁移 BACKUP_DIR 根目录下的旧 cloud-bot.db.*.db 到 _full/
 */
function cleanupOldBackups() {
  try {
    if (!existsSync(FULL_BACKUP_DIR)) mkdirSync(FULL_BACKUP_DIR, { recursive: true });

    // 迁移旧版备份（BACKUP_DIR 根目录下的 cloud-bot.db.*.db）到 _full/
    // 兼容性逻辑：确保升级后旧备份不丢失
    try {
      const legacyFiles = readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith("cloud-bot.db.") && f.endsWith(".db"));
      for (const f of legacyFiles) {
        const src = join(BACKUP_DIR, f);
        const dst = join(FULL_BACKUP_DIR, f);
        if (!existsSync(dst)) copyFileSync(src, dst);
        unlinkSync(src);
      }
    } catch {}

    // 清理 _full/ 下过期的全库备份
    const files = readdirSync(FULL_BACKUP_DIR)
      .filter(f => f.startsWith("cloud-bot.db.") && f.endsWith(".db"))
      .map(f => ({ name: f, time: statSync(join(FULL_BACKUP_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);
    for (let i = MAX_BACKUPS; i < files.length; i++) {
      unlinkSync(join(FULL_BACKUP_DIR, files[i].name));
    }
  } catch (e) {
    console.error("[DB] 清理旧备份失败:", e.message);
  }
}

/**
 * 清理某用户目录下过期的备份，只保留最近 MAX_BACKUPS_PER_USER 份
 * @param {string} userDir 用户备份目录绝对路径
 * @param {string} prefix 备份文件名前缀（通常是 user_key）
 */
function cleanupOldUserBackups(userDir, prefix) {
  try {
    if (!existsSync(userDir)) return;
    const files = readdirSync(userDir)
      .filter(f => f.startsWith(prefix + ".") && f.endsWith(".db"))
      .map(f => ({ name: f, time: statSync(join(userDir, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);
    for (let i = MAX_BACKUPS_PER_USER; i < files.length; i++) {
      unlinkSync(join(userDir, files[i].name));
    }
  } catch (e) {
    console.error(`[DB] 清理用户 ${prefix} 旧备份失败:`, e.message);
  }
}

/**
 * 为单个用户创建业务数据快照（不含 users/sessions 等公共表）
 * 方案1：users 表只进全库备份，不按用户拆分；业务表按 user_key 导出
 * @param {string} userKey 用户标识
 * @param {string} timestamp ISO 时间戳字符串（已替换非法字符）
 */
function backupUserDatabase(userKey, timestamp) {
  if (!db || !SQLModule || !userKey) return;
  try {
    const userDb = new SQLModule.Database();

    // 建空表（schema 与主库一致）
    userDb.run(`CREATE TABLE accounts (id TEXT PRIMARY KEY, user_key TEXT, name TEXT, token TEXT, ws_url TEXT, bin_base64 TEXT, platform TEXT, server_id TEXT, platform_ext TEXT, role_id TEXT, role_name TEXT, level INTEGER, enabled INTEGER, connected INTEGER, last_login TEXT, settings TEXT, import_method TEXT, source_url TEXT, upgraded_to_permanent INTEGER, upgraded_at TEXT, created_at TEXT, updated_at TEXT)`);
    userDb.run(`CREATE TABLE task_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_key TEXT, name TEXT, cron TEXT, enabled INTEGER, account_ids TEXT, operation TEXT, config TEXT, concurrency INTEGER, created_at TEXT)`);
    userDb.run(`CREATE TABLE task_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, user_key TEXT, name TEXT, content TEXT, created_at TEXT)`);
    userDb.run(`CREATE TABLE user_settings (user_key TEXT, setting_key TEXT, setting_value TEXT, PRIMARY KEY (user_key, setting_key))`);
    userDb.run(`CREATE TABLE task_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_key TEXT, account_id TEXT, account_name TEXT, task_type TEXT, message TEXT, level TEXT, created_at TEXT)`);

    // 从主库导出该用户的数据到用户库
    for (const table of PER_USER_TABLES) {
      try {
        const rows = queryAll(`SELECT * FROM ${table} WHERE user_key = ?`, [userKey]);
        for (const row of rows) {
          const cols = Object.keys(row);
          const placeholders = cols.map(() => "?").join(",");
          const values = cols.map(c => row[c]);
          try {
            userDb.run(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`, values);
          } catch {}
        }
      } catch (e) {
        console.error(`[DB] 导出用户 ${userKey} 表 ${table} 失败:`, e.message);
      }
    }

    // 写入用户备份目录
    const userDir = join(BACKUP_DIR, userKey.replace(/[\\/:*?"<>|]/g, "_")); // 防非法字符
    if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });
    const userBackupPath = join(userDir, `${userKey.replace(/[\\/:*?"<>|]/g, "_")}.${timestamp}.db`);
    const data = userDb.export();
    writeFileSync(userBackupPath, Buffer.from(data));
    cleanupOldUserBackups(userDir, userKey.replace(/[\\/:*?"<>|]/g, "_"));
    userDb.close();
  } catch (e) {
    console.error(`[DB] 备份用户 ${userKey} 数据失败:`, e.message);
  }
}

/**
 * 创建数据库历史快照（全库 + 按用户）
 * - 全库快照：到 backups/_full/，含所有表（含 users/sessions 等公共表），兜底用
 * - 按用户快照：到 backups/{user_key}/，仅含业务表，用于单用户精细还原
 */
function backupDatabase() {
  try {
    if (!existsSync(FULL_BACKUP_DIR)) mkdirSync(FULL_BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    // 1. 全库备份（兜底）
    const fullPath = join(FULL_BACKUP_DIR, `cloud-bot.db.${timestamp}.db`);
    copyFileSync(DB_PATH, fullPath);
    cleanupOldBackups();

    // 2. 按用户备份（精细还原）
    const users = queryAll("SELECT user_key FROM users");
    for (const u of users) {
      backupUserDatabase(u.user_key, timestamp);
    }
    // 兼容：accounts 里可能有 user_key 不在 users 表的脏数据，也备份一份
    const orphanUsers = queryAll("SELECT DISTINCT user_key FROM accounts WHERE user_key NOT IN (SELECT user_key FROM users)");
    for (const u of orphanUsers) {
      backupUserDatabase(u.user_key, timestamp);
    }
  } catch (e) {
    console.error("[DB] 备份数据库失败:", e.message);
  }
}

/**
 * 将数据库写入磁盘（sql.js 是内存数据库，需要手动保存）
 * 备份降频：每 5 分钟最多一次全量备份，避免批量任务期间同步IO阻塞事件循环
 */
let lastBackupTime = 0;
const BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5分钟

function saveToDisk() {
  if (!db) return;
  try {
    const data = db.export();
    const buf = Buffer.from(data);
    writeFileSync(DB_PATH, buf);
    // 备份降频：只在距上次备份超过 5 分钟时才执行
    const now = Date.now();
    if (now - lastBackupTime >= BACKUP_INTERVAL_MS) {
      lastBackupTime = now;
      backupDatabase();
    }
  } catch (e) {
    console.error("保存数据库失败:", e.message);
  }
}

/**
 * 自动保存（每次写操作后延迟保存，减少 IO）
 * 防抖 + 最大等待：2秒内无新操作则保存，但最多10秒一定保存一次
 * 避免批量任务期间持续写操作导致 saveToDisk 永远不执行
 */
let saveTimer = null;
let maxWaitTimer = null;
function autoSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (maxWaitTimer) { clearTimeout(maxWaitTimer); maxWaitTimer = null; }
    saveToDisk();
  }, 2000);
  if (!maxWaitTimer) {
    maxWaitTimer = setTimeout(() => {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      saveToDisk();
      maxWaitTimer = null;
    }, 10000);
  }
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
  // 走防抖保存（2秒内合并多次写入），避免批量任务期间频繁同步IO阻塞事件循环
  autoSave();
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
    // roleInfo 可能直接是 role 对象，也可能是 { role: {...} }
    const role = roleInfo.role || roleInfo;
    data.role_id = roleInfo.roleId || roleInfo.id || role.roleId || role.id || '';
    data.role_name = roleInfo.name || roleInfo.roleName || role.name || role.roleName || '';
    data.level = roleInfo.level || role.level || 0;
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
  const scheduleType = data.scheduleType || 'cron';
  const fixedTime = data.fixedTime || '';
  const maxActive = data.maxActive ?? 2;
  if (data.id) {
    exec(`INSERT OR REPLACE INTO task_schedules (id, user_key, name, schedule_type, fixed_time, cron_expression, task_list, account_ids, max_active, enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
      [data.id, data.userKey || 'default', data.name, scheduleType, fixedTime, data.cronExpression,
       JSON.stringify(data.taskList), data.accountIds || '*', maxActive, data.enabled ?? 1]);
    return { lastInsertRowid: data.id };
  }
  const id = execGetId(`INSERT INTO task_schedules (user_key, name, schedule_type, fixed_time, cron_expression, task_list, account_ids, max_active, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
    [data.userKey || 'default', data.name, scheduleType, fixedTime, data.cronExpression,
     JSON.stringify(data.taskList), data.accountIds || '*', maxActive, data.enabled ?? 1]);
  return { lastInsertRowid: id };
}

export function updateSchedule(id, data, userKey) {
  const map = {
    cronExpression: "cron_expression",
    scheduleType: "schedule_type",
    fixedTime: "fixed_time",
    taskList: "task_list",
    accountIds: "account_ids",
    maxActive: "max_active",
  };
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
