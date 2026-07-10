/**
 * 定时任务调度器 - Cron 驱动的自动化任务
 */
import cron from "node-cron";
import * as db from "./db.js";

export class Scheduler {
  constructor(connectionPool, taskRunner) {
    this.pool = connectionPool;
    this.taskRunner = taskRunner;
    this.jobs = new Map(); // scheduleId -> cronJob
    this.onLog = null;
  }

  setLogCallback(fn) { this.onLog = fn; }

  log(msg, level = "info") {
    if (this.onLog) this.onLog({ time: new Date().toISOString(), message: msg, level });
  }

  /**
   * 初始化：加载所有启用的定时任务
   */
  init() {
    const schedules = db.getEnabledSchedules();
    this.log(`加载了 ${schedules.length} 个定时任务配置`);
    for (const schedule of schedules) {
      this.registerSchedule(schedule);
    }
  }

  /**
   * 注册单个定时任务
   */
  registerSchedule(schedule) {
    const { id, name, cron_expression, task_list, account_ids } = schedule;

    // 验证 cron 表达式
    if (!cron.validate(cron_expression)) {
      this.log(`[${name}] Cron 表达式无效: ${cron_expression}`, "error");
      return;
    }

    // 解析任务列表
    let tasks;
    try {
      tasks = typeof task_list === "string" ? JSON.parse(task_list) : task_list;
    } catch (e) {
      this.log(`[${name}] 任务列表解析失败: ${e.message}`, "error");
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

    // 创建 cron job
    const job = cron.schedule(cron_expression, async () => {
      this.log(`[${name}] 触发定时任务 (${accountIds.length} 个账号)`);

      // 批量预刷新 Token，避免执行中途过期
      try {
        await this.taskRunner.preRefreshTokens(accountIds, {
          onLog: (entry) => this.log(`[${name}] ${entry.message}`, entry.type || "info"),
        });
      } catch (error) {
        this.log(`[${name}] 批量预刷新 Token 失败: ${error.message}`, "error");
      }

      for (const accountId of accountIds) {
        const account = db.getAccount(accountId);
        if (!account || !account.enabled) {
          this.log(`[${name}] 跳过已禁用账号: ${accountId}`, "warning");
          continue;
        }

        this.log(`[${name}] 开始执行账号: ${account.name}`);

        try {
          await this.taskRunner.run(accountId, {
            onLog: (entry) => {
              this.log(`[${account.name}] ${entry.message}`, entry.type || "info");
              db.addLog(accountId, account.name, entry.message, entry.type || "info", "");
            },
            onProgress: (pct) => {
              // 进度回调（可扩展）
            },
          });
          db.addLog(accountId, account.name, name, "success", "任务完成");
          this.log(`[${name}] ${account.name}: 全部完成`, "success");
        } catch (error) {
          this.log(`[${name}] ${account.name}: 执行失败 - ${error.message}`, "error");
          db.addLog(accountId, account.name, name, "error", error.message);
        }

        // 账号间延迟
        await new Promise(r => setTimeout(r, 3000));
      }

      this.log(`[${name}] 定时任务执行完毕`, "success");
    });

    this.jobs.set(id, job);
    this.log(`[${name}] 已注册: ${cron_expression} → ${accountIds.length} 个账号`);
  }

  /**
   * 添加新的定时任务（运行时）
   */
  addSchedule(schedule) {
    if (!schedule.id) {
      // 生成ID
      schedule.id = db.addSchedule({
        name: schedule.name,
        cronExpression: schedule.cron_expression,
        taskList: schedule.task_list,
        accountIds: schedule.account_ids || "*",
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
  reload() {
    // 停止所有
    for (const [id, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();

    // 重新加载
    this.init();
  }

  /**
   * 停止所有定时任务
   */
  stopAll() {
    for (const [id, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
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
