/**
 * 商店任务 - 四圣碎片/皮肤币/黑市/珍宝阁
 * 从 xyzw_web_helper tasksStore.js 移植
 */
import * as db from "../db.js";
import { isExecutedToday, markExecutedToday } from "./dailyExecutedUtils.js";

export class StoreTasks {
  constructor(pool) {
    this.pool = pool;
    this.callbacks = {};
  }

  log(msg, type = "info") {
    if (typeof this.callbacks === "function") {
      this.callbacks({ time: new Date().toLocaleTimeString(), message: msg, type });
      return;
    }
    if (this.callbacks && typeof this.callbacks.onLog === "function") {
      this.callbacks.onLog({ time: new Date().toLocaleTimeString(), message: msg, type });
    }
  }

  async exec(accountId, cmd, params = {}, desc = "", timeout = 8000) {
    try {
      if (desc) this.log(`${desc}...`);
      const r = await this.pool.sendMessage(accountId, cmd, params, timeout);
      return r;
    } catch (e) {
      if (desc) this.log(`${desc} - 失败: ${e.message}`, "error");
      throw e;
    }
  }

  // ==================== 俱乐部商店 ====================

  /**
   * 购买四圣碎片 (goodsId=6)
   */
  async buyFourGuardiansFragment(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 购买四圣碎片 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const result = await this.exec(accountId, "legion_storebuygoods", { id: 6 }, "购买四圣碎片");
      this.log(`[${name}] 四圣碎片购买成功`, "success");
      return result;
    } catch (e) {
      if (e.message?.includes("超出上限") || e.message?.includes("已购买")) {
        this.log(`[${name}] 本周已购买过四圣碎片`, "info");
      } else if (e.message?.includes("不存在") || e.message?.includes("400000")) {
        this.log(`[${name}] 盐锭不足或未加入军团`, "error");
      } else {
        this.log(`[${name}] 购买失败: ${e.message}`, "error");
      }
    }
  }

  /**
   * 购买皮肤币 (goodsId=1, 5次)
   */
  async buySkinCoins(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 购买皮肤币 x5 ===`);
    await this.pool.ensureConnected(accountId);

    let result;
    try {
      for (let i = 0; i < 5; i++) {
        result = await this.exec(accountId, "legion_storebuygoods", { id: 1 }, `皮肤币 ${i + 1}/5`);
        await new Promise(r => setTimeout(r, 500));
      }
      this.log(`[${name}] 皮肤币购买完成`, "success");
    } catch (e) {
      if (result?.error?.includes("超出上限") || e.message?.includes("超出上限")) {
        this.log(`[${name}] 本周已购买过皮肤币`, "info");
      } else if (e.message?.includes("不存在")) {
        this.log(`[${name}] 盐锭不足或未加入军团`, "error");
      } else {
        this.log(`[${name}] 购买失败: ${e.message}`, "error");
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
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;

    // 每日防重复：今日已执行过则跳过
    if (!options.force && isExecutedToday(accountId, "blackMarket")) {
      this.log(`[${name}] 今日已执行过黑市采购，跳过`, "info");
      return { skipped: true, reason: "already_executed_today" };
    }

    this.log(`[${name}] === 黑市采购 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      await this.exec(accountId, "store_purchase", {}, "黑市一键采购");
      this.log(`[${name}] 黑市采购成功`, "success");
      markExecutedToday(accountId, "blackMarket");
      return { success: true };
    } catch (e) {
      this.log(`[${name}] 黑市采购失败: ${e.message}`, "error");
      throw e;
    }
  }

  // ==================== 珍宝阁 ====================

  /**
   * 免费领取珍宝阁每日奖励
   */
  async claimCollectionFree(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 珍宝阁免费领取 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      await this.exec(accountId, "collection_claimfreereward", {}, "珍宝阁免费奖励");
      this.log(`[${name}] 珍宝阁领取成功`, "success");
    } catch (e) {
      this.log(`[${name}] 珍宝阁领取失败: ${e.message}`, "error");
    }
  }
}

export default StoreTasks;
