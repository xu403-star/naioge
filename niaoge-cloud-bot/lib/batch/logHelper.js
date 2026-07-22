/**
 * 批量任务日志/执行辅助函数
 * 所有 batch 模块统一使用局部 log/exec，避免 this.callbacks 并发覆盖。
 */
import { getCommandDelay } from "../globalDelay.js";

export function makeLog(callbacks) {
  return (msg, type = "info") => {
    if (typeof callbacks === "function") {
      callbacks({ time: new Date().toLocaleTimeString(), message: msg, type });
    } else if (callbacks?.onLog) {
      callbacks.onLog({ time: new Date().toLocaleTimeString(), message: msg, type });
    }
  };
}

export function makeExec(pool, accountId, log) {
  return async (cmd, params = {}, desc = "", timeout = 5000) => {
    try {
      if (desc) log(`${desc}...`);
      const r = await pool.sendMessage(accountId, cmd, params, timeout);
      // 应用全局命令延迟（commandDelay），让 Accounts 页面的"通用延迟"对批量任务也生效
      const cmdDelay = getCommandDelay();
      if (cmdDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, cmdDelay));
      }
      return r;
    } catch (e) {
      if (desc) log(`${desc} - 失败: ${e.message}`, "error");
      throw e;
    }
  };
}
