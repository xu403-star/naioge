/**
 * 车辆任务 - 智能发车/一键收车/改装升级
 * 从 xyzw (2) tasksCar.js + carUtils.js 移植并适配 ConnectionPool
 */
import * as db from "../db.js";
import {
  normalizeCars,
  gradeLabel,
  shouldSendCarSimple,
  checkStopCondition,
  canClaim,
  DEFAULT_CAR_THRESHOLDS,
  ITEM_RESEARCH_PIECE,
  CAR_RESEARCH_COST,
} from "./carUtils.js";

/** 获取当前日期字符串（按每天 1:00 作为跨天边界） */
function getSnapshotDay() {
  const now = new Date();
  if (now.getHours() < 1) now.setDate(now.getDate() - 1);
  return now.toISOString().slice(0, 10);
}

/** 持久化赛车状态快照 */
function saveCarSnapshot(accountId, status) {
  try {
    db.saveAccountSettings(accountId, {
      lastCarStatus: status,
      lastCarDay: getSnapshotDay()
    });
  } catch {}
}

export class CarTasks {
  constructor(pool) {
    this.pool = pool;
    this.callbacks = {};
  }

  log(msg, type = "info") {
    if (typeof this.callbacks === "function") {
      this.callbacks({
        time: new Date().toLocaleTimeString(),
        message: msg,
        type,
      });
      return;
    }
    if (this.callbacks && typeof this.callbacks.onLog === "function") {
      this.callbacks.onLog({
        time: new Date().toLocaleTimeString(),
        message: msg,
        type,
      });
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

  /**
   * 获取角色信息（含包裹物品数量）
   */
  async getRoleInfo(accountId) {
    try {
      const res = await this.pool.sendMessage(
        accountId,
        "role_getroleinfo",
        {},
        10000
      );
      return res?.role || {};
    } catch {
      return {};
    }
  }

  /**
   * 获取刷新券数量
   * 失败时保守返回 2（对齐 xyzw (2) 行为），避免网络抖动导致提前停止刷新
   */
  async getRefreshTickets(accountId, conservativeOnError = true) {
    try {
      const role = await this.getRoleInfo(accountId);
      return Number(role?.items?.[35002]?.quantity || 0);
    } catch {
      if (conservativeOnError) {
        this.log(`获取刷新券数量失败，保守视为2`, "warning");
        return 2;
      }
      return 0;
    }
  }

  /**
   * 获取俱乐部成员（护卫列表）
   */
  async getHelpers(accountId, currentRoleId) {
    try {
      const res = await this.exec(
        accountId,
        "legion_getinfo",
        {},
        "获取俱乐部信息",
        8000
      );
      const members = res?.body?.info?.members || res?.info?.members || {};

      return Object.values(members)
        .filter((m) => !currentRoleId || String(m.roleId) !== currentRoleId)
        .map((m) => ({
          id: String(m.roleId),
          name: m.name || m.nickname || String(m.roleId),
          redQuench: m.custom?.red_quench_cnt || 0,
        }))
        .sort((a, b) => b.redQuench - a.redQuench);
    } catch {
      return [];
    }
  }

  /**
   * 获取护卫使用次数
   */
  async getHelperUsage(accountId) {
    try {
      const res = await this.pool.sendMessage(
        accountId,
        "car_getmemberhelpingcnt",
        {},
        8000
      );
      return res?.body?.memberHelpingCntMap || res?.memberHelpingCntMap || {};
    } catch {
      return {};
    }
  }

  /**
   * 为红色及以上车辆分配护卫
   */
  async assignHelper(accountId, car, helpers, usageMap) {
    const color = Number(car.color || 0);
    if (color < 5 || car.helperId) return;

    if (!helpers.length) {
      this.log(`车辆[${gradeLabel(color)}]需要护卫，但无可用护卫`, "warning");
      return;
    }

    // 分配前刷新护卫使用状态，避免并发导致超限
    const freshUsage = await this.getHelperUsage(accountId);
    Object.assign(usageMap, freshUsage);

    const best = helpers.find((h) => Number(usageMap[h.id] || 0) < 4);
    if (best) {
      car.helperId = best.id;
      usageMap[best.id] = Number(usageMap[best.id] || 0) + 1;
      this.log(
        `车辆[${gradeLabel(color)}]分配护卫: ${best.name} (${usageMap[best.id]}/4)`,
        "success"
      );
    } else {
      this.log(
        `车辆[${gradeLabel(color)}]需要护卫，但所有护卫次数已满`,
        "warning"
      );
    }
  }

  // ==================== 智能发车 ====================

  /**
   * 智能发车（xyzw (2) 简化保底模式）
   * @param {string} accountId - 账号 ID
   * @param {object} options - 配置项
   * @param {object} options.thresholds - 保底阈值 { gold, recruit, jade, ticket }
   * @param {boolean} options.assignHelper - 是否自动分配护卫（默认 true）
   * @param {object} options.delay - 延迟配置 { action, refresh }（毫秒）
   * @param {object} callbacks - 回调 { onLog }
   */
  async smartSend(accountId, options = {}, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;

    // 局部日志函数，避免并发时 this.callbacks 被覆盖导致日志串号
    const log = (msg, type = "info") => {
      const entry = {
        time: new Date().toLocaleTimeString(),
        message: msg,
        type,
      };
      if (typeof callbacks === "function") {
        callbacks(entry);
      } else if (callbacks && typeof callbacks.onLog === "function") {
        callbacks.onLog(entry);
      }
    };

    const thresholds = {
      gold: Number(options.thresholds?.gold ?? DEFAULT_CAR_THRESHOLDS.gold),
      recruit: Number(
        options.thresholds?.recruit ?? DEFAULT_CAR_THRESHOLDS.recruit
      ),
      jade: Number(options.thresholds?.jade ?? DEFAULT_CAR_THRESHOLDS.jade),
      ticket: Number(
        options.thresholds?.ticket ?? DEFAULT_CAR_THRESHOLDS.ticket
      ),
    };
    const assignHelperEnabled = options.assignHelper !== false;
    const delayAction = Number(options.delay?.action ?? options.actionDelay ?? 300);
    const delayRefresh = Number(options.delay?.refresh ?? options.refreshDelay ?? 1000);

    log(`[${name}] === 智能发车 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      // 1. 获取车辆列表
      const carRes = await this.exec(
        accountId,
        "car_getrolecar",
        {},
        "获取车辆信息"
      );
      const carList = normalizeCars(carRes?.body || carRes);

      // 2. 获取刷新券
      let refreshTickets = await this.getRefreshTickets(accountId);
      log(`[${name}] 刷新券: ${refreshTickets}`);

      // 3. 获取当前角色 ID 与护卫列表
      let helpers = [];
      let helperUsage = {};
      if (assignHelperEnabled) {
        const role = await this.getRoleInfo(accountId);
        const currentRoleId = role.roleId ? String(role.roleId) : null;
        helpers = await this.getHelpers(accountId, currentRoleId);
        helperUsage = await this.getHelperUsage(accountId);

        if (helpers.length) {
          log(`[${name}] 获取到 ${helpers.length} 位潜在护卫`);
        }
      }

      let sentCount = 0;
      for (const car of carList) {
        if (Number(car.sendAt || 0) !== 0) continue; // 已发车

        try {
          // 检查是否满足保底条件
          if (shouldSendCarSimple(car, thresholds)) {
            const stopResult = checkStopCondition(car.rewards, thresholds);
            if (assignHelperEnabled) await this.assignHelper(accountId, car, helpers, helperUsage);
            log(
              `车辆[${gradeLabel(car.color)}]满足保底条件(${stopResult.reason})，直接发车`
            );
            await this.exec(accountId, "car_send", {
              carId: String(car.id),
              helperId: car.helperId ? String(car.helperId) : 0,
              text: "",
              isUpgrade: false,
            });
            sentCount++;
            await new Promise((r) => setTimeout(r, delayAction));
            continue;
          }

          // 是否可以刷新
          const free = Number(car.refreshCount ?? 0) === 0;
          let shouldRefresh = false;
          if (free) shouldRefresh = true;
          else if (refreshTickets > 0) shouldRefresh = true;

          if (!shouldRefresh) {
            if (assignHelperEnabled) await this.assignHelper(accountId, car, helpers, helperUsage);
            log(
              `车辆[${gradeLabel(car.color)}]没有免费刷新次数且刷新券不足，直接发车`,
              "warning"
            );
            await this.exec(accountId, "car_send", {
              carId: String(car.id),
              helperId: car.helperId ? String(car.helperId) : 0,
              text: "",
              isUpgrade: false,
            });
            sentCount++;
            await new Promise((r) => setTimeout(r, delayAction));
            continue;
          }

          // 刷新循环
          while (shouldRefresh && Number(car.sendAt || 0) === 0) {
            log(`车辆[${gradeLabel(car.color)}]尝试刷新(保底模式)...`);
            const resp = await this.exec(
              accountId,
              "car_refresh",
              { carId: String(car.id) },
              "刷新车辆",
              10000
            );
            const data = resp?.car || resp?.body?.car || resp;

            if (data && typeof data === "object") {
              if (data.color != null) car.color = Number(data.color);
              if (data.refreshCount != null)
                car.refreshCount = Number(data.refreshCount);
              if (data.rewards != null) car.rewards = data.rewards;
            }

            refreshTickets = await this.getRefreshTickets(accountId);

            // 刷新后检查保底条件
            if (shouldSendCarSimple(car, thresholds)) {
              const stopResult = checkStopCondition(car.rewards, thresholds);
              if (assignHelperEnabled) await this.assignHelper(accountId, car, helpers, helperUsage);
              log(
                `刷新后车辆[${gradeLabel(car.color)}]满足保底条件(${stopResult.reason})，发车`,
                "success"
              );
              await this.exec(accountId, "car_send", {
                carId: String(car.id),
                helperId: car.helperId ? String(car.helperId) : 0,
                text: "",
                isUpgrade: false,
              });
              sentCount++;
              await new Promise((r) => setTimeout(r, delayAction));
              break;
            }

            // 检查是否还能继续刷新
            const freeNow = Number(car.refreshCount ?? 0) === 0;
            if (freeNow) shouldRefresh = true;
            else if (refreshTickets > 0) shouldRefresh = true;
            else {
              if (assignHelperEnabled) await this.assignHelper(accountId, car, helpers, helperUsage);
              log(
                `车辆[${gradeLabel(car.color)}]没有免费刷新次数且刷新券不足，保底未满足直接发车`,
                "warning"
              );
              await this.exec(accountId, "car_send", {
                carId: String(car.id),
                helperId: car.helperId ? String(car.helperId) : 0,
                text: "",
                isUpgrade: false,
              });
              sentCount++;
              await new Promise((r) => setTimeout(r, delayAction));
              break;
            }

            await new Promise((r) => setTimeout(r, delayRefresh));
          }
        } catch (carErr) {
          log(`车辆处理失败: ${carErr.message}，跳过`, "error");
        }
      }

      try {
        // 发车完成后重新查询车辆状态并保存快照，供前端账号栏实时显示
        await this.getStatus(accountId);
      } catch {}

      log(`[${name}] 智能发车完成，共发 ${sentCount} 辆`, "success");
    } catch (e) {
      log(`[${name}] 智能发车失败: ${e.message}`, "error");
    }
  }

  /**
   * 查询车辆当前状态（用于前端展示）
   * 返回：{ open, sent, total, claimable, cars }
   */
  async getStatus(accountId) {
    const d = new Date();
    const wd = d.getDay();
    const hour = d.getHours();
    // 赛车活动周一到周三开放，20:00 后禁止发车
    const open = wd >= 1 && wd <= 3 && hour < 20;

    try {
      await this.pool.ensureConnected(accountId);
      const carRes = await this.pool.sendMessage(accountId, "car_getrolecar", {}, 8000);
      const carList = normalizeCars(carRes?.body || carRes);
      const total = carList.length || 0;
      const sent = carList.filter((car) => Number(car.sendAt || 0) !== 0).length;
      const claimable = carList.filter((car) => canClaim(car)).length;
      const status = {
        open,
        sent,
        total,
        claimable,
        cars: carList.map((car) => ({
          id: car.id,
          color: Number(car.color || 0),
          sendAt: Number(car.sendAt || 0),
          claimAt: Number(car.claimAt || 0),
          canClaim: canClaim(car),
        })),
      };
      saveCarSnapshot(accountId, status);
      return status;
    } catch (e) {
      return { open, sent: 0, total: 0, claimable: 0, cars: [], error: e.message };
    }
  }

  // ==================== 一键收车 ====================

  /** 一键收车 + 自动改装升级 */
  async claimAll(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;

    // 局部日志函数，避免并发时 this.callbacks 被覆盖导致日志串号
    const log = (msg, type = "info") => {
      const entry = {
        time: new Date().toLocaleTimeString(),
        message: msg,
        type,
      };
      if (typeof callbacks === "function") {
        callbacks(entry);
      } else if (callbacks && typeof callbacks.onLog === "function") {
        callbacks.onLog(entry);
      }
    };

    log(`[${name}] === 一键收车 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const carRes = await this.exec(
        accountId,
        "car_getrolecar",
        {},
        "获取车辆信息"
      );
      const carList = normalizeCars(carRes?.body || carRes);
      let refreshLevel = carRes?.roleCar?.research?.[1] || 0;

      let claimed = 0;
      for (const car of carList) {
        if (!canClaim(car)) continue;

        try {
          await this.exec(
            accountId,
            "car_claim",
            { carId: String(car.id) },
            `收车[${gradeLabel(car.color)}]`
          );
          claimed++;

          // 自动改装升级
          let roleInfo = await this.getRoleInfo(accountId);
          let pieces = Number(
            roleInfo?.items?.[ITEM_RESEARCH_PIECE]?.quantity || 0
          );

          while (
            refreshLevel < CAR_RESEARCH_COST.length &&
            pieces >= CAR_RESEARCH_COST[refreshLevel]
          ) {
            try {
              await this.exec(
                accountId,
                "car_research",
                { researchId: 1 },
                `车辆改装升级 Lv${refreshLevel + 1}`,
                8000
              );
              refreshLevel++;
              roleInfo = await this.getRoleInfo(accountId);
              pieces = Number(
                roleInfo?.items?.[ITEM_RESEARCH_PIECE]?.quantity || 0
              );
              log(`改装升级成功，当前等级: ${refreshLevel}`, "success");
              await new Promise((r) => setTimeout(r, 300));
            } catch {
              break;
            }
          }

          // 尝试领取改装累计奖励
          try {
            await this.pool.sendMessage(
              accountId,
              "car_claimpartconsumereward",
              {},
              5000
            );
          } catch {}

          await new Promise((r) => setTimeout(r, 500));
        } catch (e) {
          log(`收车失败: ${e.message}`, "warning");
        }
      }

      if (claimed === 0)
        log(`[${name}] 没有可收取的车辆`, "info");
      else log(`[${name}] 收车完成，共收取 ${claimed} 辆`, "success");
    } catch (e) {
      log(`[${name}] 收车失败: ${e.message}`, "error");
    }
  }
}

export default CarTasks;
