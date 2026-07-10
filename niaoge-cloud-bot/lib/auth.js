/**
 * 用户鉴权中间件
 * 基于 Access Key + Password 登录，返回 Session Token
 * Token 持久化到数据库，永久有效（除非用户主动退出登录）
 */
import { queryOne, exec, queryAll } from "./db.js";

/**
 * 生成随机 Token
 */
function generateToken() {
  return 'sk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/**
 * 登录
 * @returns { token, userKey, name } 或抛出错误
 */
export function login(userKey, password) {
  const user = queryOne("SELECT * FROM users WHERE user_key = ? AND password = ? AND enabled = 1", [userKey, password]);
  if (!user) {
    throw new Error("用户名或密码错误");
  }
  if (user.expiry && new Date(user.expiry) < new Date()) {
    throw new Error("账号已过期");
  }
  const token = generateToken();
  exec("INSERT INTO sessions (token, user_key, name, max_accounts) VALUES (?, ?, ?, ?)",
    [token, user.user_key, user.name || user.user_key, user.max_accounts || 10]);
  return { token, userKey: user.user_key, name: user.name || user.user_key };
}

/**
 * 验证 Token，返回 session 信息
 * Token 永久有效，不检查过期
 */
export function verifyToken(token) {
  if (!token) return null;
  const session = queryOne("SELECT * FROM sessions WHERE token = ?", [token]);
  if (!session) return null;
  return {
    userKey: session.user_key,
    name: session.name,
    maxAccounts: session.max_accounts,
  };
}

/**
 * 登出（用户主动退出登录时调用）
 */
export function logout(token) {
  if (token) {
    exec("DELETE FROM sessions WHERE token = ?", [token]);
  }
}

/**
 * 获取当前用户信息
 */
export function getSession(token) {
  return verifyToken(token);
}

/**
 * 创建新用户（仅管理员可用）
 */
export function createUser(adminToken, { userKey, password, name, maxAccounts, expiry }) {
  const admin = verifyToken(adminToken);
  if (!admin || admin.userKey !== 'admin') {
    throw new Error("无权限");
  }
  const existing = queryOne("SELECT * FROM users WHERE user_key = ?", [userKey]);
  if (existing) {
    throw new Error("用户名已存在");
  }
  exec("INSERT INTO users (user_key, password, name, max_accounts, expiry) VALUES (?, ?, ?, ?, ?)",
    [userKey, password, name || userKey, maxAccounts || 10, expiry || null]);
  return { userKey, name: name || userKey };
}

/**
 * 获取所有用户列表（仅管理员）
 */
export function listUsers(adminToken) {
  const admin = verifyToken(adminToken);
  if (!admin || admin.userKey !== 'admin') {
    throw new Error("无权限");
  }
  return queryAll("SELECT user_key, name, max_accounts, expiry, enabled, created_at FROM users ORDER BY created_at");
}

/**
 * 删除用户（仅管理员）
 */
export function deleteUser(adminToken, userKey) {
  const admin = verifyToken(adminToken);
  if (!admin || admin.userKey !== 'admin') {
    throw new Error("无权限");
  }
  if (userKey === 'admin') {
    throw new Error("不能删除管理员");
  }
  exec("DELETE FROM users WHERE user_key = ?", [userKey]);
  // 同时删除该用户的所有数据（包括会话）
  exec("DELETE FROM accounts WHERE user_key = ?", [userKey]);
  exec("DELETE FROM task_schedules WHERE user_key = ?", [userKey]);
  exec("DELETE FROM task_logs WHERE user_key = ?", [userKey]);
  exec("DELETE FROM task_templates WHERE user_key = ?", [userKey]);
  exec("DELETE FROM sessions WHERE user_key = ?", [userKey]);
}

/**
 * Express 中间件：验证 Token
 */
export function authMiddleware(req, res, next) {
  // 跳过登录接口和静态文件
  const path = req.path;
  if (path === '/api/auth/login' || path === '/api/auth/register' || !path.startsWith('/api/')) {
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "未登录" });
  }
  const token = authHeader.slice(7);
  const session = verifyToken(token);
  if (!session) {
    return res.status(401).json({ error: "登录已过期，请重新登录" });
  }
  req.userKey = session.userKey;
  req.userName = session.name;
  req.maxAccounts = session.maxAccounts;
  next();
}
