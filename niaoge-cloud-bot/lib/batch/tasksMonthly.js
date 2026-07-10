/**
 * 月度任务 - 钓鱼补齐 / 竞技场补齐
 * 从 xyzw_web_helper tasksArena.js 移植
 */
import * as db from "../db.js";

const FISH_TARGET = 320;
const ARENA_TARGET = 240;

/** 今日开始时间戳（秒） */
function getTodayStartSec() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/** 检查今日是否可用 */
function isTodayAvailable(lastTimeSec) {
  if (!lastTimeSec || typeof lastTimeSec !== "number") return true;
  return lastTimeSec < getTodayStartSec();
}

export class MonthlyTasks {
  constructor(pool) {
    this.pool = pool;
    this.callbacks = {};
  }

  log(msg, type = "info") {
    const cb = this.callbacks;
    const entry = { time: new Date().toLocaleTimeString(), message: msg, type };
    if (typeof cb === "function") {
      cb(entry);
    } else if (cb?.onLog) {
      cb.onLog(entry);
    }
  }

  async exec(accountId, cmd, params = {}, desc = "", timeout = 10000) {
    try {
      if (desc) this.log(`${desc}...`);
      return await this.pool.sendMessage(accountId, cmd, params, timeout);
    } catch (e) {
      if (desc) this.log(`${desc} - 失败: ${e.message}`, "error");
      throw e;
    }
  }

  _accountName(accountId) {
    try {
      return db.getAccount(accountId)?.name || accountId;
    } catch {
      return accountId;
    }
  }

  /**
   * 获取月度任务数据（xyzw 使用 activity_get）
   */
  async _getActivity(accountId) {
    const res = await this.pool.sendMessage(accountId, "activity_get", {}, 10000);
    return res?.activity || res?.body?.activity || res;
  }

  /**
   * 钓鱼补齐
   * 与 xyzw MonthlyTasksCard 行为一致：
   * - 先消耗今日免费次数
   * - 再用普通鱼竿补齐到 shouldBe
   */
  async topUpFish(accountId, callbacks = {}, targetOverride = null) {
    this.callbacks = callbacks;
    const name = this._accountName(accountId);
    this.log(`[${name}] === 钓鱼补齐 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      // 获取角色信息以判断免费次数和鱼竿数量
      let role;
      try {
        const roleInfo = await this.exec(accountId, "role_getroleinfo", {}, "获取角色信息", 10000);
        role = roleInfo?.role || {};
      } catch (e) {
        this.log(`[${name}] 获取角色信息失败: ${e.message}`, "error");
        return;
      }

      // 月度钓鱼补齐目标：默认直接补齐到 320 次，可通过 targetOverride 自定义
      const shouldBe = targetOverride ?? FISH_TARGET;

      // 1. 消耗今日免费钓鱼次数（每次 1 次，最多 3 次）
      let freeUsed = 0;
      const lastFreeTime = Number(role?.statisticsTime?.["artifact:normal:lottery:time"] || 0);
      if (isTodayAvailable(lastFreeTime)) {
        this.log(`[${name}] 检测到今日免费钓鱼次数，开始消耗 3 次`);
        for (let i = 0; i < 3; i++) {
          try {
            await this.exec(accountId, "artifact_lottery", { lotteryNumber: 1, newFree: true, type: 1 }, `免费钓鱼 ${i + 1}/3`, 8000);
            freeUsed++;
            await new Promise(r => setTimeout(r, 500));
          } catch (e) {
            this.log(`[${name}] 免费钓鱼失败: ${e.message}`, "warning");
            break;
          }
        }
      }

      // 2. 免费次数后重新查询进度，计算还需补齐次数
      await this._fetchAndLogProgress(accountId, name, "免费次数后");
      let remaining = await this._calcRemaining(accountId, shouldBe);
      if (remaining <= 0) {
        this.log(`[${name}] 已通过免费次数完成目标`, "success");
        return;
      }

      // 3. 使用普通鱼竿（ID: 1011）批量补齐，每次最多 10 次
      const rodCount = Number(role?.items?.[1011]?.quantity || 0);
      this.log(`[${name}] 当前普通鱼竿: ${rodCount}`);

      if (rodCount < remaining) {
        this.log(`[${name}] 普通鱼竿不足 (${rodCount} < ${remaining})，将仅使用现有鱼竿`, "warning");
        remaining = rodCount;
      }

      let paidDone = 0;
      while (remaining > 0) {
        const batch = Math.min(10, remaining);
        try {
          await this.exec(accountId, "artifact_lottery", { lotteryNumber: batch, newFree: true, type: 1 }, `付费钓鱼 ${batch}次`, 12000);
          remaining -= batch;
          paidDone += batch;
          this.log(`[${name}] 完成 ${batch} 次付费钓鱼，剩余 ${remaining}次`);

          // 每 50 次同步一次鱼竿数量
          if (remaining > 0 && batch >= 10 && paidDone % 50 === 0) {
            try {
              const roleRes = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000);
              const currentRole = roleRes?.role || {};
              const currentRodCount = Number(currentRole?.items?.[1011]?.quantity || 0);
              if (currentRodCount < remaining) {
                this.log(`[${name}] 同步后发现鱼竿不足 (${currentRodCount} < ${remaining})，调整目标`, "warning");
                remaining = currentRodCount;
              }
            } catch {}
          }

          await new Promise(r => setTimeout(r, 800));
        } catch (e) {
          this.log(`[${name}] 付费钓鱼失败: ${e.message}`, "error");
          break;
        }
      }

      // 4. 最终进度
      await this._fetchAndLogProgress(accountId, name, "最终");
      const finalRemaining = await this._calcRemaining(accountId, shouldBe);
      if (finalRemaining <= 0) {
        this.log(`[${name}] 钓鱼补齐完成`, "success");
      } else {
        this.log(`[${name}] 钓鱼补齐已停止，未达到目标`, "warning");
      }

      // 5. 领取鱼竿累计奖励
      try {
        const roleRes = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 5000);
        const currentRole = roleRes?.role || {};
        const points = Number(currentRole?.statistics?.["artifact:point"] || 0);
        const exchangeCount = Math.floor(points / 20);
        if (exchangeCount > 0) {
          this.log(`[${name}] 检测到鱼竿累计使用 ${points}，开始领取 ${exchangeCount} 次累计奖励`);
          for (let k = 0; k < exchangeCount; k++) {
            try {
              await this.pool.sendMessage(accountId, "artifact_exchange", {}, 3000);
              await new Promise(r => setTimeout(r, 300));
            } catch (err) {
              this.log(`[${name}] 领取累计奖励失败 (第${k + 1}次): ${err.message}`, "warning");
              break;
            }
          }
          this.log(`[${name}] 累计奖励领取结束`, "success");
        }
      } catch (e) {
        this.log(`[${name}] 检查累计奖励失败: ${e.message}`, "warning");
      }
    } catch (e) {
      this.log(`[${name}] 钓鱼补齐失败: ${e.message}`, "error");
    }
  }

  /**
   * 获取并打印月度钓鱼进度
   */
  async _fetchAndLogProgress(accountId, name, label) {
    try {
      const act = await this._getActivity(accountId);
      const myMonthInfo = act?.myMonthInfo || {};
      const fishNum = Number(myMonthInfo?.["2"]?.num || 0);
      this.log(`[${name}] ${label}进度: ${fishNum}/${FISH_TARGET}`);
      return fishNum;
    } catch (e) {
      this.log(`[${name}] 获取${label}进度失败: ${e.message}`, "warning");
      return 0;
    }
  }

  /**
   * 计算还需补齐次数
   */
  async _calcRemaining(accountId, shouldBe) {
    try {
      const act = await this._getActivity(accountId);
      const myMonthInfo = act?.myMonthInfo || {};
      const fishNum = Number(myMonthInfo?.["2"]?.num || 0);
      return Math.max(0, shouldBe - fishNum);
    } catch {
      return 0;
    }
  }

  /**
   * 竞技场补齐
   * 参考 xyzw batchTopUpArena
   * 默认一键补齐到 ARENA_TARGET（240 次），可通过 targetOverride 自定义目标
   */
  async topUpArena(accountId, callbacks = {}, targetOverride = null) {
    this.callbacks = callbacks;
    const name = this._accountName(accountId);
    this.log(`[${name}] === 竞技场补齐 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const hour = new Date().getHours();
      if (hour < 6 || hour > 22) {
        this.log(`[${name}] 当前不在竞技场开放时段(6-22点)`, "warning");
        return;
      }

      const acc = db.getAccount(accountId);
      const settings = JSON.parse(acc?.settings || "{}");
      const arenaFormation = settings.arenaFormation || 1;

      // 切换阵容
      try {
        const teamInfo = await this.pool.sendMessage(accountId, "presetteam_getinfo", {}, 5000);
        const currentFormation = teamInfo?.presetTeamInfo?.useTeamId;
        if (currentFormation === arenaFormation) {
          this.log(`[${name}] 当前已是阵容${arenaFormation}，无需切换`);
        } else {
          await this.exec(accountId, "presetteam_saveteam", { teamId: arenaFormation }, `切换竞技场阵容${arenaFormation}`);
        }
      } catch (e) {
        this.log(`[${name}] 切换竞技场阵容失败: ${e.message}`, "warning");
      }

      // 获取月度任务进度
      this.log(`[${name}] 获取月度任务进度...`);
      const act = await this._getActivity(accountId);
      if (!act) {
        this.log(`[${name}] 获取月度任务进度失败`, "error");
        return;
      }

      const myArenaInfo = act.myArenaInfo || {};
      let arenaNum = Number(myArenaInfo?.num || 0);

      // 默认一键补齐到 240 积分；保留 targetOverride 供自定义目标
      const shouldBe = targetOverride ?? ARENA_TARGET;
      let needPoints = Math.max(0, shouldBe - arenaNum);

      this.log(`[${name}] 当前进度: ${arenaNum}/${ARENA_TARGET}，目标: ${shouldBe}，还需积分: ${needPoints}`);

      if (needPoints <= 0) {
        this.log(`[${name}] 竞技场已达标`, "success");
        return;
      }

      // 获取角色信息以判断咸神门票
      let role;
      try {
        const roleInfo = await this.exec(accountId, "role_getroleinfo", {}, "获取角色信息", 10000);
        role = roleInfo?.role || {};
      } catch (e) {
        this.log(`[${name}] 获取角色信息失败: ${e.message}`, "error");
        return;
      }

      const ticketCount = Number(role?.items?.[1007]?.quantity || 0);
      this.log(`[${name}] 当前咸神门票: ${ticketCount}`);

      // 进入竞技场
      try {
        await this.exec(accountId, "arena_startarea", {}, "进入竞技场", 6000);
      } catch (e) {
        this.log(`[${name}] 进入竞技场失败: ${e.message}`, "warning");
      }

      let totalDone = 0;

      // 按全胜估算先打一批，打完后查询实际积分，不够再补
      while (needPoints > 0) {
        // 按每场最多 2 积分估算（全胜），至少留 1 场兜底
        let batch = Math.max(1, Math.ceil(needPoints / 2));
        if (ticketCount > 0 && batch > ticketCount) {
          this.log(`[${name}] 咸神门票不足 (${ticketCount} < ${batch})，将仅使用现有门票`, "warning");
          batch = ticketCount;
        }
        if (batch <= 0) {
          this.log(`[${name}] 没有可用的咸神门票`, "warning");
          break;
        }

        this.log(`[${name}] 本轮计划战斗 ${batch} 次（按全胜估算）`);
        let done = 0;
        let safetyCounter = 0;
        const safetyMaxFights = Math.max(batch, 100);

        while (done < batch && safetyCounter < safetyMaxFights) {
          let target;
          try {
            const targets = await this.pool.sendMessage(accountId, "arena_getareatarget", {}, 8000);
            target = this._pickArenaTarget(targets);
          } catch (e) {
            this.log(`[${name}] 获取竞技场目标失败: ${e.message}`, "error");
            break;
          }

          if (!target) {
            this.log(`[${name}] 未找到竞技场目标，已战${totalDone + done}次`, "warning");
            break;
          }

          try {
            await this.exec(accountId, "fight_startareaarena", { targetId: target }, `竞技场战斗 ${totalDone + done + 1}`, 12000);
            done++;
            await new Promise(r => setTimeout(r, 1000));
          } catch (e) {
            this.log(`[${name}] 竞技场战斗失败: ${e.message}`, "error");
            break;
          }
          safetyCounter++;
        }

        totalDone += done;

        // 查询本轮后的实际积分
        try {
          const actAfter = await this._getActivity(accountId);
          arenaNum = Number(actAfter?.myArenaInfo?.num || 0);
        } catch (e) {
          this.log(`[${name}] 查询战后积分失败: ${e.message}`, "warning");
          break;
        }

        needPoints = Math.max(0, shouldBe - arenaNum);
        this.log(`[${name}] 本轮战斗 ${done} 次，当前进度: ${arenaNum}/${ARENA_TARGET}，还需积分: ${needPoints}`);

        if (needPoints <= 0) {
          this.log(`[${name}] 竞技场已达标`, "success");
          break;
        }

        if (done === 0) {
          this.log(`[${name}] 本轮未进行有效战斗，停止补齐`, "warning");
          break;
        }
      }

      this.log(`[${name}] 竞技场补齐完成: 共战斗${totalDone}次`, "success");
    } catch (e) {
      this.log(`[${name}] 竞技场补齐失败: ${e.message}`, "error");
    }
  }

  _pickArenaTarget(targets) {
    if (!targets) return null;
    if (Array.isArray(targets)) {
      const c = targets[0];
      return c?.roleId || c?.id || c?.targetId;
    }
    const candidate = targets?.rankList?.[0] || targets?.roleList?.[0] ||
      targets?.targets?.[0] || targets?.list?.[0];
    if (candidate) {
      return candidate.roleId || candidate.id || candidate.targetId;
    }
    return targets?.roleId || targets?.id || targets?.targetId;
  }
}

export default MonthlyTasks;
