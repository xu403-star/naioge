/**
 * 内存日志缓冲区
 *
 * 设计目标：
 * - 任务执行过程中的日志只存内存，不写数据库，避免 saveToDisk 阻塞事件循环
 * - 前端通过轮询 API 增量读取，不依赖 SSE 长连接
 * - 环形缓冲区，超出上限自动丢弃最早的
 *
 * 容量估算：
 * - 每条日志约 200 字节
 * - 全局最多 2000 条 ≈ 400KB
 * - 每账号最多 200 条
 */

const MAX_GLOBAL_LOGS = 2000;
const MAX_PER_ACCOUNT = 200;

// 全局日志数组（按时间顺序）
const _logs = [];
// 自增序号，供前端增量拉取
let _seq = 0;

/**
 * 推送一条日志到内存缓冲区
 * @param {string} accountId - 账号ID（可为 null 表示全局日志）
 * @param {string} message - 日志内容
 * @param {string} type - info/success/warning/error
 * @param {object} extra - 额外字段（如 runId）
 */
function push(accountId, message, type = "info", extra = {}) {
  const entry = {
    seq: ++_seq,
    time: new Date().toISOString(),
    accountId: accountId || null,
    message,
    type,
    ...extra,
  };

  _logs.push(entry);

  // 超出全局上限，丢弃最早的
  if (_logs.length > MAX_GLOBAL_LOGS) {
    _logs.splice(0, _logs.length - MAX_GLOBAL_LOGS);
  }

  // 每账号上限：统计并裁剪（低频操作，O(n) 可接受）
  if (accountId) {
    let count = 0;
    for (let i = _logs.length - 1; i >= 0; i--) {
      if (_logs[i].accountId === accountId) {
        count++;
        if (count > MAX_PER_ACCOUNT) {
          _logs.splice(i, 1);
        }
      }
    }
  }
}

/**
 * 增量读取日志（从指定 seq 之后）
 * @param {number} sinceSeq - 上次拉取到的 seq
 * @param {number} limit - 最多返回条数
 * @returns {{ logs: Array, lastSeq: number }}
 */
function getSince(sinceSeq = 0, limit = 200) {
  const result = [];
  for (let i = 0; i < _logs.length; i++) {
    if (_logs[i].seq > sinceSeq) {
      result.push(_logs[i]);
      if (result.length >= limit) break;
    }
  }
  return {
    logs: result,
    lastSeq: result.length > 0 ? result[result.length - 1].seq : sinceSeq,
  };
}

/**
 * 获取最近的日志（不基于 seq，直接取最后 N 条）
 * @param {number} limit
 * @returns {Array}
 */
function getRecent(limit = 100) {
  return _logs.slice(-limit);
}

/**
 * 获取缓冲区当前状态（调试用）
 */
function getStats() {
  return {
    total: _logs.length,
    lastSeq: _seq,
    maxCapacity: MAX_GLOBAL_LOGS,
  };
}

export { push, getSince, getRecent, getStats };
