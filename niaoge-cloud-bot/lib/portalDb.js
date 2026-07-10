/**
 * Portal 卡密管理系统 - 数据库层
 */
import * as db from "./db.js";

export function initPortalDB() {
  try {
    const d = db.getDb();
    d.run(`
      CREATE TABLE IF NOT EXISTS portal_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_code TEXT NOT NULL UNIQUE,
        password TEXT,
        label TEXT DEFAULT '',
        expiry TEXT,
        max_accounts INTEGER DEFAULT 1,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        used_count INTEGER DEFAULT 0
      )
    `);
    d.run(`
      CREATE TABLE IF NOT EXISTS portal_bindings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id INTEGER NOT NULL,
        account_id TEXT NOT NULL,
        bound_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);
    return true;
  } catch (e) {
    console.error("[portalDb] 初始化失败:", e.message);
    return false;
  }
}

export function getCardByCode(cardCode) {
  return db.queryOne("SELECT * FROM portal_cards WHERE card_code = ?", [cardCode]);
}

export function createCard({ cardCode, password = '', label = '', expiry = '', maxAccounts = 1 }) {
  const existing = getCardByCode(cardCode);
  if (existing) return { error: "卡密已存在" };
  const id = db.execGetId(
    "INSERT INTO portal_cards (card_code, password, label, expiry, max_accounts) VALUES (?,?,?,?,?)",
    [cardCode, password, label, expiry, maxAccounts]
  );
  return { success: true, id };
}

export function batchCreateCards(cards) {
  const results = [];
  for (const c of cards) results.push(createCard(c));
  return results;
}

export function getAllCards() {
  return db.queryAll(
    `SELECT c.*, (SELECT COUNT(*) FROM portal_bindings WHERE card_id = c.id) as bound_count 
     FROM portal_cards c ORDER BY c.created_at DESC`
  );
}

export function verifyCard(cardCode, password) {
  const card = getCardByCode(cardCode);
  if (!card) return { error: "卡密不存在" };
  if (!card.enabled) return { error: "卡密已禁用" };
  if (card.password && card.password !== password) return { error: "密码错误" };
  if (card.expiry) {
    const now = Date.now();
    const exp = new Date(card.expiry).getTime();
    if (now > exp) return { error: "卡密已过期" };
  }
  if ((card.bound_count || 0) >= card.max_accounts) return { error: "卡密使用次数已用完" };
  return { success: true, card };
}

export function bindAccount(cardId, accountId) {
  try {
    db.exec("INSERT INTO portal_bindings (card_id, account_id) VALUES (?,?)", [cardId, accountId]);
    db.exec("UPDATE portal_cards SET used_count = used_count + 1 WHERE id = ?", [cardId]);
    return { success: true };
  } catch (e) { return { error: e.message }; }
}

export function updateCardPassword(cardId, newPassword) {
  db.exec("UPDATE portal_cards SET password = ? WHERE id = ?", [newPassword, cardId]);
  return { success: true };
}

export function renewCard(cardId, newExpiry) {
  db.exec("UPDATE portal_cards SET expiry = ? WHERE id = ?", [newExpiry, cardId]);
  return { success: true };
}

export function deleteCard(cardId) {
  db.exec("DELETE FROM portal_bindings WHERE card_id = ?", [cardId]);
  db.exec("DELETE FROM portal_cards WHERE id = ?", [cardId]);
  return { success: true };
}

export function getCardAccounts(cardId) {
  return db.queryAll(
    "SELECT a.* FROM portal_bindings b JOIN accounts a ON b.account_id = a.id WHERE b.card_id = ?",
    [cardId]
  );
}

export function createCardSession(cardCode, password) {
  const result = verifyCard(cardCode, password);
  if (result.error) return result;
  const token = Buffer.from(JSON.stringify({
    cardCode, timestamp: Date.now(), type: 'card-session'
  })).toString('base64');
  return { success: true, token, card: result.card };
}
