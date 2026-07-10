/**
 * 车辆相关工具函数
 * 从 xyzw (2) carUtils.js 移植
 */

// 四小时毫秒数
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

// 车辆品质名称
export const GRADE_NAMES = {
  0: "白色",
  1: "绿色",
  2: "蓝色",
  3: "紫色",
  4: "橙色",
  5: "红色",
  6: "金色",
};

// 刷新券 / 改装碎片道具 ID
export const ITEM_REFRESH_TICKET = 35002;
export const ITEM_RESEARCH_PIECE = 35009;

// 车辆研究消耗表
export const CAR_RESEARCH_COST = [
  20, 21, 22, 23, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 47, 50, 53, 56,
  59, 62, 65, 68, 71, 74, 78, 82, 86, 90, 94, 99, 104, 109, 114, 119, 126, 133,
  140, 147, 154, 163, 172, 181, 190, 199, 210, 221, 232, 243, 369, 393, 422,
  457, 498, 548, 607, 678, 763, 865, 1011,
];

// xyzw (2) 默认发车保底阈值
export const DEFAULT_CAR_THRESHOLDS = {
  gold: 500,
  recruit: 3,
  jade: 500,
  ticket: 4,
};

/**
 * 标准化车辆数据
 * @param {object} raw - 原始车辆数据
 * @returns {Array} - 标准化后的车辆列表
 */
export function normalizeCars(raw) {
  const r = raw || {};
  const body = r.body || r;
  const roleCar = body.roleCar || body.rolecar || {};

  // 优先从 roleCar.carDataMap 解析（id -> info）
  const carMap = roleCar.carDataMap || roleCar.cardatamap;
  if (carMap && typeof carMap === "object") {
    return Object.entries(carMap).map(([id, info], idx) => ({
      key: idx,
      id,
      ...(info || {}),
    }));
  }

  // 兜底
  let arr =
    body.cars || body.list || body.data || body.carList || body.vehicles || [];
  if (!Array.isArray(arr) && typeof arr === "object" && arr !== null)
    arr = Object.values(arr);
  if (Array.isArray(body) && arr.length === 0) arr = body;
  return (Array.isArray(arr) ? arr : []).map((it, idx) => ({
    key: idx,
    ...it,
  }));
}

/**
 * 获取品质标签
 * @param {number} color - 颜色等级
 * @returns {string} - 品质标签
 */
export function gradeLabel(color) {
  const map = {
    1: "绿·普通",
    2: "蓝·稀有",
    3: "紫·史诗",
    4: "橙·传说",
    5: "红·神话",
    6: "金·传奇",
  };
  return map[color] || "未知";
}

/**
 * 统计车辆奖励中的关键资源
 * @param {Array} rewards - 奖励列表
 * @returns {object} - { goldBrick, refreshTicket, recruitToken, whiteJade }
 */
export function countCarResources(rewards) {
  const result = {
    goldBrick: 0,
    refreshTicket: 0,
    recruitToken: 0,
    whiteJade: 0,
  };
  if (!Array.isArray(rewards)) return result;

  rewards.forEach((r) => {
    const val = Number(r.value || r.num || r.quantity || r.count || 0);
    const type = Number(r.type || 0);
    const itemId = Number(r.itemId || 0);

    if (type === 2) result.goldBrick += val;
    if (itemId === ITEM_REFRESH_TICKET) result.refreshTicket += val;
    if (itemId === 1001) result.recruitToken += val;
    if (itemId === 1022) result.whiteJade += val;
  });

  return result;
}

/**
 * 检查是否满足保底停止条件
 * @param {Array} rewards - 奖励列表
 * @param {object} thresholds - 阈值 { gold, recruit, jade, ticket }
 * @returns {object} - { shouldStop, resources, reason }
 */
export function checkStopCondition(rewards, thresholds = DEFAULT_CAR_THRESHOLDS) {
  const resources = countCarResources(rewards);
  const stopReason = [];

  if (resources.goldBrick >= thresholds.gold) {
    stopReason.push(`金砖${resources.goldBrick}>=${thresholds.gold}`);
  }
  if (resources.refreshTicket >= thresholds.ticket) {
    stopReason.push(`刷新券${resources.refreshTicket}>=${thresholds.ticket}`);
  }
  if (resources.recruitToken >= thresholds.recruit) {
    stopReason.push(`招募令${resources.recruitToken}>=${thresholds.recruit}`);
  }
  if (resources.whiteJade >= thresholds.jade) {
    stopReason.push(`白玉${resources.whiteJade}>=${thresholds.jade}`);
  }

  return {
    shouldStop: stopReason.length > 0,
    resources,
    reason: stopReason.join(", "),
  };
}

/**
 * 简化版保底模式 - 判断是否该发车
 * @param {object} car - 车辆对象
 * @param {object} thresholds - 阈值 { gold, recruit, jade, ticket }
 * @returns {boolean}
 */
export function shouldSendCarSimple(car, thresholds = DEFAULT_CAR_THRESHOLDS) {
  const rewards = Array.isArray(car?.rewards) ? car.rewards : [];
  const stopResult = checkStopCondition(rewards, thresholds);
  return stopResult.shouldStop;
}

/**
 * 判断是否可以收取
 * @param {object} car - 车辆对象
 * @returns {boolean} - 是否可以收取
 */
export function canClaim(car) {
  const t = Number(car?.sendAt || 0);
  if (!t) return false;
  const tsMs = t < 1e12 ? t * 1000 : t;
  return Date.now() - tsMs >= FOUR_HOURS_MS;
}
