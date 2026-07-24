import { randomUUID } from "crypto";
import * as db from "./db.js";

const DEFAULT_BATCH_SETTINGS = {
  maxActive: 2,
  commandDelay: 500,
  taskDelay: 500,
  // 批次间间隔（一批账号跑完后等待多久再启动下一批）
  batchDelay: 1000,
  // 失败账号重试间隔（第一轮全部跑完后，失败账号等待多久再重试）
  retryDelay: 3000,
  // 失败账号最大重试次数
  maxRetry: 1,
  // 限流（400340/200750/11800010）断点续跑等待间隔
  rateLimitRetryDelay: 60000,
  // 限流断点续跑最大重试次数
  maxRateLimitRetry: 3,
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
   *
   * 改造为分批模式（参考 xyzw runInBatches）：
   * - 按 maxActive 切片成多批，批内并发、批间串行
   * - 批间等待 batchDelay（用户可配，避免账号多时连环触发限流）
   * - 第一轮跑完后，失败账号按批重试 maxRetry 次，重试间隔 retryDelay
   *
   * 可通过 options.executeOne 传入自定义单账号执行函数（如每日任务），
   * 不传则走默认的 executeBatchOperation（普通批量操作）。
   */
  async run(runId, options = {}) {
    const run = this.runs.get(runId);
    if (!run) throw new Error("批量运行不存在: " + runId);

    // 读取用户 batchSettings（含 maxActive/batchDelay/retryDelay/maxRetry 等）
    const userSettings = run.userKey ? (db.getUserSetting(run.userKey, "batchSettings") || {}) : {};
    const settings = { ...DEFAULT_BATCH_SETTINGS, ...userSettings, ...(run.body || {}) };
    const maxActive = Math.max(1, Number(settings.maxActive) || this.maxConcurrency);
    const batchDelay = Math.max(0, Number(settings.batchDelay) || 0);
    const retryDelay = Math.max(0, Number(settings.retryDelay) || 0);
    const maxRetry = Math.max(0, Number(settings.maxRetry) || 0);

    // 自定义单账号执行函数（每日任务用），不传则走默认
    const customExecuteOne = options.executeOne || null;

    // 单账号执行包装：状态流转 + 日志 + 槽位管理
    const executeOne = async (accountId) => {
      if (run.aborted) {
        run.status.set(accountId, "cancelled");
        this._emitStatus(run, accountId, "cancelled");
        return;
      }
      run.status.set(accountId, "running");
      this._emitStatus(run, accountId, "running");

      // 使用连接中缓存的真实角色名，未连接时回退到数据库显示名
      const name = this.pool
        ? this.pool.getRoleName(accountId)
        : (db.getAccount(accountId, run.userKey)?.name || accountId);
      this._emitLog(run, accountId, `[${name}] 开始执行 ${this._getLabel(run.operation)}`, "info");

      try {
        if (customExecuteOne) {
          // 每日任务路径：槽位/连接/释放全部由 taskRunner.run 内部管理
          // batchEngine 只负责状态流转和日志，不重复 acquireTaskSlot/ensureConnected，否则会双重占用导致死锁
          const logCb = (entry) => {
            let message = entry.message || "";
            const prefix = `[${name}]`;
            if (message.startsWith(prefix)) {
              message = message.slice(prefix.length).trimStart();
            }
            this._emitLog(run, accountId, `${prefix} ${message}`, entry.type || "info");
          };
          await customExecuteOne(accountId, logCb, name);
        } else {
          // 默认批量操作路径：由 batchEngine 管理槽位和连接
          if (this.pool) {
            this.pool.allowAutoConnect(accountId, true);
            this.pool.clearAbort(accountId);
          }
          if (this.pool) {
            await this.pool.acquireTaskSlot(accountId).catch(() => {});
          }
          if (this.pool) {
            try {
              await this.pool.ensureConnected(accountId);
            } catch (e) {
              throw new Error(`连接失败: ${e.message}`);
            }
          }
          const logCb = (entry) => {
            let message = entry.message || "";
            const prefix = `[${name}]`;
            if (message.startsWith(prefix)) {
              message = message.slice(prefix.length).trimStart();
            }
            this._emitLog(run, accountId, `${prefix} ${message}`, entry.type || "info");
          };
          await executeBatchOperation(this.modules, run.operation, accountId, run.body, logCb, run.userKey);
        }
        run.status.set(accountId, "completed");
        this._emitStatus(run, accountId, "completed");
        this._emitLog(run, accountId, `[${name}] ${this._getLabel(run.operation)} 执行完成`, "info");
      } catch (error) {
        run.status.set(accountId, "failed");
        this._emitStatus(run, accountId, "failed");
        this._emitLog(run, accountId, `[${name}] 执行失败: ${error.message}`, "error");
      } finally {
        // 仅默认批量操作需要 batchEngine 释放槽位，每日任务由 taskRunner 自行释放
        if (!customExecuteOne && this.pool) {
          await this.pool.releaseTaskSlot(accountId);
        }
      }
    };

    // 执行一批账号（批内并发）
    const runBatch = async (batchIds) => {
      await Promise.all(batchIds.map((id) => executeOne(id)));
    };

    const totalAccounts = run.accountIds.length;
    const totalBatches = Math.ceil(totalAccounts / maxActive);

    this._emitLog(run, null, `共 ${totalAccounts} 个账号，分 ${totalBatches} 批执行，每批 ${maxActive} 个`, "info");

    // ===== 第一轮：按批次执行所有账号 =====
    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      if (run.aborted) break;
      const start = batchIdx * maxActive;
      const end = Math.min(start + maxActive, totalAccounts);
      const batchIds = run.accountIds.slice(start, end);

      this._emitLog(run, null, `批次 ${batchIdx + 1}/${totalBatches} 开始执行 ${batchIds.length} 个账号`, "info");
      await runBatch(batchIds);
      this._emitLog(run, null, `批次 ${batchIdx + 1}/${totalBatches} 执行完成`, "success");

      // 批间延迟（非最后一批）
      if (batchIdx + 1 < totalBatches && !run.aborted && batchDelay > 0) {
        this._emitLog(run, null, `等待 ${batchDelay / 1000} 秒后执行下一批...`, "info");
        await new Promise((r) => setTimeout(r, batchDelay));
      }
    }

    // ===== 第二轮：失败账号重试（也按批次） =====
    if (maxRetry > 0 && !run.aborted) {
      let failedIds = run.accountIds.filter((id) => run.status.get(id) === "failed");

      for (let retryIdx = 0; retryIdx < maxRetry && failedIds.length > 0 && !run.aborted; retryIdx++) {
        this._emitLog(run, null, `第 ${retryIdx + 1}/${maxRetry} 次重试：${failedIds.length} 个账号失败，等待 ${retryDelay / 1000} 秒`, "warning");
        if (retryDelay > 0) {
          await new Promise((r) => setTimeout(r, retryDelay));
        }
        if (run.aborted) break;

        // 重试前重置状态为 waiting
        failedIds.forEach((id) => {
          run.status.set(id, "waiting");
          this._emitStatus(run, id, "waiting");
        });

        const retryBatches = Math.ceil(failedIds.length / maxActive);
        for (let batchIdx = 0; batchIdx < retryBatches && !run.aborted; batchIdx++) {
          const start = batchIdx * maxActive;
          const end = Math.min(start + maxActive, failedIds.length);
          const batchIds = failedIds.slice(start, end);
          this._emitLog(run, null, `重试批次 ${batchIdx + 1}/${retryBatches} 开始执行 ${batchIds.length} 个账号`, "info");
          await runBatch(batchIds);
        }
        failedIds = run.accountIds.filter((id) => run.status.get(id) === "failed");
      }

      if (failedIds.length > 0) {
        this._emitLog(run, null, `${failedIds.length} 个账号重试后仍失败`, "error");
      }
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
   * 中止所有未完成的运行，返回被中止的 runId 列表
   */
  abortAll() {
    const stopped = [];
    for (const [runId, run] of this.runs) {
      if (!run.completedAt) {
        run.aborted = true;
        run.abortController.abort();
        stopped.push(runId);
      }
    }
    return stopped;
  }

  /**
   * 获取所有未完成运行的账号列表（用于统一断开连接）
   */
  getActiveAccountIds() {
    const ids = new Set();
    for (const [, run] of this.runs) {
      if (!run.completedAt) {
        for (const aid of run.accountIds) ids.add(aid);
      }
    }
    return [...ids];
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
      }, logCb, userKey);
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
