/**
 * 副本/宝库/梦境 批处理 - 从 xyzw_web_helper tasksDungeon.js 移植
 */
import * as db from "../db.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DREAM_SHOP_LOG_DIR = join(__dirname, "..", "..", "data", "dream-shop-log");
const DREAM_SHOP_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function getDreamShopLogPath(userKey) {
  const safeKey = userKey ? String(userKey).replace(/[^a-zA-Z0-9_-]/g, "_") : "default";
  return join(DREAM_SHOP_LOG_DIR, `dream-shop-log.${safeKey}.json`);
}

const DREAM_MERCHANT_CONFIG = {
  1: { name: "初级商人", items: ["进阶石", "精铁", "木质宝箱", "青铜宝箱", "普通鱼竿", "咸神门票", "咸神火把"] },
  2: { name: "中级商人", items: ["梦魇晶石", "进阶石", "精铁", "黄金宝箱", "黄金鱼竿", "招募令", "橙将碎片", "紫将碎片"] },
  3: { name: "高级商人", items: ["梦魇晶石", "铂金宝箱", "黄金鱼竿", "招募令", "红将碎片", "橙将碎片", "红将碎片", "普通鱼竿"] },
};

let _dreamLogPromise = Promise.resolve();

function getDreamMerchantName(mId) {
  return DREAM_MERCHANT_CONFIG[mId]?.name || `商人${mId}`;
}

function getDreamItemName(mId, itemIdx) {
  return DREAM_MERCHANT_CONFIG[mId]?.items[itemIdx] || `商品${mId}-${itemIdx}`;
}

function recordDreamShopPurchase(accountId, accountName, mId, itemIdx, userKey) {
  const merchantName = getDreamMerchantName(mId);
  const itemName = getDreamItemName(mId, itemIdx);
  const record = {
    time: new Date().toISOString(),
    accountId,
    accountName,
    merchantId: mId,
    merchantName,
    itemIdx,
    itemName,
  };

  const write = () => {
    try {
      if (!existsSync(DREAM_SHOP_LOG_DIR)) mkdirSync(DREAM_SHOP_LOG_DIR, { recursive: true });
      const logPath = getDreamShopLogPath(userKey);
      let records = [];
      if (existsSync(logPath)) {
        try {
          records = JSON.parse(readFileSync(logPath, "utf8"));
          if (!Array.isArray(records)) records = [];
        } catch {
          records = [];
        }
      }
      const cutoff = Date.now() - DREAM_SHOP_LOG_RETENTION_MS;
      records = records.filter(r => r?.time && new Date(r.time).getTime() > cutoff);
      records.push(record);
      writeFileSync(logPath, JSON.stringify(records, null, 2), "utf8");
    } catch (e) {
      console.error("[dream-shop-log] 写入失败:", e.message);
    }
  };

  const next = _dreamLogPromise.then(write, write);
  _dreamLogPromise = next.catch(() => {});
  return next;
}

export class DungeonTasks {
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

  /** 一键宝库前3层: 获取信息→打2次boss→开9次箱 */
  async baoku13(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 一键宝库前3层 ===`);
    await this.pool.ensureConnected(accountId);

    const info = await this.exec(accountId, "bosstower_getinfo", {}, "获取宝库信息");
    const towerId = info?.bossTower?.towerId;
    if (towerId < 1 || towerId > 3) {
      this.log(`[${name}] 当前不在1-3层(towerId=${towerId})，跳过`, "warning");
      return;
    }

    for (let i = 0; i < 2; i++) {
      await this.exec(accountId, "bosstower_startboss", {}, `宝库BOSS ${i + 1}/2`, 8000);
      await new Promise(r => setTimeout(r, 500));
    }
    for (let i = 0; i < 9; i++) {
      await this.exec(accountId, "bosstower_startbox", {}, `开启宝箱 ${i + 1}/9`);
      await new Promise(r => setTimeout(r, 500));
    }
    this.log(`[${name}] 宝库前3层完成`, "success");
  }

  /** 一键宝库4,5层: 获取信息→打2次boss */
  async baoku45(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 一键宝库4-5层 ===`);
    await this.pool.ensureConnected(accountId);

    const info = await this.exec(accountId, "bosstower_getinfo", {}, "获取宝库信息");
    const towerId = info?.bossTower?.towerId;
    if (towerId < 4 || towerId > 5) {
      this.log(`[${name}] 当前不在4-5层(towerId=${towerId})，跳过`, "warning");
      return;
    }

    for (let i = 0; i < 2; i++) {
      await this.exec(accountId, "bosstower_startboss", {}, `宝库BOSS ${i + 1}/2`, 8000);
      await new Promise(r => setTimeout(r, 500));
    }
    this.log(`[${name}] 宝库4-5层完成`, "success");
  }

  /** 一键梦境: 仅周日/一/三/四开放 */
  async mengjing(accountId, callbacks = {}) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 一键梦境 ===`);
    await this.pool.ensureConnected(accountId);

    const dow = new Date().getDay();
    if (dow !== 0 && dow !== 1 && dow !== 3 && dow !== 4) {
      this.log(`[${name}] 当前非梦境开放日(日/一/三/四)，跳过`, "warning");
      return;
    }

    const roleInfo = await this.exec(accountId, "role_getroleinfo", {}, "获取梦境信息", 15000);
    const levelId = roleInfo?.role?.levelId || 0;
    const dungeon = roleInfo?.role?.dungeon || {};
    const maxId = dungeon.maxId || 0;
    const dungeonStatus = dungeon.status;
    this.log(`[${name}] 梦境关卡: ${maxId}`);

    if (levelId < 200) {
      this.log(`[${name}] 关卡数不足(${levelId}<200)，无法进行梦境挑战，跳过`, "warning");
      return;
    }
    if (dungeonStatus === 2 || dungeonStatus === "completed") {
      this.log(`[${name}] 梦境已完成，无需重复执行`, "warning");
      return;
    }

    const heroId = 107;
    const battleTeam = { 0: heroId };
    try {
      await this.exec(accountId, "dungeon_selecthero", { battleTeam }, "梦境选将", 10000);
    } catch (e) {
      const msg = e.message || "";
      if (!msg.includes("2600040")) throw e;
      this.log(`[${name}] 阵容已设置，直接开始战斗`, "info");
    }

    await new Promise(r => setTimeout(r, 500));
    this.log(`[${name}] 开始梦境战斗...`, "info");

    let wins = 0, losses = 0, total = 0, consecutiveLosses = 0;
    const maxBattles = 200, maxConsecutiveLosses = 5;

    for (; total < maxBattles; ) {
      try {
        const res = await this.pool.sendMessage(accountId, "fight_startdungeon", { heroId }, 15000);
        total++;
        const isWin = res?.isWin || false;
        const dungeonId = res?.dungeonId || res?.stageId || 0;
        if (isWin) { wins++; consecutiveLosses = 0; } else { losses++; consecutiveLosses++; }
        if (!isWin && consecutiveLosses >= maxConsecutiveLosses) {
          this.log(`[${name}] 连续${consecutiveLosses}次战斗失败，疑似遇到回血武将，停止挑战`, "warning");
          break;
        }
        if (dungeonId) {
          await new Promise(r => setTimeout(r, 500));
          try {
            await this.exec(accountId, "dungeon_reward", { dungeonId }, "领取梦境奖励", 10000);
          } catch (err) {
            this.log(`[${name}] 梦境奖励领取失败: ${err.message}`, "warning");
          }
        }
        if (total % 10 === 0) {
          this.log(`[${name}] 梦境进度: 已打${total}场，${wins}胜${losses}负`, "info");
        }
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        const msg = e.message || "";
        if (msg.includes("2600080") || msg.includes("2600050") || msg.includes("2600040") || msg.includes("已完成梦境挑战")) {
          this.log(`[${name}] 梦境挑战结束（武将已阵亡或无剩余次数）`, "info");
          break;
        }
        this.log(`[${name}] 第${total + 1}场战斗出错: ${msg}`, "error");
        break;
      }
    }

    this.log(`[${name}] 咸王梦境完成（${wins}胜${losses}负，共${total}场）`, "success");
  }

  /** 一键购买梦境商品 */
  async buyDreamItems(accountId, purchaseList, callbacks = {}, userKey = null) {
    this.callbacks = callbacks;
    const acc = db.getAccount(accountId, userKey);
    const name = acc?.name || accountId;
    this.log(`[${name}] === 梦境购买 ===`);
    await this.pool.ensureConnected(accountId);

    const dow = new Date().getDay();
    if (dow !== 0 && dow !== 1 && dow !== 3 && dow !== 4) {
      this.log(`[${name}] 当前非梦境开放日，跳过`, "warning");
      return;
    }

    const roleInfo = await this.exec(accountId, "role_getroleinfo", {}, "获取角色信息", 15000);
    const levelId = roleInfo?.role?.levelId || 0;
    if (levelId < 4000) {
      this.log(`[${name}] 关卡<4000无法购买`, "warning");
      return;
    }

    let merchant = roleInfo?.role?.dungeon?.merchant;
    if (!merchant) { this.log(`[${name}] 无法获取梦境商店`, "error"); return; }

    let success = 0, fail = 0;
    const summary = new Map(); // merchantName -> Set(itemName)

    for (const itemKey of (purchaseList || [])) {
      const [mId, itemIdx] = itemKey.split("-").map(Number);
      const merchantName = getDreamMerchantName(mId);
      const itemName = getDreamItemName(mId, itemIdx);
      let boughtForThis = 0;
      const maxPerItem = 20;
      while (boughtForThis < maxPerItem) {
        const items = merchant[mId];
        if (!items) break;
        let pos = -1;
        for (let p = 0; p < items.length; p++) { if (items[p] === itemIdx) { pos = p; break; } }
        if (pos < 0) break;
        try {
          await this.exec(accountId, "dungeon_buymerchant", { id: mId, index: itemIdx, pos }, `购买 ${merchantName} 的 ${itemName}`);
          success++; boughtForThis++;
          if (!summary.has(merchantName)) summary.set(merchantName, new Set());
          summary.get(merchantName).add(itemName);
          recordDreamShopPurchase(accountId, name, mId, itemIdx, userKey);
        } catch (e) {
          fail++;
          break;
        }
        await new Promise(r => setTimeout(r, 500));
        try {
          const fresh = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 10000);
          merchant = fresh?.role?.dungeon?.merchant || merchant;
        } catch {}
      }
    }

    if (summary.size > 0) {
      const summaryParts = [];
      for (const [merchantName, itemSet] of summary) {
        summaryParts.push(`${merchantName}:${Array.from(itemSet).join("/")}`);
      }
      this.log(`[${name}] 本次购买: ${summaryParts.join("; ")}`, "info");
    }
    this.log(`[${name}] 梦境购买: 成功${success}, 失败${fail}`, "success");
  }
}

export default DungeonTasks;
