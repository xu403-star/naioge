/**
 * Portal 卡密管理 API
 */
import { Router } from "express";
import * as portalDb from "../lib/portalDb.js";

const router = Router();

// ====== 卡密 CRUD ======

// 获取所有卡密
router.get("/cards", (req, res) => {
  const cards = portalDb.getAllCards();
  res.json(cards);
});

// 添加卡密
router.post("/cards", (req, res) => {
  const { cardCode, password, label, expiry, maxAccounts } = req.body;
  if (!cardCode) return res.status(400).json({ error: "缺少 cardCode" });
  const r = portalDb.createCard({ cardCode, password, label, expiry, maxAccounts: maxAccounts || 1 });
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

// 批量添加卡密
router.post("/cards/batch", (req, res) => {
  const { cards } = req.body;
  if (!Array.isArray(cards) || cards.length === 0) return res.status(400).json({ error: "缺少 cards 数组" });
  const results = portalDb.batchCreateCards(cards);
  res.json({ results, total: cards.length, success: results.filter(r => r.success).length });
});

// 删除卡密
router.delete("/cards/:cardId", (req, res) => {
  const r = portalDb.deleteCard(req.params.cardId);
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

// 续期卡密
router.post("/cards/:cardId/renew", (req, res) => {
  const { expiry } = req.body;
  if (!expiry) return res.status(400).json({ error: "缺少 expiry" });
  const r = portalDb.renewCard(req.params.cardId, expiry);
  res.json(r);
});

// 修改卡密密码
router.put("/cards/:cardId/password", (req, res) => {
  const { password } = req.body;
  const r = portalDb.updateCardPassword(req.params.cardId, password);
  res.json(r);
});

// 获取卡密绑定的账号
router.get("/cards/:cardId/accounts", (req, res) => {
  const accounts = portalDb.getCardAccounts(req.params.cardId);
  res.json(accounts);
});

// ====== 认证相关 ======

// 卡密验证/登录
router.post("/login", (req, res) => {
  const { cardCode, password } = req.body;
  const result = portalDb.createCardSession(cardCode, password);
  if (result.error) return res.status(401).json(result);
  res.json(result);
});

// 心跳检测
router.get("/ping", (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

// 获取当前会话信息
router.get("/me", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "未认证" });
  try {
    const token = auth.replace("Bearer ", "");
    const data = JSON.parse(Buffer.from(token, "base64").toString());
    const card = portalDb.getCardByCode(data.cardCode);
    if (!card) return res.status(401).json({ error: "卡密无效" });
    res.json({ card });
  } catch {
    res.status(401).json({ error: "Token 无效" });
  }
});

// ====== 会话管理 ======

// 创建卡密会话 (绑定账号时使用)
router.post("/cards/session", (req, res) => {
  const { cardCode, password } = req.body;
  const result = portalDb.createCardSession(cardCode, password);
  if (result.error) return res.status(401).json(result);
  res.json(result);
});

// 绑定账号到卡密
router.post("/cards/bind", (req, res) => {
  const { cardCode, accountId } = req.body;
  const card = portalDb.getCardByCode(cardCode);
  if (!card) return res.status(400).json({ error: "卡密不存在" });
  if (card.bound_count >= card.max_accounts) return res.status(400).json({ error: "已达绑定上限" });
  const r = portalDb.bindAccount(card.id, accountId);
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

export default router;
