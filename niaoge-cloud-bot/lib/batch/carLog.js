/**
 * 赛车发车日志持久化（仿照 tasksDungeon.js 的 dream-shop-log 模式）
 * 按 userKey 隔离，7 天保留期，串行化写入避免并发冲突。
 *
 * 记录字段：
 *   { time, accountId, accountName, sentCount, cars: [{ carId, color, colorLabel, rewards: [{name, count}] }] }
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CAR_LOG_DIR = join(__dirname, "..", "..", "data", "car-log");
export const CAR_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function getCarLogPath(userKey) {
  const safeKey = userKey ? String(userKey).replace(/[^a-zA-Z0-9_-]/g, "_") : "default";
  return join(CAR_LOG_DIR, `car-log.${safeKey}.json`);
}

// 颜色数字 → 简短中文标签（用于日志显示，例如"红"/"橙"/"金"）
const COLOR_LABEL_MAP = {
  0: "白",
  1: "绿",
  2: "蓝",
  3: "紫",
  4: "橙",
  5: "红",
  6: "金",
};

export function colorLabel(color) {
  return COLOR_LABEL_MAP[Number(color)] || "未知";
}

// 奖励项 → 可读名称 + 对应阈值字段
const REWARD_KEY_MAP = [
  { test: r => Number(r?.type || 0) === 2, name: "金砖", thresholdKey: "gold" },
  { test: r => Number(r?.itemId || 0) === 35002, name: "刷新券", thresholdKey: "ticket" },
  { test: r => Number(r?.itemId || 0) === 1001, name: "招募令", thresholdKey: "recruit" },
  { test: r => Number(r?.itemId || 0) === 1022, name: "白玉", thresholdKey: "jade" },
];

/**
 * 将单辆车的奖励数组转成 [{name, count}, ...] 可读结构
 * 传入 thresholds 时只返回达到保底阈值的资源项；不传则返回全部 4 种关键资源
 * @param {Array} rewards - 原始奖励数组
 * @param {object} [thresholds] - { gold, ticket, recruit, jade }，传入则只显示达标项
 */
export function summarizeRewards(rewards, thresholds = null) {
  if (!Array.isArray(rewards) || rewards.length === 0) return [];
  // 合并 4 种关键资源
  const map = new Map();
  for (const r of rewards) {
    const key = REWARD_KEY_MAP.find(k => k.test(r));
    if (!key) continue;
    const count = Number(r.value || r.num || r.quantity || r.count || 0);
    if (count <= 0) continue;
    map.set(key.name, (map.get(key.name) || 0) + count);
  }
  // 按阈值过滤（只显示达标的）
  if (thresholds) {
    const result = [];
    for (const [name, count] of map.entries()) {
      const keyInfo = REWARD_KEY_MAP.find(k => k.name === name);
      const threshold = Number(thresholds[keyInfo.thresholdKey] || 0);
      if (count >= threshold && threshold > 0) {
        result.push({ name, count });
      }
    }
    return result;
  }
  return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
}

/**
 * 把一辆车的详情格式化成短字符串（用于实时日志）
 * 例如："赛车1:红(500金砖,3招募令)"
 * @param {number} carIdx - 序号（从1开始）
 * @param {object} car - { color, rewards }
 * @param {object} [thresholds] - 传入则只显示达标奖励
 */
export function formatCarShort(carIdx, car, thresholds = null) {
  const label = colorLabel(car.color);
  const rewards = summarizeRewards(car.rewards, thresholds);
  const rewardStr = rewards.length ? rewards.map(r => `${r.count}${r.name}`).join(",") : "无达标奖励";
  return `赛车${carIdx}:${label}(${rewardStr})`;
}

/**
 * 把一次发车的所有车汇总成短字符串（用于实时日志）
 * 例如："发车数量4 | 赛车1:红(500金砖) | 赛车2:橙(3招募令) | 赛车3:白(无达标奖励)"
 * @param {number} sentCount
 * @param {Array} sentCars - [{ carId, color, rewards }]
 * @param {object} [thresholds] - 传入则只显示达标奖励
 */
export function formatSendSummary(sentCount, sentCars, thresholds = null) {
  if (sentCount === 0) return "发车数量0";
  const parts = sentCars.map((c, i) => formatCarShort(i + 1, c, thresholds));
  return `发车数量${sentCount} | ${parts.join(" | ")}`;
}

let _carLogPromise = Promise.resolve();

/**
 * 记录一次智能发车结果到 JSON 文件
 * @param {string} accountId
 * @param {string} accountName
 * @param {number} sentCount
 * @param {Array} sentCars - [{ carId, color, rewards(原始数组) }]
 * @param {string} userKey
 * @param {object} [thresholds] - 保底阈值，传入则只记录达标奖励
 */
export function recordCarSendLog(accountId, accountName, sentCount, sentCars, userKey, thresholds = null) {
  const record = {
    time: new Date().toISOString(),
    accountId,
    accountName: accountName || accountId,
    sentCount: Number(sentCount) || 0,
    cars: (sentCars || []).map(c => ({
      carId: String(c.carId ?? c.id ?? ""),
      color: Number(c.color ?? 0),
      colorLabel: colorLabel(c.color),
      rewards: summarizeRewards(c.rewards, thresholds),
    })),
  };

  const write = () => {
    try {
      if (!existsSync(CAR_LOG_DIR)) mkdirSync(CAR_LOG_DIR, { recursive: true });
      const logPath = getCarLogPath(userKey);
      let records = [];
      if (existsSync(logPath)) {
        try {
          records = JSON.parse(readFileSync(logPath, "utf8"));
          if (!Array.isArray(records)) records = [];
        } catch {
          records = [];
        }
      }
      const cutoff = Date.now() - CAR_LOG_RETENTION_MS;
      records = records.filter(r => r?.time && new Date(r.time).getTime() > cutoff);
      records.push(record);
      writeFileSync(logPath, JSON.stringify(records, null, 2), "utf8");
    } catch (e) {
      console.error("[car-log] 写入失败:", e.message);
    }
  };

  const next = _carLogPromise.then(write, write);
  _carLogPromise = next.catch(() => {});
  return next;
}
