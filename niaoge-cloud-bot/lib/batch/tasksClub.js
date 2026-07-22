/**
 * 俱乐部/军团 批处理 - 从 xyzw_web_helper ClubInfo/Signin 等移植
 */
import { makeLog, makeExec } from "./logHelper.js";

export class ClubTasks {
  constructor(pool) {
    this.pool = pool;
  }

  /** 俱乐部签到 */
  async signin(accountId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 俱乐部签到 ===`);
    await this.pool.ensureConnected(accountId);
    await exec("legion_signin", {}, "俱乐部签到");
    log(`签到完成`, "success");
  }

  /** 获取俱乐部详情 */
  async getInfo(accountId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`获取俱乐部信息...`);
    await this.pool.ensureConnected(accountId);
    const info = await exec("legion_getinfo", {}, "俱乐部详情");
    if (info?.body?.info) {
      const legion = info.body.info;
      log(`俱乐部: ${legion.name || "?"} Lv${legion.level || 0} (${legion.members ? Object.keys(legion.members).length : "?"}人)`, "success");
    }
    return info;
  }

  /** 俱乐部研究 */
  async research(accountId, researchId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 俱乐部研究 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const info = await exec("legion_getinfo", {}, "获取俱乐部信息");
      const legion = info?.body?.info || info?.info || {};
      const maxResearch = legion.maxResearchCount || 2;
      const doneToday = legion.researchCount || 0;
      const remaining = maxResearch - doneToday;

      if (remaining <= 0) {
        log(`今日研究次数已用完`, "warning");
        return;
      }

      for (let i = 0; i < remaining; i++) {
        await exec("legion_research", { researchId: researchId || 1 }, `研究 ${i + 1}/${remaining}`, 8000);
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) { log(`研究失败: ${e.message}`, "error"); }

    log(`俱乐部研究完成`, "success");
  }

  /** 审批申请: 全部通过 */
  async approveAll(accountId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 审批俱乐部申请 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const res = await exec("legion_applylist", {}, "获取申请列表");
      const list = res?.body?.applyList || res?.applyList || [];
      if (!list.length) { log(`无待审批申请`, "info"); return; }

      for (const apply of list) {
        await exec("legion_agree", { roleId: apply.roleId }, `通过 ${apply.name || apply.roleId}`);
        await new Promise(r => setTimeout(r, 300));
      }
      log(`已通过${list.length}个申请`, "success");
    } catch (e) { log(`审批失败: ${e.message}`, "error"); }
  }

  /** 俱乐部排位报名 */
  async signupMatch(accountId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    await this.pool.ensureConnected(accountId);
    await exec("legionmatch_rolesignup", {}, "俱乐部排位报名");
    log(`排位报名完成`, "success");
  }

  /** 俱乐部商店购买 */
  async storeBuy(accountId, goodsId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    await this.pool.ensureConnected(accountId);
    await exec("legion_storebuygoods", { id: goodsId }, `商店购买 id=${goodsId}`);
    log(`商店购买完成`, "success");
  }

  /** 领取月赛拍手器 */
  async claimGuessCoin(accountId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    await this.pool.ensureConnected(accountId);
    await exec("warguess_getguesscoinreward", {}, "领取拍手器");
    log(`拍手器领取完成`, "success");
  }

  /** 月赛助威 (需提供legionId和guessCoin) */
  async warGuess(accountId, legionId, guessCoin, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 月赛助威 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const rank = await exec("warguess_getrank", { bfId: "" }, "获取助威排名", 5000);
      const list = rank?.body?.list || rank?.list || [];
      let totalUsed = 0;
      for (const item of list) { totalUsed += item.guessNum || 0; }

      if (totalUsed >= 20) { log(`今日助威已达上限(20)`, "warning"); return; }

      const coin = Math.min(guessCoin || 999, 20 - totalUsed);
      if (coin <= 0) return;

      await exec("warguess_startguess", { guessCoin: coin, legionId }, `助威 ${coin}拍手器`, 8000);
      log(`助威完成: ${coin}拍手器`, "success");
    } catch (e) { log(`助威失败: ${e.message}`, "error"); }
  }
}

export default ClubTasks;
