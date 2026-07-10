/**
 * 竞技场 批处理 - 从 xyzw_web_helper tasksArena.js 移植
 */
import * as db from "../db.js";

/** 从竞技场目标列表中提取 targetId */
function pickArenaTargetId(targets) {
  if (!targets) return null;
  if (Array.isArray(targets)) {
    const candidate = targets[0];
    return candidate?.roleId || candidate?.id || candidate?.targetId;
  }
  const candidate = targets?.rankList?.[0] || targets?.roleList?.[0] ||
    targets?.targets?.[0] || targets?.targetList?.[0] || targets?.list?.[0];
  if (candidate) {
    if (candidate.roleId) return candidate.roleId;
    if (candidate.id) return candidate.id;
    if (candidate.targetId) return candidate.targetId;
  }
  return targets?.roleId || targets?.id || targets?.targetId;
}

export class ArenaTasks {
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

  /** 竞技场战斗3次（按每日任务进度决定，避免浪费门票） */
  async arenaFight(accountId, logCb) {
    this.callbacks = typeof logCb === "function" ? { onLog: logCb } : (logCb || {});
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 竞技场战斗 ===`);
    await this.pool.ensureConnected(accountId);

    const hour = new Date().getHours();
    if (hour < 6 || hour >= 22) {
      this.log(`[${name}] 当前时间 ${hour}:00 不在竞技场开放时间（6:00-22:00），跳过`, "warning");
      return;
    }

    // 查询每日任务进度
    let roleResp;
    try {
      roleResp = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000);
    } catch (e) {
      this.log(`[${name}] 竞技场 - 获取角色信息失败: ${e.message}`, "error");
      throw e;
    }
    const role = roleResp?.role || roleResp?.data?.role;
    const dailyTask = role?.dailyTask ?? {};
    const completedTasks = dailyTask?.complete ?? {};
    const arenaProgress = completedTasks[13];

    // -1 表示已完成，数字表示当前进度
    let remaining = 3;
    if (arenaProgress === -1) {
      this.log(`[${name}] 竞技场每日任务已完成，跳过`, "info");
      return;
    } else if (typeof arenaProgress === "number") {
      remaining = Math.max(3 - arenaProgress, 0);
    }

    if (remaining <= 0) {
      this.log(`[${name}] 竞技场今日已无需再战，跳过`, "info");
      return;
    }

    this.log(`[${name}] 竞技场今日还需战斗 ${remaining} 次`);

    try {
      await this.exec(accountId, "arena_startarea", {}, "开始竞技场");

      for (let i = 0; i < remaining; i++) {
        try {
          const targets = await this.exec(accountId, "arena_getareatarget", {}, `获取竞技场目标 ${i + 1}/${remaining}`);
          const targetId = pickArenaTargetId(targets);
          if (!targetId) {
            this.log(`[${name}] 竞技场 ${i + 1} - 未找到目标`, "warning");
            break;
          }
          await this.exec(accountId, "fight_startareaarena", { targetId }, `竞技场战斗 ${i + 1}/${remaining}`, 10000);
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          this.log(`[${name}] 竞技场 ${i + 1} 失败: ${e.message}`, "error");
          break;
        }
      }
    } catch (e) {
      this.log(`[${name}] 竞技场战斗失败: ${e.message}`, "error");
    }

    this.log(`[${name}] 竞技场战斗完成`, "success");
  }
}

export default ArenaTasks;
