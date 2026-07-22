/**
 * 定时任务调度器 - Cron 驱动的自动化任务
 */
import cron from "node-cron";
import * as db from "./db.js";

/**
 * 通用并发控制辅助：按指定并发数同时执行多个任务
 */
async function runWithConcurrency(items, limit, fn) {
  const executing = new Set();
  for (const item of items) {
    const p = fn(item).finally(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  await Promise.all(executing);
}

/**
 * 统一任务项格式：支持旧字符串格式和新对象格式
 * - "daily" -> { key: "daily", config: {} }
 * - { op: "smartSendCar", thresholds: {...} } -> { key: "smartSendCar", config: { thresholds: {...} } }
 */
function normalizeTask(t) {
  if (typeof t === "string") return { key: t, config: {} };
  if (t && typeof t === "object" && !Array.isArray(t)) {
    const key = t.op || t.key;
    if (!key || typeof key !== "string") return null;
    const config = { ...t };
    delete config.op;
    delete config.key;
    return { key, config };
  }
  return null;
}

/**
 * 把 HH:mm 固定时间转成 node-cron 表达式（每天）
 */
function fixedTimeToCron(fixedTime) {
  const [h, m] = fixedTime.split(":").map(Number);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`无效的固定时间: ${fixedTime}`);
  }
  return `${m} ${h} * * *`;
}

export class Scheduler {
  constructor(connectionPool, taskRunner, options = {}) {
    this.pool = connectionPool;
    this.taskRunner = taskRunner;
    this.options = options;
    this.taskHandlers = options.taskHandlers || {};
    this.batchRunner = options.batchRunner || null;
    this.defaultMaxActive = options.maxActive || 2;
    this.jobs = new Map(); // scheduleId -> cronJob
    this.running = new Map(); // scheduleId -> Promise
    this.lastRunMinute = new Map(); // scheduleId -> YYYY-MM-DDTHH:mm
    this.onLog = null;
  }

  setLogCallback(fn) { this.onLog = fn; }
  setBatchRunner(fn) { this.batchRunner = fn; }

  log(msg, level = "info") {
    if (this.onLog) this.onLog({ time: new Date().toISOString(), message: msg, level });
  }

  /**
   * 初始化：加载所有启用的定时任务
   */
  init(userKey) {
    const schedules = db.getEnabledSchedules(userKey);
    this.log(`加载了 ${schedules.length} 个定时任务配置`);
    for (const schedule of schedules) {
      this.registerSchedule(schedule);
    }
  }

  /**
   * 注册单个定时任务
   */
  registerSchedule(schedule) {
    const { id, name, schedule_type, fixed_time, cron_expression, task_list, account_ids, max_active } = schedule;

    // 解析任务列表
    let tasks;
    try {
      tasks = typeof task_list === "string" ? JSON.parse(task_list) : task_list;
      if (!Array.isArray(tasks) || tasks.length === 0) {
        this.log(`[${name}] 任务列表为空，跳过`, "warning");
        return;
      }
    } catch (e) {
      this.log(`[${name}] 任务列表解析失败: ${e.message}`, "error");
      return;
    }

    // 确定最终 cron 表达式
    let cronExpr = cron_expression;
    if (schedule_type === "fixed" && fixed_time) {
      try {
        cronExpr = fixedTimeToCron(fixed_time);
      } catch (e) {
        this.log(`[${name}] ${e.message}`, "error");
        return;
      }
    }

    // 验证 cron 表达式
    if (!cron.validate(cronExpr)) {
      this.log(`[${name}] Cron 表达式无效: ${cronExpr}`, "error");
      return;
    }

    // 解析账号列表
    const accountIds = account_ids === "*"
      ? db.getAllAccounts().filter(a => a.enabled).map(a => a.id)
      : account_ids.split(",").map(s => s.trim()).filter(Boolean);

    if (!accountIds.length) {
      this.log(`[${name}] 没有可用账号，跳过`, "warning");
      return;
    }

    const maxActive = Math.max(1, Number(max_active) || this.defaultMaxActive);

    // 创建 cron job
    const job = cron.schedule(cronExpr, async () => {
      // 防止同一任务重叠执行
      if (this.running.has(id)) {
        this.log(`[${name}] 跳过：上次执行尚未结束`);
        return;
      }

      // 防止同一分钟内重复触发（node-cron 某些情况下可能重复）
      const minuteKey = new Date().toISOString().slice(0, 16);
      if (this.lastRunMinute.get(id) === minuteKey) {
        this.log(`[${name}] 跳过：本分钟已触发过`);
        return;
      }
      this.lastRunMinute.set(id, minuteKey);

      const runPromise = this._executeSchedule(id, name, tasks, accountIds, maxActive);
      this.running.set(id, runPromise);
      runPromise.finally(() => this.running.delete(id));
    });

    this.jobs.set(id, job);
    this.log(`[${name}] 已注册: ${cronExpr} → ${accountIds.length} 个账号，并发 ${maxActive}，账号列表: ${accountIds.join(",")}`);
  }

  /**
   * 执行一次调度任务
   */
  async _executeSchedule(id, name, tasks, accountIds, maxActive) {
    this.log(`[${name}] 触发定时任务 (${accountIds.length} 个账号，并发 ${maxActive})，实际执行: ${accountIds.join(",")}`);

    const normalizedTasks = tasks.map(normalizeTask).filter(Boolean);
    if (normalizedTasks.length === 0) {
      this.log(`[${name}] 任务列表为空或格式无效，跳过`, "warning");
      return;
    }

    // 如果包含每日任务，提前刷新 Token（最佳努力）
    if (normalizedTasks.some((t) => t.key === "daily")) {
      try {
        await this.taskRunner.preRefreshTokens(accountIds, {
          onLog: (entry) => this.log(`[${name}] ${entry.message}`, entry.type || "info"),
        });
      } catch (error) {
        this.log(`[${name}] 批量预刷新 Token 失败: ${error.message}`, "error");
      }
    }

    await runWithConcurrency(accountIds, maxActive, async (accountId) => {
      const account = db.getAccount(accountId);
      if (!account || !account.enabled) {
        this.log(`[${name}] 跳过已禁用账号: ${accountId}`, "warning");
        return;
      }

      const accountName = account?.name || accountId;
      const accountLog = (msg, level = "info") => {
        // 消息由 handler / batchRunner 自行带上账号角色名前缀；这里只加任务名前缀
        this.log(`[${name}] ${msg}`, level);
      };

      // 每次定时任务开始时恢复该账号的自动连接权限并清除上次的手动中止标记
      this.pool.allowAutoConnect(accountId, true);
      this.pool.clearAbort(accountId);

      let wasAborted = false;
      try {
        for (const task of normalizedTasks) {
          // 手动断开后中止后续任务执行
          if (this.pool.isAborted(accountId)) {
            wasAborted = true;
            accountLog(`${accountName} 已被手动中止，跳过剩余任务`);
            break;
          }
          const { key, config } = task;
          const handler = this.taskHandlers[key];
          if (handler) {
            accountLog(`${accountName} 开始执行: ${key}`);
            await handler(accountId, accountLog);
          } else if (this.batchRunner) {
            accountLog(`${accountName} 开始执行: ${key}`);
            await this.batchRunner(key, accountId, accountLog, config);
          } else {
            accountLog(`${accountName} 未知任务: ${key}`, "warning");
          }
        }
        if (wasAborted) {
          db.addLog(accountId, accountName, name, "warning", "任务被手动中止");
          this.log(`[${name}] ${accountName}: 已手动中止`, "warning");
        } else {
          db.addLog(accountId, accountName, name, "success", "任务完成");
          this.log(`[${name}] ${accountName}: 全部完成`, "success");
        }
      } catch (error) {
        this.log(`[${name}] ${accountName}: 执行失败 - ${error.message}`, "error");
        db.addLog(accountId, accountName, name, "error", error.message);
      } finally {
        // 任务执行完毕后主动释放连接，避免占用连接槽并停止前端轮询
        try {
          await this.pool.disconnect(accountId);
          accountLog(`${accountName} 已断开连接`);
        } catch (disconnectError) {
          accountLog(`${accountName} 断开连接失败: ${disconnectError.message}`, "warning");
        }
        // 任务执行完毕后清除手动中止标记，确保下次定时任务可正常连接
        this.pool.clearAbort(accountId);
      }
    });

    this.log(`[${name}] 定时任务执行完毕`, "success");
  }

  /**
   * 添加新的定时任务（运行时）
   */
  addSchedule(schedule) {
    if (!schedule.id) {
      // 生成ID
      schedule.id = db.addSchedule({
        name: schedule.name,
        scheduleType: schedule.schedule_type,
        fixedTime: schedule.fixed_time,
        cronExpression: schedule.cron_expression,
        taskList: schedule.task_list,
        accountIds: schedule.account_ids || "*",
        maxActive: schedule.max_active,
        enabled: schedule.enabled ?? 1,
      }).lastInsertRowid;
    }
    this.registerSchedule(schedule);
  }

  /**
   * 停止并移除某个定时任务
   */
  removeSchedule(id) {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
    }
    db.removeSchedule(id);
    this.log(`定时任务 ${id} 已移除`);
  }

  /**
   * 重新加载所有定时任务
   */
  reload(userKey) {
    // 停止所有
    for (const [id, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
    this.running.clear();
    this.lastRunMinute.clear();

    // 重新加载
    this.init(userKey);
  }

  /**
   * 停止所有定时任务
   */
  stopAll() {
    for (const [id, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
    this.running.clear();
    this.lastRunMinute.clear();
    this.log("所有定时任务已停止");
  }

  /**
   * 获取当前运行的定时任务列表
   */
  getActiveSchedules() {
    return db.getAllSchedules().map(s => ({
      ...s,
      running: this.jobs.has(s.id),
    }));
  }
}

export default Scheduler;
