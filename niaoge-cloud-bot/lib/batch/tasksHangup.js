/**
 * 挂机 批处理 - 从 xyzw_web_helper tasksHangUp.js 移植
 */
import * as db from "../db.js";

export class HangupTasks {
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

  /** 领取挂机奖励 */
  async claimHangUp(accountId, logCb) {
    this.callbacks = typeof logCb === "function" ? { onLog: logCb } : (logCb || {});
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 领取挂机奖励 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      await this.exec(accountId, "system_claimhangupreward", {}, "领取挂机奖励");
      await new Promise(r => setTimeout(r, 500));
      // 刷新角色信息
      try { await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 10000); } catch {}
    } catch (e) { this.log(`领取挂机奖励失败: ${e.message}`, "error"); }

    this.log(`[${name}] 挂机奖励领取完成`, "success");
  }

  /** 挂机加钟: 最多4次，每次间隔1秒 */
  async addHangUpTime(accountId, logCb) {
    this.callbacks = typeof logCb === "function" ? { onLog: logCb } : (logCb || {});
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 挂机加钟 ===`);
    await this.pool.ensureConnected(accountId);

    for (let i = 0; i < 4; i++) {
      try {
        await this.exec(accountId, "system_mysharecallback", { isSkipShareCard: true, type: 2 }, `挂机加钟 ${i + 1}/4`);
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        this.log(`挂机加钟 ${i + 1} 失败: ${e.message}`, "error");
        break;
      }
    }

    this.log(`[${name}] 挂机加钟完成`, "success");
  }
}

export default HangupTasks;
