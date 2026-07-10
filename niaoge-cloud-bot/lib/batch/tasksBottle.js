/**
 * 盐罐 批处理 - 从 xyzw_web_helper tasksBottle.js 移植
 */
import * as db from "../db.js";

export class BottleTasks {
  constructor(pool) {
    this.pool = pool;
    this.callbacks = {};
  }

  log(msg, type = "info") {
    const cb = this.callbacks;
    if (typeof cb === "function") {
      cb({ time: new Date().toLocaleTimeString(), message: msg, type });
    } else if (cb?.onLog) {
      cb.onLog({ time: new Date().toLocaleTimeString(), message: msg, type });
    }
  }

  async exec(accountId, cmd, params = {}, desc = "", timeout = 5000) {
    try {
      if (desc) this.log(`${desc}...`);
      const r = await this.pool.sendMessage(accountId, cmd, params, timeout);
      if (desc) this.log(`${desc} - 成功`, "success");
      return r;
    } catch (e) {
      if (desc) this.log(`${desc} - 失败: ${e.message}`, "error");
      throw e;
    }
  }

  /** 重置盐罐: 停止计时→开始计时 */
  async resetBottles(accountId, logCb) {
    this.callbacks = typeof logCb === "function" ? { onLog: logCb } : (logCb || {});
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 重置盐罐 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      await this.exec(accountId, "bottlehelper_stop", {}, "停止盐罐计时");
      await new Promise(r => setTimeout(r, 500));
      await this.exec(accountId, "bottlehelper_start", {}, "开始盐罐计时");
    } catch (e) { this.log(`重置盐罐失败: ${e.message}`, "error"); }

    this.log(`[${name}] 盐罐重置完成`, "success");
  }

  /** 领取盐罐: 重置→领取奖励 */
  async claimBottles(accountId, logCb) {
    this.callbacks = typeof logCb === "function" ? { onLog: logCb } : (logCb || {});
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 领取盐罐 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      // 先重置
      await this.exec(accountId, "bottlehelper_stop", {}, "停止盐罐计时");
      await new Promise(r => setTimeout(r, 500));
      await this.exec(accountId, "bottlehelper_start", {}, "开始盐罐计时");
      await new Promise(r => setTimeout(r, 500));
      // 领取奖励
      await this.exec(accountId, "bottlehelper_claim", {}, "领取盐罐奖励");
    } catch (e) { this.log(`领取盐罐失败: ${e.message}`, "error"); }

    this.log(`[${name}] 盐罐领取完成`, "success");
  }
}

export default BottleTasks;
