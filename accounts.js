/**
 * 账号管理 API
 */
import { Router } from "express";
import { readFileSync, unlinkSync } from "fs";
import * as db from "../lib/db.js";
import { getBinBase64Token, buildWsUrl, getServerList, getTokenId, transformToken, modifyBinServerId, parseBinData } from "../lib/tokenAuth.js";

let poolRef = null;

export function setPool(pool) { poolRef = pool; }

const router = Router();

/**
 * 从 serverId 解码真实区服号
 * serverId = realServerId + 27 + roleIndex * 1000000
 * 参考 xyzw 的 getServerIdDisplay
 */
function getServerNum(serverId) {
  let sid = Number(serverId);
  if (sid >= 2000000) sid -= 2000000;
  else if (sid >= 1000000) sid -= 1000000;
  return sid - 27;
}

/**
 * 从 serverId 解码角色序号（0=第1个角色，1=第2个角色，2=第3个角色）
 * 参考 xyzw 的 getRoleIndexDisplay
 */
function getRoleIndex(serverId) {
  const sid = Number(serverId);
  if (sid >= 2000000) return 2;
  if (sid >= 1000000) return 1;
  return 0;
}

/**
 * 检查账号配额（max_accounts = 0 表示无限）
 * @returns {boolean} true=允许添加, false=已达上限
 */
function checkQuota(userKey) {
  const user = db.queryOne("SELECT max_accounts FROM users WHERE user_key = ?", [userKey]);
  if (!user) return true; // 用户不存在时不拦截（让后续逻辑处理）
  if (user.max_accounts === 0) return true; // 0 = 无限
  const count = db.queryOne("SELECT COUNT(*) as cnt FROM accounts WHERE user_key = ?", [userKey]);
  return (count?.cnt || 0) < user.max_accounts;
}

/** 获取所有账号 */
router.get("/", (req, res) => {
  const accounts = db.getAllAccounts(req.userKey);
  const statuses = poolRef ? poolRef.getAllStatus() : {};
  res.json(accounts.map(a => ({
    id: a.id,
    name: a.name,
    enabled: a.enabled,
    status: statuses[a.id] || "disconnected",
    connected: statuses[a.id] === "connected",
    server: a.server_id || "",
    platform: a.platform || "",
    level: a.level || 0,
    role_name: a.role_name || "",
    last_login: a.last_login || "",
  })));
});

/** 预览 BIN 文件 — 返回服务器列表让用户选择角色(不保存) */
router.post("/preview", async (req, res) => {
  try {
    if (!req.files?.binFile) {
      return res.status(400).json({ error: "请上传 BIN 文件" });
    }
    const binFile = req.files.binFile;
    const buf = binFile.data;
    const binArrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const tokenId = getTokenId(binArrayBuffer);

    // 获取服务器列表
    let serverList;
    try {
      serverList = await getServerList(binArrayBuffer);
    } catch (e) {
      return res.status(502).json({ error: `获取服务器列表失败: ${e.message}` });
    }

    const data = JSON.parse(serverList);
    res.json({
      tokenId,
      roles: Object.entries(data).map(([id, info]) => ({
        id, name: info.name || id,
        serverId: info.serverId || "",
        platform: info.platform || "hortor",
        platformExt: info.platformExt || "mix",
        level: info.level || 0,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 批量确认添加账号（单 BIN 多角色）
 * 接收一个 BIN 文件 + 多个角色信息，为每个角色修改 serverId 生成独立 token
 * 参考 xyzw 的 addSelectedRole 实现
 */
router.post("/confirm-batch", async (req, res) => {
  try {
    if (!req.files?.binFile) {
      return res.status(400).json({ error: "请上传 BIN 文件" });
    }
    const roles = req.body.roles ? JSON.parse(req.body.roles) : [];
    if (!roles.length) {
      return res.status(400).json({ error: "请选择至少一个角色" });
    }

    const binFile = req.files.binFile;
    const buf = binFile.data;
    const binArrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    const results = [];
    const errors = [];

    for (const role of roles) {
      try {
        // 检查配额
        if (!checkQuota(req.userKey)) {
          errors.push({ role: role.name, error: "已达账号配额上限" });
          break;
        }

        // 修改 bin 的 serverId，生成独立 token
        let modifiedBin;
        try {
          modifiedBin = modifyBinServerId(binArrayBuffer, role.serverId);
        } catch (e) {
          console.error(`[批量绑定] 角色:${role.name} modifyBinServerId失败:`, e.message);
          errors.push({ role: role.name, error: `修改BIN失败: ${e.message}` });
          continue;
        }
        const tokenId = getTokenId(modifiedBin);

        // 检查重复
        const existing = db.getAccount(tokenId, req.userKey);
        if (existing) {
          results.push({ name: role.name, id: tokenId, existed: true });
          continue;
        }

        // 用修改后的 bin 获取 token（间隔1秒避免限流）
        await new Promise(r => setTimeout(r, 1000));
        let jsonToken;
        try {
          jsonToken = await transformToken(modifiedBin);
        } catch (e) {
          console.error(`[批量绑定] 角色:${role.name} transformToken失败:`, e.message);
          errors.push({ role: role.name, error: `获取Token失败: ${e.message}` });
          continue;
        }
        const wsUrl = buildWsUrl(jsonToken);
        const binBase64 = getBinBase64Token(modifiedBin);

        // 解码区服号
        let sid = Number(role.serverId);
        let roleIndex = 0;
        if (sid >= 2000000) { roleIndex = 2; sid -= 2000000; }
        else if (sid >= 1000000) { roleIndex = 1; sid -= 1000000; }
        const serverNum = sid - 27;

        db.addAccount({
          id: tokenId,
          userKey: req.userKey,
          name: role.name,
          token: jsonToken,
          wsUrl,
          binBase64,
          platform: role.platform || 'hortor',
          serverId: String(serverNum),
          platformExt: role.platformExt || 'mix',
          role_id: role.id || '',
          role_name: role.name || '',
          level: role.level || 0,
          enabled: 1,
        });

        results.push({ name: role.name, id: tokenId, server: serverNum + '服' });
      } catch (e) {
        errors.push({ role: role.name, error: e.message });
      }
    }

    res.json({
      success: results.length > 0,
      added: results.filter(r => !r.existed).length,
      existed: results.filter(r => r.existed).length,
      errors,
      results,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 确认添加账号 (BIN文件 + 选中的角色ID) */
router.post("/confirm", async (req, res) => {
  try {
    if (!req.files?.binFile) {
      return res.status(400).json({ error: "请上传 BIN 文件" });
    }
    const { name, serverId, platform, platformExt } = req.body || {};

    const binFile = req.files.binFile;
    const buf = binFile.data;
    const binArrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const tokenId = getTokenId(binArrayBuffer);

    // 检查重复
    const existing = db.getAccount(tokenId, req.userKey);
    if (existing) {
      return res.status(409).json({ error: "该账号已存在", id: tokenId });
    }

    // 检查配额
    if (!checkQuota(req.userKey)) {
      return res.status(403).json({ error: "已达账号配额上限，请联系管理员" });
    }

    // BIN Base64 (存档用于刷新)
    const binBase64 = getBinBase64Token(binArrayBuffer);

    // 调用 authuser API 获取 JSON Token (与前端 transformToken 一致)
    let jsonToken;
    try {
      jsonToken = await transformToken(binArrayBuffer);
    } catch (e) {
      return res.status(502).json({ error: `获取Token失败(BIN可能已过期): ${e.message}` });
    }
    const wsUrl = buildWsUrl(jsonToken);

    // 自动从BIN文件名提取角色名
    const autoName = name || `角色_${tokenId.slice(0, 8)}`;

    db.addAccount({
      id: tokenId,
      name: autoName,
      token: jsonToken,
      wsUrl,
      binBase64,
      platform: platform || "hortor",
      serverId: serverId || "",
      platformExt: platformExt || "mix",
      userKey: req.userKey,
    });

    res.json({ success: true, id: tokenId, name: autoName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 批量导入 BIN 文件 */
router.post("/batch", async (req, res) => {
  try {
    const files = req.files?.binFiles;
    if (!files) return res.status(400).json({ error: "请上传 BIN 文件" });

    const fileList = Array.isArray(files) ? files : [files];
    const results = [];
    const errors = [];

    for (const binFile of fileList) {
      try {
        const buf = binFile.data;
        const binArrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        const tokenId = getTokenId(binArrayBuffer);

        if (db.getAccount(tokenId, req.userKey)) {
          results.push({ name: binFile.name, tokenId, existed: true });
          continue;
        }

        // 检查配额
        if (!checkQuota(req.userKey)) {
          errors.push({ name: binFile.name, error: "已达账号配额上限" });
          break; // 配额已满，后续不再处理
        }

        const binBase64 = getBinBase64Token(binArrayBuffer);

        // 从 BIN 内容解析真实角色名（避免文件名中文乱码）
        let roleName = binFile.name.replace(/\.bin$/i, "").slice(0, 30);
        let roleInfo = null;
        try {
          const serverListJson = await getServerList(binArrayBuffer);
          const rolesData = JSON.parse(serverListJson);
          const roles = Object.entries(rolesData).map(([id, info]) => ({ id, ...info }));
          console.log(`[BIN批处理] 文件:${binFile.name} 角色数:${roles.length}`, roles.map(r => ({ name: r.name, serverId: r.serverId, id: r.id })));

          // 优先用 BIN 文件自己的 serverId 精确匹配角色（parseBinData 已能正确返回编码后的 serverId）
          let originalServerId = null;
          try {
            const binData = parseBinData(binArrayBuffer);
            originalServerId = binData?.serverId ?? null;
          } catch (e) {
            console.error(`[BIN批处理] 文件:${binFile.name} 解析原始serverId失败:`, e.message);
          }

          // 文件名解析：去掉扩展名，提取末尾数字作为角色序号
          const baseName = binFile.name.replace(/\.bin$/i, "").trim();
          const indexMatch = baseName.match(/(\d+)$/);
          const fileIndex = indexMatch ? parseInt(indexMatch[1], 10) : null;
          const fileNameCn = baseName.replace(/\d+$/, "").trim();

          // 匹配逻辑：
          // 1. 优先：BIN 原始 serverId 精确匹配
          // 2. 精确匹配角色名 == 文件名（含数字）
          // 3. 角色名 == 文件名中文（不含数字），且角色序号匹配
          // 4. 角色名包含文件名中文
          // 5. 兜底第一个角色
          roleInfo =
            (originalServerId !== null
              ? roles.find(r => Number(r.serverId) === Number(originalServerId))
              : null) ||
            roles.find(r => r.name === baseName) ||
            (fileIndex !== null
              ? roles.find(r => r.name === fileNameCn && getRoleIndex(r.serverId) === fileIndex)
              : null) ||
            roles.find(r => r.name && r.name.includes(fileNameCn)) ||
            roles.find(r => r.name && fileNameCn.includes(r.name)) ||
            roles[0];

          console.log(`[BIN批处理] 文件:${binFile.name} 原始serverId:${originalServerId} 匹配到:`, roleInfo?.name, roleInfo?.serverId);
          if (roleInfo?.name) {
            const serverNum = getServerNum(roleInfo.serverId);
            roleName = `${roleInfo.name}-${serverNum}服`;
          }
        } catch (e) {
          console.error(`[BIN批处理] 文件:${binFile.name} 解析角色失败:`, e.message);
        }

        // 调用 authuser API 获取 JSON Token
        let jsonToken;
        try {
          jsonToken = await transformToken(binArrayBuffer);
        } catch (e) {
          errors.push({ name: binFile.name, error: `Token获取失败(BIN可能已过期): ${e.message}` });
          continue;
        }
        const wsUrl = buildWsUrl(jsonToken);

        db.addAccount({
          id: tokenId,
          name: roleName,
          token: jsonToken,
          wsUrl,
          binBase64,
          userKey: req.userKey,
        });

        results.push({ name: roleName, tokenId, added: true });
      } catch (e) {
        errors.push({ name: binFile.name, error: e.message });
      }
    }

    res.json({ results, errors, total: results.length + errors.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 单个 BIN 添加：支持 multipart 文件上传 或 JSON Base64 */
router.post("/bin", async (req, res) => {
  try {
    let binArrayBuffer;
    let autoName;

    // multipart 文件上传
    if (req.files?.binFile) {
      const binFile = req.files.binFile;
      const buf = binFile.data;
      binArrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      // 不用文件名（中文会乱码），后面从 BIN 内容解析真实角色名
      autoName = null;
    } else {
      // JSON Base64 上传
      const { binBase64, name } = req.body;
      if (!binBase64) return res.status(400).json({ error: "缺少 binBase64 或 binFile" });
      const binBuf = Buffer.from(binBase64, "base64");
      binArrayBuffer = binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.byteLength);
      autoName = name;
    }

    const tokenId = getTokenId(binArrayBuffer);

    const existing = db.getAccount(tokenId, req.userKey);
    if (existing) return res.status(200).json({ success: true, id: tokenId, existed: true, name: existing.name });

    // 检查配额
    if (!checkQuota(req.userKey)) {
      return res.status(403).json({ error: "已达账号配额上限，请联系管理员" });
    }

    // 从 BIN 内容解析真实角色名（避免文件名中文乱码）
    if (!autoName) {
      try {
        const serverListJson = await getServerList(binArrayBuffer);
        const rolesData = JSON.parse(serverListJson);
        const roles = Object.entries(rolesData).map(([id, info]) => ({ id, ...info }));
        const fileName = (req.files?.binFile?.name || '').replace(/\.bin$/i, "").trim();
        console.log(`[BIN单文件] 文件:${fileName} 角色数:${roles.length}`, roles.map(r => ({ name: r.name, serverId: r.serverId, id: r.id })));

        // 优先用 BIN 文件自己的 serverId 精确匹配角色（parseBinData 已能正确返回编码后的 serverId）
          let originalServerId = null;
          try {
            const binData = parseBinData(binArrayBuffer);
            originalServerId = binData?.serverId ?? null;
          } catch (e) {
            console.error(`[BIN单文件] 解析原始serverId失败:`, e.message);
          }

          // 文件名解析：去掉扩展名，提取末尾数字作为角色序号
          const indexMatch = fileName.match(/(\d+)$/);
          const fileIndex = indexMatch ? parseInt(indexMatch[1], 10) : null;
          const fileNameCn = fileName.replace(/\d+$/, "").trim();

          const matched =
            // 1. 优先：BIN 原始 serverId 精确匹配
            (originalServerId !== null
              ? roles.find(r => Number(r.serverId) === Number(originalServerId))
              : null) ||
            // 2. 精确匹配角色名 == 文件名
            roles.find(r => r.name === fileName) ||
            // 3. 角色名 == 文件名中文 + 角色序号匹配
            (fileIndex !== null
              ? roles.find(r => r.name === fileNameCn && getRoleIndex(r.serverId) === fileIndex)
              : null) ||
            // 4. 角色名包含文件名中文
            roles.find(r => r.name && r.name.includes(fileNameCn)) ||
            roles.find(r => r.name && fileNameCn.includes(r.name)) ||
            // 5. 兜底第一个角色
            roles[0];
          console.log(`[BIN单文件] 文件:${fileName} 原始serverId:${originalServerId} 匹配到:`, matched?.name, matched?.serverId);
        if (matched?.name) {
          const serverNum = getServerNum(matched.serverId);
          autoName = `${matched.name}-${serverNum}服`;
        }
      } catch (e) {
        console.error(`[BIN单文件] 解析角色失败:`, e.message, e.stack);
        // 解析失败，用 tokenId 兜底
      }
    }
    if (!autoName) autoName = `账号_${tokenId.slice(0, 8)}`;

    // 调用 authuser API 获取 JSON Token
    let jsonToken;
    try {
      jsonToken = await transformToken(binArrayBuffer);
    } catch (e) {
      return res.status(502).json({ error: `获取Token失败(BIN可能已过期): ${e.message}` });
    }
    const wsUrl = buildWsUrl(jsonToken);

    db.addAccount({
      id: tokenId,
      name: autoName,
      token: jsonToken,
      wsUrl,
      binBase64: getBinBase64Token(binArrayBuffer),
      userKey: req.userKey,
    });

    res.json({ success: true, id: tokenId, name: autoName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 更新账号 */
router.put("/:id", (req, res) => {
  try {
    const allowed = ["name", "enabled"];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: "没有可更新的字段" });
    db.updateAccount(req.params.id, data, req.userKey);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 删除账号 */
router.delete("/:id", (req, res) => {
  try {
    if (!db.getAccount(req.params.id, req.userKey)) return res.status(404).json({ error: "账号不存在" });
    db.removeAccount(req.params.id, req.userKey);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 刷新 Token */
router.post("/:id/refresh-token", async (req, res) => {
  try {
    const account = db.getAccount(req.params.id, req.userKey);
    if (!account) return res.status(404).json({ error: "账号不存在" });
    if (!account.bin_base64) return res.status(400).json({ error: "无BIN数据" });

    // 从存档的 BIN base64 解码回 ArrayBuffer，重新调用 authuser
    const binBuf = Buffer.from(account.bin_base64, "base64");
    const binArrayBuffer = binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.byteLength);
    const jsonToken = await transformToken(binArrayBuffer);
    const wsUrl = buildWsUrl(jsonToken);

    db.updateAccount(req.params.id, { token: jsonToken, ws_url: wsUrl }, req.userKey);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
