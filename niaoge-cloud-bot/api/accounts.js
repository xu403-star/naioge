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
    import_method: a.import_method || "manual",
    upgraded_to_permanent: a.upgraded_to_permanent || 0,
    has_bin: !!a.bin_base64,
    source_url: a.source_url || "",
  })));
});

/** 获取单个账号 */
router.get("/:id", (req, res) => {
  const account = db.getAccount(req.params.id, req.userKey);
  if (!account) return res.status(404).json({ error: "账号不存在" });
  const statuses = poolRef ? poolRef.getAllStatus() : {};
  res.json({
    id: account.id,
    name: account.name,
    enabled: account.enabled,
    status: statuses[account.id] || "disconnected",
    connected: statuses[account.id] === "connected",
    server: account.server_id || "",
    platform: account.platform || "",
    level: account.level || 0,
    role_name: account.role_name || "",
    last_login: account.last_login || "",
    import_method: account.import_method || "manual",
    upgraded_to_permanent: account.upgraded_to_permanent || 0,
    has_bin: !!account.bin_base64,
    source_url: account.source_url || "",
  });
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
        // 注意：parse/getServerList 会原地修改 buffer，所以必须复制一份用于解析
        let roleName = binFile.name.replace(/\.bin$/i, "").slice(0, 30);
        let roleInfo = null;
        try {
          const parseBuffer = binArrayBuffer.slice(0);
          const serverListJson = await getServerList(parseBuffer);
          const rolesData = JSON.parse(serverListJson);
          const roles = Object.entries(rolesData).map(([id, info]) => ({ id, ...info }));
          console.log(`[BIN批处理] 文件:${binFile.name} 角色数:${roles.length}`, roles.map(r => ({ name: r.name, serverId: r.serverId, id: r.id })));

          // 优先用 BIN 文件自己的 serverId 精确匹配角色（parseBinData 已能正确返回编码后的 serverId）
          let originalServerId = null;
          try {
            const binData = parseBinData(parseBuffer);
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
          importMethod: "bin",
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
    // 注意：parse/getServerList 会原地修改 buffer，所以必须复制一份用于解析
    if (!autoName) {
      try {
        const parseBuffer = binArrayBuffer.slice(0);
        const serverListJson = await getServerList(parseBuffer);
        const rolesData = JSON.parse(serverListJson);
        const roles = Object.entries(rolesData).map(([id, info]) => ({ id, ...info }));
        const fileName = (req.files?.binFile?.name || '').replace(/\.bin$/i, "").trim();
        console.log(`[BIN单文件] 文件:${fileName} 角色数:${roles.length}`, roles.map(r => ({ name: r.name, serverId: r.serverId, id: r.id })));

        // 优先用 BIN 文件自己的 serverId 精确匹配角色（parseBinData 已能正确返回编码后的 serverId）
          let originalServerId = null;
          try {
            const binData = parseBinData(parseBuffer);
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
      importMethod: "bin",
    });

    // 新账号导入时清理可能残留的会话缓存
    if (poolRef) {
      poolRef._lastSuccessfulToken?.delete(tokenId);
      poolRef._lastRecvSeq?.delete(tokenId);
      poolRef._tokenExpiredSignal?.delete(tokenId);
    }

    res.json({ success: true, id: tokenId, name: autoName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** URL 形式 Token 导入 */
router.post("/url", async (req, res) => {
  try {
    const { sourceUrl, name } = req.body;
    if (!sourceUrl) return res.status(400).json({ error: "缺少 sourceUrl" });

    let tokenData;
    try {
      const response = await axios.get(sourceUrl, { timeout: 10000 });
      if (response.data?.token) {
        tokenData = response.data;
      } else if (typeof response.data === "string" && response.data.length > 20) {
        tokenData = { token: response.data };
      } else {
        return res.status(502).json({ error: "URL 返回数据格式无效" });
      }
    } catch (e) {
      return res.status(502).json({ error: `从 URL 获取 Token 失败: ${e.message}` });
    }

    const tokenStr = tokenData.token;
    const tokenId = getTokenId(new TextEncoder().encode(tokenStr));
    const existing = db.getAccount(tokenId, req.userKey);
    if (existing) {
      return res.status(200).json({ success: true, id: tokenId, existed: true, name: existing.name });
    }

    if (!checkQuota(req.userKey)) {
      return res.status(403).json({ error: "已达账号配额上限" });
    }

    const wsUrl = buildWsUrl(tokenStr);
    db.addAccount({
      id: tokenId,
      name: name || `URL账号_${tokenId.slice(0, 8)}`,
      token: tokenStr,
      wsUrl,
      userKey: req.userKey,
      importMethod: "url",
      sourceUrl,
    });

    // 新账号导入时清理可能残留的会话缓存
    if (poolRef) {
      poolRef._lastSuccessfulToken?.delete(tokenId);
      poolRef._lastRecvSeq?.delete(tokenId);
      poolRef._tokenExpiredSignal?.delete(tokenId);
    }

    res.json({ success: true, id: tokenId, name: name || `URL账号_${tokenId.slice(0, 8)}` });
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
    // 清理会话恢复缓存，避免残留
    if (poolRef) {
      poolRef._lastSuccessfulToken?.delete(req.params.id);
      poolRef._lastRecvSeq?.delete(req.params.id);
      poolRef._tokenExpiredSignal?.delete(req.params.id);
    }
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

    let jsonToken, wsUrl;

    if (account.import_method === "url" && account.source_url) {
      // URL 形式：从 sourceUrl 拉取新 token
      const response = await axios.get(account.source_url, { timeout: 10000 });
      if (response.data?.token) {
        jsonToken = response.data.token;
      } else if (typeof response.data === "string" && response.data.length > 20) {
        jsonToken = response.data;
      } else {
        return res.status(502).json({ error: "URL 返回数据格式无效" });
      }
      wsUrl = buildWsUrl(jsonToken);
    } else if (account.bin_base64) {
      // BIN 形式：重新调用 authuser
      const binBuf = Buffer.from(account.bin_base64, "base64");
      const binArrayBuffer = binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.byteLength);
      jsonToken = await transformToken(binArrayBuffer);
      wsUrl = buildWsUrl(jsonToken);
    } else {
      return res.status(400).json({ error: "无 BIN 数据或 sourceUrl，无法刷新 Token" });
    }

    db.updateAccount(req.params.id, { token: jsonToken, ws_url: wsUrl }, req.userKey);

    // 手动刷新 Token 后清理旧的会话恢复缓存，使用新 token 作为会话起点
    if (poolRef) {
      poolRef._lastSuccessfulToken?.delete(req.params.id);
      poolRef._lastRecvSeq?.delete(req.params.id);
      poolRef._tokenExpiredSignal?.delete(req.params.id);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 手动 token 升级为长期有效 */
router.post("/:id/upgrade-permanent", (req, res) => {
  try {
    const ok = db.upgradeTokenToPermanent(req.params.id, req.userKey);
    if (!ok) return res.status(400).json({ error: "无法升级：账号不存在或已是长期有效" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
