/**
 * 游戏日常状态查询模块
 * 角色信息 / 挂机 / 盐罐机器人 / 爬塔 / 日常任务
 */
import * as db from "../db.js";

/** 获取当前日期字符串（按每天 1:00 作为跨天边界） */
function getSnapshotDay() {
  const now = new Date();
  // 如果早于 1:00，则视为前一天
  if (now.getHours() < 1) {
    now.setDate(now.getDate() - 1);
  }
  return now.toISOString().slice(0, 10);
}

/** 持久化活跃度快照 */
function saveDailySnapshot(accountId, point, max) {
  try {
    db.saveAccountSettings(accountId, {
      lastDailyPoint: point,
      lastDailyPointMax: max,
      lastDailyDay: getSnapshotDay()
    });
  } catch {}
}

export class GameStatus {
  constructor(pool) {
    this.pool = pool;
  }

  async _send(accountId, cmd, params = {}, timeout = 5000) {
    return this.pool.sendMessage(accountId, cmd, params, timeout);
  }

  /** 获取完整角色信息 */
  async getRoleInfo(accountId) {
    const res = await this._send(accountId, "role_getroleinfo");
    const role = res?.role || {};
    return {
      name: role.name || "",
      level: role.level || 0,
      gold: role.gold || 0,
      diamond: role.diamond || 0,
      // 挂机
      hangUp: role.hangUp ? {
        lastTime: role.hangUp.lastTime || 0,
        hangUpTime: role.hangUp.hangUpTime || 0,
        remaining: Math.max(0, (role.hangUp.hangUpTime || 0) - (Date.now()/1000 - (role.hangUp.lastTime || 0))),
      } : null,
      // 盐罐机器人
      bottleHelper: role.bottleHelpers ? {
        helperStopTime: role.bottleHelpers.helperStopTime || 0,
        isRunning: (role.bottleHelpers.helperStopTime || 0) > Date.now()/1000,
        remainingTime: Math.max(0, Math.floor((role.bottleHelpers.helperStopTime || 0) - Date.now()/1000)),
      } : null,
      // 爬塔
      tower: role.tower ? {
        id: role.tower.id || 0,
        floor: Math.floor((role.tower.id || 0) / 10) + 1,
      } : null,
      // 统计
      statistics: role.statistics || {},
      statisticsTime: role.statisticsTime || {},
      // 原始数据（供前端使用）
      _raw: res,
    };
  }

  /** 获取日常任务状态 */
  async getDailyTaskStatus(accountId) {
    try {
      // 使用 role_getroleinfo 读取 dailyTask，避免 task_claimdailypoint 返回单任务分值
      const res = await this._send(accountId, "role_getroleinfo", {}, 5000);
      const dailyTask = res?.role?.dailyTask || {};
      const point = dailyTask.dailyPoint ?? dailyTask.dayPoint ?? dailyTask.point ?? 0;
      const max = dailyTask.maxPoint ?? dailyTask.dailyPointMax ?? dailyTask.pointMax ?? 100;

      // 持久化最近一次活跃度快照
      saveDailySnapshot(accountId, point, max);

      return {
        dailyPoint: point,
        maxPoint: max,
        taskList: dailyTask.taskList || [],
        claimed: dailyTask.claimed || false,
      };
    } catch { return { dailyPoint: 0, maxPoint: 100, taskList: [], claimed: false }; }
  }

  /** 获取阵容信息 */
  async getFormations(accountId) {
    try {
      const res = await this._send(accountId, "presetteam_getinfo", {}, 3000);
      return {
        teams: res?.teams || [],
        currentTeam: res?.currentTeam || 0,
      };
    } catch { return { teams: [], currentTeam: 0 }; }
  }

  /** 获取咸将塔信息 */
  async getTowerInfo(accountId) {
    try {
      const res = await this._send(accountId, "tower_getinfo", {}, 3000);
      return {
        currentFloor: res?.currentFloor || 0,
        energy: res?.energy || 0,
        maxFloor: res?.maxFloor || 0,
      };
    } catch { return { currentFloor: 0, energy: 0, maxFloor: 0 }; }
  }

  /** 获取怪异塔信息 */
  async getWeirdTowerInfo(accountId) {
    try {
      const res = await this._send(accountId, "evotower_getinfo", {}, 3000);
      return {
        currentFloor: res?.currentFloor || 0,
        energy: res?.energy || 0,
        members: res?.members || [],
      };
    } catch { return { currentFloor: 0, energy: 0, members: [] }; }
  }

  /** 一键查询日常面板所有数据 */
  async getAllStatus(accountId) {
    const [role, task, formation, tower, weirdTower] = await Promise.allSettled([
      this.getRoleInfo(accountId),
      this.getDailyTaskStatus(accountId),
      this.getFormations(accountId),
      this.getTowerInfo(accountId),
      this.getWeirdTowerInfo(accountId),
    ]);
    return {
      role: role.status === "fulfilled" ? role.value : { name: "?", level: 0 },
      dailyTasks: task.status === "fulfilled" ? task.value : { dailyPoint: 0 },
      formations: formation.status === "fulfilled" ? formation.value : { teams: [] },
      tower: tower.status === "fulfilled" ? tower.value : { currentFloor: 0 },
      weirdTower: weirdTower.status === "fulfilled" ? weirdTower.value : { currentFloor: 0 },
    };
  }
}
