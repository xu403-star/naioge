/**
 * 鸟哥之王云端挂机 - 主服务入口
 */
// 全局错误处理，防止未捕获异常导致进程崩溃
process.on("uncaughtException", (err) => {
  console.error("[FATAL] 未捕获异常:", err.message);
  console.error(err.stack);
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] 未处理的Promise拒绝:", reason);
});

import express from "express";
import cors from "cors";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import fileUpload from "express-fileupload";

import * as db from "./lib/db.js";
import { ConnectionPool } from "./lib/connectionPool.js";
import { TaskRunner } from "./lib/taskRunner.js";
import { Scheduler } from "./lib/scheduler.js";
import { BatchEngine, executeBatchOperation } from "./lib/batchEngine.js";
import accountsRouter, { setPool as setAccountsPool } from "./api/accounts.js";
import tasksRouter, { setScheduler as setTasksScheduler } from "./api/tasks.js";
import portalRouter from "./api/portal.js";
import * as portalDb from "./lib/portalDb.js";
import { authMiddleware, login, logout, getSession, createUser, listUsers, deleteUser, verifyToken } from "./lib/auth.js";
import { getDreamShopLogPath, DREAM_SHOP_LOG_DIR } from "./lib/batch/tasksDungeon.js";

// 批量模块
import { ClubTasks } from "./lib/batch/tasksClub.js";
import { DungeonTasks } from "./lib/batch/tasksDungeon.js";
import { TowerTasks } from "./lib/batch/tasksTower.js";
import { ItemTasks } from "./lib/batch/tasksItem.js";
import { CarTasks } from "./lib/batch/tasksCar.js";
import { LegacyTasks } from "./lib/batch/tasksLegacy.js";
import { MonthlyTasks } from "./lib/batch/tasksMonthly.js";
import { StoreTasks } from "./lib/batch/tasksStore.js";
import { HangupTasks } from "./lib/batch/tasksHangup.js";
import { BottleTasks } from "./lib/batch/tasksBottle.js";
import { ArenaTasks } from "./lib/batch/tasksArena.js";

// 游戏功能查询模块
import { GameStatus } from "./lib/game/gameStatus.js";
import { ClubInfo } from "./lib/game/clubInfo.js";
import { Rankings } from "./lib/game/rankings.js";
import { Activity } from "./lib/game/activity.js";
import { SaltField } from "./lib/game/saltField.js";
import { Pvp } from "./lib/game/pvp.js";
import { GameTools } from "./lib/game/tools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3456;

// ======== 初始化核心组件 ========
const pool = new ConnectionPool();
setAccountsPool(pool);
const taskRunner = new TaskRunner(pool);
const scheduler = new Scheduler(pool, taskRunner);
setTasksScheduler(scheduler);

// 批量模块实例
const batchModules = {
  club: new ClubTasks(pool),
  dungeon: new DungeonTasks(pool),
  tower: new TowerTasks(pool),
  item: new ItemTasks(pool),
  car: new CarTasks(pool),
  legacy: new LegacyTasks(pool),
  monthly: new MonthlyTasks(pool),
  store: new StoreTasks(pool),
  hangup: new HangupTasks(pool),
  bottle: new BottleTasks(pool),
  arena: new ArenaTasks(pool),
};

// 统一批量任务引擎（labelMap 在文件下方定义）
const batchEngine = new BatchEngine(batchModules, { maxConcurrency: 2, pool });

// 定时清理已完成的运行记录，防止内存泄漏
setInterval(() => batchEngine.cleanup(), 10 * 60 * 1000);

// 游戏功能查询模块实例
const gameModules = {
  status: new GameStatus(pool),
  club: new ClubInfo(pool),
  rankings: new Rankings(pool),
  activity: new Activity(pool),
  saltField: new SaltField(pool),
  pvp: new Pvp(pool),
  tools: new GameTools(pool),
};

// 日志回调
const logBuffer = []; // 保留最近200条日志
const MAX_LOG = 200;

function addLog(entry) {
  let time = entry.time;
  // 兼容传入的不是 ISO 格式的情况（如 toLocaleTimeString()）
  if (!time || isNaN(new Date(time).getTime())) {
    time = new Date().toISOString();
  }
  const normalized = {
    time,
    level: entry.level || entry.type || "info",
    message: entry.message,
    accountId: entry.accountId || null,
  };
  logBuffer.push(normalized);
  if (logBuffer.length > MAX_LOG) logBuffer.shift();
  console.log(`[${normalized.level.toUpperCase()}] ${normalized.message}`);
}

pool.setLogCallback(addLog);
scheduler.setLogCallback(addLog);

// ======== Express 初始化 ========
const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(authMiddleware);
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(fileUpload({
  createParentPath: true,
  limits: { fileSize: 50 * 1024 * 1024 },
}));

// ======== 认证 API ========
app.post("/api/auth/login", async (req, res) => {
  try {
    const { userKey, password } = req.body;
    if (!userKey || !password) return res.status(400).json({ error: "请输入用户名和密码" });
    const result = login(userKey, password);
    res.json(result);
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.headers.authorization?.slice(7);
  logout(token);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const token = req.headers.authorization?.slice(7);
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: "未登录" });
  res.json({ userKey: session.userKey, name: session.name, maxAccounts: session.maxAccounts });
});

// 修改自己的密码
app.put("/api/auth/password", (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: "请输入旧密码和新密码" });
    const user = db.queryOne("SELECT * FROM users WHERE user_key = ? AND password = ?", [req.userKey, oldPassword]);
    if (!user) return res.status(400).json({ error: "旧密码错误" });
    if (newPassword.length < 6) return res.status(400).json({ error: "新密码至少6位" });
    db.exec("UPDATE users SET password = ? WHERE user_key = ?", [newPassword, req.userKey]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 管理员：修改用户信息（含 user_key 和密码）
app.put("/api/auth/users/:userKey", (req, res) => {
  try {
    const token = req.headers.authorization?.slice(7);
    const admin = verifyToken(token);
    if (!admin || admin.userKey !== 'admin') return res.status(403).json({ error: "无权限" });
    const { newUserKey, password, name, maxAccounts, expiry, enabled } = req.body;
    const oldKey = req.params.userKey;
    const user = db.queryOne("SELECT * FROM users WHERE user_key = ?", [oldKey]);
    if (!user) return res.status(404).json({ error: "用户不存在" });

    // 如果改了 user_key，检查新 key 是否冲突
    if (newUserKey && newUserKey !== oldKey) {
      const exists = db.queryOne("SELECT * FROM users WHERE user_key = ?", [newUserKey]);
      if (exists) return res.status(400).json({ error: "新用户名已存在" });
    }

    // 更新 users 表
    const updates = [];
    const params = [];
    if (newUserKey && newUserKey !== oldKey) { updates.push("user_key = ?"); params.push(newUserKey); }
    if (password) { updates.push("password = ?"); params.push(password); }
    if (name !== undefined) { updates.push("name = ?"); params.push(name); }
    if (maxAccounts !== undefined) { updates.push("max_accounts = ?"); params.push(maxAccounts); }
    if (expiry !== undefined) { updates.push("expiry = ?"); params.push(expiry || null); }
    if (enabled !== undefined) { updates.push("enabled = ?"); params.push(enabled ? 1 : 0); }
    if (updates.length) {
      params.push(oldKey);
      db.exec(`UPDATE users SET ${updates.join(', ')} WHERE user_key = ?`, params);
    }

    // 如果改了 user_key，同步更新所有关联表
    if (newUserKey && newUserKey !== oldKey) {
      db.exec("UPDATE accounts SET user_key = ? WHERE user_key = ?", [newUserKey, oldKey]);
      db.exec("UPDATE task_schedules SET user_key = ? WHERE user_key = ?", [newUserKey, oldKey]);
      db.exec("UPDATE task_logs SET user_key = ? WHERE user_key = ?", [newUserKey, oldKey]);
      db.exec("UPDATE task_templates SET user_key = ? WHERE user_key = ?", [newUserKey, oldKey]);
      db.exec("UPDATE sessions SET user_key = ? WHERE user_key = ?", [newUserKey, oldKey]);
      // 更新当前 session
      if (admin.userKey === oldKey) {
        db.exec("UPDATE sessions SET user_key = ?, name = ? WHERE token = ?", [newUserKey, name || admin.name, token]);
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 管理员：用户管理
app.get("/api/auth/users", (req, res) => {
  try {
    const token = req.headers.authorization?.slice(7);
    res.json(listUsers(token));
  } catch (e) {
    res.status(403).json({ error: e.message });
  }
});

app.post("/api/auth/users", (req, res) => {
  try {
    const token = req.headers.authorization?.slice(7);
    const result = createUser(token, req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/auth/users/:userKey", (req, res) => {
  try {
    const token = req.headers.authorization?.slice(7);
    deleteUser(token, req.params.userKey);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 任务模板 API
app.get("/api/templates", (req, res) => {
  const rows = db.getAllTemplates(req.userKey);
  res.json(rows.map(r => ({
    ...r,
    settings: parseTemplateSettings(r.settings),
  })));
});

app.post("/api/templates", (req, res) => {
  const { id, name, settings } = req.body;
  db.addTemplate(id || Date.now().toString(), req.userKey, name, settings);
  res.json({ ok: true });
});

app.put("/api/templates/:id", (req, res) => {
  const { name, settings } = req.body;
  if (!name) return res.status(400).json({ error: "模板名称不能为空" });
  const existing = db.getAllTemplates(req.userKey).find(t => t.id === req.params.id);
  if (!existing) return res.status(404).json({ error: "模板不存在" });
  db.addTemplate(req.params.id, req.userKey, name, settings);
  res.json({ ok: true });
});

app.post("/api/templates/:id/apply", (req, res) => {
  const template = db.getAllTemplates(req.userKey).find(t => t.id === req.params.id);
  if (!template) return res.status(404).json({ error: "模板不存在" });
  const { accountIds } = req.body || {};
  if (!Array.isArray(accountIds) || accountIds.length === 0) {
    return res.status(400).json({ error: "请选择要应用模板的账号" });
  }
  const settings = parseTemplateSettings(template.settings);
  let applied = 0;
  for (const id of accountIds) {
    const account = db.getAccount(id, req.userKey);
    if (!account) continue;
    let current = {};
    try { current = JSON.parse(account.settings || "{}"); } catch {}
    db.updateAccount(id, { settings: JSON.stringify({ ...current, ...settings }) }, req.userKey);
    applied++;
  }
  res.json({ ok: true, applied, templateName: template.name });
});

app.delete("/api/templates/:id", (req, res) => {
  db.deleteTemplate(req.params.id, req.userKey);
  res.json({ ok: true });
});

function parseTemplateSettings(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// ======== 全局批量设置 API ========

const DEFAULT_BATCH_SETTINGS = {
  maxActive: 2,
  commandDelay: 500,
  taskDelay: 500,
  actionDelay: 300,
  battleDelay: 500,
  refreshDelay: 1000,
  longDelay: 3000,
  boxCount: 100,
  fishCount: 100,
  recruitCount: 10,
  defaultBoxType: 2001,
  defaultFishType: 2,
  carGoldThreshold: 500,
  carRecruitThreshold: 3,
  carJadeThreshold: 500,
  carTicketThreshold: 4,
  maxLogEntries: 1000,
};

app.get("/api/settings/batch", (req, res) => {
  const saved = db.getUserSetting(req.userKey, 'batchSettings');
  res.json({ ...DEFAULT_BATCH_SETTINGS, ...(saved || {}) });
});

app.put("/api/settings/batch", (req, res) => {
  try {
    const merged = { ...DEFAULT_BATCH_SETTINGS, ...req.body };
    db.setUserSetting(req.userKey, 'batchSettings', merged);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ======== API 路由 ========
app.use("/api/accounts", accountsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/v1/portal", portalRouter);

// ======== 控制 API ========

/** 连接账号 */
app.post("/api/control/connect/:id", async (req, res) => {
  try {
    const account = db.getAccount(req.params.id, req.userKey);
    if (!account) return res.status(404).json({ error: "账号不存在" });

    await pool.ensureConnected(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error(`[connect/${req.params.id}] 错误:`, error);
    res.status(500).json({ error: error.message });
  }
});

/** 断开账号 */
app.post("/api/control/disconnect/:id", (req, res) => {
  pool.disconnect(req.params.id);
  res.json({ success: true });
});

/** 获取所有连接状态 */
app.get("/api/control/status", (req, res) => {
  const accounts = db.getAllAccounts(req.userKey);
  const statuses = pool.getAllStatus();
  const result = accounts.map(a => ({
    id: a.id,
    name: a.name,
    enabled: a.enabled,
    connected: statuses[a.id] === "connected",
    status: statuses[a.id] || "disconnected",
    role_id: a.role_id,
    role_name: a.role_name,
    level: a.level,
    last_login: a.last_login,
  }));
  res.json(result);
});

/** 手动执行某个账号的每日任务 */
app.post("/api/control/run-daily/:id", async (req, res) => {
  try {
    const account = db.getAccount(req.params.id, req.userKey);
    if (!account) return res.status(404).json({ error: "账号不存在" });

    res.json({ success: true, message: "任务已开始执行" });

    // 异步执行，支持前端传递任务设置
    const customSettings = req.body?.settings || null;
    try {
      await taskRunner.run(req.params.id, {
        onLog: (entry) => {
          addLog({ ...entry, accountId: req.params.id });
          db.addLog(req.params.id, account.name, "手动每日任务", entry.message, entry.type || "info", req.userKey);
        },
        onDailyPointUpdate: (accountId, point, max) => {
          // 活跃度变化时通过全局日志通道实时通知前端
          addLog({ accountId, message: `__DAILY_POINT_UPDATE__:${point}/${max}`, type: "info" });
        },
      }, customSettings);
      addLog({ message: `[${account.role_name || account.name}] 手动每日任务完成`, level: "success" });
    } catch (error) {
      addLog({ message: `[${account.role_name || account.name}] 手动每日任务失败: ${error.message}`, level: "error" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 重新加载定时任务 */
app.post("/api/control/reload-schedules", (req, res) => {
  scheduler.reload();
  res.json({ success: true });
});

/** 获取服务器日志（过滤 debug 级别，避免前端泄露敏感信息） */
app.get("/api/control/logs", (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const filtered = logBuffer.filter(e => e.level !== "debug").slice(-limit);
  res.json(filtered);
});

/** 清空服务器内存日志 */
app.post("/api/control/clear-logs", (req, res) => {
  logBuffer.length = 0;
  res.json({ success: true });
});

/** 获取梦境商品购买日志（按当前登录用户隔离） */
app.get("/api/logs/dream-shop", (req, res) => {
  try {
    const { from, to, accountId } = req.query;
    const records = readDreamShopRecords(req.userKey);
    const filtered = filterDreamShopRecords(records, { from, to, accountId });
    res.json(filtered);
  } catch (e) {
    console.error("[dream-shop-log] 读取失败:", e.message);
    res.status(500).json({ error: "读取日志失败" });
  }
});

/** 导出梦境商品购买日志 CSV（当前用户） */
app.get("/api/logs/dream-shop/export", (req, res) => {
  try {
    const { from, to, accountId } = req.query;
    const records = readDreamShopRecords(req.userKey);
    const filtered = filterDreamShopRecords(records, { from, to, accountId });
    const csv = dreamShopRecordsToCSV(filtered);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="dream-shop-log-${req.userKey}.csv"`);
    res.send("\uFEFF" + csv);
  } catch (e) {
    console.error("[dream-shop-log] 导出失败:", e.message);
    res.status(500).json({ error: "导出失败" });
  }
});

/** 管理员：获取所有用户的梦境商品购买日志 */
app.get("/api/logs/dream-shop/all", (req, res) => {
  try {
    const admin = verifyToken(req.headers.authorization?.slice(7));
    if (!admin || admin.userKey !== 'admin') return res.status(403).json({ error: "无权限" });
    const { from, to, accountId } = req.query;
    const allRecords = [];
    if (existsSync(DREAM_SHOP_LOG_DIR)) {
      const files = readdirSync(DREAM_SHOP_LOG_DIR).filter(f => f.startsWith("dream-shop-log.") && f.endsWith(".json"));
      for (const file of files) {
        const userKey = file.slice("dream-shop-log.".length, -".json".length);
        const records = readDreamShopRecords(userKey).map(r => ({ ...r, userKey }));
        allRecords.push(...records);
      }
    }
    const filtered = filterDreamShopRecords(allRecords, { from, to, accountId });
    res.json(filtered);
  } catch (e) {
    console.error("[dream-shop-log] 读取全部失败:", e.message);
    res.status(500).json({ error: "读取日志失败" });
  }
});

/** 管理员：导出所有用户的梦境商品购买日志 CSV */
app.get("/api/logs/dream-shop/all/export", (req, res) => {
  try {
    const admin = verifyToken(req.headers.authorization?.slice(7));
    if (!admin || admin.userKey !== 'admin') return res.status(403).json({ error: "无权限" });
    const { from, to, accountId } = req.query;
    const allRecords = [];
    if (existsSync(DREAM_SHOP_LOG_DIR)) {
      const files = readdirSync(DREAM_SHOP_LOG_DIR).filter(f => f.startsWith("dream-shop-log.") && f.endsWith(".json"));
      for (const file of files) {
        const userKey = file.slice("dream-shop-log.".length, -".json".length);
        const records = readDreamShopRecords(userKey).map(r => ({ ...r, userKey }));
        allRecords.push(...records);
      }
    }
    const filtered = filterDreamShopRecords(allRecords, { from, to, accountId });
    const csv = dreamShopRecordsToCSV(filtered, true);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="dream-shop-log-all.csv"`);
    res.send("\uFEFF" + csv);
  } catch (e) {
    console.error("[dream-shop-log] 导出全部失败:", e.message);
    res.status(500).json({ error: "导出失败" });
  }
});

function readDreamShopRecords(userKey) {
  const logPath = getDreamShopLogPath(userKey);
  if (!existsSync(logPath)) return [];
  try {
    const raw = readFileSync(logPath, "utf8");
    const records = JSON.parse(raw);
    if (!Array.isArray(records)) return [];
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return records
      .filter(r => r?.time && new Date(r.time).getTime() > cutoff)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  } catch (e) {
    console.error("[dream-shop-log] 读取失败:", e.message);
    return [];
  }
}

function filterDreamShopRecords(records, { from, to, accountId }) {
  let filtered = records;
  if (from) {
    const fromTime = new Date(from).getTime();
    filtered = filtered.filter(r => new Date(r.time).getTime() >= fromTime);
  }
  if (to) {
    const toTime = new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1;
    filtered = filtered.filter(r => new Date(r.time).getTime() <= toTime);
  }
  if (accountId) {
    filtered = filtered.filter(r => r.accountId === accountId);
  }
  return filtered;
}

function dreamShopRecordsToCSV(records, includeUserKey = false) {
  const headers = includeUserKey
    ? ["时间", "用户", "账号", "商人", "商品"]
    : ["时间", "账号", "商人", "商品"];
  const rows = records.map(r => {
    const base = [new Date(r.time).toLocaleString(), r.accountName, r.merchantName, r.itemName];
    if (includeUserKey) base.splice(1, 0, r.userKey);
    return base.map(escapeCSV).join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}

function escapeCSV(v) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** 清空梦境商品购买日志（仅当前用户） */
app.post("/api/logs/dream-shop/clear", (req, res) => {
  try {
    const logPath = getDreamShopLogPath(req.userKey);
    if (existsSync(logPath)) {
      writeFileSync(logPath, JSON.stringify([], null, 2), "utf8");
    }
    res.json({ success: true });
  } catch (e) {
    console.error("[dream-shop-log] 清空失败:", e.message);
    res.status(500).json({ error: "清空日志失败" });
  }
});

/** 获取定时任务状态 */
app.get("/api/control/schedules", (req, res) => {
  res.json(scheduler.getActiveSchedules());
});

// ======== 仪表盘 ========

/** 仪表盘总览 */
app.get("/api/control/dashboard", (req, res) => {
  const accounts = db.getAllAccounts(req.userKey);
  const statuses = pool.getAllStatus();
  const connected = accounts.filter(a => statuses[a.id] === "connected");
  const schedules = db.getEnabledSchedules(req.userKey);
  const recentLogs = db.getRecentLogs(20, req.userKey);

  res.json({
    total: accounts.length,
    connected: connected.length,
    disabled: accounts.filter(a => !a.enabled).length,
    schedules: schedules.length,
    accounts: accounts.map(a => ({
      id: a.id, name: a.name, level: a.level || 0,
      role_name: a.role_name || "",
      enabled: a.enabled,
      status: statuses[a.id] || "disconnected",
      connected: statuses[a.id] === "connected",
      last_login: a.last_login,
    })),
    recentLogs,
  });
});

// ======== 账号任务设置 ========

/** 获取某个账号的任务设置 */
app.get("/api/accounts/:id/settings", (req, res) => {
  const account = db.getAccount(req.params.id, req.userKey);
  if (!account) return res.status(404).json({ error: "账号不存在" });

  const defaults = {
    // 阵容配置
    arenaFormation: 1, bossFormation: 1,
    // 基础活跃度任务开关
    shareEnable: true, giveGoldEnable: true,
    payRecruit: true, freeGoldEnable: true,
    claimBottle: true, openBox: true,
    fishingEnable: true, freeGachaEnable: true,
    // 奖励领取
    claimHangUp: true, fixedRewardsEnable: true,
    claimEmail: true,
    // 功能类任务
    arenaEnable: true, bossTimes: 2,
    genieSweepEnable: true, blackMarketPurchase: true,
    dungeonEnable: true, studyEnable: true,
    // 通用延迟
    commandDelay: 500, taskDelay: 500,
  };

  let settings;
  try { settings = JSON.parse(account.settings || "{}"); } catch { settings = {}; }
  res.json({ ...defaults, ...settings });
});

/** 保存某个账号的任务设置 */
app.put("/api/accounts/:id/settings", (req, res) => {
  const account = db.getAccount(req.params.id, req.userKey);
  if (!account) return res.status(404).json({ error: "账号不存在" });
  try {
    db.updateAccount(req.params.id, { settings: JSON.stringify(req.body) }, req.userKey);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ======== 批量操作 ========

/** 一键连接所有启用的账号 */
app.post("/api/control/connect-all", async (req, res) => {
  res.json({ success: true, message: "开始连接所有账号" });

  const accounts = db.getAllAccounts(req.userKey).filter(a => a.enabled);
  addLog({ message: `开始连接 ${accounts.length} 个账号...`, level: "info" });

  for (const account of accounts) {
    const status = pool.getStatus(account.id);
    if (status === "connected") continue;
    pool.connect(account.id, account.token, account.ws_url).catch(err => {
      addLog({ message: `[${account.name}] 连接失败: ${err.message}`, level: "error" });
    });
    await new Promise(r => setTimeout(r, 2000)); // 错开连接
  }
});

/** 一键断开所有账号 */
app.post("/api/control/disconnect-all", (req, res) => {
  pool.disconnectAll();
  addLog({ message: "所有账号已断开", level: "info" });
  res.json({ success: true });
});

/** 一键执行指定账号列表的每日任务 */
app.post("/api/control/run-daily-batch", async (req, res) => {
  const { accountIds, settings } = req.body || {};
  if (!accountIds || !Array.isArray(accountIds) || !accountIds.length) {
    return res.status(400).json({ error: "请提供账号ID列表" });
  }

  const accounts = db.getAllAccounts(req.userKey).filter(a => accountIds.includes(a.id));
  if (!accounts.length) return res.status(400).json({ error: "没有找到匹配的账号" });

  res.json({ success: true, message: `开始执行 ${accounts.length} 个账号的每日任务` });
  addLog({ message: `批量每日任务(选中): ${accounts.length} 个账号`, level: "info" });

  for (const account of accounts) {
    try {
      await taskRunner.run(account.id, {
        onLog: (entry) => {
          addLog({ ...entry, accountId: account.id });
          db.addLog(account.id, account.name, "批量每日任务", entry.message, entry.type || "info", req.userKey);
        },
      }, settings || null);
      addLog({ message: `[${account.name}] 每日任务完成`, level: "success" });
    } catch (error) {
      addLog({ message: `[${account.name}] 每日任务失败: ${error.message}`, level: "error" });
      db.addLog(account.id, account.name, "批量每日任务", "error", error.message, req.userKey);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
});

/** 一键执行所有已连接账号的每日任务 */
app.post("/api/control/run-daily-all", async (req, res) => {
  const accounts = db.getAllAccounts(req.userKey);
  const statuses = pool.getAllStatus();
  const connected = accounts.filter(a => statuses[a.id] === "connected");

  if (!connected.length) {
    return res.status(400).json({ error: "没有已连接的账号" });
  }

  const customSettings = req.body?.settings || null;
  res.json({ success: true, message: `开始执行 ${connected.length} 个账号的每日任务` });

  addLog({ message: `批量每日任务: ${connected.length} 个账号`, level: "info" });

  for (const account of connected) {
    try {
      await taskRunner.run(account.id, {
        onLog: (entry) => {
          addLog({ ...entry, accountId: account.id });
          db.addLog(account.id, account.name, "批量每日任务", entry.message, entry.type || "info", req.userKey);
        },
      }, customSettings);
      addLog({ message: `[${account.name}] 每日任务完成`, level: "success" });
    } catch (error) {
      addLog({ message: `[${account.name}] 每日任务失败: ${error.message}`, level: "error" });
      db.addLog(account.id, account.name, "批量每日任务", "error", error.message, req.userKey);
    }
    await new Promise(r => setTimeout(r, 3000));
  }
});

// ======== 批量功能 API ========

const BATCH_OPERATIONS = [
  // 日常
  { key: "claimHangUp", category: "日常", label: "领取挂机" },
  { key: "addHangUpTime", category: "日常", label: "一键加钟" },
  { key: "resetBottles", category: "日常", label: "重置罐子" },
  { key: "claimBottles", category: "日常", label: "一键领罐子" },
  { key: "clubSign", category: "日常", label: "俱乐部签到" },
  { key: "study", category: "日常", label: "一键答题" },
  { key: "arena", category: "日常", label: "竞技场3次" },
  { key: "smartSendCar", category: "日常", label: "智能发车" },
  { key: "claimCars", category: "日常", label: "一键收车" },
  { key: "blackMarket", category: "日常", label: "黑市采购" },
  { key: "treasurePavilion", category: "日常", label: "珍宝阁" },
  { key: "genieSweep", category: "日常", label: "灯神扫荡" },
  { key: "freeGacha", category: "日常", label: "免费扭蛋" },
  // 副本
  { key: "tower", category: "副本", label: "一键爬塔" },
  { key: "dream", category: "副本", label: "一键梦境" },
  { key: "skinChallenge", category: "副本", label: "换皮闯关" },
  { key: "peachTasks", category: "副本", label: "蟠桃园任务" },
  { key: "dreamShop", category: "副本", label: "梦境商品" },
  // 宝库
  { key: "baoku13", category: "宝库", label: "宝库前3层" },
  { key: "baoku45", category: "宝库", label: "宝库4-5层" },
  // 怪异塔
  { key: "weirdTower", category: "怪异塔", label: "爬怪异塔" },
  { key: "weirdTowerUseItems", category: "怪异塔", label: "使用道具" },
  { key: "weirdTowerMerge", category: "怪异塔", label: "怪异塔合成" },
  { key: "weirdTowerFreeEnergy", category: "怪异塔", label: "免费道具" },
  // 资源
  { key: "chest", category: "资源", label: "批量开箱" },
  { key: "chestPoints", category: "资源", label: "宝箱积分" },
  { key: "fish", category: "资源", label: "批量钓鱼" },
  { key: "recruit", category: "资源", label: "批量招募" },
  { key: "heroUpgrade", category: "资源", label: "英雄升星" },
  { key: "bookUpgrade", category: "资源", label: "图鉴升星" },
  { key: "fourSaints", category: "资源", label: "四圣碎片" },
  { key: "skinCoins", category: "资源", label: "5皮肤币" },
  // 功法
  { key: "legacyClaim", category: "功法", label: "功法领取" },
  { key: "legacyGift", category: "功法", label: "功法赠送" },
  // 月度
  { key: "topUpFish", category: "月度", label: "钓鱼补齐" },
  { key: "topUpArena", category: "月度", label: "竞技场补齐" },
  // 兼容旧 key
  { key: "dungeonBaoku13", category: "副本", label: "宝库前3层" },
  { key: "dungeonBaoku45", category: "副本", label: "宝库4-5层" },
  { key: "dungeonMengjing", category: "副本", label: "咸王梦境" },
  { key: "dungeonBuyDreamItems", category: "副本", label: "梦境商品购买" },
  { key: "towerClimb", category: "怪异塔", label: "一键爬塔" },
  { key: "towerClimbWeird", category: "怪异塔", label: "一键爬怪异塔" },
  { key: "towerClaimFreeEnergy", category: "怪异塔", label: "领取免费道具" },
  { key: "carSmartSend", category: "资源", label: "智能发车" },
  { key: "carClaimAll", category: "资源", label: "一键收车" },
  { key: "itemOpenBox", category: "资源", label: "批量开箱" },
  { key: "itemClaimBoxPoint", category: "资源", label: "宝箱积分" },
  { key: "itemFish", category: "资源", label: "批量钓鱼" },
  { key: "itemRecruit", category: "资源", label: "批量招募" },
  { key: "itemGenieSweep", category: "资源", label: "灯神扫荡" },
  { key: "itemClaimPeach", category: "资源", label: "蟠桃园任务" },
  { key: "itemHeroUpgrade", category: "资源", label: "英雄升星" },
  { key: "itemBookUpgrade", category: "资源", label: "图鉴升星" },
  { key: "itemClaimBookReward", category: "资源", label: "图鉴奖励" },
  { key: "legacyGiftSend", category: "功法", label: "赠送功法残卷" },
  { key: "monthlyTopUpFish", category: "月度", label: "钓鱼补齐" },
  { key: "monthlyTopUpArena", category: "月度", label: "竞技场补齐" },
  { key: "clubSignin", category: "俱乐部", label: "俱乐部签到" },
  { key: "clubResearch", category: "俱乐部", label: "俱乐部研究" },
  { key: "clubApproveAll", category: "俱乐部", label: "审批申请" },
  { key: "clubSignupMatch", category: "俱乐部", label: "排位报名" },
  { key: "clubWarGuess", category: "俱乐部", label: "月赛助威" },
  { key: "storeFourGuardians", category: "商店", label: "四圣碎片" },
  { key: "storeSkinCoins", category: "商店", label: "皮肤币x5" },
  { key: "storeQuickPurchase", category: "商店", label: "黑市采购" },
  { key: "storeCollectionFree", category: "商店", label: "珍宝阁领取" },
];

const BATCH_LABEL_MAP = Object.fromEntries(BATCH_OPERATIONS.map(op => [op.key, op.label]));

function getBatchLabel(operation) {
  return BATCH_LABEL_MAP[operation] || operation;
}

/** 获取所有可用的批量操作列表 */
app.get("/api/batch/operations", (req, res) => {
  res.json(BATCH_OPERATIONS);
});

/** 批量账号执行批量操作（支持并发与中止） */
app.post("/api/batch/run-all/:operation", async (req, res) => {
  try {
    const { accountIds } = req.body || {};
    let ids = [];
    if (Array.isArray(accountIds) && accountIds.length > 0) {
      ids = accountIds;
    } else {
      // 默认全部账号
      ids = db.getAllAccounts(req.userKey).map(a => a.id);
    }

    if (!ids.length) return res.status(400).json({ error: "没有可用的账号" });

    const runId = batchEngine.createRun(req.params.operation, ids, req.body || {}, {
      userKey: req.userKey,
      onLog: (entry) => {
        addLog({ ...entry });
        const account = db.getAccount(entry.accountId, req.userKey);
        db.addLog(entry.accountId, account?.name || entry.accountId, req.params.operation, entry.message, entry.type || "info", req.userKey);
      },
    });

    res.json({ success: true, message: `开始批量 ${getBatchLabel(req.params.operation)}: ${ids.length} 个账号`, runId });
    addLog({ message: `批量${getBatchLabel(req.params.operation)}: ${ids.length} 个账号`, level: "info" });

    // 异步执行
    batchEngine.run(runId).catch((err) => {
      console.error(`[BatchEngine] run ${runId} failed:`, err);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 单个账号执行批量操作 */
app.post("/api/batch/:operation/:id", async (req, res) => {
  try {
    const account = db.getAccount(req.params.id, req.userKey);
    if (!account) return res.status(404).json({ error: "账号不存在" });

    const { id, operation } = req.params;
    const body = req.body || {};
    const logCb = (entry) => {
      addLog({ ...entry, accountId: id });
      db.addLog(id, account.name, operation, entry.message, entry.type || "info", req.userKey);
    };

    res.json({ success: true, message: "操作已开始" });

    try {
      await executeBatchOperation(batchModules, operation, id, body, logCb);
      addLog({ message: `[${account.name}] ${operation} 完成`, level: "success" });
    } catch (error) {
      addLog({ message: `[${account.name}] ${operation} 失败: ${error.message}`, level: "error" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 中止批量运行 */
app.post("/api/batch/abort/:runId", (req, res) => {
  const ok = batchEngine.abort(req.params.runId);
  res.json({ success: ok, message: ok ? "已发送中止信号" : "运行不存在或已结束" });
});

/** 查询批量运行状态 */
app.get("/api/batch/status/:runId", (req, res) => {
  const status = batchEngine.getStatus(req.params.runId);
  if (!status) return res.status(404).json({ error: "运行不存在" });
  res.json(status);
});

/** 查询批量运行日志 */
app.get("/api/batch/logs/:runId", (req, res) => {
  const limit = parseInt(req.query.limit) || 500;
  const logs = batchEngine.getLogs(req.params.runId, limit);
  if (logs === null) return res.status(404).json({ error: "运行不存在" });
  res.json(logs);
});

// ======== 游戏功能查询 API ========

/** 获取当前日期字符串（按每天 1:00 作为跨天边界） */
function getSnapshotDay() {
  const now = new Date();
  if (now.getHours() < 1) {
    now.setDate(now.getDate() - 1);
  }
  return now.toISOString().slice(0, 10);
}

/** 获取活跃度快照（离线可读，不触发连接） */
app.get("/api/game/last-daily-status/:id", (req, res) => {
  const id = req.params.id;
  const account = db.getAccount(id, req.userKey);
  if (!account) return res.status(404).json({ error: "账号不存在" });
  const settings = db.getAccountSettings(id, req.userKey) || {};
  const today = getSnapshotDay();
  const savedDay = settings.lastDailyDay || null;
  const expired = !savedDay || savedDay !== today;
  res.json({
    dailyPoint: expired ? 0 : (settings.lastDailyPoint ?? 0),
    dailyPointMax: expired ? 100 : (settings.lastDailyPointMax ?? 100),
    dailyDay: savedDay,
    expired
  });
});

/** 工具函数：确保账号已连接，否则返回错误 */
async function requireConnected(id, userKey) {
  const account = db.getAccount(id, userKey);
  if (!account) throw Object.assign(new Error("账号不存在"), { status: 404 });
  const status = pool.getStatus(id);
  if (status !== "connected") {
    // 尝试自动连接
    try { await pool.ensureConnected(id); }
    catch (e) { throw Object.assign(new Error("账号未连接"), { status: 400 }); }
  }
  return account;
}

/** 包装异步查询：立即返回，异步更新日志 */
function wrapGameQuery(getId, getName, feature, queryFn) {
  return async (req, res) => {
    const id = getId(req);
    const accountName = getName instanceof Function ? getName(req) : (getName || id);
    try {
      await requireConnected(id, req.userKey);
      res.json({ success: true, message: `${feature} 查询已开始，请查看结果` });
      try {
        const data = await queryFn(req);
        addLog({ message: `[${accountName}] ${feature} 查询完成`, level: "success" });
        // 结果存入内存供前端轮询
        queryResults.set(`${id}:${feature}`, { time: Date.now(), data });
      } catch (e) {
        addLog({ message: `[${accountName}] ${feature} 查询失败: ${e.message}`, level: "error" });
        queryResults.set(`${id}:${feature}`, { time: Date.now(), error: e.message });
      }
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  };
}

/** 查询结果缓存 */
const queryResults = new Map();

/** 获取某个查询结果 */
app.get("/api/game/result/:id/:feature", (req, res) => {
  const key = `${req.params.id}:${req.params.feature}`;
  const result = queryResults.get(key);
  if (!result) return res.json({ ready: false });
  res.json({ ready: true, ...result });
});

/** 清除查询结果 */
app.delete("/api/game/result/:id/:feature", (req, res) => {
  queryResults.delete(`${req.params.id}:${req.params.feature}`);
  res.json({ success: true });
});

/** 获取角色完整状态 */
app.get("/api/game/daily-status/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "日常状态",
  (req) => gameModules.status.getAllStatus(req.params.id)
));

/** 获取角色信息 */
app.get("/api/game/role-info/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "角色信息",
  (req) => gameModules.status.getRoleInfo(req.params.id)
));

/** 获取阵容 */
app.get("/api/game/formations/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "阵容",
  (req) => gameModules.status.getFormations(req.params.id)
));

/** 获取咸将塔 */
app.get("/api/game/tower/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "咸将塔",
  (req) => gameModules.status.getTowerInfo(req.params.id)
));

/** 获取怪异塔 */
app.get("/api/game/weird-tower/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "怪异塔",
  (req) => gameModules.status.getWeirdTowerInfo(req.params.id)
));

// ======== 俱乐部 ========

/** 获取俱乐部信息 */
app.get("/api/game/club/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "俱乐部信息",
  (req) => gameModules.club.getClubInfo(req.params.id)
));

/** 获取俱乐部成员 */
app.get("/api/game/club-members/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "成员列表",
  (req) => gameModules.club.getMembers(req.params.id)
));

/** 获取入会申请 */
app.get("/api/game/club-apply/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "入会申请",
  (req) => gameModules.club.getApplyList(req.params.id)
));

/** 获取盐场匹配排名 */
app.get("/api/game/war-rank/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "盐场排名",
  (req) => gameModules.club.getWarRank(req.params.id)
));

// ======== 盐场 ========

/** 获取盐场信息 */
app.get("/api/game/salt-field/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "盐场信息",
  (req) => gameModules.saltField.getWarType(req.params.id)
));

/** 获取盐场分组排名 */
app.get("/api/game/salt-group-rank/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "盐场分组",
  (req) => gameModules.saltField.getGroupRank(req.params.id)
));

/** 获取盐场战场 */
app.get("/api/game/battlefield/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "盐场战场",
  (req) => gameModules.saltField.getBattlefield(req.params.id)
));

/** 获取本周战绩 */
app.get("/api/game/week-battle/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "本周战绩",
  (req) => gameModules.club.getWeekBattleRecords(req.params.id)
));

/** 获取本月战绩 */
app.get("/api/game/month-battle/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "本月战绩",
  (req) => gameModules.club.getMonthBattleRecords(req.params.id)
));

// ======== 蟠桃园 ========

/** 获取蟠桃园信息 */
app.get("/api/game/peach/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "蟠桃园",
  (req) => gameModules.club.getPeachInfo(req.params.id)
));

/** 获取蟠桃园战绩 */
app.get("/api/game/peach-battle/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "蟠桃战绩",
  (req) => gameModules.club.getPeachBattleRecords(req.params.id)
));

// ======== 排行榜 ========

/** 获取区服榜 */
app.get("/api/game/rank-server/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "区服榜",
  (req) => gameModules.rankings.getServerRank(req.params.id)
));

/** 获取巅峰榜 */
app.get("/api/game/rank-top/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "巅峰榜",
  (req) => gameModules.rankings.getTopRank(req.params.id)
));

/** 获取俱乐部榜 */
app.get("/api/game/rank-club/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "俱乐部榜",
  (req) => gameModules.rankings.getTopClubRank(req.params.id)
));

/** 获取黄金积分榜 */
app.get("/api/game/rank-gold/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "黄金积分榜",
  (req) => gameModules.rankings.getGoldClubRank(req.params.id)
));

/** 获取伟大航路榜 */
app.get("/api/game/rank-route/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "伟大航路榜",
  (req) => gameModules.rankings.getGreatRouteRank(req.params.id)
));

// ======== 活动 ========

/** 获取月度任务 */
app.get("/api/game/monthly/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "月度任务",
  (req) => gameModules.activity.getMonthlyTasks(req.params.id)
));

/** 获取答题状态 */
app.get("/api/game/study/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "答题状态",
  (req) => gameModules.activity.getStudyStatus(req.params.id)
));

/** 获取车辆状态 */
app.get("/api/game/car-status/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "车辆状态",
  (req) => batchModules.car.getStatus(req.params.id)
));

/** 获取最近一次赛车状态快照（离线也可读，不触发连接） */
app.get("/api/game/last-car-status/:id", (req, res) => {
  const id = req.params.id;
  const account = db.getAccount(id, req.userKey);
  if (!account) return res.status(404).json({ error: "账号不存在" });
  const settings = (() => {
    try { return JSON.parse(account.settings || '{}'); } catch { return {}; }
  })();

  const today = new Date();
  if (today.getHours() < 1) today.setDate(today.getDate() - 1);
  const todayDay = today.toISOString().slice(0, 10);
  const snapshotDay = settings.lastCarDay || null;
  const expired = !snapshotDay || snapshotDay !== todayDay;

  // 赛车开放状态必须按当前日期重新计算，避免过期快照里的旧 open 值误导前端
  const wd = today.getDay();
  const hour = today.getHours();
  const open = wd >= 1 && wd <= 3 && hour < 20;

  res.json({
    ...{ open: false, sent: 0, total: 0, claimable: 0, cars: [] },
    ...(settings.lastCarStatus || {}),
    open,
    expired
  });
});

/** 获取邮件 */
app.get("/api/game/mail/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "邮件列表",
  (req) => gameModules.activity.getMailList(req.params.id)
));

// ======== 切磋 ========

/** 获取竞技场对手 */
app.get("/api/game/arena-targets/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "竞技场对手",
  (req) => gameModules.pvp.getArenaTargets(req.params.id, req.query.refresh === "true")
));

/** 获取竞技场排名 */
app.get("/api/game/arena-rank/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "竞技场排名",
  (req) => gameModules.pvp.getArenaRank(req.params.id)
));

/** 切磋操作 */
app.post("/api/game/fight/:id", async (req, res) => {
  try {
    const account = await requireConnected(req.params.id, req.userKey);
    if (!req.body.targetId) return res.status(400).json({ error: "缺少 targetId" });
    res.json({ success: true, message: "切磋已开始" });
    try {
      const result = await gameModules.pvp.startFight(req.params.id, req.body.targetId);
      addLog({ message: `[${account.name}] 切磋: ${result.success ? "完成" : result.message}`, level: result.success ? "success" : "warning" });
      queryResults.set(`${req.params.id}:fightResult`, { time: Date.now(), data: result });
    } catch (e) {
      addLog({ message: `[${account.name}] 切磋失败: ${e.message}`, level: "error" });
    }
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ======== 工具 ========

/** 获取商店商品 */
app.get("/api/game/store/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "商店",
  (req) => gameModules.tools.getStoreGoods(req.params.id, parseInt(req.query.storeId) || 1)
));

/** 获取挂机奖励预览 */
app.get("/api/game/hangup-reward/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "挂机奖励",
  (req) => gameModules.tools.getHangUpReward(req.params.id)
));

/** 获取梦境信息 */
app.get("/api/game/dream/:id", wrapGameQuery(
  (req) => req.params.id, (req) => db.getAccount(req.params.id, req.userKey)?.name || req.params.id, "梦境",
  (req) => gameModules.tools.getDreamInfo(req.params.id)
));

// ======== 用户自定义命令 ========

/** 发送任意游戏命令 */
app.post("/api/game/raw/:id", async (req, res) => {
  try {
    const account = await requireConnected(req.params.id, req.userKey);
    const { cmd, params, timeout } = req.body || {};
    if (!cmd) return res.status(400).json({ error: "缺少 cmd" });
    res.json({ success: true, message: `命令 ${cmd} 已发送` });
    try {
      const result = await pool.sendMessage(req.params.id, cmd, params || {}, timeout || 8000);
      addLog({ message: `[${account.name}] 命令 ${cmd} 完成`, level: "success" });
      queryResults.set(`${req.params.id}:rawCmd`, { time: Date.now(), data: result });
    } catch (e) {
      addLog({ message: `[${account.name}] 命令 ${cmd} 失败: ${e.message}`, level: "error" });
    }
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

/** SSE 实时日志推送 */
app.get("/api/control/logs/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write("data: {\"init\":true}\n\n");

  // 定期发送日志
  const interval = setInterval(() => {
    const recent = logBuffer.slice(-20);
    if (recent.length > 0) {
      res.write(`data: ${JSON.stringify(recent)}\n\n`);
    }
  }, 2000);

  req.on("close", () => {
    clearInterval(interval);
  });
});

// ======== 静态文件（前端） ========
// 优先使用 Vue 构建的 dist-vue，回退到 public
const vueDist = join(__dirname, "dist-vue");
if (existsSync(vueDist)) {
  app.use(express.static(vueDist, {
    maxAge: 0,
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }));
  console.log("[server] 使用 Vue 前端: dist-vue/");
}
app.use(express.static(join(__dirname, "public")));

// 前端 SPA fallback（优先 Vue）
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    const vueIndex = join(__dirname, "dist-vue", "index.html");
    if (existsSync(vueIndex)) {
      return res.sendFile(vueIndex);
    }
    res.sendFile(join(__dirname, "public", "index.html"));
  }
});

// ======== 启动 ========
async function start() {
  // 初始化数据库
  console.log("正在初始化数据库...");
  await db.initDatabase();
  console.log("数据库初始化完成");

  // Portal卡密表初始化（依赖db初始化完毕）
  portalDb.initPortalDB();

  app.listen(PORT, () => {
    // 在启动完成后再注入 labelMap，避免变量提升问题
    batchEngine.labelMap = BATCH_LABEL_MAP;

    console.log(`\n========================================`);
    console.log(`  niaoge cloud bot v1.0.0`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`========================================\n`);

    // 启动定时任务（任务执行时会按需连接账号，避免启动时并发连接风暴）
    scheduler.init();
  });
}

start().catch(err => {
  console.error("启动失败:", err);
  process.exit(1);
});
