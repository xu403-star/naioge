/**
 * 爬塔/怪异塔 批处理 - 从 xyzw_web_helper tasksTower.js 移植
 */
import * as db from "../db.js";

export class TowerTasks {
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
      return r;
    } catch (e) {
      if (desc) this.log(`${desc} - 失败: ${e.message}`, "error");
      throw e;
    }
  }

  loadSettings(accountId) {
    const account = db.getAccount(accountId);
    try { return { towerFormation: 1, weirdTowerFormation: 1, ...JSON.parse(account?.settings || "{}") }; }
    catch { return { towerFormation: 1, weirdTowerFormation: 1 }; }
  }

  /** 爬塔: 切阵容→循环战斗直到体力耗尽 */
  async climbTower(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    const settings = this.loadSettings(accountId);
    this.log(`[${name}] === 开始爬塔 ===`);
    await this.pool.ensureConnected(accountId);

    // 切换阵容
    let originalFormation = null, switched = false;
    try {
      const teamInfo = await this.exec(accountId, "presetteam_getinfo", {}, "获取阵容");
      originalFormation = teamInfo?.presetTeamInfo?.useTeamId;
      if (originalFormation !== settings.towerFormation) {
        await this.exec(accountId, "presetteam_saveteam", { teamId: settings.towerFormation }, `切换到阵容${settings.towerFormation}`);
        switched = true;
      }
    } catch (e) { this.log(`阵容切换失败: ${e.message}`, "warning"); }

    // 获取初始体力
    await this.exec(accountId, "tower_getinfo", {}, "获取爬塔信息").catch(() => {});
    let roleInfo = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 10000);
    let energy = roleInfo?.role?.tower?.energy || 0;
    this.log(`[${name}] 初始体力: ${energy}`);

    let count = 0, consecutiveFails = 0;
    const MAX = 100;

    while (energy > 0 && count < MAX) {
      try {
        await this.pool.sendMessage(accountId, "fight_starttower", {}, 8000);
        count++;
        consecutiveFails = 0;
        await new Promise(r => setTimeout(r, 1000));

        // 每5次刷新体力并汇报
        if (count % 5 === 0) {
          try { roleInfo = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000); energy = roleInfo?.role?.tower?.energy || 0; }
          catch { energy = Math.max(0, energy - 1); }
          this.log(`[${name}] 爬塔进度: 已打${count}次，剩余体力${energy}`);
        } else {
          energy = Math.max(0, energy - 1);
        }
      } catch (err) {
        const msg = err.message || "";

        // 操作太快
        if (msg.includes("200400")) {
          this.log(`[${name}] 操作过快，等待5秒...`, "warning");
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        // 上座塔奖励未领取
        if (msg.includes("1500040")) {
          this.log(`[${name}] 上座塔奖励未领取，尝试自动领取...`, "warning");
          try { roleInfo = roleInfo || await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000); } catch {}
          const tid = roleInfo?.role?.tower?.id;
          if (tid !== undefined) {
            const floor = Math.floor(tid / 10);
            if (floor > 0) {
              this.log(`[${name}] 领取第${floor}层奖励`);
              this.pool.sendMessage(accountId, "tower_claimreward", { rewardId: floor }, 3000).catch(() => {});
            }
          }
          await new Promise(r => setTimeout(r, 3000));
          try { roleInfo = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000); energy = roleInfo?.role?.tower?.energy || 0; } catch {}
          consecutiveFails = 0;
          continue;
        }

        consecutiveFails++;
        this.log(`[${name}] 战斗出错(${consecutiveFails}/3): ${msg}`, "warning");
        if (consecutiveFails >= 3) {
          this.log(`[${name}] 连续失败3次，停止爬塔`, "error");
          break;
        }
        await new Promise(r => setTimeout(r, 2000));
        try { roleInfo = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000); energy = roleInfo?.role?.tower?.energy || 0; } catch {}
      }
    }

    // 恢复阵容
    if (switched && originalFormation) {
      try { await this.exec(accountId, "presetteam_saveteam", { teamId: originalFormation }, "恢复原始阵容"); } catch {}
    }

    this.log(`[${name}] 爬塔结束，共${count}次`, "success");
  }

  /** 爬怪异塔 */
  async climbWeirdTower(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    const settings = this.loadSettings(accountId);
    this.log(`[${name}] === 开始爬怪异塔 ===`);
    await this.pool.ensureConnected(accountId);

    // 获取信息
    await this.exec(accountId, "evotower_getinfo", {}, "获取怪异塔信息").catch(() => {});
    let roleInfo = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 10000);
    let energy = roleInfo?.role?.evoTower?.energy || 0;
    this.log(`[${name}] 怪异塔初始体力: ${energy}`);

    let count = 0, consecutiveFails = 0;
    const MAX = 100;

    while (energy > 0 && count < MAX) {
      try {
        await this.exec(accountId, "evotower_fight", {}, `怪异塔 ${count + 1}`, 10000);
        count++;
        consecutiveFails = 0;
        await new Promise(r => setTimeout(r, 1500));
        if (count % 5 === 0) {
          try { roleInfo = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000); energy = roleInfo?.role?.evoTower?.energy || 0; }
          catch { energy = Math.max(0, energy - 1); }
        } else {
          energy = Math.max(0, energy - 1);
        }
      } catch (err) {
        const msg = err.message || "";
        if (msg.includes("200400")) { await new Promise(r => setTimeout(r, 5000)); continue; }
        consecutiveFails++;
        if (consecutiveFails >= 3) { this.log(`[${name}] 连续失败，停止`, "error"); break; }
        await new Promise(r => setTimeout(r, 2000));
        try { roleInfo = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000); energy = roleInfo?.role?.evoTower?.energy || 0; } catch {}
      }
    }

    this.log(`[${name}] 怪异塔结束，共${count}次`, "success");
  }

  /** 领取怪异塔免费能量 */
  async claimFreeEnergy(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 领取怪异塔免费能量 ===`);
    await this.pool.ensureConnected(accountId);

    for (let i = 0; i < 5; i++) {
      try {
        await this.exec(accountId, "mergebox_claimfreeenergy", {}, `领取免费能量 ${i + 1}/5`);
        await new Promise(r => setTimeout(r, 500));
      } catch { break; }
    }
    this.log(`[${name}] 免费能量领取完成`, "success");
  }

  /** 使用道具: 领取免费能量→自动使用道具 */
  async useItems(accountId, logCb) {
    this.callbacks = typeof logCb === "function" ? { onLog: logCb } : (logCb || {});
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 使用道具 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      await this.exec(accountId, "mergebox_claimfreeenergy", {}, "领取免费能量");
      await new Promise(r => setTimeout(r, 500));
      await this.exec(accountId, "mergebox_automergeitem", { actType: 1 }, "自动使用道具", 8000);
    } catch (e) { this.log(`使用道具失败: ${e.message}`, "error"); }

    this.log(`[${name}] 使用道具完成`, "success");
  }

  /** 合成道具 */
  async mergeItems(accountId, logCb) {
    this.callbacks = typeof logCb === "function" ? { onLog: logCb } : (logCb || {});
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 合成道具 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      await this.exec(accountId, "mergebox_mergeitem", { actType: 1 }, "合成道具", 8000);
    } catch (e) { this.log(`合成道具失败: ${e.message}`, "error"); }

    this.log(`[${name}] 合成道具完成`, "success");
  }
}

export default TowerTasks;
