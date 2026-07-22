/**
 * 挂机 批处理 - 从 xyzw_web_helper tasksHangUp.js 移植
 */
import { makeLog, makeExec } from "./logHelper.js";

export class HangupTasks {
  constructor(pool) {
    this.pool = pool;
  }

  /** 领取挂机奖励 */
  async claimHangUp(accountId, logCb) {
    const log = makeLog(logCb);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 领取挂机奖励 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      await exec("system_claimhangupreward", {}, "领取挂机奖励");
      await new Promise(r => setTimeout(r, 500));
      // 刷新角色信息
      try { await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 10000); } catch {}
    } catch (e) { log(`领取挂机奖励失败: ${e.message}`, "error"); }

    log(`挂机奖励领取完成`, "success");
  }

  /** 挂机加钟: 最多4次，每次间隔1秒 */
  async addHangUpTime(accountId, logCb) {
    const log = makeLog(logCb);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 挂机加钟 ===`);
    await this.pool.ensureConnected(accountId);

    for (let i = 0; i < 4; i++) {
      try {
        await exec("system_mysharecallback", { isSkipShareCard: true, type: 2 }, `挂机加钟 ${i + 1}/4`);
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        log(`挂机加钟 ${i + 1} 失败: ${e.message}`, "error");
        break;
      }
    }

    log(`挂机加钟完成`, "success");
  }
}

export default HangupTasks;
