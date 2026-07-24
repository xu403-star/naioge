/**
 * 每日任务执行器 - 从 dailyTaskRunner.js 移植
 * 适配 Node.js + SQLite + ConnectionPool
 */
import * as db from "./db.js";
import * as logBuffer from "./logBuffer.js";
import { CarTasks } from "./batch/tasksCar.js";
import { isExecutedToday, markExecutedToday } from "./batch/dailyExecutedUtils.js";
import { getSnapshotDay as getDailySnapshotDay, saveDailySnapshot } from "./game/gameStatus.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ======== 辅助函数 ========

const pickArenaTargetId = (targets) => {
  if (!targets) return null;
  if (Array.isArray(targets)) {
    const candidate = targets[0];
    return candidate?.roleId || candidate?.id || candidate?.targetId;
  }
  const candidate = targets?.rankList?.[0] || targets?.roleList?.[0] ||
    targets?.targets?.[0] || targets?.targetList?.[0] || targets?.list?.[0];
  if (candidate) {
    if (candidate.roleId) return candidate.roleId;
    if (candidate.id) return candidate.id;
    if (candidate.targetId) return candidate.targetId;
  }
  return targets?.roleId || targets?.id || targets?.targetId;
};

const isTodayAvailable = (statisticsTime) => {
  if (!statisticsTime) return true;
  const today = new Date().toDateString();
  const recordDate = new Date(statisticsTime * 1000).toDateString();
  return today !== recordDate;
};

const getTodayBossId = () => {
  const DAY_BOSS_MAP = [9904, 9905, 9901, 9902, 9903, 9904, 9905];
  return DAY_BOSS_MAP[new Date().getDay()];
};

/**
 * 活动周判断（三周循环：黑市周→招募周→宝箱周）
 * 移植自 xyzw_web_helper connectionManager.js
 */
const getActivityStatus = () => {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  const start = new Date("2025-12-12T12:00:00"); // 起始时间：黑市周开始
  const weekDuration = 7 * 24 * 60 * 60 * 1000;
  const cycleDuration = 3 * weekDuration;

  const elapsed = now - start;
  let currentActivityWeek = null;

  if (elapsed >= 0) {
    const cyclePosition = elapsed % cycleDuration;
    if (cyclePosition < weekDuration) {
      currentActivityWeek = "黑市周";
    } else if (cyclePosition < 2 * weekDuration) {
      currentActivityWeek = "招募周";
    } else {
      currentActivityWeek = "宝箱周";
    }
  }

  return {
    isCarActivityOpen: day >= 1 && day <= 3,
    ismengjingActivityOpen: day === 0 || day === 1 || day === 3 || day === 4,
    isbaokuActivityOpen: day !== 1 && day !== 2,
    isarenaActivityOpen: hour >= 6 && hour < 22,
    currentActivityWeek,
    isWeirdTowerActivityOpen: currentActivityWeek === "黑市周",
  };
};

// ======== 答题系统（移植自 xyzw_web_helper） ========

let answerDatabase = null;

/**
 * 加载答题题库
 */
function loadAnswerDatabase() {
  if (answerDatabase) return answerDatabase;
  try {
    const jsonPath = path.join(__dirname, "..", "data", "answer.json");
    const raw = fs.readFileSync(jsonPath, "utf-8");
    answerDatabase = JSON.parse(raw);
    return answerDatabase;
  } catch (e) {
    console.warn(`[taskRunner] 加载答题题库失败: ${e.message}`);
    return [];
  }
}

/**
 * 模糊匹配题目
 */
function matchQuestion(questionFromDB, actualQuestion) {
  if (!questionFromDB || !actualQuestion) return false;
  const cleanDB = questionFromDB.replace(/\s+/g, "").toLowerCase();
  const cleanActual = actualQuestion.replace(/\s+/g, "").toLowerCase();
  return cleanActual.includes(cleanDB) || cleanDB.includes(cleanActual);
}

/**
 * 查找题目答案
 */
function findAnswer(question) {
  const questions = loadAnswerDatabase();
  if (!questions || questions.length === 0) return null;
  for (const item of questions) {
    if (!item.name || !item.value) continue;
    if (matchQuestion(item.name, question)) {
      return item.value;
    }
  }
  return null;
}

// ======== 默认设置 ========
// 所有任务都有独立开关，前端勾选后才会执行
// 注意：仅修改 defaultSettings 中的默认值是不够的——
// 数据库历史设置和前端传入的 customSettings 会覆盖默认值。
// 若要把某功能从每日任务"强制关闭/开启"，必须改下方 FORCED_SETTINGS，
// 它会在 loadSettings 和 run 两处自动覆盖历史设置与 customSettings。
const defaultSettings = {
  // 阵容配置
  arenaFormation: 1,
  bossFormation: 1,
  // 基础活跃度任务
  shareEnable: true,
  giveGoldEnable: true,
  freeRecruit: true,
  payRecruit: false,
  freeGoldEnable: true,
  claimBottle: true,
  openBox: true,
  fishingEnable: true,
  freeGachaEnable: true,
  // 奖励领取
  claimHangUp: true,
  fixedRewardsEnable: true,
  claimEmail: true,
  // 功能类任务
  arenaEnable: true,
  bossTimes: 2,
  genieSweepEnable: true,
  blackMarketPurchase: true,
  dungeonEnable: true,
  // 答题已从每日任务默认模板中剔除（保留代码与开关，用户可手动开启）
  studyEnable: false,
  // 车辆任务已从每日模板移除（仅在开放日通过批量/独立入口执行）
  smartSendCarEnable: false,
  claimCarsEnable: false,
  carGoldThreshold: 500,
  carRecruitThreshold: 3,
  carJadeThreshold: 500,
  carTicketThreshold: 4,
  carAssignHelper: true,
  // 通用延迟
  commandDelay: 500,
  taskDelay: 500,
};

// ======== 每日任务强制设置（单一数据源） ========
// 无论数据库历史设置还是前端传入的 customSettings，这些字段始终以代码为准。
// 以后要把某项功能从每日任务强制关闭/开启，只需改这里一处，loadSettings 和 run 自动生效。
const FORCED_SETTINGS = {
  // 车辆任务已从每日模板移除（仅在开放日通过批量/独立入口执行）
  smartSendCarEnable: false,
  claimCarsEnable: false,
  // 答题已从每日任务默认模板剔除（保留代码与开关，用户可手动开启）
  studyEnable: false,
};

// ======== 已知的可忽略错误码（合并自 xyzw_web_helper） ========
const SKIP_ERROR_CODES = {
  400030: "今日已执行/次数已用完",
  700020: "已经领取过这个任务",
  700010: "任务未达成完成条件",
  200020: "出了点小问题（重复领取等）",
  3500020: "没有可领取的奖励",
  200160: "模块未开启",
  1300040: "功能未解锁",
  2600040: "功能未解锁",
  3300060: "扫荡条件不满足",
  3300050: "购买数量超出限制",
  400190: "没有可领取的签到奖励",
  2300190: "今天已经签到过了",
  1000020: "今天已经领取过奖励了",
  1400010: "没有购买该月卡",
  4100040: "通行证未购买/未开启",
  // 400340（服务器限流）已移出可忽略列表：限流是临时状态，改为在 executeGameCommand 内等待重试，避免直接跳过影响后续奖励
  12000116: "今日已领取免费奖励",
  2300250: "俱乐部BOSS今日攻打次数已用完",
  2300370: "俱乐部商品购买数量超出上限",
  1500020: "能量不足",
  1500040: "上座塔的奖励未领取",
  1500010: "已经全部通关",
  12000050: "今日发车次数已达上限",
  12000060: "不在发车时间内",
  400010: "物品数量不足",
  7900023: "已达到使用次数上限",
  12300040: "没有空格子了",
  12300080: "未达到解锁条件",
  200330: "无效的ID",
  12400000: "挂机奖励领取过于频繁",
};

export class TaskRunner {
  constructor(connectionPool) {
    this.pool = connectionPool;
    this.callbacks = {};
    this.carTasks = new CarTasks(connectionPool);
    this.currentAccountName = "";
    this.currentRoleId = "";
  }

  log(message, type = "info") {
    if (this.callbacks.onLog) {
      // 账号名前缀由上层（scheduler.accountLog / BatchEngine）统一添加，这里只输出纯消息
      this.callbacks.onLog({ time: new Date().toLocaleTimeString(), message, type });
    }
    // 同步写入内存缓冲区（不写数据库，前端通过轮询读取）
    logBuffer.push(this._currentAccountId || null, message, type);
  }

  /**
   * 执行游戏命令（增强版：优雅处理已知可忽略错误）
   *
   * 限流处理（参考 xyzw）：
   * - 遇 400340/200750/11800010 立即标记 hasRateLimitError，不内部重试，直接抛出
   * - 由外层 run() 的任务循环捕获并 break，交由 batchEngine 统一等待后断点续跑
   */
  async executeGameCommand(accountId, cmd, params = {}, description = "", timeout = 8000) {
    try {
      if (description) this.log(`${description}...`);
      const result = await this.pool.sendMessage(accountId, cmd, params, timeout);
      if (description) this.log(`${description} - 成功`, "success");
      // 命令成功后应用通用命令延迟（commandDelay），让全局延迟作用于所有走此方法的命令
      const cmdDelay = this.settings?.commandDelay;
      if (cmdDelay && cmdDelay > 0) {
        await new Promise(r => setTimeout(r, cmdDelay));
      }
      return result;
    } catch (error) {
      const errMsg = error.message || "";
      // 限流检测：遇 400340/200750/11800010 立即标记，不重试直接抛出
      // 外层 run() 的任务循环会捕获并 break，由 batchEngine 的限流重试队列统一处理
      if (/400340|200750|11800010/.test(errMsg)) {
        this.hasRateLimitError = true;
        if (description) this.log(`${description} - 服务器限流`, "warning");
        throw error;
      }
      // 检查是否为已知可忽略的错误码
      for (const [code, desc] of Object.entries(SKIP_ERROR_CODES)) {
        if (errMsg.includes(code) || errMsg.includes(desc)) {
          if (description) this.log(`${description} - 跳过 (${desc})`, "warning");
          return { skipped: true, code, message: desc };
        }
      }
      if (description) {
        this.log(`${description} - 失败: ${error.message}`, "error");
      }
      throw error;
    }
  }

  /**
   * 切换阵容
   */
  async switchToFormationIfNeeded(accountId, targetFormation, formationName) {
    try {
      this.log(`检查${formationName}配置...`);
      const teamInfo = await this.executeGameCommand(accountId, "presetteam_getinfo", {}, "获取阵容信息");

      const currentFormation = teamInfo?.presetTeamInfo?.useTeamId;
      this.log(`当前阵容: ${currentFormation}`);
      if (currentFormation === targetFormation) {
        this.log(`当前已是${formationName}${targetFormation}，无需切换`, "success");
        return false;
      }

      this.log(`开始切换到${formationName}${targetFormation}...`);
      await this.executeGameCommand(accountId, "presetteam_saveteam", { teamId: targetFormation }, `切换到${formationName}${targetFormation}`);
      this.log(`成功切换到${formationName}${targetFormation}`, "success");
      return true;
    } catch (error) {
      this.log(`阵容检查失败: ${error.message}`, "warning");
      try {
        await this.executeGameCommand(accountId, "presetteam_saveteam", { teamId: targetFormation }, `强制切换到${formationName}${targetFormation}`);
        return true;
      } catch (e) {
        this.log(`强制切换也失败: ${e.message}`, "error");
        throw e;
      }
    }
  }

  /**
   * 加载账号设置（从DB读取自定义设置 + 合并默认值）
   */
  loadSettings(accountId) {
    const account = db.getAccount(accountId);
    if (!account) return { ...defaultSettings, ...FORCED_SETTINGS };
    try {
      const custom = JSON.parse(account.settings || "{}");
      // 合并顺序：默认值 → 历史设置 → 强制设置（强制设置始终胜出）
      return { ...defaultSettings, ...custom, ...FORCED_SETTINGS };
    } catch {
      return { ...defaultSettings, ...FORCED_SETTINGS };
    }
  }

  /**
   * 批量预刷新账号 Token（在批量任务执行前调用，避免执行中途 token 过期）
   * 仅刷新 bin/url 来源的账号，manual 来源 token 是临时的，不刷新
   * @param {string[]} accountIds 账号ID列表
   * @param {object} callbacks 日志回调 { onLog }
   * @param {number} concurrency 并发数，默认 3（避免 authuser 接口被限流）
   */
  async preRefreshTokens(accountIds, callbacks = {}, concurrency = 3) {
    this.callbacks = callbacks;

    const refreshableIds = accountIds.filter(id => {
      const account = db.getAccount(id);
      return account && account.enabled &&
        (account.import_method === "bin" || account.import_method === "url") &&
        (account.bin_base64 || account.source_url);
    });

    if (refreshableIds.length === 0) {
      this.log("没有可预刷新的账号（仅支持 bin/url 来源）");
      return { refreshed: [], failed: [], skipped: accountIds };
    }

    this.log(`开始批量预刷新 Token: ${refreshableIds.length} 个账号`);

    const results = { refreshed: [], failed: [], skipped: accountIds.filter(id => !refreshableIds.includes(id)) };

    // 按并发数分批
    for (let i = 0; i < refreshableIds.length; i += concurrency) {
      const batch = refreshableIds.slice(i, i + concurrency);
      const batchPromises = batch.map(async (accountId) => {
        const account = db.getAccount(accountId);
        const accountName = account?.name || accountId;
        try {
          this.log("预刷新 Token...");
          await this.pool.refreshToken(accountId);
          this.log("Token 预刷新成功", "success");
          results.refreshed.push(accountId);
        } catch (error) {
          this.log(`Token 预刷新失败: ${error.message}`, "error");
          results.failed.push({ accountId, error: error.message });
        }
      });
      await Promise.all(batchPromises);
      // 批次间稍作等待，避免触发限流
      if (i + concurrency < refreshableIds.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    this.log(`Token 预刷新完成: 成功 ${results.refreshed.length}, 失败 ${results.failed.length}, 跳过 ${results.skipped.length}`);
    return results;
  }

  /**
   * 执行每日任务（含活跃度智能判断，移植自 xyzw_web_helper）
   *
   * 支持限流断点续跑：
   * - options.resumeFromTaskName 指定从哪个任务继续（跳过之前的）
   * - 遇限流码（400340/200750/11800010）时标记 hasRateLimitError 并 break
   * - 返回 { hasRateLimitError, resumeTaskName } 供外层统一等待后断点续跑
   */
  async run(accountId, callbacks = {}, customSettings = null, options = {}) {
    this.callbacks = callbacks;
    // 限流相关状态：每次 run 重置（外层重试时复用 resumeFromTaskName 实现断点续跑）
    this.hasRateLimitError = false;
    this.rateLimitTaskName = null;
    const resumeFromTaskName = options.resumeFromTaskName || null;

    let settings = customSettings || this.loadSettings(accountId);
    // 应用强制设置：覆盖前端传入的 customSettings，确保 FORCED_SETTINGS 始终胜出
    if (settings && typeof settings === "object") {
      settings = { ...settings, ...FORCED_SETTINGS };
    }
    // 暴露给实例方法（如 executeGameCommand）使用通用延迟 commandDelay
    this.settings = settings;
    const account = db.getAccount(accountId);
    const accountName = account?.role_name || account?.name || accountId;

    this.currentAccountName = accountName;
    this.currentRoleId = "";
    this._currentAccountId = accountId;

    // 子任务结果收集（用于结束时写汇总日志）
    this._subTaskResults = [];
    this._taskStartTime = Date.now();

    // 活跃度只在任务结束时保存一次最终值，执行过程中不再反复保存和推送
    // 前端通过 API /api/accounts/:id/daily-point 读取最后一次保存的快照
    const reportDailyPoint = (point, max) => {};

    this.log(`开始每日任务`);

    // 新任务开始前清除可能残留的手动中止标记，避免上一次的断开操作影响本次任务
    this.pool.clearAbort(accountId);
    // 恢复该账号的自动连接权限，确保任务执行期间断线可以自动重连（后续手动断开会重新关闭）
    this.pool.allowAutoConnect(accountId, true);

    // 申请任务槽位：任务执行期间占用并发名额，断线不释放
    await this.pool.acquireTaskSlot(accountId);

    try {
      // 确保已连接
      await this.pool.ensureConnected(accountId);

    // ====== 第一步：获取角色信息 ======
    // 优先复用连接初始化时已缓存的角色信息，避免短时间内重复请求 role_getroleinfo 导致超时
    let roleInfoResp = this.pool.getCachedRoleInfo ? this.pool.getCachedRoleInfo(accountId) : null;
    if (roleInfoResp) {
      this.log("角色信息获取成功（复用连接缓存）", "success");
    } else {
      this.log("正在获取角色信息...");
      try {
        roleInfoResp = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000);
        this.log("角色信息获取成功", "success");
      } catch (error) {
        this.log(`获取角色信息失败: ${error.message}`, "error");
        throw error;
      }
    }

    const roleData = roleInfoResp?.role;
    if (!roleData) throw new Error("角色数据不存在");

    // 记录 roleId，后续日志用 [role:xxx][名字] 前缀，前端可按 roleId 精确匹配
    this.currentRoleId = roleData.roleId || roleData.id || "";

    // 更新角色信息到DB
    try {
      db.updateAccount(accountId, {
        role_id: this.currentRoleId,
        role_name: roleData.name || "",
        level: roleData.level || 0,
      });
    } catch (e) { /* ignore */ }

    // ====== 第二步：先领取所有任务积分，防止任务已完成但积分未领取 ======
    const DAILY_TASK_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const getDailyPointInfo = (dailyTask) => {
      const task = dailyTask || {};
      const point = task.dailyPoint ?? task.dayPoint ?? task.point ?? 0;
      const max = task.maxPoint ?? task.dailyPointMax ?? task.pointMax ?? 100;
      return { point, max };
    };

    let dailyTask = roleData.dailyTask ?? {};
    let { point: currentDailyPoint, max: dailyPointMax } = getDailyPointInfo(dailyTask);

    this.log("领取可用任务积分...");
    let claimedCount = 0;
    for (const taskId of DAILY_TASK_IDS) {
      let claimRetried = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const claimRes = await this.pool.sendMessage(accountId, "task_claimdailypoint", { taskId }, 5000);
          claimedCount++;
          // 部分响应携带最新活跃度
          const claimDailyTask = claimRes?.dailyTask || claimRes?.role?.dailyTask;
          if (claimDailyTask) {
            const { point: newPoint, max: newMax } = getDailyPointInfo(claimDailyTask);
            if (newPoint > currentDailyPoint) {
              currentDailyPoint = newPoint;
              dailyPointMax = newMax;
            }
          }
          await new Promise(r => setTimeout(r, settings.commandDelay));
          break;
        } catch (e) {
          const msg = e?.message || String(e);
          if (/400340/.test(msg) && attempt === 0) {
            // 服务器限流，等待后重试
            claimRetried = true;
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          break; // 其他错误静默跳过
        }
      }
      await new Promise(r => setTimeout(r, claimRetried ? 500 : 300));
    }
    if (claimedCount > 0) {
      this.log(`成功领取 ${claimedCount} 个任务积分，当前活跃度 ${currentDailyPoint}/${dailyPointMax}`, "success");
    }

    // ====== 第三步：多次刷新角色信息直到活跃度稳定 ======
    // 停止信号检查：避免停止后又跑5次×5秒的刷新超时无用功
    if (this.pool.isAborted(accountId)) {
      this.log("检测到手动断开，停止执行任务", "warning");
      return { stopped: true };
    }
    try {
      const maxRefreshAttempts = 5;
      let previousPoint = -1;
      for (let attempt = 1; attempt <= maxRefreshAttempts; attempt++) {
        if (this.pool.isAborted(accountId)) break;
        if (attempt > 1) await new Promise(r => setTimeout(r, 800));
        if (this.pool.isAborted(accountId)) break;
        const freshRoleResp = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000);
        const freshDailyTask = freshRoleResp?.role?.dailyTask ?? freshRoleResp?.dailyTask ?? {};
        const { point: freshPoint, max: freshMax } = getDailyPointInfo(freshDailyTask);
        dailyTask = freshDailyTask;
        if (freshPoint > currentDailyPoint) {
          currentDailyPoint = freshPoint;
          dailyPointMax = freshMax;
        }
        if (attempt >= 2 && freshPoint === previousPoint) break;
        previousPoint = freshPoint;
        if (currentDailyPoint >= dailyPointMax) break;
      }
    } catch (e) {
      this.log(`刷新角色信息失败，使用初始值: ${e.message}`, "warning");
    }

    // 修正活跃度上限
    if (currentDailyPoint > dailyPointMax) {
      dailyPointMax = currentDailyPoint;
    }

    this.log(`当前活跃度: ${currentDailyPoint}/${dailyPointMax}`);
    reportDailyPoint(currentDailyPoint, dailyPointMax);

    // ====== 第四步：活跃度判断与任务模式选择 ======
    const ACTIVITY_MAX = 110;
    const isLeanMode = currentDailyPoint >= ACTIVITY_MAX;

    if (isLeanMode) {
      this.log(`活跃度已满 ${currentDailyPoint}/${ACTIVITY_MAX}，仅执行精简任务`, "info");
    } else {
      this.log(`活跃度 ${currentDailyPoint}/${ACTIVITY_MAX}，检查所有未完成任务`, "info");
    }

    // 活跃度接近达标时额外校验
    if (currentDailyPoint >= 80 && currentDailyPoint < dailyPointMax) {
      if (this.pool.isAborted(accountId)) {
        this.log("检测到手动断开，停止执行任务", "warning");
        return { stopped: true };
      }
      try {
        this.log("活跃度接近达标，再次校验任务完成状态...");
        await new Promise(r => setTimeout(r, 600));
        if (this.pool.isAborted(accountId)) {
          this.log("检测到手动断开，停止执行任务", "warning");
          return { stopped: true };
        }
        const verifyResp = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000);
        const verifyDailyTask = verifyResp?.role?.dailyTask ?? verifyResp?.dailyTask ?? {};
        const { point: verifyPoint, max: verifyMax } = getDailyPointInfo(verifyDailyTask);
        if (verifyPoint >= currentDailyPoint) {
          currentDailyPoint = verifyPoint;
          dailyPointMax = verifyMax;
        }
        dailyTask = verifyDailyTask;
        this.log(`活跃度校验完成: ${currentDailyPoint}/${dailyPointMax}`);
        reportDailyPoint(currentDailyPoint, dailyPointMax);
      } catch (e) {
        this.log(`活跃度校验失败: ${e.message}`, "warning");
      }
    }

    // 构建任务列表前最后检查一次
    if (this.pool.isAborted(accountId)) {
      this.log("检测到手动断开，停止执行任务", "warning");
      return { stopped: true };
    }

    // ====== 构建任务列表 ======
    const completedTasks = dailyTask.complete ?? {};
    const getTaskProgress = (taskId) => {
      const done = completedTasks[taskId];
      if (done === -1) return -1;
      if (typeof done === "number") return done;
      return 0;
    };
    const isTaskCompleted = (taskId) => getTaskProgress(taskId) === -1;
    const taskRemaining = (taskId, target) => {
      const progress = getTaskProgress(taskId);
      if (progress === -1) return 0;
      return Math.max(target - progress, 0);
    };
    const statistics = roleData.statistics ?? {};
    const statisticsTime = roleData.statisticsTime ?? {};

    // 读取当前阵容
    let originalFormation = null;
    try {
      const teamInfo = await this.pool.sendMessage(accountId, "presetteam_getinfo", {}, 5000);
      originalFormation = teamInfo?.presetTeamInfo?.useTeamId;
      this.log(`当前阵容: ${originalFormation}`);
    } catch (error) {
      this.log(`读取当前阵容失败: ${error.message}`, "warning");
    }

    const taskList = [];

    // 判断当前任务是否受用户勾选控制（开关为 true 才执行）
    const isEnabled = (key) => settings[key] !== false;

    // 今日任务去重：构造任务时跳过已执行过的 key，执行成功后标记
    const dailyKeyPrefix = `daily:${accountId}`;
    const taskKey = (name) => `${dailyKeyPrefix}:${name}`;
    const shouldSkip = (name) => isExecutedToday(accountId, taskKey(name));
    const markDone = (name) => markExecutedToday(accountId, taskKey(name));
    // 不受每日去重影响的任务：盐罐/挂机相关每次执行每日都要做
    const isAlwaysRun = (name) => {
      if (["停止盐罐计时", "开始盐罐计时", "领取挂机奖励"].includes(name)) return true;
      if (/^挂机加钟\s+\d/.test(name)) return true;
      return false;
    };
    const pushTask = (name, fn) => {
      if (!isAlwaysRun(name) && shouldSkip(name)) {
        this.log(`${name} - 跳过 (今日已执行过)`, "warning");
        return;
      }
      taskList.push({ name, fn, dailyLimited: !isAlwaysRun(name) });
    };

    // ======== 1. 基础活跃度任务（精简模式跳过，且受用户开关控制） ========
    if (!isLeanMode) {
      if (isEnabled("shareEnable") && !isTaskCompleted(2)) {
        pushTask("分享一次游戏", () => this.executeGameCommand(accountId, "system_mysharecallback", { isSkipShareCard: true, type: 2 }, "分享游戏"));
      }

      if (isEnabled("giveGoldEnable") && !isTaskCompleted(3)) {
        pushTask("赠送好友金币", () => this.executeGameCommand(accountId, "friend_batch", {}, "赠送好友金币"));
      }

      if (isEnabled("freeRecruit") || isEnabled("payRecruit")) {
        const recruitRemaining = taskRemaining(4, 2);
        if (recruitRemaining > 0) {
          // 只要勾选了免费或付费，都会先做免费招募（付费招募的前置条件）
          pushTask("免费招募", () => this.executeGameCommand(accountId, "hero_recruit", { recruitType: 3, recruitNumber: 1 }, "免费招募"));
          if (isEnabled("payRecruit") && recruitRemaining > 1) {
            pushTask("付费招募", () => this.executeGameCommand(accountId, "hero_recruit", { recruitType: 1, recruitNumber: 1 }, "付费招募"));
          }
        }
      }

      if (isEnabled("freeGoldEnable")) {
        const buyGoldRemaining = taskRemaining(6, 3);
        if (buyGoldRemaining > 0 && isTodayAvailable(statisticsTime["buy:gold"])) {
          for (let i = 0; i < buyGoldRemaining; i++) {
            pushTask(`免费点金 ${i + 1}/${buyGoldRemaining}`, () => this.executeGameCommand(accountId, "system_buygold", { buyNum: 1 }, `免费点金 ${i + 1}`));
          }
        }
      }

      if (isEnabled("claimBottle")) {
        // 盐罐
        pushTask("停止盐罐计时", () => this.executeGameCommand(accountId, "bottlehelper_stop", {}, "停止盐罐计时"));
        pushTask("开始盐罐计时", () => this.executeGameCommand(accountId, "bottlehelper_start", {}, "开始盐罐计时"));

        if (!isTaskCompleted(14)) {
          pushTask("领取盐罐奖励", () => this.executeGameCommand(accountId, "bottlehelper_claim", {}, "领取盐罐奖励"));
        }
      }

      if (isEnabled("openBox") && !isTaskCompleted(7)) {
        pushTask("开启木质宝箱", () => this.executeGameCommand(accountId, "item_openbox", { itemId: 2001, number: 10 }, "开启木质宝箱10个"));
      }

      // 免费扭蛋（移植自 xyzw）
      if (isEnabled("freeGachaEnable") && isTodayAvailable(statisticsTime["gacha:free"])) {
        pushTask("免费扭蛋", () => this.executeGameCommand(accountId, "gacha_drawreward", { num: 1, isGroup: false }, "免费扭蛋"));
      }

      // 免费钓鱼
      if (isEnabled("fishingEnable") && isTodayAvailable(statisticsTime["artifact:normal:lottery:time"])) {
        for (let i = 0; i < 3; i++) {
          pushTask(`免费钓鱼 ${i + 1}/3`, () => this.executeGameCommand(accountId, "artifact_lottery", { lotteryNumber: 1, newFree: true, type: 1 }, `免费钓鱼 ${i + 1}`));
        }
      }
    }

    // ======== 2. 挂机奖励（奖励类，不受精简模式影响） ========
    if (isEnabled("claimHangUp")) {
      pushTask("领取挂机奖励", () => this.executeGameCommand(accountId, "system_claimhangupreward", {}, "领取挂机奖励"));
      const hangUpRemaining = taskRemaining(5, 5);
      if (hangUpRemaining > 0) {
        const addTimeCount = Math.min(4, hangUpRemaining);
        for (let i = 0; i < addTimeCount; i++) {
          pushTask(`挂机加钟 ${i + 1}/${addTimeCount}`, () => this.executeGameCommand(accountId, "system_mysharecallback", { isSkipShareCard: true, type: 2 }, `挂机加钟 ${i + 1}`));
        }
      }
    }

    // ======== 3. 竞技场（精简模式保留，受用户开关控制） ========
    // 参考 xyzw：每次执行前查询服务器最新状态，根据咸神门票数量动态决定战斗次数，断线重连后自然幂等
    if (isEnabled("arenaEnable") && !isTaskCompleted(13)) {
      taskList.push({
        name: "竞技场战斗",
        dailyLimited: true,
        fn: async () => {
          const hour = new Date().getHours();
          if (hour < 6) {
            this.log("当前时间未到6点，跳过竞技场", "warning");
            throw new Error("TIME_SKIP");
          }
          if (hour >= 22) {
            this.log("当前时间已过22点，跳过竞技场", "warning");
            throw new Error("TIME_SKIP");
          }
          await this.switchToFormationIfNeeded(accountId, settings.arenaFormation, "竞技场阵容");

          // 查询当前咸神门票数量
          let roleResp;
          try {
            roleResp = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000);
          } catch (e) {
            this.log(`竞技场 - 获取角色信息失败: ${e.message}`, "error");
            throw e;
          }
          const role = roleResp?.role || roleResp?.data?.role;
          let ticketCount = role?.items?.[1007]?.quantity ?? 0;
          if (ticketCount <= 0) {
            this.log(`竞技场 - 当前咸神门票为 ${ticketCount}，跳过`, "warning");
            return;
          }

          // 开始竞技场
          try {
            await this.executeGameCommand(accountId, "arena_startarea", {}, "开始竞技场");
          } catch (e) {
            this.log(`竞技场 - 开始竞技场失败: ${e.message}`, "warning");
          }

          // 根据门票数动态战斗，每场后重新查询门票，避免断线重连后重复消耗
          const maxFights = Math.min(3, ticketCount);
          for (let i = 0; i < maxFights; i++) {
            // 每场战斗前重新查询最新门票数
            try {
              const freshResp = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000);
              const freshRole = freshResp?.role || freshResp?.data?.role;
              ticketCount = freshRole?.items?.[1007]?.quantity ?? 0;
            } catch (e) {
              this.log(`竞技场 - 同步门票失败: ${e.message}`, "warning");
            }
            if (ticketCount <= 0) {
              this.log("竞技场 - 门票已用完，停止战斗", "info");
              break;
            }

            try {
              const targets = await this.executeGameCommand(accountId, "arena_getareatarget", {}, `获取竞技场目标${i + 1}`);
              const targetId = pickArenaTargetId(targets);
              if (targetId) {
                await this.executeGameCommand(accountId, "fight_startareaarena", { targetId }, `竞技场战斗${i + 1}`, 10000);
              } else {
                this.log(`竞技场战斗${i + 1} - 未找到目标`, "warning");
                break;
              }
            } catch (err) {
              this.log(`竞技场战斗${i + 1}失败: ${err.message}`, "error");
              break;
            }
            await new Promise(r => setTimeout(r, 1000));
          }
        },
      });
    }

    // ======== 4. BOSS（精简模式跳过，受用户开关控制） ========
    if (!isLeanMode && settings.bossTimes > 0) {
      let alreadyLegionBoss = statistics["legion:boss"] ?? 0;
      if (isTodayAvailable(statisticsTime["legion:boss"])) alreadyLegionBoss = 0;
      const remainingLegionBoss = Math.max(settings.bossTimes - alreadyLegionBoss, 0);

      if (remainingLegionBoss > 0) {
        pushTask("军团BOSS阵容检查", () => this.switchToFormationIfNeeded(accountId, settings.bossFormation, "BOSS阵容"));
        for (let i = 0; i < remainingLegionBoss; i++) {
          pushTask(`军团BOSS ${i + 1}/${remainingLegionBoss}`, () => this.executeGameCommand(accountId, "fight_startlegionboss", {}, `军团BOSS ${i + 1}`, 12000));
        }
      }

      const todayBossId = getTodayBossId();
      pushTask("每日BOSS阵容检查", () => this.switchToFormationIfNeeded(accountId, settings.bossFormation, "BOSS阵容"));
      for (let i = 0; i < 3; i++) {
        pushTask(`每日BOSS ${i + 1}/3`, () => this.executeGameCommand(accountId, "fight_startboss", { bossId: todayBossId }, `每日BOSS ${i + 1}`, 12000));
      }
    }

    // ======== 5. 固定奖励（奖励类，不受精简模式影响，受用户开关控制） ========
    if (isEnabled("fixedRewardsEnable")) {
      const fixedRewards = [
        { name: "福利签到", cmd: "system_signinreward", params: {} },
        { name: "俱乐部", cmd: "legion_signin", params: {} },
        { name: "领取每日礼包", cmd: "discount_claimreward", params: {} },
        { name: "领取每日免费奖励", cmd: "collection_claimfreereward", params: {} },
        { name: "领取免费礼包", cmd: "card_claimreward", params: {} },
        { name: "领取永久卡礼包", cmd: "card_claimreward", params: { cardId: 4003 } },
      ];

      if (isEnabled("claimEmail")) {
        fixedRewards.push({ name: "领取邮件奖励", cmd: "mail_claimallattachment", params: {} });
      }

      fixedRewards.forEach(r => {
        pushTask(r.name, () => this.executeGameCommand(accountId, r.cmd, r.params, r.name));
      });

      pushTask("领取珍宝阁礼包", () => this.executeGameCommand(accountId, "collection_goodslist", {}, "领取珍宝阁礼包"));
      pushTask("领取珍宝阁免费礼包", () => this.executeGameCommand(accountId, "collection_claimfreereward", {}, "领取珍宝阁免费礼包"));
    }

    // ======== 6. 黑市（精简模式跳过，受用户开关控制） ========
    if (!isLeanMode && isEnabled("blackMarketPurchase") && !isTaskCompleted(12)) {
      pushTask("黑市购买1次物品", () => this.executeGameCommand(accountId, "store_purchase", { goodsId: 1 }, "黑市购买1次物品"));
    }

    // ======== 7. 咸王梦境（精简模式跳过，受用户开关控制） ========
    if (!isLeanMode && isEnabled("dungeonEnable")) {
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 4) {
        pushTask("咸王梦境", () => this.executeGameCommand(accountId, "dungeon_selecthero", { battleTeam: { 0: 107 } }, "咸王梦境"));
      }
    }

    // ======== 8. 灯神扫荡（精简模式保留，受用户开关控制） ========
    if (isEnabled("genieSweepEnable")) {
      const kingdoms = ["魏国", "蜀国", "吴国", "群雄"];
      for (let gid = 1; gid <= 4; gid++) {
        if (isTodayAvailable(statisticsTime[`genie:daily:free:${gid}`])) {
          pushTask(`${kingdoms[gid - 1]}灯神免费扫荡`, () => this.executeGameCommand(accountId, "genie_sweep", { genieId: gid }, `${kingdoms[gid - 1]}灯神免费扫荡`));
        }
      }

      for (let i = 0; i < 3; i++) {
        pushTask(`领取免费扫荡卷 ${i + 1}/3`, () => this.executeGameCommand(accountId, "genie_buysweep", {}, `领取免费扫荡卷 ${i + 1}`));
      }

      // 深海灯神 (周一)
      if (new Date().getDay() === 1 && isTodayAvailable(statisticsTime["genie:daily:free:5"])) {
        pushTask("深海灯神", () => this.executeGameCommand(accountId, "genie_sweep", { genieId: 5, sweepCnt: 1 }, "深海灯神"));
      }
    }

    // ======== 9. 自动答题（精简模式保留，受用户开关控制） ========
    if (isEnabled("studyEnable")) {
      pushTask("自动答题", async () => {
          try {
            const studyResp = await this.pool.sendMessage(accountId, "study_startgame", {}, 8000);
            const body = studyResp?.body ?? studyResp;
            const questionList = body?.questionList;
            const studyId = body?.role?.study?.id;

            if (!questionList || !Array.isArray(questionList) || questionList.length === 0) {
              this.log("答题 - 无题目或今日已完成", "info");
              return;
            }
            if (!studyId) {
              this.log("答题 - 未获取到studyId", "warning");
              return;
            }

            this.log(`答题 - 找到 ${questionList.length} 道题目`);

            for (let i = 0; i < questionList.length; i++) {
              const question = questionList[i];
              const questionText = question.question;
              const questionId = question.id;

              let answer = findAnswer(questionText);
              if (answer === null) {
                answer = 1;
                this.log(`答题 ${i + 1} - 未找到答案，使用默认选项1`, "warning");
              } else {
                this.log(`答题 ${i + 1} - 找到答案: ${answer}`, "success");
              }

              await this.pool.sendMessage(accountId, "study_answer", {
                id: studyId,
                option: [answer],
                questionId: [questionId],
              }, 5000);

              if (i < questionList.length - 1) {
                await new Promise(r => setTimeout(r, 300));
              }
            }

            // 领取答题奖励
            await new Promise(r => setTimeout(r, 1500));
            for (let rewardId = 1; rewardId <= 10; rewardId++) {
              try {
                await this.pool.sendMessage(accountId, "study_claimreward", { rewardId }, 3000);
              } catch (e) { /* 部分奖励可能已领取 */ }
              await new Promise(r => setTimeout(r, 200));
            }
            this.log("答题 - 奖励领取完成", "success");
          } catch (error) {
            this.log(`答题失败: ${error.message}`, "warning");
          }
      });
    }

    // ======== 9. 车辆任务（已从每日模板移除，保留兼容处理） ========
    if (isEnabled("smartSendCarEnable") || isEnabled("claimCarsEnable")) {
      this.log("车辆任务已从每日模板移除，跳过", "warning");
    }

    // ======== 10. 阵容还原 ========
    if (originalFormation) {
      taskList.push({ name: "阵容还原", fn: () => this.switchToFormationIfNeeded(accountId, originalFormation, "初始阵容") });
    }

    // ======== 11. 刷新任务状态后再领取奖励 ========
    taskList.push({
      name: "刷新任务状态",
      fn: async () => {
        this.log("刷新任务完成状态...");
        try {
          const freshResp = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000);
          const freshDailyTask = freshResp?.role?.dailyTask ?? {};
          const { point: freshPoint, max: freshMax } = getDailyPointInfo(freshDailyTask);
          dailyTask = freshDailyTask;
          if (freshPoint > currentDailyPoint) {
            currentDailyPoint = freshPoint;
            dailyPointMax = freshMax;
          }
          this.log(`刷新后活跃度: ${currentDailyPoint}/${dailyPointMax}`);
          reportDailyPoint(currentDailyPoint, dailyPointMax);
        } catch (e) {
          this.log(`刷新任务状态失败: ${e.message}`, "warning");
        }
        await new Promise(r => setTimeout(r, 2000));
      },
    });

    // ======== 12. 任务奖励 ========
    for (const taskId of DAILY_TASK_IDS) {
      taskList.push({
        name: `领取任务奖励${taskId}`,
        fn: async () => {
          const claimRes = await this.executeGameCommand(accountId, "task_claimdailypoint", { taskId }, `领取任务奖励${taskId}`, 5000);
          const claimDailyTask = claimRes?.dailyTask || claimRes?.role?.dailyTask;
          if (claimDailyTask) {
            const { point: newPoint, max: newMax } = getDailyPointInfo(claimDailyTask);
            if (newPoint > currentDailyPoint) {
              currentDailyPoint = newPoint;
              dailyPointMax = newMax;
              this.log(`领取任务奖励${taskId}后活跃度: ${currentDailyPoint}/${dailyPointMax}`, "success");
              reportDailyPoint(currentDailyPoint, dailyPointMax);
            }
          }
        }
      });
    }

    taskList.push(
      { name: "领取日常任务奖励", fn: () => this.executeGameCommand(accountId, "task_claimdailyreward", {}, "领取日常任务奖励") },
      { name: "领取周常任务奖励", fn: () => this.executeGameCommand(accountId, "task_claimweekreward", {}, "领取周常任务奖励") },
      { name: "领取通行证奖励", fn: () => this.executeGameCommand(accountId, "activity_recyclewarorderrewardclaim", { actId: 1 }, "领取通行证奖励") },
    );

    // ======== 执行任务列表 ========
    const totalTasks = taskList.length;
    this.log(`共有 ${totalTasks} 个任务待执行`);

    // 断点续执行：如果指定了恢复任务名，跳过已完成的任务
    let startIndex = 0;
    if (resumeFromTaskName) {
      const foundIndex = taskList.findIndex(t => t.name === resumeFromTaskName);
      if (foundIndex >= 0) {
        startIndex = foundIndex;
        this.log(`从上次限流断点 "${resumeFromTaskName}" 继续执行`, "info");
      }
    }

    // 判断是否为连接/Token 类错误（需要刷新 token 重试）
    const isConnectionError = (errMsg) => {
      return /code=1006|连接失败|连接断开|连接超时|Token|令牌|未连接|timeout|WebSocket|ws/i.test(errMsg);
    };

    for (let i = startIndex; i < taskList.length; i++) {
      const task = taskList[i];

      // 如果用户手动点击了断开/断开全部，停止继续执行任务
      if (this.pool.isAborted(accountId)) {
        this.log("检测到手动断开，停止执行任务", "warning");
        break;
      }

      // 执行前检查连接状态，断线则自动重连
      if (this.pool.getStatus(accountId) !== "connected") {
        // 重连前再次检查是否被手动中止或禁止自动连接，避免用户断开后又自动连上
        if (this.pool.isAborted(accountId) || !this.pool.isAutoConnectAllowed(accountId)) {
          this.log("手动断开状态下不再重连，停止执行任务", "warning");
          break;
        }
        this.log(`连接已断开，尝试重连后继续...`, "warning");
        try {
          await this.pool.ensureConnected(accountId);
          this.log(`重连成功，继续执行任务`, "success");
          await new Promise(r => setTimeout(r, 1000)); // 重连后等待稳定
        } catch (reconnectErr) {
          this.log(`重连失败: ${reconnectErr.message}，跳过 ${task.name}`, "error");
          this._subTaskResults.push({ name: task.name, status: "failed", reason: `重连失败: ${reconnectErr.message}` });
          continue;
        }
      }

      // 执行任务，连接类错误时刷新 token 重试一次
      let taskSuccess = false;
      let timeSkipped = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await task.fn();
          taskSuccess = true;
          break;
        } catch (error) {
          const errMsg = error?.message || String(error);

          // TIME_SKIP 不算失败，也不标记为已执行（非有效执行）
          if (/TIME_SKIP/.test(errMsg)) {
            this.log(`${task.name} - 时间不符跳过`, "warning");
            taskSuccess = true;
            timeSkipped = true;
            break;
          }

          // 限流码（400340/200750/11800010）：executeGameCommand 已标记 hasRateLimitError
          // 立即 break 整个任务循环，记录断点，交由外层统一等待后断点续跑
          if (this.hasRateLimitError) {
            this.rateLimitTaskName = task.name;
            this.log(`遇到服务器限流，停止后续任务（已完成 ${i}/${totalTasks}），等待外层重试`, "warning");
            break;
          }

          // 第一次失败且是连接/Token 类错误，尝试刷新 token 重连并重做当前任务
          if (attempt === 0 && isConnectionError(errMsg)) {
            // 如果已被手动中止或禁止自动连接，不再重连
            if (this.pool.isAborted(accountId) || !this.pool.isAutoConnectAllowed(accountId)) {
              this.log(`${task.name} - 手动断开状态下不再重连`, "warning");
              break;
            }
            this.log(`${task.name} - 连接异常，尝试刷新 Token 重连后重做...`, "warning");
            try {
              // 安全重置旧连接（释放槽位、销毁旧客户端），但不释放任务槽位
              await this.pool.resetConnection(accountId);
              await this.pool.ensureConnected(accountId);
              this.log(`${task.name} - Token 刷新并重连成功，重做任务`, "success");
              await new Promise(r => setTimeout(r, 1000));
              continue; // 重试当前 task.fn()
            } catch (reconnectErr) {
              this.log(`${task.name} - 刷新 Token 重连失败: ${reconnectErr.message}`, "error");
              // 非连接错误，记录后跳出
            }
          }

          // 若服务端返回“今日已执行/次数已用完”，即使失败也标记为已完成，避免下次重复请求
          if (/400030/.test(errMsg) && task.dailyLimited) {
            markDone(task.name);
          }

          this.log(`任务失败: ${task.name} - ${errMsg}`, "error");
          this._subTaskResults.push({ name: task.name, status: "failed", reason: errMsg });
          break;
        }
      }

      // 限流后跳出整个循环（外层 break 只跳出 attempt 循环，这里再跳出 task 循环）
      if (this.hasRateLimitError) {
        this._subTaskResults.push({ name: task.name, status: "rate_limited", reason: "服务器限流" });
        break;
      }

      // 成功执行且非时间跳过的日常限定任务，标记为今日已执行
      if (taskSuccess && !timeSkipped && task.dailyLimited) {
        markDone(task.name);
      }

      // 收集成功的子任务
      if (taskSuccess) {
        this._subTaskResults.push({ name: task.name, status: timeSkipped ? "skipped" : "success" });
        const progress = Math.floor(((i + 1) / totalTasks) * 100);
        if (this.callbacks.onProgress) this.callbacks.onProgress(progress);
      }
      await new Promise(r => setTimeout(r, settings.taskDelay));
    }

    // ======== 二次领取积分（活跃度未达标时，限流时跳过） ========
    if (this.pool.isAborted(accountId)) {
      this.log("任务已停止，跳过二次领取积分", "warning");
    } else if (this.hasRateLimitError) {
      this.log("限流状态，跳过二次领取积分（将在外层重试时补领）", "warning");
    } else if (currentDailyPoint < 100) {
      this.log(`当前活跃度 ${currentDailyPoint} 未达标，尝试二次领取任务积分...`);

      // 先刷新一次
      try {
        const preResp = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000);
        const preDailyTask = preResp?.role?.dailyTask ?? {};
        const { point: prePoint, max: preMax } = getDailyPointInfo(preDailyTask);
        if (prePoint > currentDailyPoint) {
          currentDailyPoint = prePoint;
          dailyPointMax = preMax;
        }
      } catch (e) { /* ignore */ }

      if (currentDailyPoint < 100) {
        let retryClaimedCount = 0;
        for (const taskId of DAILY_TASK_IDS) {
          let retryRetried = false;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const claimRes = await this.pool.sendMessage(accountId, "task_claimdailypoint", { taskId }, 5000);
              retryClaimedCount++;
              const claimDailyTask = claimRes?.dailyTask || claimRes?.role?.dailyTask;
              if (claimDailyTask) {
                const { point: newPoint, max: newMax } = getDailyPointInfo(claimDailyTask);
                if (newPoint > currentDailyPoint) {
                  currentDailyPoint = newPoint;
                  dailyPointMax = newMax;
                }
              }
              await new Promise(r => setTimeout(r, settings.commandDelay));
              break;
            } catch (e) {
              const msg = e?.message || String(e);
              // 限流码：标记并跳出二次领取（交由外层断点续跑统一处理）
              if (/400340|200750|11800010/.test(msg)) {
                this.hasRateLimitError = true;
                this.log(`二次领取任务积分${taskId} - 服务器限流，停止二次领取`, "warning");
                break;
              }
              break;
            }
          }
          if (this.hasRateLimitError) break;
          await new Promise(r => setTimeout(r, retryRetried ? 500 : 300));
        }
        if (retryClaimedCount > 0) {
          this.log(`二次领取成功 ${retryClaimedCount} 个，当前活跃度 ${currentDailyPoint}/${dailyPointMax}`, "success");
        }
      }
    }

    // ======== 最终刷新活跃度（限流/中止时跳过） ========
    if (this.pool.isAborted(accountId)) {
      this.log("任务已停止，跳过最终刷新", "warning");
    } else if (this.hasRateLimitError) {
      this.log("限流状态，跳过最终刷新（将在外层重试时刷新）", "warning");
    } else {
      try {
        const finalResp = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000);
        const finalDailyTask = finalResp?.role?.dailyTask ?? {};
        const { point: finalPoint, max: finalMax } = getDailyPointInfo(finalDailyTask);
        this.log(`最终活跃度: ${finalPoint}/${finalMax}`, "success");
        saveDailySnapshot(accountId, finalPoint, finalMax);
        reportDailyPoint(finalPoint, finalMax);
      } catch (e) { /* ignore */ }
    }

    if (this.callbacks.onProgress) this.callbacks.onProgress(100);
    if (this.hasRateLimitError) {
      this.log(`每日任务因限流中断（断点: ${this.rateLimitTaskName || "未知"}），等待外层重试`, "warning");
    } else if (this.pool.isAborted(accountId)) {
      this.log("每日任务已停止", "warning");
    } else {
      this.log("所有任务执行完成", "success");
    }

    // ======== 写汇总日志到数据库（每账号仅1条，含子任务详情） ========
    const duration = Math.floor((Date.now() - this._taskStartTime) / 1000);
    const successCount = this._subTaskResults.filter(r => r.status === "success").length;
    const failedCount = this._subTaskResults.filter(r => r.status === "failed").length;
    const skippedCount = this._subTaskResults.filter(r => r.status === "skipped").length;
    const rateLimitedCount = this._subTaskResults.filter(r => r.status === "rate_limited").length;
    let overallStatus = "success";
    if (this.hasRateLimitError) overallStatus = "rate_limited";
    else if (this.pool.isAborted(accountId)) overallStatus = "stopped";
    else if (failedCount > 0 && successCount === 0) overallStatus = "failed";
    else if (failedCount > 0) overallStatus = "partial";

    const subTaskSummary = this._subTaskResults.map(r => {
      if (r.status === "success") return `${r.name}✓`;
      if (r.status === "skipped") return `${r.name}⊘`;
      if (r.status === "rate_limited") return `${r.name}⚠`;
      return `${r.name}✗(${r.reason || "失败"})`;
    }).join(" ");

    db.addLog(accountId, accountName, "daily", overallStatus, subTaskSummary, account?.user_key, {
      duration,
      successCount,
      failedCount,
      skippedCount,
      rateLimitedCount,
    });

    // 返回限流信息供外层（batchEngine）做断点续跑
    return {
      hasRateLimitError: this.hasRateLimitError,
      resumeTaskName: this.rateLimitTaskName,
    };
    } finally {
      // 任务执行完毕后释放任务槽位（同时断开连接）
      this.log("释放任务槽位并断开连接", "info");
      try {
        await this.pool.releaseTaskSlot(accountId);
      } catch (e) {
        this.log(`释放任务槽位时出错: ${e.message}`, "warning");
      }
      this.currentAccountName = "";
      this.currentRoleId = "";
    }
  }
}

export default TaskRunner;
