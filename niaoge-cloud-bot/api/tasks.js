/**
 * 任务调度 API
 */
import { Router } from "express";
import * as db from "../lib/db.js";

let schedulerRef = null;

export function setScheduler(s) { schedulerRef = s; }

const router = Router();

// type → taskList 映射
const TYPE_MAP = {
  "daily-all": ["daily"],
  "connect-all": ["connect"],
  "disconnect-all": ["disconnect"],
  "daily-then-disconnect": ["daily", "disconnect"],
};

/**
 * 把 HH:mm 固定时间转成 5 字段 cron 表达式
 */
function fixedTimeToCron(t) {
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error("无效的固定时间");
  }
  return `${m} ${h} * * *`;
}

/** 获取所有定时任务 */
router.get("/", (req, res) => {
  const schedules = db.getAllSchedules(req.userKey);
  res.json(schedules);
});

/** 获取单个定时任务 */
router.get("/:id", (req, res) => {
  const schedule = db.getAllSchedules(req.userKey).find(s => s.id === Number(req.params.id));
  if (!schedule) return res.status(404).json({ error: "任务不存在" });
  res.json(schedule);
});

/** 创建定时任务 */
router.post("/", (req, res) => {
  try {
    const { name, cronExpression, cron, scheduleType, fixedTime, type, taskList, accountIds, maxActive, enabled } = req.body;

    const sType = scheduleType || "cron";
    let cronExpr = cronExpression || cron;

    // 固定时间类型：校验并转换
    if (sType === "fixed") {
      if (!fixedTime) {
        return res.status(400).json({ error: "缺少必填字段: fixedTime" });
      }
      try {
        cronExpr = fixedTimeToCron(fixedTime);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    } else if (!cronExpr) {
      return res.status(400).json({ error: "缺少必填字段: cronExpression" });
    }

    // type → taskList 转换
    const tasks = taskList || TYPE_MAP[type] || ["daily"];

    const result = db.addSchedule({
      name,
      scheduleType: sType,
      fixedTime: fixedTime || "",
      cronExpression: cronExpr,
      taskList: tasks,
      accountIds: accountIds || "*",
      maxActive: Number(maxActive) || 2,
      enabled: enabled ?? 1,
      userKey: req.userKey,
    });

    // 注册到运行时调度器
    if (schedulerRef) {
      const schedule = db.getAllSchedules(req.userKey).find(s => s.id === result.lastInsertRowid);
      if (schedule) schedulerRef.registerSchedule(schedule);
    }

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 更新定时任务 */
router.put("/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = { ...req.body };

    // 如果改为固定时间，重新转换 cron
    if (body.scheduleType === "fixed" && body.fixedTime) {
      try {
        body.cronExpression = fixedTimeToCron(body.fixedTime);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    db.updateSchedule(id, body, req.userKey);
    res.json({ success: true });

    // 更新后重新加载调度器
    if (schedulerRef) schedulerRef.reload(req.userKey);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 删除定时任务 */
router.delete("/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    db.removeSchedule(id, req.userKey);
    res.json({ success: true });

    // 删除后重新加载调度器
    if (schedulerRef) schedulerRef.reload(req.userKey);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** 获取任务日志 */
router.get("/logs/recent", (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const logs = db.getRecentLogs(limit, req.userKey);
  res.json(logs);
});

/** 清理旧日志 */
router.delete("/logs/clean", (req, res) => {
  const days = parseInt(req.query.days) || 7;
  db.clearOldLogs(days, req.userKey);
  res.json({ success: true, message: `已清理 ${days} 天前的日志` });
});

export default router;
