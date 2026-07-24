/**
 * 车辆任务 - 智能发车/一键收车/改装升级
 * 从 xyzw (2) tasksCar.js + carUtils.js 移植并适配 ConnectionPool
 */
import * as db from "../db.js";
import { makeLog, makeExec } from "./logHelper.js";
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
import { recordCarSendLog, formatSendSummary } from "./carLog.js";

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
  async getRefreshTickets(accountId, log, conservativeOnError = true) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const role = await this.getRoleInfo(accountId);
        if (!role || typeof role !== "object" || !role.items || typeof role.items !== "object") {
          throw new Error("角色信息解析失败");
        }
        const item = role.items[35002];
        if (!item || item.quantity === undefined || item.quantity === null) {
          throw new Error("刷新券数量缺失");
        }
        return Number(item.quantity || 0);
      } catch (e) {
        lastError = e;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 300));
      }
    }
    if (conservativeOnError) {
      log(`获取刷新券数量失败(${lastError?.message || "unknown"})，保守视为2`, "warning");
      return 2;
    }
    return 0;
  }

  /**
   * 获取俱乐部成员（护卫列表）
   */
  async getHelpers(accountId, currentRoleId, exec) {
    try {
      const res = await exec(
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
  async assignHelper(accountId, car, helpers, usageMap, log) {
    const color = Number(car.color || 0);
    if (color < 5 || car.helperId) return;

    if (!helpers.length) {
      log(`车辆[${gradeLabel(color)}]需要护卫，但无可用护卫`, "warning");
      return;
    }

    // 分配前刷新护卫使用状态，避免并发导致超限
    const freshUsage = await this.getHelperUsage(accountId);
    Object.assign(usageMap, freshUsage);

    const best = helpers.find((h) => Number(usageMap[h.id] || 0) < 4);
    if (best) {
      car.helperId = best.id;
      usageMap[best.id] = Number(usageMap[best.id] || 0) + 1;
      log(
        `车辆[${gradeLabel(color)}]分配护卫: ${best.name} (${usageMap[best.id]}/4)`,
        "success"
      );
    } else {
      log(
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
  async smartSend(accountId, options = {}, callbacks = {}, userKey = null) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);

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

    log(`=== 智能发车 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      // 0. 发车前先尝试收车，避免昨天未收的车占用车位导致统计错误
      try {
        log(`智能发车前尝试一键收车...`);
        await this.claimAll(accountId, callbacks);
      } catch (e) {
        log(`发车前收车失败: ${e.message}，继续发车`, "warning");
      }

      // 1. 获取车辆列表
      const carRes = await exec(
        "car_getrolecar",
        {},
        "获取车辆信息"
      );
      const carList = normalizeCars(carRes?.body || carRes);

      // 2. 获取刷新券
      let refreshTickets = await this.getRefreshTickets(accountId, log);
      log(`刷新券: ${refreshTickets}`);

      // 3. 获取当前角色 ID 与护卫列表
      let helpers = [];
      let helperUsage = {};
      if (assignHelperEnabled) {
        const role = await this.getRoleInfo(accountId);
        const currentRoleId = role.roleId ? String(role.roleId) : null;
        helpers = await this.getHelpers(accountId, currentRoleId, exec);
        helperUsage = await this.getHelperUsage(accountId);

        if (helpers.length) {
          log(`获取到 ${helpers.length} 位潜在护卫`);
        }
      }

      let sentCount = 0;
      const sentCars = []; // 发车详情收集，用于汇总日志与持久化
      const pushSentCar = (car) => {
        sentCars.push({
          carId: car.id,
          color: car.color,
          rewards: Array.isArray(car.rewards) ? car.rewards : [],
        });
      };

      for (const car of carList) {
        if (Number(car.sendAt || 0) !== 0) continue; // 已发车

        try {
          // 检查是否满足保底条件
          if (shouldSendCarSimple(car, thresholds)) {
            const stopResult = checkStopCondition(car.rewards, thresholds);
            if (assignHelperEnabled) await this.assignHelper(accountId, car, helpers, helperUsage, log);
            log(
              `车辆[${gradeLabel(car.color)}]满足保底条件(${stopResult.reason})，直接发车`
            );
            await exec("car_send", {
              carId: String(car.id),
              helperId: car.helperId ? String(car.helperId) : 0,
              text: "",
              isUpgrade: false,
            });
            sentCount++;
            pushSentCar(car);
            continue;
          }

          // 是否可以刷新
          const free = Number(car.refreshCount ?? 0) === 0;
          let shouldRefresh = false;
          if (free) shouldRefresh = true;
          else if (refreshTickets > 0) shouldRefresh = true;

          if (!shouldRefresh) {
            if (assignHelperEnabled) await this.assignHelper(accountId, car, helpers, helperUsage, log);
            log(
              `车辆[${gradeLabel(car.color)}]没有免费刷新次数且刷新券不足，直接发车`,
              "warning"
            );
            await exec("car_send", {
              carId: String(car.id),
              helperId: car.helperId ? String(car.helperId) : 0,
              text: "",
              isUpgrade: false,
            });
            sentCount++;
            pushSentCar(car);
            continue;
          }

          // 刷新循环
          while (shouldRefresh && Number(car.sendAt || 0) === 0) {
            log(`车辆[${gradeLabel(car.color)}]尝试刷新(保底模式)...`);
            const resp = await exec(
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

            refreshTickets = await this.getRefreshTickets(accountId, log);
            log(`刷新后刷新券: ${refreshTickets}`);

            // 刷新后检查保底条件
            if (shouldSendCarSimple(car, thresholds)) {
              const stopResult = checkStopCondition(car.rewards, thresholds);
              if (assignHelperEnabled) await this.assignHelper(accountId, car, helpers, helperUsage, log);
              log(
                `刷新后车辆[${gradeLabel(car.color)}]满足保底条件(${stopResult.reason})，发车`,
                "success"
              );
              await exec("car_send", {
                carId: String(car.id),
                helperId: car.helperId ? String(car.helperId) : 0,
                text: "",
                isUpgrade: false,
              });
              sentCount++;
              pushSentCar(car);
              break;
            }

            // 检查是否还能继续刷新
            const freeNow = Number(car.refreshCount ?? 0) === 0;
            if (freeNow) shouldRefresh = true;
            else if (refreshTickets > 0) shouldRefresh = true;
            else {
              // 如果判断为不足，再做一次保守确认，避免 transient 0 导致误判
              const retryTickets = await this.getRefreshTickets(accountId, log);
              if (retryTickets > 0) {
                log(`刷新券不足判断疑似异常，重试后: ${retryTickets}，继续刷新`, "warning");
                refreshTickets = retryTickets;
                shouldRefresh = true;
                continue;
              }
              if (assignHelperEnabled) await this.assignHelper(accountId, car, helpers, helperUsage, log);
              log(
                `车辆[${gradeLabel(car.color)}]没有免费刷新次数且刷新券不足，保底未满足直接发车`,
                "warning"
              );
              await exec("car_send", {
                carId: String(car.id),
                helperId: car.helperId ? String(car.helperId) : 0,
                text: "",
                isUpgrade: false,
              });
              sentCount++;
              pushSentCar(car);
              break;
            }

          }
        } catch (carErr) {
          log(`车辆处理失败: ${carErr.message}，跳过`, "error");
        }
      }

      try {
        // 发车完成后重新查询车辆状态并保存快照，供前端账号栏实时显示
        await this.getStatus(accountId);
      } catch {}

      // 输出汇总日志（账号名：发车数量4 | 赛车1:红(500金砖) | 赛车2:橙(3招募令) | ...）
      // userKey 可能为 null（定时任务等场景），此时 db.getAccount 第二参数用 null 兜底
      const accInfo = userKey
        ? db.getAccount(accountId, userKey)
        : (db.getAccount(accountId) || db.getAllAccounts().find(a => a.id === accountId));
      const accountName = accInfo?.name || accountId;
      // 奖励只显示达到保底阈值的资源项（金砖/刷新券/招募令/白玉）
      const summary = formatSendSummary(sentCount, sentCars, thresholds);
      log(`${accountName}：${summary}`, sentCount > 0 ? "success" : "info");

      // 持久化到 car-log 文件（按 userKey 隔离，同样只记录达标奖励）
      if (userKey) {
        recordCarSendLog(accountId, accountName, sentCount, sentCars, userKey, thresholds);
      }

      log(`智能发车完成，共发 ${sentCount} 辆`, "success");
    } catch (e) {
      log(`智能发车失败: ${e.message}`, "error");
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
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);

    log(`=== 一键收车 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const carRes = await exec(
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
          await exec(
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
              await exec(
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
        log(`没有可收取的车辆`, "info");
      else log(`收车完成，共收取 ${claimed} 辆`, "success");
    } catch (e) {
      log(`收车失败: ${e.message}`, "error");
    }
  }
}

export default CarTasks;
