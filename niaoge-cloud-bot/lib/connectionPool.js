/**
 * 连接池管理器 - 管理多账号的 WebSocket 连接
 */
import { GameWsClient } from "./gameWsClient.js";
import * as db from "./db.js";
import { transformToken, buildWsUrl, buildRestoreToken } from "./tokenAuth.js";

function isValidWsUrl(url) {
  return typeof url === "string" && url.startsWith("wss://");
}

const MAX_ACTIVE = 5; // 最大并发连接数

export class ConnectionPool {
  constructor() {
    this.connections = new Map(); // accountId -> { client, status, hasSlot }
    this.activeCount = 0;
    this.slotQueue = []; // 等待槽位的 resolve 列表
    this.onLog = null;
    this.onDisconnect = null;
    this._lastTokenRefresh = new Map(); // accountId -> timestamp（Token刷新冷却）
    this._tokenRefreshLocks = new Map(); // accountId -> Promise，防止并发刷新
    this._taskSlots = new Set(); // 正在执行任务的账号（任务槽位）
    this._connectLocks = new Map(); // accountId -> Promise，串行化同一账号的连接/重连操作
    this._lastSuccessfulToken = new Map(); // accountId -> { tokenObj, tokenStr, wsUrl, sessId, connId }
    this._lastRecvSeq = new Map(); // accountId -> number
    this._tokenExpiredSignal = new Map(); // accountId -> boolean
    // 手动中止的账号：用户点击断开/断开全部后，正在运行的任务应停止而不是自动重连
    this._manualAborted = new Set();
    // 用户手动断开后，禁止该账号自动重连，直到下次手动连接或任务重新启动
    this._autoConnectAllowed = new Map();
    // 会话恢复在部分账号/网络环境下不稳定，默认关闭以优先保证连接成功率
    this.enableSessionRestore = false;
  }

  /**
   * 标记账号为手动中止，正在运行的任务应停止
   */
  abortAccount(accountId) {
    this._manualAborted.add(accountId);
  }

  /**
   * 取消账号的手动中止标记（任务正常结束后调用）
   */
  clearAbort(accountId) {
    this._manualAborted.delete(accountId);
  }

  /**
   * 检查账号是否被手动中止
   */
  isAborted(accountId) {
    return this._manualAborted.has(accountId);
  }

  /**
   * 设置账号是否允许自动连接。
   * 用户手动断开/断开全部后设为 false，阻止后续自动重连；
   * 手动连接或新任务开始时会重新设为 true。
   */
  allowAutoConnect(accountId, allowed) {
    if (allowed) {
      this._autoConnectAllowed.delete(accountId);
    } else {
      this._autoConnectAllowed.set(accountId, false);
    }
  }

  /**
   * 检查账号当前是否允许自动连接
   */
  isAutoConnectAllowed(accountId) {
    return !this._autoConnectAllowed.has(accountId);
  }

  setLogCallback(fn) { this.onLog = fn; }

  /**
   * 账号级连接锁：防止同一个账号并发 connect/ensureConnected/reconnect 导致多连接和槽位泄漏
   */
  async _withAccountLock(accountId, fn) {
    const existing = this._connectLocks.get(accountId);
    const promise = (async () => {
      if (existing) await existing;
      return fn();
    })();
    this._connectLocks.set(accountId, promise);
    try {
      return await promise;
    } finally {
      if (this._connectLocks.get(accountId) === promise) {
        this._connectLocks.delete(accountId);
      }
    }
  }

  /**
   * 清理账号的会话恢复缓存（任务正常结束时调用，避免跨任务使用已失效的 restore token）
   */
  _clearSessionCache(accountId) {
    this._lastSuccessfulToken.delete(accountId);
    this._lastRecvSeq.delete(accountId);
    this._tokenExpiredSignal.delete(accountId);
  }

  /**
   * 清理指定账号的连接记录（必须在持有 accountLock 时调用）
   */
  _cleanupConnectionLocked(accountId) {
    const conn = this.connections.get(accountId);
    if (!conn) return;
    this._releaseSlotIfNeeded(conn);
    try { conn.client.destroy(); } catch {}
    this.connections.delete(accountId);
    try { db.updateAccountConnection(accountId, false); } catch {}
  }

  /**
   * 安全清理指定账号的连接记录（自动加锁）
   */
  async _cleanupConnection(accountId) {
    return this._withAccountLock(accountId, () => this._cleanupConnectionLocked(accountId));
  }

  log(msg, level = "info") {
    if (this.onLog) this.onLog({ time: new Date().toISOString(), message: msg, level });
  }

  _accountName(accountId) {
    try {
      // 优先使用连接中缓存的真实角色名，未连接时回退到数据库里的显示名
      const conn = this.connections.get(accountId);
      if (conn?.roleName) return conn.roleName;
      const account = db.getAccount(accountId);
      return account?.name || accountId;
    } catch {
      return accountId;
    }
  }

  /**
   * 获取账号连接中缓存的真实角色名（游戏内名称）
   */
  getRoleName(accountId) {
    return this._accountName(accountId);
  }

  /**
   * 获取账号连接初始化时缓存的角色信息（避免 taskRunner 重复请求 role_getroleinfo）
   * @returns {object|null} roleInfo 或 null（未连接或初始化时未获取到）
   */
  getCachedRoleInfo(accountId) {
    const conn = this.connections.get(accountId);
    return conn?.lastRoleInfo || null;
  }

  /**
   * 获取连接状态
   */
  getStatus(accountId) {
    const conn = this.connections.get(accountId);
    return conn ? conn.status : "disconnected";
  }

  /**
   * 获取所有连接状态
   */
  getAllStatus() {
    const result = {};
    for (const [id, conn] of this.connections) {
      result[id] = conn.status;
    }
    return result;
  }

  /**
   * 等待连接槽位（最大并发5，其余排队）
   */
  async waitForSlot(timeoutMs = 120000) {
    if (this.activeCount < MAX_ACTIVE) {
      this.activeCount++;
      return;
    }

    this.log(`连接槽位已满 (${this.activeCount}/${MAX_ACTIVE})，进入队列等待...`, "debug");
    return new Promise((resolve, reject) => {
      const timer = timeoutMs > 0
        ? setTimeout(() => {
            const idx = this.slotQueue.findIndex(item => item.resolve === resolve);
            if (idx >= 0) this.slotQueue.splice(idx, 1);
            reject(new Error("连接槽位等待超时"));
          }, timeoutMs)
        : null;
      this.slotQueue.push({ resolve, timer });
    });
  }

  /**
   * 释放连接槽位，并唤醒队列中的下一个等待者
   */
  releaseSlot() {
    this.activeCount = Math.max(0, this.activeCount - 1);

    while (this.slotQueue.length > 0) {
      const next = this.slotQueue.shift();
      if (next.timer) clearTimeout(next.timer);
      // 只有在还有余量时才真正分配槽位
      if (this.activeCount < MAX_ACTIVE) {
        this.activeCount++;
        next.resolve();
        return;
      }
    }
  }

  /**
   * 连接间隔抖动：避免同一秒大量连接
   */
  async jitterDelay(minMs = 500, maxMs = 1500) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(r => setTimeout(r, delay));
  }

  /**
   * 连接一个账号（公开方法，自动加锁）
   */
  async connect(accountId, token, wsUrl, options = {}) {
    // 手动连接时恢复该账号的自动连接权限
    this.allowAutoConnect(accountId, true);
    this.clearAbort(accountId);
    return this._withAccountLock(accountId, () => this._connectLocked(accountId, token, wsUrl, options));
  }

  /**
   * 实际连接逻辑（必须在 accountLock 内调用）
   * @param {object} options - 连接选项
   * @param {boolean} options.isRestore - 是否为会话恢复模式
   */
  async _connectLocked(accountId, token, wsUrl, options = {}) {
    const existing = this.connections.get(accountId);
    if (existing) {
      if (existing.status === "connected") return existing.client;
      // 旧连接未就绪，先清理（释放槽位、销毁客户端）
      this._cleanupConnectionLocked(accountId);
    }

    // 等待并发槽位（最大5个）
    await this.waitForSlot();

    // 抖动，避免同一秒大量连接
    await this.jitterDelay();

    // 创建连接前再次检查，避免用户点击断开后仍创建新连接
    if (this._manualAborted.has(accountId) || !this.isAutoConnectAllowed(accountId)) {
      this.releaseSlot();
      throw new Error(`账号 ${accountId} 已手动断开，需手动重新连接`);
    }

    if (!wsUrl || !wsUrl.startsWith("wss://")) {
      this.releaseSlot();
      throw new Error(`[${accountId}] 无效的 WebSocket URL，Token 可能已过期或缺失`);
    }

    const name = this._accountName(accountId);
    // 隐藏 URL 中的敏感 token 参数，仅用于调试展示基础连接信息
    const urlPreview = wsUrl.length > 100 ? wsUrl.substring(0, 100) + "..." : wsUrl;
    this.log(`[${name}] 正在连接... [${this.activeCount}/${MAX_ACTIVE}]`, "debug");

    // 调试：记录连接来源，帮助排查意外自动连接
    try {
      const stack = new Error("连接来源").stack.split("\n").slice(2, 8).map(s => s.trim()).join(" | ");
      this.log(`[${name}] 连接来源: ${stack}`, "debug");
    } catch {}

    const client = new GameWsClient({
      url: wsUrl,
      heartbeatMs: 5000,
      onLog: (entry) => {
        if (this.onLog) this.onLog({ ...entry, accountId });
      },
    });
    const clientRef = client;

    const connEntry = { client, status: "connecting", hasSlot: true, roleName: "", lastRoleInfo: null };
    this.connections.set(accountId, connEntry);

    // 把本次连接实际使用的 token/wsUrl 保存到闭包，供回调使用
    const connectToken = token;
    const connectWsUrl = wsUrl;

    return new Promise((resolve, reject) => {
      let resolved = false;
      let handshakeSucceeded = false;

      const settle = (fn, value) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        fn(value);
      };

      const timeout = setTimeout(() => {
        connEntry.status = "timeout";
        settle(reject, new Error(`[${accountId}] 连接超时`));
        client.destroy();
      }, 15000);

      client.onConnect = async () => {
        handshakeSucceeded = true;
        clearTimeout(timeout);
        connEntry.status = "connected";
        const name = this._accountName(accountId);
        this.log(`[${name}] 连接成功 [${this.activeCount}/${MAX_ACTIVE}]`);

        // 缓存成功连接的 token，用于断线后会话恢复
        try {
          const tokenObj = JSON.parse(connectToken);
          this._lastSuccessfulToken.set(accountId, {
            tokenObj,
            tokenStr: connectToken,
            wsUrl: connectWsUrl,
            sessId: tokenObj.sessId,
            connId: tokenObj.connId,
          });
        } catch (e) {
          this.log(`[${accountId}] 无法缓存成功 token: ${e.message}`, "warning");
        }

        // 跟踪最后收到的服务端 seq
        this._lastRecvSeq.set(accountId, client.lastRecvSeq);
        if (client._seqTrackerInterval) clearInterval(client._seqTrackerInterval);
        client._seqTrackerInterval = setInterval(() => {
          this._lastRecvSeq.set(accountId, client.lastRecvSeq);
        }, 1000);

        // 等待一下让服务器稳定，再发送初始命令
        await new Promise(r => setTimeout(r, 500));

        // 检查连接是否在等待期间断开
        if (!client.connected) {
          this.log(`[${name}] 连接在初始化期间断开`, "warning");
          connEntry.status = "disconnected";
          // 握手已经成功过，但初始化阶段断开 → 不消耗 BIN，直接重连
          const err = new Error(`[${accountId}] 服务器断开连接: code=1006`);
          err.handshakeSucceeded = true;
          settle(reject, err);
          client.destroy();
          return;
        }

        // 初始化：获取角色信息
        try {
          const roleInfo = await client.sendWithPromise("role_getroleinfo", {}, 8000);
          this.log(`[${name}] 角色信息获取成功`);

          // 缓存真实角色名和完整角色信息，供后续日志和 taskRunner 复用（避免重复请求 role_getroleinfo）
          const roleName = roleInfo?.role?.name || roleInfo?.name || "";
          if (roleName) {
            connEntry.roleName = roleName;
          }
          connEntry.lastRoleInfo = roleInfo;

          // 更新角色信息到数据库
          if (roleInfo) {
            try {
              db.updateAccountConnection(accountId, true, roleInfo);
            } catch (e) { /* ignore */ }
          }
        } catch (e) {
          this.log(`[${name}] 初始化数据失败: ${e.message}`, "warning");

          // 会话恢复模式下初始化超时，说明该 restore session 已失效（服务端不响应），
          // 必须拒绝本次连接，让上层重试时走全新连接，避免后续请求继续超时。
          if (options.isRestore && /timeout/i.test(e.message)) {
            this.log(`[${name}] 恢复模式初始化超时，回退到全新连接`, "warning");
            const err = new Error(`[${accountId}] 恢复模式初始化超时`);
            err.isRestoreInitTimeout = true;
            err.handshakeSucceeded = true;
            settle(reject, err);
            client.destroy();
            return;
          }

          // 即使初始化失败，连接仍可能有效
          try { db.updateAccountConnection(accountId, true, null); } catch (e) { /* ignore */ }
          settle(resolve, client);
          return;
        }

        // 更新数据库
        try {
          db.updateAccountConnection(accountId, true, null);
        } catch (e) { /* ignore */ }

        settle(resolve, client);
      };

      client.onDisconnect = (code, reason, hadHandshake) => {
        connEntry.status = "disconnected";
        const name = this._accountName(accountId);
        // 保存最终 seq 并清理定时器
        this._lastRecvSeq.set(accountId, client.lastRecvSeq);
        if (client._seqTrackerInterval) {
          clearInterval(client._seqTrackerInterval);
          client._seqTrackerInterval = null;
        }
        // 连接断开时统一释放连接槽位；任务槽位由 releaseTaskSlot 单独管理
        this._releaseSlotIfNeeded(connEntry);
        if (this._taskSlots.has(accountId)) {
          this.log(`[${name}] 任务执行期间连接断开，保留任务槽位等待重连`, "warning");
        }
        this.log(`[${name}] 连接断开: code=${code} ${reason}`);
        // 如果连接未成功建立就被断开，通知调用方
        if (!resolved) {
          const err = new Error(`[${accountId}] 连接失败: code=${code}`);
          err.handshakeSucceeded = hadHandshake || false;
          settle(reject, err);
        }
        try { db.updateAccountConnection(accountId, false); } catch (e) { /* ignore */ }
        if (this.onDisconnect) this.onDisconnect(accountId);
      };

      client.onError = (err) => {
        this.log(`[${this._accountName(accountId)}] 连接错误: ${err.message}`, "error");
      };

      client.onTokenExpired = async () => {
        if (this._tokenExpiredSignal.get(accountId)) return;
        this.log(`[${accountId}] 收到 Token 过期信号`, "warning");
        this._tokenExpiredSignal.set(accountId, true);
      };

      client.init();
    });
  }

  /**
   * 释放连接占用的槽位（幂等）
   */
  _releaseSlotIfNeeded(connEntry) {
    if (connEntry?.hasSlot) {
      connEntry.hasSlot = false;
      this.releaseSlot();
    }
  }

  /**
   * 申请任务槽位：标记账号进入任务执行状态
   * 注意：不再调用 waitForSlot，真正的并发控制由 ensureConnected 中的 waitForSlot 负责，
   * 避免一个任务账号占用两个 activeCount 名额。
   */
  async acquireTaskSlot(accountId) {
    if (this._taskSlots.has(accountId)) return; // 已经持有
    this._taskSlots.add(accountId);
    this.log(`[${this._accountName(accountId)}] 已获取任务槽位`);
  }

  /**
   * 释放任务槽位：任务结束或最终失败时调用
   * @param {boolean} preserveAbort - 是否保留手动中止标记，默认 false
   */
  async releaseTaskSlot(accountId, preserveAbort = false) {
    if (!this._taskSlots.has(accountId)) return;
    this._taskSlots.delete(accountId);
    // 任务结束（无论成功/失败），清除手动中止标记，除非调用方要求保留
    if (!preserveAbort) {
      this.clearAbort(accountId);
    }
    const name = this._accountName(accountId);
    // 清理连接并释放槽位；若连接记录已不存在但 activeCount 仍被占用，兜底释放一次
    const hadConn = this.connections.has(accountId);
    await this._cleanupConnection(accountId);
    if (!hadConn && this.activeCount > 0) {
      this.releaseSlot();
    }
    // 任务已结束，清理会话恢复缓存，避免跨任务使用失效的 restore token
    this._clearSessionCache(accountId);
    this.log(`[${name}] 任务槽位已释放 [${this.activeCount}/${MAX_ACTIVE}]`);
  }

  /**
   * 断开某个账号（非任务期间调用）
   * @param {boolean} abort - 是否标记为手动中止，默认 true
   */
  async disconnect(accountId, abort = true) {
    if (abort) {
      // 禁止该账号自动重连，并标记为手动中止，使正在运行的任务停止
      this.allowAutoConnect(accountId, false);
      this.abortAccount(accountId);
    }
    if (this._taskSlots.has(accountId)) {
      this.log(`[${this._accountName(accountId)}] 当前正在执行任务，使用 releaseTaskSlot 释放`, "warning");
      // 保留手动中止标记，确保正在运行的任务能检测到用户已手动断开并停止
      return this.releaseTaskSlot(accountId, abort);
    }
    await this._cleanupConnection(accountId);
    this._clearSessionCache(accountId);
  }

  /**
   * 强制重置指定账号的连接（不释放任务槽位）
   * 用于任务执行期间需要刷新 Token 后重新连接，但任务本身还要继续
   */
  async resetConnection(accountId) {
    return this._withAccountLock(accountId, () => this._cleanupConnectionLocked(accountId));
  }

  /**
   * 断开所有连接
   */
  disconnectAll() {
    // 标记所有当前连接账号为手动中止，并禁止自动重连
    for (const id of this.connections.keys()) {
      this.abortAccount(id);
      this.allowAutoConnect(id, false);
    }
    for (const id of this._taskSlots) {
      this.abortAccount(id);
      this.allowAutoConnect(id, false);
    }
    for (const [id, conn] of this.connections) {
      conn.client.destroy();
      try { db.updateAccountConnection(id, false); } catch (e) { /* ignore */ }
    }
    this.connections.clear();
    this.activeCount = 0;
    this.slotQueue = [];
    this._taskSlots.clear();
    this._lastSuccessfulToken.clear();
    this._lastRecvSeq.clear();
    this._tokenExpiredSignal.clear();
    this._manualAborted.clear();
    this.log("所有连接已断开");
  }

  /**
   * 发送游戏命令到指定账号
   * 战斗相关命令自动注入 battleVersion（参考 xyzw tokenStore.ts）
   */
  async sendMessage(accountId, cmd, params = {}, timeoutMs = 5000) {
    const conn = this.connections.get(accountId);
    if (!conn || conn.status !== "connected") {
      throw new Error(`账号 ${accountId} 未连接`);
    }

    // 为战斗相关命令自动注入 battleVersion
    const battleCommands = [
      "fight_startareaarena",
      "fight_startpvp",
      "fight_starttower",
      "fight_startboss",
      "fight_startlegionboss",
      "fight_startdungeon",
    ];
    if (battleCommands.includes(cmd)) {
      let battleVersion = conn.client.battleVersion;
      // 懒加载 battleVersion，避免初始化阶段频繁请求导致断开
      if (!battleVersion) {
        try {
          const fightRes = await conn.client.sendWithPromise("fight_startlevel", {}, 5000);
          if (fightRes?.battleData?.version) {
            battleVersion = fightRes.battleData.version;
            conn.client.battleVersion = battleVersion;
          }
        } catch (e) {
          this.log(`[${accountId}] 战斗版本获取失败: ${e.message}`, "debug");
        }
      }
      if (battleVersion) {
        params = { battleVersion, ...params };
      }
    }

    try {
      return await conn.client.sendWithPromise(cmd, params, timeoutMs);
    } catch (err) {
      const msg = err?.message || String(err);
      // 发送期间连接断开：任务模式下尝试重连一次，避免任务卡住
      if (this._taskSlots.has(accountId) && /未连接|timeout|send/i.test(msg)) {
        this.log(`[${accountId}] 发送命令 ${cmd} 时连接异常，尝试重连...`, "warning");
        try {
          await this.ensureConnected(accountId, 2);
          const newConn = this.connections.get(accountId);
          if (newConn && newConn.status === "connected") {
            return await newConn.client.sendWithPromise(cmd, params, timeoutMs);
          }
        } catch (reconnectErr) {
          this.log(`[${accountId}] 重连后继续发送失败: ${reconnectErr.message}`, "error");
        }
      }
      throw err;
    }
  }

  /**
   * 刷新 Token（Token 过期时自动调用）
   * 支持 BIN 文件和 URL 两种来源
   * 含10秒冷却时间防止频繁刷新（参考 xyzw attemptTokenRefresh）
   * @returns {Promise<{token: string, wsUrl: string}>} 新的 token 和 wsUrl
   */
  async refreshToken(accountId) {
    // 防止并发刷新：同一个 accountId 同时只能有一个刷新流程
    let lock = this._tokenRefreshLocks.get(accountId);
    if (lock) {
      this.log(`[${accountId}] Token 刷新已在进行中，等待结果...`, "debug");
      return lock;
    }

    const refreshPromise = (async () => {
      // 冷却检查（10秒内不重复刷新）
      const now = Date.now();
      if (!this._lastTokenRefresh) this._lastTokenRefresh = new Map();
      const lastRefresh = this._lastTokenRefresh.get(accountId) || 0;
      if (now - lastRefresh < 10000) {
        const waitMs = 10000 - (now - lastRefresh);
        this.log(`[${accountId}] Token 刷新冷却中，等待 ${Math.ceil(waitMs / 1000)} 秒...`, "warning");
        await new Promise(r => setTimeout(r, waitMs));
      }
      this._lastTokenRefresh.set(accountId, Date.now());

      const account = db.getAccount(accountId);
      if (!account) throw new Error(`账号 ${accountId} 不存在`);

      let newToken, sourceType;

      if (account.import_method === "url" && account.source_url) {
        // URL 形式：从 sourceUrl 拉取新 token
        sourceType = "URL";
        this.log(`[${accountId}] Token 已过期，正在从 URL 刷新...`, "warning");
        try {
          const axios = (await import("axios")).default;
          const response = await axios.get(account.source_url, { timeout: 10000 });
          if (response.data?.token) {
            newToken = response.data.token;
          } else if (typeof response.data === "string" && response.data.length > 20) {
            newToken = response.data;
          } else {
            throw new Error("URL 返回数据格式无效");
          }
        } catch (e) {
          throw new Error(`从 URL 刷新 Token 失败: ${e.message}`);
        }
      } else if (account.bin_base64) {
        // BIN 形式：重新调用 authuser
        sourceType = "BIN";
        const binBuffer = Buffer.from(account.bin_base64, "base64");
        if (binBuffer.length < 100) {
          throw new Error(`账号 ${accountId} 的 BIN 文件已损坏（${binBuffer.length} 字节），请重新上传 BIN`);
        }
        this.log(`[${accountId}] Token 已过期，正在用 BIN 文件刷新...`, "warning");
        const arrayBuffer = binBuffer.buffer.slice(binBuffer.byteOffset, binBuffer.byteOffset + binBuffer.byteLength);
        newToken = await transformToken(arrayBuffer);
      } else {
        throw new Error(`账号 ${accountId} 没有 BIN 数据或 sourceUrl，无法刷新 Token`);
      }

      // 校验 token 完整性
      let tokenObj;
      try {
        tokenObj = JSON.parse(newToken);
      } catch {}
      if (!tokenObj?.roleToken || !tokenObj?.roleId) {
        throw new Error(`账号 ${accountId} 刷新 Token 失败：返回的 Token 不完整（缺少 roleToken/roleId）`);
      }

      // 解析旧 token 的 roleToken，用于比较 authuser 是否真正下发了新 token
      let oldRoleToken = null;
      try {
        const oldTokenObj = JSON.parse(account.token || "{}");
        oldRoleToken = oldTokenObj.roleToken || null;
      } catch {}
      const newRoleToken = tokenObj.roleToken;

      this.log(`[${accountId}] 刷新前后 roleToken: ${oldRoleToken ? oldRoleToken.slice(0, 16) + "..." : "无"} -> ${newRoleToken.slice(0, 16)}...`, "info");

      // 校验 token 是否真正变化；若 authuser 返回旧 roleToken，说明该 BIN/URL 已无法获取新 token
      if (newRoleToken && newRoleToken === oldRoleToken) {
        throw new Error(`账号 ${accountId} 刷新 Token 失败：authuser 返回的 roleToken 未变化，BIN/URL 可能已失效，请重新导入`);
      }

      const newWsUrl = buildWsUrl(newToken);

      // 更新数据库
      db.exec(
        `UPDATE accounts SET token=?, ws_url=?, updated_at=datetime('now','localtime') WHERE id=?`,
        [newToken, newWsUrl, accountId]
      );

      this.log(`[${accountId}] Token 刷新成功（来源：${sourceType}）`, "success");
      return { token: newToken, wsUrl: newWsUrl };
    })();

    this._tokenRefreshLocks.set(accountId, refreshPromise);
    try {
      return await refreshPromise;
    } finally {
      this._tokenRefreshLocks.delete(accountId);
    }
  }

  /**
   * 确保某个账号已连接（公开方法，自动加锁）
   * Token 过期时自动用 BIN 文件刷新并重试（最多3次，参考 xyzw connectionManager）
   */
  async ensureConnected(accountId, maxRetries = 3) {
    return this._withAccountLock(accountId, () => this._ensureConnectedLocked(accountId, maxRetries));
  }

  /**
   * 实际 ensureConnected 逻辑（必须在 accountLock 内调用）
   */
  async _ensureConnectedLocked(accountId, maxRetries = 3) {
    const account = db.getAccount(accountId);
    if (!account) throw new Error(`账号 ${accountId} 不存在`);

    // 账号已被手动中止（用户点击断开），拒绝自动重连，直到下次手动连接
    if (this._manualAborted.has(accountId)) {
      throw new Error(`账号 ${accountId} 已手动断开，需手动重新连接`);
    }

    // 用户手动断开后，该账号不允许自动重连，直到手动连接或新任务开始
    if (!this.isAutoConnectAllowed(accountId)) {
      throw new Error(`账号 ${accountId} 已手动断开，需手动重新连接`);
    }

    const conn = this.connections.get(accountId);
    if (conn && conn.status === "connected") return conn.client;

    let lastError = null;
    let explicitTokenExpired = this._tokenExpiredSignal.get(accountId) || false;
    this._tokenExpiredSignal.delete(accountId);
    let restoreAttempted = false; // 本次是否已尝试会话恢复
    let fullRefreshAttempted = false; // 本次是否已执行完整 Token 刷新

    const cached = this._lastSuccessfulToken.get(accountId);
    const lastAck = this._lastRecvSeq.get(accountId) || 0;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // 每次重试前检查是否被手动断开或禁止自动连接，避免用户点击断开后仍继续重连
      if (this._manualAborted.has(accountId) || !this.isAutoConnectAllowed(accountId)) {
        throw new Error(`账号 ${accountId} 已手动断开，需手动重新连接`);
      }

      try {
        // 关键：onTokenExpired 可能在任意一次 _connectLocked 执行期间异步触发，
        // 每次循环前重新检查信号，确保能立即响应 token expired 并执行完整刷新。
        if (!explicitTokenExpired && this._tokenExpiredSignal.get(accountId)) {
          this.log(`[${accountId}] 检测到 Token 过期信号，切换为完整刷新模式`, "warning");
          explicitTokenExpired = true;
        }
        this._tokenExpiredSignal.delete(accountId);

        // 清理残留的非就绪连接（释放槽位、销毁旧客户端）
        const oldConn = this.connections.get(accountId);
        if (oldConn && oldConn.status !== "connected") {
          this._cleanupConnectionLocked(accountId);
        }

        if (attempt > 0) {
          this.log(`[${accountId}] 重试连接 ${attempt + 1}/${maxRetries}...`, "warning");
          // 指数退避：1s, 2s, 4s
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
          await new Promise(r => setTimeout(r, backoffMs));
        }

        let token, wsUrl, mode;

        // --- 决定本次连接模式 ---
        if (explicitTokenExpired && !fullRefreshAttempted) {
          // 服务端明确 Token 过期：执行完整刷新
          this.log(`[${accountId}] 服务器明确 Token 过期，执行完整刷新...`, "warning");
          const refreshed = await this.refreshToken(accountId);
          token = refreshed.token;
          wsUrl = refreshed.wsUrl;
          mode = "fresh";
          fullRefreshAttempted = true;
          explicitTokenExpired = false;
        } else if (this.enableSessionRestore && cached && !restoreAttempted && !explicitTokenExpired) {
          // 优先尝试会话恢复（默认关闭，避免部分环境下连接不稳定）
          const restore = buildRestoreToken(cached.tokenStr, lastAck);
          token = restore.token;
          wsUrl = restore.wsUrl;
          mode = "restore";
          restoreAttempted = true;
        } else {
          // 普通连接：使用数据库最新 Token
          const latestAccount = db.getAccount(accountId);
          token = latestAccount?.token || account.token;
          wsUrl = latestAccount?.ws_url || account.ws_url;
          if (!isValidWsUrl(wsUrl) && token) {
            try {
              wsUrl = buildWsUrl(token);
              db.exec("UPDATE accounts SET ws_url = ? WHERE id = ?", [wsUrl, accountId]);
            } catch (e) { /* ignore */ }
          }
          mode = "fresh";
        }

        if (!isValidWsUrl(wsUrl)) {
          this.log(`[${accountId}] 无效 wsUrl，跳过本次重试`, "error");
          continue;
        }

        this.log(`[${accountId}] 连接模式: ${mode}${mode === "restore" ? ` ack=${lastAck}` : ""}`, "debug");

        return await this._connectLocked(accountId, token, wsUrl, { isRestore: mode === "restore" });
      } catch (error) {
        lastError = error;
        const errMsg = error?.message || String(error);

        // 恢复模式初始化超时：该 restore session 已失效，立即回退到全新连接
        if (error?.isRestoreInitTimeout) {
          this.log(`[${accountId}] 恢复模式初始化超时，回退到全新连接`, "warning");
          restoreAttempted = true;
          continue;
        }

        // 服务端明确返回 token expired，下一轮执行完整刷新
        if (/token expired|Token Expired|令牌已过期/i.test(errMsg)) {
          explicitTokenExpired = true;
          this.log(`[${accountId}] 检测到 Token 过期，下一轮将完整刷新`, "warning");
          continue;
        }

        // 会话恢复失败后，尝试一次完整 Token 刷新兜底
        if (!fullRefreshAttempted && restoreAttempted && /code=1005|code=1006|连接失败|连接断开|timeout/i.test(errMsg)) {
          this.log(`[${accountId}] 会话恢复失败，尝试完整 Token 刷新`, "warning");
          try {
            await this.refreshToken(accountId);
            fullRefreshAttempted = true;
            continue;
          } catch (refreshError) {
            this.log(`[${accountId}] 完整 Token 刷新失败: ${refreshError.message}`, "error");
          }
        }

        // 普通断开：不重刷 Token，继续重试
        if (/code=1005|code=1006/i.test(errMsg)) {
          // 但连续多次普通断开且未成功握手，可能是 token 已被服务端踢出，尝试刷新一次兜底
          if (!fullRefreshAttempted && attempt === maxRetries - 1 && error?.handshakeSucceeded !== true) {
            this.log(`[${accountId}] 多次普通断开且未完成握手，尝试完整 Token 刷新兜底`, "warning");
            try {
              await this.refreshToken(accountId);
              fullRefreshAttempted = true;
              // 刷新后追加一次额外重试机会
              maxRetries++;
            } catch (refreshError) {
              this.log(`[${accountId}] 完整 Token 刷新失败: ${refreshError.message}`, "error");
            }
          }
          this.log(`[${accountId}] 普通断开 (${errMsg})，使用现有 token 重试`, "debug");
          continue;
        }

        // 其他错误，继续重试
        if (attempt < maxRetries - 1) {
          this.log(`[${accountId}] 连接失败: ${errMsg}，将重试...`, "warning");
        }
      }
    }

    // 最终失败时释放可能残留的槽位
    this._cleanupConnectionLocked(accountId);
    throw new Error(`[${accountId}] 连接失败 (已重试${maxRetries}次): ${lastError?.message || "未知错误"}`);
  }
}

export default ConnectionPool;
