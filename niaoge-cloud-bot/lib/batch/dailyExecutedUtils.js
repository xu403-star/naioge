/**
 * 每日批量任务执行状态工具
 * 用于记录某个账号今天是否已经执行过某个批量/日常任务，避免重复执行。
 * 状态持久化在 account.settings.dailyBatchExecuted 中。
 */
import * as db from "../db.js";

const RETENTION_DAYS = 7;

function getTodayKey() {
  return new Date().toDateString();
}

function cleanOldDates(map) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const result = {};
  for (const [dateStr, keys] of Object.entries(map || {})) {
    try {
      const d = new Date(dateStr);
      if (d >= cutoff) result[dateStr] = keys;
    } catch {
      result[dateStr] = keys;
    }
  }
  return result;
}

export function loadAccountSettings(accountId) {
  try {
    const account = db.getAccount(accountId);
    if (account?.settings) {
      return JSON.parse(account.settings);
    }
  } catch {
    // ignore parse error
  }
  return {};
}

export function saveAccountSettings(accountId, settings) {
  db.updateAccount(accountId, { settings: JSON.stringify(settings) });
}

/**
 * 检查某个 key 今日是否已经执行过
 * @param {string} accountId
 * @param {string} key
 * @returns {boolean}
 */
export function isExecutedToday(accountId, key) {
  const settings = loadAccountSettings(accountId);
  const today = getTodayKey();
  const executed = settings.dailyBatchExecuted || {};
  return Array.isArray(executed[today]) && executed[today].includes(key);
}

/**
 * 标记某个 key 今日已执行
 * @param {string} accountId
 * @param {string} key
 */
export function markExecutedToday(accountId, key) {
  const settings = loadAccountSettings(accountId);
  const today = getTodayKey();

  if (!settings.dailyBatchExecuted) settings.dailyBatchExecuted = {};
  let cleaned = cleanOldDates(settings.dailyBatchExecuted);

  if (!Array.isArray(cleaned[today])) cleaned[today] = [];
  if (!cleaned[today].includes(key)) cleaned[today].push(key);

  settings.dailyBatchExecuted = cleaned;
  saveAccountSettings(accountId, settings);
}

/**
 * 清除某个 key 的今日执行记录（用于强制重跑）
 * @param {string} accountId
 * @param {string} key
 */
export function clearExecutedToday(accountId, key) {
  const settings = loadAccountSettings(accountId);
  const today = getTodayKey();
  if (settings.dailyBatchExecuted?.[today]) {
    settings.dailyBatchExecuted[today] = settings.dailyBatchExecuted[today].filter(
      (k) => k !== key
    );
    saveAccountSettings(accountId, settings);
  }
}

export default {
  isExecutedToday,
  markExecutedToday,
  clearExecutedToday,
};
