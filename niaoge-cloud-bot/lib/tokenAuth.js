/**
 * Token 认证模块 - BIN转Token + 服务器列表
 * 从 xyzw_web_helper token.ts 移植到 Node.js
 */
import axios from "axios";
import CryptoJS from "crypto-js";
const { MD5, lib, enc } = CryptoJS;
import { bon, getEnc, ProtoMsg, parse, encode } from "./bonProtocol.js";

// ======== RateLimiter ========
class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
    this.queueSize = 0;
    this.onWaitCallback = null;
  }

  onWait(callback) { this.onWaitCallback = callback; }

  cleanOldRequests() {
    const cutoff = Date.now() - this.windowMs;
    this.requests = this.requests.filter(t => t > cutoff);
  }

  async waitForSlot() {
    this.cleanOldRequests();
    if (this.requests.length < this.maxRequests) {
      this.requests.push(Date.now());
      return;
    }
    const oldest = this.requests[0];
    const waitTime = oldest + this.windowMs - Date.now();
    if (waitTime > 0) {
      const totalWait = waitTime + 100;
      const start = Date.now();
      const update = () => {
        if (this.onWaitCallback) {
          this.onWaitCallback(Math.max(0, totalWait - (Date.now() - start)), this.queueSize);
        }
      };
      update();
      const interval = setInterval(update, 1000);
      await new Promise(r => setTimeout(r, totalWait));
      clearInterval(interval);
    }
    return this.waitForSlot();
  }

  async schedule(fn) {
    this.queueSize++;
    try { await this.waitForSlot(); return fn(); }
    finally { this.queueSize--; }
  }
}

const authUserLimiter = new RateLimiter(25, 60000);

/** 获取Token ID (MD5 hash of BIN) */
export function getTokenId(token) {
  const wordArray = lib.WordArray.create(token);
  return MD5(wordArray).toString(enc.Hex);
}

/**
 * 将ArrayBuffer转为Node.js Buffer
 */
function arrayBufferToBuffer(ab) {
  const u8 = new Uint8Array(ab);
  return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
}

// ======== BIN → Token 转换 (WebSocket连接用) ========

/**
 * 将BIN文件转为WebSocket连接用的JSON Token
 * 前端 xyzw_web_helper 的 transformToken() 流程:
 *   1. POST BIN 到 /login/authuser
 *   2. 解析 BON 响应获取 combUser 数据
 *   3. 添加 sessId/connId/isRestore → JSON.stringify
 * @param {ArrayBuffer} arrayBuffer - BIN文件的ArrayBuffer
 * @returns {Promise<string>} - JSON格式的Token字符串
 */
export async function transformToken(arrayBuffer) {
  const res = await axios.post(
    "https://xxz-xyzw.hortorgames.com/login/authuser",
    arrayBuffer,
    {
      params: { _seq: 1 },
      headers: {
        "Content-Type": "application/octet-stream",
        referrerPolicy: "no-referrer",
      },
      responseType: "arraybuffer",
    }
  );

  const u8 = new Uint8Array(res.data);
  const enc = getEnc("auto");
  const plain = enc.decrypt(u8);
  const raw = bon.decode(plain);
  const msg = new ProtoMsg(raw);
  const data = msg.getData();

  if (msg.code !== 0 && msg.code !== undefined) {
    throw new Error(`authuser 失败: ${msg.error || msg.hint || msg.code}`);
  }

  const currentTime = Date.now();
  const sessId = currentTime * 100 + Math.floor(Math.random() * 100);
  const connId = currentTime + Math.floor(Math.random() * 10);

  return JSON.stringify({
    ...data,
    sessId,
    connId,
    isRestore: 0,
  });
}

/**
 * 将BIN文件转为Base64字符串（用于存档，可重新获取token）
 * @param {ArrayBuffer} arrayBuffer - BIN文件的ArrayBuffer
 * @returns {string} - base64编码的BIN数据
 */
export function getBinBase64Token(arrayBuffer) {
  return arrayBufferToBuffer(arrayBuffer).toString("base64");
}

/**
 * 根据JSON Token构建WebSocket URL
 * 与 xyzw_web_helper 完全一致:
 *   wss://xxz-xyzw.hortorgames.com/agent?p=<JSON_token>&e=x&lang=chinese
 * @param {string} jsonToken - transformToken() 返回的JSON字符串
 */
export function buildWsUrl(jsonToken) {
  return `wss://xxz-xyzw.hortorgames.com/agent?p=${encodeURIComponent(jsonToken)}&e=x&lang=chinese`;
}

/**
 * 根据已有的成功 token 构建会话恢复用的 token 和 WebSocket URL
 * 与 xyzw 断线重连行为一致：
 *   - 复用 sessId
 *   - isRestore = 1
 *   - connId = Date.now()
 *   - URL 附加 &ack=<lastRecvSeq>
 * @param {string|object} token - JSON token 字符串或解析后的对象
 * @param {number} [ack=0] - 最后收到的服务端 seq
 * @returns {{token: string, wsUrl: string, sessId: number, connId: number}}
 */
export function buildRestoreToken(token, ack = 0) {
  let tokenObj;
  if (typeof token === "string") {
    try {
      tokenObj = JSON.parse(token);
    } catch (e) {
      throw new Error("buildRestoreToken: invalid token JSON");
    }
  } else if (token && typeof token === "object") {
    tokenObj = token;
  } else {
    throw new Error("buildRestoreToken: invalid token");
  }

  if (!tokenObj.sessId) {
    throw new Error("buildRestoreToken: token missing sessId");
  }

  const restored = {
    ...tokenObj,
    isRestore: 1,
    connId: Date.now(),
  };

  const tokenStr = JSON.stringify(restored);
  let wsUrl = buildWsUrl(tokenStr);
  if (ack > 0) {
    wsUrl += `&ack=${ack}`;
  }
  return { token: tokenStr, wsUrl, sessId: restored.sessId, connId: restored.connId };
}

// ======== 服务器列表查询 ========

/**
 * 获取服务器列表
 * @param {ArrayBuffer} arrayBuffer - BIN文件的ArrayBuffer
 * @returns {Promise<string>} - JSON字符串 {roles: {...}}
 */
export async function getServerList(arrayBuffer) {
  const res = await axios.post(
    "https://xxz-xyzw.hortorgames.com/login/serverlist",
    arrayBuffer,
    {
      params: { _seq: 3 },
      headers: { "Content-Type": "application/octet-stream" },
      responseType: "arraybuffer",
    }
  );

  const u8 = new Uint8Array(res.data);
  const enc = getEnc("auto");
  const plain = enc.decrypt(u8);
  const raw = bon.decode(plain);
  const msg = new ProtoMsg(raw);
  const data = msg.getData();

  return JSON.stringify({ ...data.roles });
}

export { authUserLimiter as rateLimiter };

/**
 * 修改 BIN 文件的 serverId 并重新编码（支持单 bin 多角色）
 * 参考 xyzw 的 addSelectedRole 实现
 * @param {ArrayBuffer} arrayBuffer - 原始 BIN 文件
 * @param {string|number} newServerId - 目标角色的 serverId
 * @returns {ArrayBuffer} - 修改后的 BIN ArrayBuffer
 */
export function modifyBinServerId(arrayBuffer, newServerId) {
  const enc = getEnc("auto");
  const msg = parse(arrayBuffer, enc);
  // BIN 文件 parse 后 getData() 可能为空，参考 xyzw 使用 _raw
  let data = msg.getData();
  if (!data && msg._raw) data = { ...msg._raw };
  if (!data) throw new Error("无法解析BIN文件");
  // 修改 serverId
  data.serverId = Number(newServerId);
  // 重新编码
  return encode(data, enc);
}

/**
 * 解析 BIN 文件获取原始数据对象（用于调试）
 */
export function parseBinData(arrayBuffer) {
  const enc = getEnc("auto");
  const msg = parse(arrayBuffer, enc);
  // BIN 文件 parse 后 getData() 可能为空，参考 xyzw 使用 _raw
  const data = msg.getData();
  if (data) return data;
  if (msg._raw) return { ...msg._raw };
  return null;
}
