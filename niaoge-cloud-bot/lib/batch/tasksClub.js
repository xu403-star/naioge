/**
 * 俱乐部/军团 批处理 - 从 xyzw_web_helper ClubInfo/Signin 等移植
 */
import * as db from "../db.js";

export class ClubTasks {
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

  /** 俱乐部签到 */
  async signin(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 俱乐部签到 ===`);
    await this.pool.ensureConnected(accountId);
    await this.exec(accountId, "legion_signin", {}, "俱乐部签到");
    this.log(`[${name}] 签到完成`, "success");
  }

  /** 获取俱乐部详情 */
  async getInfo(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] 获取俱乐部信息...`);
    await this.pool.ensureConnected(accountId);
    const info = await this.exec(accountId, "legion_getinfo", {}, "俱乐部详情");
    if (info?.body?.info) {
      const legion = info.body.info;
      this.log(`[${name}] 俱乐部: ${legion.name || "?"} Lv${legion.level || 0} (${legion.members ? Object.keys(legion.members).length : "?"}人)`, "success");
    }
    return info;
  }

  /** 俱乐部研究 */
  async research(accountId, researchId, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 俱乐部研究 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const info = await this.exec(accountId, "legion_getinfo", {}, "获取俱乐部信息");
      const legion = info?.body?.info || info?.info || {};
      const maxResearch = legion.maxResearchCount || 2;
      const doneToday = legion.researchCount || 0;
      const remaining = maxResearch - doneToday;

      if (remaining <= 0) {
        this.log(`[${name}] 今日研究次数已用完`, "warning");
        return;
      }

      for (let i = 0; i < remaining; i++) {
        await this.exec(accountId, "legion_research", { researchId: researchId || 1 }, `研究 ${i + 1}/${remaining}`, 8000);
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) { this.log(`研究失败: ${e.message}`, "error"); }

    this.log(`[${name}] 俱乐部研究完成`, "success");
  }

  /** 审批申请: 全部通过 */
  async approveAll(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 审批俱乐部申请 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const res = await this.exec(accountId, "legion_applylist", {}, "获取申请列表");
      const list = res?.body?.applyList || res?.applyList || [];
      if (!list.length) { this.log(`[${name}] 无待审批申请`, "info"); return; }

      for (const apply of list) {
        await this.exec(accountId, "legion_agree", { roleId: apply.roleId }, `通过 ${apply.name || apply.roleId}`);
        await new Promise(r => setTimeout(r, 300));
      }
      this.log(`[${name}] 已通过${list.length}个申请`, "success");
    } catch (e) { this.log(`审批失败: ${e.message}`, "error"); }
  }

  /** 俱乐部排位报名 */
  async signupMatch(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    await this.pool.ensureConnected(accountId);
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    await this.exec(accountId, "legionmatch_rolesignup", {}, "俱乐部排位报名");
    this.log(`[${name}] 排位报名完成`, "success");
  }

  /** 俱乐部商店购买 */
  async storeBuy(accountId, goodsId, callbacks = {}) {
    this.callbacks = callbacks;
    await this.pool.ensureConnected(accountId);
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    await this.exec(accountId, "legion_storebuygoods", { id: goodsId }, `商店购买 id=${goodsId}`);
    this.log(`[${name}] 商店购买完成`, "success");
  }

  /** 领取月赛拍手器 */
  async claimGuessCoin(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    await this.pool.ensureConnected(accountId);
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    await this.exec(accountId, "warguess_getguesscoinreward", {}, "领取拍手器");
    this.log(`[${name}] 拍手器领取完成`, "success");
  }

  /** 月赛助威 (需提供legionId和guessCoin) */
  async warGuess(accountId, legionId, guessCoin, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 月赛助威 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const rank = await this.exec(accountId, "warguess_getrank", { bfId: "" }, "获取助威排名", 5000);
      const list = rank?.body?.list || rank?.list || [];
      let totalUsed = 0;
      for (const item of list) { totalUsed += item.guessNum || 0; }

      if (totalUsed >= 20) { this.log(`[${name}] 今日助威已达上限(20)`, "warning"); return; }

      const coin = Math.min(guessCoin || 999, 20 - totalUsed);
      if (coin <= 0) return;

      await this.exec(accountId, "warguess_startguess", { guessCoin: coin, legionId }, `助威 ${coin}拍手器`, 8000);
      this.log(`[${name}] 助威完成: ${coin}拍手器`, "success");
    } catch (e) { this.log(`助威失败: ${e.message}`, "error"); }
  }
}

export default ClubTasks;
