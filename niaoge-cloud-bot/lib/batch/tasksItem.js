/**
 * 物品/宝箱/钓鱼/招募/升星 批处理 - 从 xyzw_web_helper tasksItem.js 移植
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { makeLog, makeExec } from "./logHelper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { PEACH_TASKS } from "./PeachTaskIds.js";

const BOX_NAMES = { 2001: "木质", 2002: "青铜", 2003: "黄金", 2004: "铂金" };
const FISH_NAMES = { 1: "普通鱼竿", 2: "黄金鱼竿" };

// ======== 答题题库加载 ========
let answerDatabase = null;

function loadAnswerDatabase() {
  if (answerDatabase) return answerDatabase;
  try {
    const jsonPath = path.join(__dirname, "..", "..", "data", "answer.json");
    const raw = fs.readFileSync(jsonPath, "utf-8");
    answerDatabase = JSON.parse(raw);
    return answerDatabase;
  } catch (e) {
    console.warn(`[tasksItem] 加载答题题库失败: ${e.message}`);
    return [];
  }
}

function matchQuestion(questionFromDB, actualQuestion) {
  if (!questionFromDB || !actualQuestion) return false;
  const cleanDB = questionFromDB.replace(/\s+/g, "").toLowerCase();
  const cleanActual = actualQuestion.replace(/\s+/g, "").toLowerCase();
  return cleanActual.includes(cleanDB) || cleanDB.includes(cleanActual);
}

function findAnswer(question) {
  const questions = loadAnswerDatabase();
  if (!questions || questions.length === 0) return null;
  for (const item of questions) {
    if (!item.name || !item.value) continue;
    if (matchQuestion(item.name, question)) {
      return item.value;
    }
  }
  return null;
}

export class ItemTasks {
  constructor(pool) {
    this.pool = pool;
  }

  /** 批量开宝箱: 按品质从低到高开指定id */
  async openBox(accountId, boxId, maxCount, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    const boxName = BOX_NAMES[boxId] || `宝箱(${boxId})`;
    log(`=== 批量开${boxName}宝箱 ===`);
    await this.pool.ensureConnected(accountId);

    // 获取宝箱数量
    let roleInfo;
    try { roleInfo = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 10000); } catch { roleInfo = {}; }
    const items = roleInfo?.role?.items || {};
    const boxCount = Number(items[boxId]?.quantity || 0);
    const target = Math.max(1, Number(maxCount) || 100);
    const actual = Math.min(boxCount, target);
    log(`${boxName}宝箱: 拥有${boxCount}个, 将开${actual}个`);

    if (actual <= 0) {
      log(`没有可开启的${boxName}宝箱`, "warning");
      return;
    }

    let opened = 0;
    let remaining = actual;
    while (remaining > 0) {
      const batch = Math.min(10, remaining);
      try {
        await exec("item_openbox", { itemId: boxId, number: batch }, `${boxName} ${batch}个 (${opened + batch}/${actual})`);
        opened += batch;
        remaining -= batch;
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        log(`${boxName} 开箱失败: ${e.message}`, "error");
        break;
      }
    }
    log(`${boxName}宝箱: 成功开${opened}个`, "success");
  }

  /** 领取宝箱积分奖励 */
  async claimBoxPointReward(accountId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 领取宝箱积分 ===`);
    await this.pool.ensureConnected(accountId);

    for (let i = 0; i < 20; i++) {
      try {
        await exec("item_batchclaimboxpointreward", {}, `领取积分 ${i + 1}`);
        await new Promise(r => setTimeout(r, 500));
      } catch { break; }
    }
    log(`宝箱积分领取完成`, "success");
  }

  /** 批量钓鱼: type=1普通/2黄金, maxCount次 */
  async fish(accountId, fishType, maxCount, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    const fishName = FISH_NAMES[fishType] || `鱼竿(${fishType})`;
    log(`=== 批量钓鱼: ${fishName} ===`);
    await this.pool.ensureConnected(accountId);

    // 获取鱼竿数量（使用正确的 itemId：1011 普通 / 1012 黄金）
    let roleInfo;
    try { roleInfo = await this.pool.sendMessage(accountId, "role_getroleinfo", {}, 10000); } catch {}
    const items = roleInfo?.role?.items || {};
    const rodId = fishType === 1 ? 1011 : 1012;
    const rodCount = Number(items[rodId]?.quantity || 0);
    const target = Math.max(1, Number(maxCount) || 100);
    const available = Math.min(rodCount, target);
    log(`${fishName}: 拥有${rodCount}个, 将钓${available}次`);

    if (available <= 0) {
      log(`没有可使用的${fishName}`, "warning");
      return;
    }

    let done = 0;
    const tens = Math.floor(available / 10);
    const remainder = available % 10;

    // 整十部分使用十连钓
    for (let i = 0; i < tens; i++) {
      try {
        await exec("artifact_lottery", { lotteryNumber: 10, newFree: true, type: fishType }, `${fishName} ${done + 10}/${available}`, 10000);
        done += 10;
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        log(`${fishName} ${done + 10}/${available} 失败: ${e.message}`, "error");
        break;
      }
    }

    // 余数部分使用单钓
    for (let i = 0; i < remainder; i++) {
      try {
        await exec("artifact_lottery", { lotteryNumber: 1, newFree: true, type: fishType }, `${fishName} ${done + 1}/${available}`, 8000);
        done += 1;
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        log(`${fishName} ${done + 1}/${available} 失败: ${e.message}`, "error");
        break;
      }
    }

    log(`${fishName}: 成功${done}次`, "success");
  }

  /** 批量招募: recruitType=1付费=3免费 */
  async recruit(accountId, recruitType, maxCount, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    const typeName = recruitType === 1 ? "付费招募" : "免费招募";
    const total = Math.max(1, Number(maxCount) || 1);
    log(`=== ${typeName} x${total} ===`);
    await this.pool.ensureConnected(accountId);

    let done = 0;
    const tens = Math.floor(total / 10);
    const remainder = total % 10;

    // 整十部分使用十连抽
    for (let i = 0; i < tens; i++) {
      try {
        await exec("hero_recruit", { recruitType, recruitNumber: 10 }, `${typeName} ${done + 10}/${total}`, 8000);
        done += 10;
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        log(`${typeName} ${done + 10}/${total} 失败: ${e.message}`, "error");
        break;
      }
    }

    // 余数部分使用单抽
    for (let i = 0; i < remainder; i++) {
      try {
        await exec("hero_recruit", { recruitType, recruitNumber: 1 }, `${typeName} ${done + 1}/${total}`, 8000);
        done += 1;
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        log(`${typeName} ${done + 1}/${total} 失败: ${e.message}`, "error");
        break;
      }
    }

    log(`${typeName}完成 (成功${done}/${total})`, "success");
  }

  /** 批量英雄升星 */
  async heroUpgrade(accountId, heroIds, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 英雄升星 ===`);
    await this.pool.ensureConnected(accountId);

    for (const heroId of (heroIds || [])) {
      for (let i = 1; i <= 10; i++) {
        try {
          await exec("hero_heroupgradestar", { heroId }, `英雄${heroId}升星(${i})`, 8000);
        } catch { break; }
        await new Promise(r => setTimeout(r, 200));
      }
    }
    log(`英雄升星完成`, "success");
  }

  /** 批量图鉴升星 */
  async bookUpgrade(accountId, heroIds, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 图鉴升星 ===`);
    await this.pool.ensureConnected(accountId);

    for (const heroId of (heroIds || [])) {
      for (let i = 1; i <= 10; i++) {
        try { await exec("book_upgrade", { heroId }, `图鉴${heroId}升星(${i})`, 8000); }
        catch { break; }
        await new Promise(r => setTimeout(r, 200));
      }
    }
    log(`图鉴升星完成`, "success");
  }

  /** 领取图鉴积分奖励 */
  async claimBookReward(accountId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 领取图鉴奖励 ===`);
    await this.pool.ensureConnected(accountId);

    for (let i = 0; i < 10; i++) {
      try { await exec("book_claimpointreward", {}, `图鉴奖励 ${i + 1}`); await new Promise(r => setTimeout(r, 300)); }
      catch { break; }
    }
    log(`图鉴奖励完成`, "success");
  }

  /** 灯神扫荡: 四国(1-4)+深海(5,仅周一) */
  async genieSweep(accountId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 灯神扫荡 ===`);
    await this.pool.ensureConnected(accountId);

    const kingdoms = ["魏国", "蜀国", "吴国", "群雄"];
    for (let gid = 1; gid <= 4; gid++) {
      try {
        await exec("genie_sweep", { genieId: gid }, `${kingdoms[gid - 1]}灯神扫荡`);
        await new Promise(r => setTimeout(r, 300));
      } catch (e) { /* 可能已扫荡 */ }
    }

    if (new Date().getDay() === 1) {
      try { await exec("genie_sweep", { genieId: 5, sweepCnt: 1 }, "深海灯神"); }
      catch {}
    }
    log(`灯神扫荡完成`, "success");
  }

  /** 领取蟠桃园任务 */
  async claimPeachTasks(accountId, callbacks = {}) {
    const log = makeLog(callbacks);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 蟠桃园任务 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const res = await exec("legion_getpayloadtask", {}, "获取蟠桃任务列表", 8000);
      const payloadTask = res?.body?.payloadTask || res?.payloadTask;

      if (!payloadTask) {
        log(`未获取到蟠桃任务数据`, "warning");
        return;
      }

      // 1. 按进度过滤并领取任务奖励
      const taskMap = payloadTask.taskMap || {};
      const claimableTasks = [];
      for (const item of Object.values(taskMap)) {
        const available = PEACH_TASKS.filter(
          (t) => t.type === item.typ && item.progress >= t.target && item.claimedProgress < t.target,
        );
        claimableTasks.push(...available);
      }

      log(`蟠桃园: 发现 ${claimableTasks.length} 个可领取任务`);

      let claimedCount = 0;
      for (const task of claimableTasks) {
        try {
          const claimRes = await exec(
            "legion_claimpayloadtask",
            { taskId: task.id },
            `领取任务 ${task.desc || task.id}`,
            5000,
          );
          if (claimRes?.body?.payloadTask || claimRes?.payloadTask) {
            claimedCount++;
          }
        } catch (e) {
          // 忽略重复领取或不可领取的错误
        }
        await new Promise((r) => setTimeout(r, 300));
      }

      log(`蟠桃园: 成功领取 ${claimedCount} 个任务奖励`);

      // 2. 重新查询后领取进度奖励
      try {
        const progressRes = await exec("legion_getpayloadtask", {}, "获取进度奖励状态", 5000);
        const progressTask = progressRes?.body?.payloadTask || progressRes?.payloadTask;
        if (progressTask) {
          const legionPoint = progressTask.legionPoint || 0;
          const selfPoint = progressTask.selfPoint || 0;
          const progressMap = progressTask.progressMap || {};
          const clubClaimed = progressMap[1] || progressMap["1"] || 0;
          const personalClaimed = progressMap[2] || progressMap["2"] || 0;

          // 俱乐部进度奖励
          if (legionPoint > clubClaimed && clubClaimed < 25) {
            try {
              await exec("legion_claimpayloadtaskprogress", { taskGroup: 1 }, "俱乐部进度奖励", 5000);
            } catch (e) {
              log(`俱乐部进度奖励领取失败: ${e.message}`, "warning");
            }
          }

          // 个人进度奖励
          if (selfPoint > personalClaimed && personalClaimed < 25) {
            try {
              await exec("legion_claimpayloadtaskprogress", { taskGroup: 2 }, "个人进度奖励", 5000);
            } catch (e) {
              log(`个人进度奖励领取失败: ${e.message}`, "warning");
            }
          }
        }
      } catch (e) {
        log(`领取进度奖励异常: ${e.message}`, "error");
      }
    } catch (e) {
      log(`蟠桃任务失败: ${e.message}`, "error");
    }

    log(`蟠桃园任务完成`, "success");
  }

  /** 自动答题: 开始→逐题回答→领取奖励 */
  async study(accountId, logCb) {
    const log = makeLog(logCb);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 自动答题 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const studyResp = await this.pool.sendMessage(accountId, "study_startgame", {}, 8000);
      const body = studyResp?.body ?? studyResp;
      const questionList = body?.questionList;
      const studyId = body?.role?.study?.id;

      if (!questionList || !Array.isArray(questionList) || questionList.length === 0) {
        log(`答题 - 无题目或今日已完成`, "info");
        return;
      }
      if (!studyId) {
        log(`答题 - 未获取到studyId`, "warning");
        return;
      }

      log(`答题 - 找到 ${questionList.length} 道题目`);

      for (let i = 0; i < questionList.length; i++) {
        const question = questionList[i];
        const questionText = question.question;
        const questionId = question.id;

        let answer = findAnswer(questionText);
        if (answer === null) {
          answer = 1;
          log(`答题 ${i + 1} - 未找到答案，使用默认选项1`, "warning");
        } else {
          log(`答题 ${i + 1} - 找到答案: ${answer}`, "success");
        }

        await this.pool.sendMessage(accountId, "study_answer", {
          id: studyId,
          option: [answer],
          questionId: [questionId],
        }, 5000);

        if (i < questionList.length - 1) {
          await new Promise(r => setTimeout(r, 300));
        }
      }

      // 领取答题奖励
      await new Promise(r => setTimeout(r, 1500));
      for (let rewardId = 1; rewardId <= 10; rewardId++) {
        try {
          await this.pool.sendMessage(accountId, "study_claimreward", { rewardId }, 3000);
        } catch (e) { /* 部分奖励可能已领取 */ }
        await new Promise(r => setTimeout(r, 200));
      }
      log(`答题 - 奖励领取完成`, "success");
    } catch (e) {
      log(`答题失败: ${e.message}`, "warning");
    }

    log(`自动答题完成`, "success");
  }

  /** 免费扭蛋 */
  async freeGacha(accountId, logCb) {
    const log = makeLog(logCb);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 免费扭蛋 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      await exec("gacha_drawreward", { num: 1, isGroup: false }, "免费扭蛋");
    } catch (e) { log(`免费扭蛋失败: ${e.message}`, "error"); }

    log(`免费扭蛋完成`, "success");
  }

  /** 换皮闯关: 获取活动→查找换皮活动→领取奖励 */
  async skinChallenge(accountId, logCb) {
    const log = makeLog(logCb);
    const exec = makeExec(this.pool, accountId, log);
    log(`=== 换皮闯关 ===`);
    await this.pool.ensureConnected(accountId);

    try {
      const res = await exec("activity_get", {}, "获取活动信息", 10000);
      const activity = res?.activity || res?.body?.activity || res;

      if (!activity) {
        log(`换皮闯关 - 获取活动信息失败`, "warning");
        return;
      }

      // 查找换皮闯关活动
      const towersData = activity.towersData || activity.towerData ||
        (activity.towers && activity.towers.towerData ? activity.towers.towerData : null);

      if (!towersData || !towersData.actId) {
        log(`换皮闯关 - 活动未开放或不存在`, "warning");
        return;
      }

      const levelRewardMap = towersData.levelRewardMap || {};
      const actId = String(towersData.actId);

      // 检查活动时间有效性
      if (actId.length >= 6) {
        const year = "20" + actId.substring(0, 2);
        const month = actId.substring(2, 4);
        const day = actId.substring(4, 6);
        const startDate = new Date(`${year}-${month}-${day}T00:00:00`);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 7);
        const now = new Date();
        if (now < startDate || now >= endDate) {
          log(`换皮闯关 - 活动已结束`, "warning");
          return;
        }
      }

      // 领取所有已通关层奖励
      let claimed = 0;
      for (const key in levelRewardMap) {
        const cleared = levelRewardMap[key];
        if (cleared) {
          const rewardId = Number(key) % 1000;
          try {
            await exec("towers_claimreward", { rewardId }, `领取换皮奖励 ${key}`, 3000);
            claimed++;
            await new Promise(r => setTimeout(r, 300));
          } catch (e) { /* 部分奖励可能已领取 */ }
        }
      }
      log(`换皮闯关 - 领取${claimed}个奖励`, "success");
    } catch (e) { log(`换皮闯关失败: ${e.message}`, "error"); }

    log(`换皮闯关完成`, "success");
  }
}

export default ItemTasks;
