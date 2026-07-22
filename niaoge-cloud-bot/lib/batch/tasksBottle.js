/**
 * 盐罐 批处理 - 从 xyzw_web_helper tasksBottle.js 移植
 */
import { makeLog, makeExec } from "./logHelper.js";

export class BottleTasks {
  constructor(pool) {
    this.pool = pool;
  }

  /** 重置盐罐: 停止计时→开始计时 */
  async resetBottles(accountId, logCb) {
    const log = makeLog(logCb);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 重置盐罐 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      await exec("bottlehelper_stop", {}, "停止盐罐计时");
      await new Promise(r => setTimeout(r, 500));
      await exec("bottlehelper_start", {}, "开始盐罐计时");
    } catch (e) { log(`重置盐罐失败: ${e.message}`, "error"); }

    log(`盐罐重置完成`, "success");
  }

  /** 领取盐罐: 重置→领取奖励 */
  async claimBottles(accountId, logCb) {
    const log = makeLog(logCb);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 领取盐罐 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      // 先重置
      await exec("bottlehelper_stop", {}, "停止盐罐计时");
      await new Promise(r => setTimeout(r, 500));
      await exec("bottlehelper_start", {}, "开始盐罐计时");
      await new Promise(r => setTimeout(r, 500));
      // 领取奖励
      await exec("bottlehelper_claim", {}, "领取盐罐奖励");
    } catch (e) { log(`领取盐罐失败: ${e.message}`, "error"); }

    log(`盐罐领取完成`, "success");
  }
}

export default BottleTasks;
