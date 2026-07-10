import { randomUUID } from "crypto";
import * as db from "./db.js";

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

/**
 * 统一批量任务引擎
 *
 * 职责：
 * 1. 并发调度多个账号执行同一个批量操作
 * 2. 提供运行实例（runId）级别的状态跟踪
 * 3. 支持中止未开始/运行中的批量任务
 * 4. 统一日志与状态回调
 *
 * 注意：当前版本对“已启动的单个账号任务”采用协作式中止——
 * 即引擎会停止调度新账号，但不会强制中断已经在执行的 batch 模块方法。
 * 如需强制中断循环内部，需要 batch 模块方法显式检查 signal。
 */
export class BatchEngine {
  constructor(batchModules, options = {}) {
    this.modules = batchModules;
    this.maxConcurrency = options.maxConcurrency || 2;
    this.pool = options.pool || null;
    this.runs = new Map();
    this.labelMap = options.labelMap || {};
  }

  _getLabel(operation) {
    return this.labelMap[operation] || operation;
  }

  /**
   * 创建一次批量运行，返回 runId
   */
  createRun(operation, accountIds, body = {}, options = {}) {
    const runId = randomUUID();
    const run = {
      id: runId,
      operation,
      accountIds: [...accountIds],
      body,
      userKey: options.userKey,
      status: new Map(), // accountId -> waiting | running | completed | failed | cancelled
      logs: [],
      aborted: false,
      startedAt: new Date(),
      completedAt: null,
      onLog: options.onLog,
      onStatus: options.onStatus,
      abortController: new AbortController(),
    };
    for (const id of accountIds) {
      run.status.set(id, "waiting");
    }
    this.runs.set(runId, run);
    return runId;
  }

  /**
   * 执行一次批量运行，返回最终状态
   */
  async run(runId) {
    const run = this.runs.get(runId);
    if (!run) throw new Error("批量运行不存在: " + runId);

    const executing = new Set();
    const queue = [...run.accountIds];

    const processNext = async () => {
      if (run.aborted) return;
      if (queue.length === 0) return;
      if (executing.size >= this.maxConcurrency) return;

      const accountId = queue.shift();
      executing.add(accountId);
      run.status.set(accountId, "running");
      this._emitStatus(run, accountId, "running");

      try {
        // 申请任务槽位，确保任务执行期间占用并发名额
        if (this.pool) {
          await this.pool.acquireTaskSlot(accountId).catch(() => {});
        }

        // 确保账号已连接，左侧状态显示在线
        if (this.pool) {
          try {
            await this.pool.ensureConnected(accountId);
          } catch (e) {
            throw new Error(`连接失败: ${e.message}`);
          }
        }

        const account = db.getAccount(accountId, run.userKey);
        const name = account?.name || accountId;
        this._emitLog(run, accountId, `[${name}] 开始执行 ${this._getLabel(run.operation)}`, "info");

        const logCb = (entry) => {
          this._emitLog(run, accountId, entry.message, entry.type || "info");
        };

        await executeBatchOperation(this.modules, run.operation, accountId, run.body, logCb, run.userKey);
        run.status.set(accountId, "completed");
        this._emitStatus(run, accountId, "completed");
        this._emitLog(run, accountId, `[${name}] ${this._getLabel(run.operation)} 执行完成`, "info");
      } catch (error) {
        run.status.set(accountId, "failed");
        this._emitStatus(run, accountId, "failed");
        this._emitLog(run, accountId, `执行失败: ${error.message}`, "error");
      } finally {
        executing.delete(accountId);
        // 释放任务槽位，自动断开连接
        if (this.pool) {
          await this.pool.releaseTaskSlot(accountId);
        }
        // 尽快启动下一个
        processNext();
      }
    };

    // 初始启动最多 maxConcurrency 个任务
    const starters = [];
    const initialCount = Math.min(this.maxConcurrency, queue.length);
    for (let i = 0; i < initialCount; i++) {
      starters.push(processNext());
    }

    // 等待所有任务完成或中止
    while (executing.size > 0 || queue.length > 0) {
      if (run.aborted) {
        // 已中止时，把排队中的账号标记为 cancelled，不再启动
        while (queue.length > 0) {
          const id = queue.shift();
          run.status.set(id, "cancelled");
          this._emitStatus(run, id, "cancelled");
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    run.completedAt = new Date();
    return this.getStatus(runId);
  }

  /**
   * 中止指定运行
   */
  abort(runId) {
    const run = this.runs.get(runId);
    if (!run) return false;
    run.aborted = true;
    run.abortController.abort();
    return true;
  }

  /**
   * 获取运行状态
   */
  getStatus(runId) {
    const run = this.runs.get(runId);
    if (!run) return null;
    return {
      id: run.id,
      operation: run.operation,
      aborted: run.aborted,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      status: Object.fromEntries(run.status),
      summary: this._summarize(run),
    };
  }

  /**
   * 获取运行日志（最近 500 条）
   */
  getLogs(runId, limit = 500) {
    const run = this.runs.get(runId);
    if (!run) return null;
    return run.logs.slice(-limit);
  }

  /**
   * 清理已完成且超过 1 小时的运行记录，防止内存泄漏
   */
  cleanup(maxAgeMs = 60 * 60 * 1000) {
    const now = Date.now();
    for (const [runId, run] of this.runs) {
      if (run.completedAt && now - run.completedAt.getTime() > maxAgeMs) {
        this.runs.delete(runId);
      }
    }
  }

  _summarize(run) {
    const counts = { waiting: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const status of run.status.values()) {
      counts[status] = (counts[status] || 0) + 1;
    }
    return counts;
  }

  _emitLog(run, accountId, message, type = "info") {
    const entry = {
      time: new Date().toISOString(),
      accountId,
      message,
      type,
    };
    run.logs.push(entry);
    if (run.onLog) {
      try {
        run.onLog(entry);
      } catch (e) {
        // 忽略回调异常
      }
    }
  }

  _emitStatus(run, accountId, status) {
    if (run.onStatus) {
      try {
        run.onStatus(accountId, status);
      } catch (e) {
        // 忽略回调异常
      }
    }
  }
}

/**
 * 统一批量操作调度函数
 * 从 server.js 提取，供 BatchEngine 与单账号接口复用
 */
export async function executeBatchOperation(modules, operation, accountId, body = {}, logCb = () => {}, userKey = null) {
  const m = modules;
  const globalSettings = userKey ? (db.getUserSetting(userKey, "batchSettings") || {}) : {};
  const s = { ...DEFAULT_BATCH_SETTINGS, ...globalSettings, ...(body || {}) };

  switch (operation) {
    // ======== 日常 ========
    case "claimHangUp": return m.hangup.claimHangUp(accountId, logCb);
    case "addHangUpTime": return m.hangup.addHangUpTime(accountId, logCb);
    case "resetBottles": return m.bottle.resetBottles(accountId, logCb);
    case "claimBottles": return m.bottle.claimBottles(accountId, logCb);
    case "clubSign": return m.club.signin(accountId, logCb);
    case "study": return m.item.study(accountId, logCb);
    case "arena": return m.arena.arenaFight(accountId, logCb);
    case "smartSendCar":
      return m.car.smartSend(accountId, {
        thresholds: s.thresholds || {
          gold: s.goldThreshold ?? s.carGoldThreshold ?? 500,
          recruit: s.recruitThreshold ?? s.carRecruitThreshold ?? 3,
          jade: s.jadeThreshold ?? s.carJadeThreshold ?? 500,
          ticket: s.ticketThreshold ?? s.carTicketThreshold ?? 4,
        },
        assignHelper: s.assignHelper ?? true,
        delay: s.delay || { action: s.actionDelay ?? 300, refresh: s.refreshDelay ?? 1000 },
      }, logCb);
    case "claimCars": return m.car.claimAll(accountId, logCb);
    case "blackMarket": return m.store.storeQuickPurchase(accountId, logCb, { force: s.force });
    case "treasurePavilion": return m.store.claimCollectionFree(accountId, logCb);
    case "genieSweep": return m.item.genieSweep(accountId, logCb);
    case "freeGacha": return m.item.freeGacha(accountId, logCb);
    // ======== 副本 ========
    case "tower": return m.tower.climbTower(accountId, logCb);
    case "dream": return m.dungeon.mengjing(accountId, logCb);
    case "skinChallenge": return m.item.skinChallenge(accountId, logCb);
    case "peachTasks": return m.item.claimPeachTasks(accountId, logCb);
    case "dreamShop": return m.dungeon.buyDreamItems(accountId, s.purchaseList, logCb, userKey);
    // ======== 宝库 ========
    case "baoku13": return m.dungeon.baoku13(accountId, logCb);
    case "baoku45": return m.dungeon.baoku45(accountId, logCb);
    // ======== 怪异塔 ========
    case "weirdTower": return m.tower.climbWeirdTower(accountId, logCb);
    case "weirdTowerUseItems": return m.tower.useItems(accountId, logCb);
    case "weirdTowerMerge": return m.tower.mergeItems(accountId, logCb);
    case "weirdTowerFreeEnergy": return m.tower.claimFreeEnergy(accountId, logCb);
    // ======== 资源 ========
    case "chest": return m.item.openBox(accountId, s.boxId ?? s.defaultBoxType ?? 2001, s.maxCount ?? s.boxCount ?? 100, logCb);
    case "chestPoints": return m.item.claimBoxPointReward(accountId, logCb);
    case "fish": return m.item.fish(accountId, s.fishType ?? s.defaultFishType ?? 2, s.maxCount ?? s.fishCount ?? 100, logCb);
    case "recruit": return m.item.recruit(accountId, s.recruitType ?? 1, s.maxCount ?? s.recruitCount ?? 10, logCb);
    case "heroUpgrade": return m.item.heroUpgrade(accountId, s.heroIds || [], logCb);
    case "bookUpgrade": return m.item.bookUpgrade(accountId, s.heroIds || [], logCb);
    case "fourSaints": return m.store.buyFourGuardiansFragment(accountId, logCb);
    case "skinCoins": return m.store.buySkinCoins(accountId, logCb);
    // ======== 功法 ========
    case "legacyClaim": return m.legacy.claimHangUp(accountId, logCb);
    case "legacyGift": return m.legacy.giftSend(accountId, s.recipientId, s.quantity, s.password, logCb);
    // ======== 月度 ========
    case "topUpFish": return m.monthly.topUpFish(accountId, logCb, s.target);
    case "topUpArena": return m.monthly.topUpArena(accountId, logCb, s.target);
    // ======== 兼容旧 key ========
    case "dungeonBaoku13": return m.dungeon.baoku13(accountId, logCb);
    case "dungeonBaoku45": return m.dungeon.baoku45(accountId, logCb);
    case "dungeonMengjing": return m.dungeon.mengjing(accountId, logCb);
    case "dungeonBuyDreamItems": return m.dungeon.buyDreamItems(accountId, s.purchaseList, logCb, userKey);
    case "towerClimb": return m.tower.climbTower(accountId, logCb);
    case "towerClimbWeird": return m.tower.climbWeirdTower(accountId, logCb);
    case "towerClaimFreeEnergy": return m.tower.claimFreeEnergy(accountId, logCb);
    case "carSmartSend": return m.car.smartSend(accountId, s.minColor || 4, logCb);
    case "carClaimAll": return m.car.claimAll(accountId, logCb);
    case "itemOpenBox": return m.item.openBox(accountId, s.boxId ?? s.defaultBoxType ?? 2001, s.maxCount ?? s.boxCount ?? 100, logCb);
    case "itemClaimBoxPoint": return m.item.claimBoxPointReward(accountId, logCb);
    case "itemFish": return m.item.fish(accountId, s.fishType ?? s.defaultFishType ?? 2, s.maxCount ?? s.fishCount ?? 100, logCb);
    case "itemRecruit": return m.item.recruit(accountId, s.recruitType ?? 1, s.maxCount ?? s.recruitCount ?? 10, logCb);
    case "itemHeroUpgrade": return m.item.heroUpgrade(accountId, s.heroIds || [], logCb);
    case "itemBookUpgrade": return m.item.bookUpgrade(accountId, s.heroIds || [], logCb);
    case "itemGenieSweep": return m.item.genieSweep(accountId, logCb);
    case "itemClaimPeach": return m.item.claimPeachTasks(accountId, logCb);
    case "itemClaimBookReward": return m.item.claimBookReward(accountId, logCb);
    case "legacyClaimHangUp": return m.legacy.claimHangUp(accountId, logCb);
    case "legacyGiftSend": return m.legacy.giftSend(accountId, s.recipientId, s.quantity, s.password, logCb);
    case "monthlyTopUpFish": return m.monthly.topUpFish(accountId, logCb, s.target);
    case "monthlyTopUpArena": return m.monthly.topUpArena(accountId, logCb, s.target);
    case "clubSignin": return m.club.signin(accountId, logCb);
    case "clubResearch": return m.club.research(accountId, s.researchId || 1, logCb);
    case "clubApproveAll": return m.club.approveAll(accountId, logCb);
    case "clubSignupMatch": return m.club.signupMatch(accountId, logCb);
    case "clubWarGuess": return m.club.warGuess(accountId, s.legionId, s.guessCoin || 20, logCb);
    case "storeFourGuardians": return m.store.buyFourGuardiansFragment(accountId, logCb);
    case "storeSkinCoins": return m.store.buySkinCoins(accountId, logCb);
    case "storeQuickPurchase": return m.store.storeQuickPurchase(accountId, logCb);
    case "storeCollectionFree": return m.store.claimCollectionFree(accountId, logCb);
    default:
      throw new Error(`未知批量操作: ${operation}`);
  }
}
