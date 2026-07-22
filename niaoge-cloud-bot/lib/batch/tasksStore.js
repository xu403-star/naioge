/**
 * 商店任务 - 四圣碎片/皮肤币/黑市/珍宝阁
 * 从 xyzw_web_helper tasksStore.js 移植
 */
import { makeLog, makeExec } from "./logHelper.js";
import { isExecutedToday, markExecutedToday } from "./dailyExecutedUtils.js";

export class StoreTasks {
  constructor(pool) {
    this.pool = pool;
  }

  // ==================== 俱乐部商店 ====================

  /**
   * 购买四圣碎片 (goodsId=6)
   */
  async buyFourGuardiansFragment(accountId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 购买四圣碎片 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const result = await exec("legion_storebuygoods", { id: 6 }, "购买四圣碎片");
      log(`四圣碎片购买成功`, "success");
      return result;
    } catch (e) {
      if (e.message?.includes("超出上限") || e.message?.includes("已购买")) {
        log(`本周已购买过四圣碎片`, "info");
      } else if (e.message?.includes("不存在") || e.message?.includes("400000")) {
        log(`盐锭不足或未加入军团`, "error");
      } else {
        log(`购买失败: ${e.message}`, "error");
      }
    }
  }

  /**
   * 购买皮肤币 (goodsId=1, 5次)
   */
  async buySkinCoins(accountId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 购买皮肤币 x5 ===`);
    await this.pool.ensureConnected(accountId);

    let result;
    try {
      for (let i = 0; i < 5; i++) {
        result = await exec("legion_storebuygoods", { id: 1 }, `皮肤币 ${i + 1}/5`);
        await new Promise(r => setTimeout(r, 500));
      }
      log(`皮肤币购买完成`, "success");
    } catch (e) {
      if (result?.error?.includes("超出上限") || e.message?.includes("超出上限")) {
        log(`本周已购买过皮肤币`, "info");
      } else if (e.message?.includes("不存在")) {
        log(`盐锭不足或未加入军团`, "error");
      } else {
        log(`购买失败: ${e.message}`, "error");
      }
    }
  }

  // ==================== 黑市 ====================

  /**
   * 黑市一键采购
   * @param {string} accountId
   * @param {object|function} callbacks - 日志回调，支持 { onLog } 或函数
   * @param {object} options - { force?: boolean }
   */
  async storeQuickPurchase(accountId, callbacks = {}, options = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);

    // 每日防重复：今日已执行过则跳过
    if (!options.force && isExecutedToday(accountId, "blackMarket")) {
      log(`今日已执行过黑市采购，跳过`, "info");
      return { skipped: true, reason: "already_executed_today" };
    }

    log(`=== 黑市采购 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      await exec("store_purchase", {}, "黑市一键采购");
      log(`黑市采购成功`, "success");
      markExecutedToday(accountId, "blackMarket");
      return { success: true };
    } catch (e) {
      log(`黑市采购失败: ${e.message}`, "error");
      throw e;
    }
  }

  // ==================== 珍宝阁 ====================

  /**
   * 免费领取珍宝阁每日奖励
   */
  async claimCollectionFree(accountId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 珍宝阁免费领取 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      await exec("collection_claimfreereward", {}, "珍宝阁免费奖励");
      log(`珍宝阁领取成功`, "success");
    } catch (e) {
      log(`珍宝阁领取失败: ${e.message}`, "error");
    }
  }
}

export default StoreTasks;
