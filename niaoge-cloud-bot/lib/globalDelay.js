/**
 * 全局延迟设置（单一数据源）
 *
 * 由 server.js 在启动时和每次更新 batchSettings 时同步。
 * 所有任务路径（每日任务 taskRunner、批量任务 batch 模块、手动单个执行）
 * 统一通过此模块读取延迟，确保 Accounts 页面的"通用延迟"真正全局生效。
 */

// 默认延迟（与 DEFAULT_BATCH_SETTINGS 保持一致）
let _delay = {
  commandDelay: 500, // 每条游戏命令成功后的等待
  taskDelay: 500,    // 每个任务之间的等待
};

/** 更新全局延迟（合并） */
export function setGlobalDelay(partial = {}) {
  _delay = { ..._delay, ...partial };
}

/** 读取全局延迟 */
export function getGlobalDelay() {
  return { ..._delay };
}

/** 仅读取 commandDelay（makeExec 用） */
export function getCommandDelay() {
  return _delay.commandDelay || 0;
}
