/**
 * 功法任务 - 领取功法残卷/赠送功法残卷
 * 从 xyzw_web_helper tasksLegacy.js 移植
 */
import { makeLog, makeExec } from "./logHelper.js";

const ITEM_LEGACY = 37007; // 功法残卷

export class LegacyTasks {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * 获取角色信息
   */
  async getRoleInfo(accountId) {
    try {
      const res = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 10000);
      return res?.role || {};
    } catch { return {}; }
  }

  /**
   * 获取功法残卷数量
   */
  async getLegacyCount(accountId) {
    try {
      const role = await this.getRoleInfo(accountId);
      return Number(role?.items?.[ITEM_LEGACY]?.quantity || 0);
    } catch { return 0; }
  }

  // ==================== 领取功法残卷 ====================

  /** 领取功法挂机残卷 */
  async claimHangUp(accountId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 领取功法残卷 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const resp = await exec("legacy_claimhangup", {}, "领取功法挂机奖励");
      const value = resp?.reward?.[0]?.value || "?";
      const total = resp?.role?.items?.[ITEM_LEGACY]?.quantity || "?";
      log(`领取 ${value} 个，共 ${total} 个`, "success");
      return resp;
    } catch (e) {
      log(`领取失败: ${e.message}`, "error");
      if (e.message?.includes("200160")) {
        log(`功法模块未开启`, "warning");
      }
      throw e;
    }
  }

  // ==================== 赠送功法残卷 ====================

  /**
   * 赠送功法残卷（需密码验证）
   * @param {string} accountId - 赠送方
   * @param {number|string} recipientId - 接收者roleId
   * @param {number} quantity - 赠送数量（默认全部）
   * @param {string} password - 安全密码
   */
  async giftSend(accountId, recipientId, quantity, password, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 赠送功法残卷 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      // 验证接收者
      if (!recipientId || Number(recipientId) <= 0) {
        throw new Error("接收者ID无效");
      }

      // 获取当前拥有量
      const legacyCount = await this.getLegacyCount(accountId);
      if (legacyCount <= 0) {
        log(`功法残卷不足(0)`, "error");
        return;
      }

      const actualQty = quantity > 0 ? Math.min(quantity, legacyCount) : legacyCount;
      log(`当前残卷${legacyCount}个，将赠送${actualQty}个`);

      // 查找接收者信息
      let recipientName = String(recipientId);
      let serverName = "";
      try {
        const rankRes = await exec("rank_getroleinfo", {
          bottleType: 0, includeBottleTeam: false, isSearch: false, roleId: Number(recipientId),
        }, "查找接收者", 5000);
        recipientName = rankRes?.roleInfo?.name || recipientName;
        serverName = rankRes?.roleInfo?.serverName || "";
        if (!rankRes?.roleInfo?.roleId) {
          throw new Error(`接收者 ${recipientId} 不存在`);
        }
      } catch (e) {
        if (e.message.includes("不存在")) throw e;
        // 其他错误不阻止
      }

      // 安全密码验证
      if (password) {
        try {
          const pwRes = await exec("role_commitpassword", {
            password, passwordType: 1,
          }, "安全密码验证", 8000);

          if (!pwRes?.role?.statistics?.["que:wh:tm"]) {
            log(`密码验证失败`, "error");
            throw new Error("安全密码错误");
          }
          log(`安全密码验证成功`, "success");
          // 密码已验证，设置"que:wh:tm"以防止后续检测失败
        } catch (e) {
          if (e.message === "安全密码错误") throw e;
          log(`密码验证异常: ${e.message}`, "warning");
        }
      }

      // 执行赠送
      await exec("legacy_sendgift", {
        itemCnt: actualQty,
        legacyUIds: [],
        targetId: Number(recipientId),
      }, `赠送${actualQty}个功法残卷给[${serverName}]${recipientName}(${recipientId})`, 10000);

      log(`成功赠送${actualQty}个功法残卷给 ${recipientName}`, "success");
    } catch (e) {
      log(`赠送失败: ${e.message}`, "error");
    }
  }
}

export default LegacyTasks;
