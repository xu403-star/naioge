/**
 * 游戏 WebSocket 客户端 - Node.js 版
 * 从 xyzwWebSocket.js 移植，使用 ws 库替代浏览器 WebSocket
 */
import WebSocket from "ws";
import { bon, ProtoMsg, getEnc, encode, parse } from "./bonProtocol.js";

// ======== 错误码映射表 ========
const errorCodeMap = {
  700010: "任务未达成完成条件",
  1400010: "没有购买该月卡,不能领取每日奖励",
  12000116: "今日已领取免费奖励",
  3300060: "扫荡条件不满足",
  1300050: "请修改您的采购次数",
  200020: "出了点小问题，请尝试重启游戏解决～",
  200160: "模块未开启",
  7500140: "请先输入密码",
  7500100: "密码输入错误",
  7500120: "密码输入错误次数已达上限",
  200400: "操作太快，请稍后再试",
  200760: "您当前看到的界面已发生变化，请重新登录",
  2300190: "今天已经签到过了",
  2300370: "俱乐部商品购买数量超出上限",
  400000: "物品不存在",
  1500020: "能量不足",
  2300070: "未加入俱乐部",
  3500020: "没有可领取的奖励",
  12000050: "今日发车次数已达上限",
  12000060: "不在发车时间内",
  400190: "没有可领取的签到奖励",
  1000020: "今天已经领取过奖励了",
  3300050: "购买数量超出限制",
  700020: "已经领取过这个任务",
  12400000: "挂机奖励领取过于频繁",
  2300250: "俱乐部BOSS今日攻打次数已用完",
  400010: "物品数量不足",
  7900023: "已达到使用次数上限",
  12300040: "没有空格子了",
  12300080: "未达到解锁条件",
  200330: "无效的ID",
  1500040: "上座塔的奖励未领取",
  1500010: "已经全部通关",
};

// ======== 命令节流 ========
const CmdDebounceMap = {
  role_getroleinfo: 1000,
  system_claimhangupreward: 1000,
  system_getdatabundlever: 1000,
};

// ======== 命令注册器 ========
export class CommandRegistry {
  constructor() {
    this.commands = new Map();
  }

  register(cmd, defaultBody = {}) {
    this.commands.set(cmd, (ack = 0, seq = 0, params = {}) => ({
      cmd,
      ack,
      seq,
      time: Date.now(),
      body: bon.encode({ ...defaultBody, ...params }),
    }));
    return this;
  }

  registerHeartbeat() {
    this.commands.set("heart_beat", (ack, seq) => ({
      cmd: "_sys/ack",
      ack,
      seq,
      time: Date.now(),
      body: {},
    }));
    return this;
  }

  encodePacket(raw) {
    const enc = getEnc("auto");
    return encode(raw, enc);
  }

  build(cmd, ack, seq, params) {
    const fn = this.commands.get(cmd);
    if (!fn) throw new Error(`Unknown cmd: ${cmd}`);
    return fn(ack, seq, params);
  }
}

function registerDefaultCommands(reg) {
  return reg
    .registerHeartbeat()
    .register("role_getroleinfo", { clientVersion: "2.21.2-fa918e1997301834-wx", inviteUid: 0, platform: "hortor", platformExt: "mix", scene: "" })
    .register("system_getdatabundlever", { isAudit: false })
    .register("system_buygold", { buyNum: 1 })
    .register("system_claimhangupreward")
    .register("system_signinreward")
    .register("system_mysharecallback", { isSkipShareCard: true, type: 2 })
    .register("system_custom", { key: "", value: 0 })
    .register("task_claimdailypoint", { taskId: 1 })
    .register("task_claimdailyreward", { rewardId: 0 })
    .register("task_claimweekreward", { rewardId: 0 })
    .register("friend_batch", { friendId: 0 })
    .register("hero_recruit", { byClub: false, recruitNumber: 1, recruitType: 3 })
    .register("item_openbox", { itemId: 2001, number: 10 })
    .register("item_batchclaimboxpointreward")
    .register("item_openpack")
    .register("rank_getserverrank")
    .register("arena_startarea")
    .register("fight_startlevel")
    .register("arena_getareatarget", { refresh: false })
    .register("arena_getarearank")
    .register("store_goodslist", { storeId: 1 })
    .register("store_buy", { goodsId: 1 })
    .register("store_purchase", { goodsId: 1 })
    .register("store_refresh", { storeId: 1 })
    .register("legion_getinfo")
    .register("legion_signin")
    .register("legion_getwarrank")
    .register("legionwar_getdetails")
    .register("legion_storebuygoods")
    .register("legion_kickout")
    .register("legion_applylist")
    .register("legion_approveapply")
    .register("legion_refuseapply")
    .register("legion_agree")
    .register("legion_ignore")
    .register("legion_research")
    .register("legion_resetresearch")
    .register("legion_getinfobyid")
    .register("legion_getarearank")
    .register("saltroad_getsaltroadwartotalrank")
    .register("legionwar_getgoldmonthwarrank")
    .register("legion_getopponent")
    .register("legion_getbattlefield")
    .register("legion_claimpayloadtask")
    .register("legion_claimpayloadtaskprogress")
    .register("saltroad_getwartype")
    .register("saltroad_getsaltroadwargrouprank")
    .register("league_getbattlefield")
    .register("league_getgroupopponent")
    .register("legion_signup")
    .register("mail_getlist", { category: [0, 4, 5], lastId: 0, size: 60 })
    .register("mail_claimallattachment", { category: 0 })
    .register("mail_getmtlinfo")
    .register("mail_getmtlshortinfo")
    .register("study_startgame")
    .register("study_answer")
    .register("study_claimreward", { rewardId: 1 })
    .register("fight_starttower")
    .register("fight_startboss")
    .register("fight_startlegionboss")
    .register("fight_startdungeon")
    .register("fight_startpvp")
    .register("fight_startareaarena")
    .register("evotower_getinfo")
    .register("evotower_fight")
    .register("evotower_getlegionjoinmembers")
    .register("evotower_readyfight")
    .register("evotower_claimreward")
    .register("mergebox_getinfo")
    .register("mergebox_claimfreeenergy")
    .register("mergebox_openbox")
    .register("mergebox_automergeitem", { actType: 1 })
    .register("mergebox_mergeitem", { actType: 1 })
    .register("mergebox_claimcostprogress", { actType: 1 })
    .register("mergebox_claimmergeprogress", { actType: 1 })
    .register("evotower_claimtask", { taskId: 1 })
    .register("bottlehelper_claim")
    .register("bottlehelper_start", { bottleType: -1 })
    .register("bottlehelper_stop", { bottleType: -1 })
    .register("legionmatch_rolesignup")
    .register("artifact_lottery", { lotteryNumber: 1, newFree: true, type: 1 })
    .register("artifact_exchange")
    .register("genie_sweep", { genieId: 1 })
    .register("genie_buysweep")
    .register("discount_claimreward", { discountId: 1 })
    .register("collection_claimfreereward")
    .register("card_claimreward", { cardId: 1 })
    .register("tower_getinfo")
    .register("tower_claimreward")
    .register("presetteam_getinfo")
    .register("presetteam_setteam")
    .register("presetteam_saveteam", { teamId: 1 })
    .register("role_gettargetteam")
    .register("hero_exchange")
    .register("hero_gointobattle")
    .register("hero_gobackbattle")
    .register("artifact_load")
    .register("artifact_unload")
    .register("lordweapon_changedefaultweapon")
    .register("pearl_replaceskill")
    .register("collection_goodslist")
    .register("gacha_drawreward", { num: 1, isGroup: false })
    .register("dungeon_selecthero")
    .register("activity_recyclewarorderrewardclaim", { actId: 1 })
    .register("pearl_exchangeskill")
    .register("pearl_unloadskill")
    .register("hero_heroupgradelevel")
    .register("hero_heroupgradeorder")
    .register("hero_rebirth")
    .register("hero_heroupgradestar")
    .register("book_upgrade")
    .register("book_claimpointreward")
    .register("rank_getroleinfo")
    .register("nightmare_getroleinfo")
    .register("dungeon_selecthero")
    .register("bosstower_gethelprank")
    .register("dungeon_buymerchant")
    .register("dungeon_reward")
    .register("activity_get")
    .register("activity_recyclewarorderrewardclaim")
    .register("legion_getpayloadtask")
    .register("legion_getpayloadkillrecord")
    .register("legion_getpayloadbf")
    .register("legion_getpayloadrecord")
    .register("warguess_getrank")
    .register("warguess_startguess")
    .register("warguess_getguesscoinreward")
    .register("legion_payloadsignup")
    .register("collection_goodslist")
    .register("car_getrolecar")
    .register("car_refresh", { carId: 0 })
    .register("car_claim", { carId: 0 })
    .register("car_send", { carId: 0, helperId: 0, text: "" })
    .register("car_getmemberhelpingcnt")
    .register("car_getmemberrank")
    .register("car_research")
    .register("car_claimpartconsumereward")
    .register("legacy_getinfo")
    .register("legacy_claimhangup")
    .register("legacy_gift_getlist")
    .register("legacy_gift_send", { recipientId: 0, itemId: 0, quantity: 0 })
    .register("legacy_gift_received")
    .register("role_commitpassword", { password: "", passwordType: 1 })
    .register("legacy_sendgift", { itemCnt: 0, legacyUIds: [], targetId: 0 })
    .register("equipment_confirm", { heroId: 0, part: 0, quenchId: 0, quenches: {} })
    .register("equipment_quench", { heroId: 0, part: 0, quenchId: 0, quenches: {}, seed: 0, skipOrange: false })
    .register("equipment_updatequenchlock", { heroId: 0, part: 0, slot: 0, isLocked: false })
    .register("matchteam_getroleteaminfo")
    .register("bosstower_getinfo")
    .register("bosstower_startboss")
    .register("bosstower_startbox")
    .register("discount_getdiscountinfo")
    .register("towers_getinfo")
    .register("towers_start")
    .register("towers_fight")
    .register("system_sendchatmessage");
}

// ======== 响应命令映射 ========
const responseToCommandMap = {
  fight_startpvpresp: "fight_startpvp",
  activity_getresp: "activity_get",
  collection_goodslistresp: "collection_goodslist",
  collection_claimfreerewardresp: "collection_claimfreereward",
  legion_getarearankresp: "legion_getarearank",
  legionwar_getgoldmonthwarrankresp: "legionwar_getgoldmonthwarrank",
  nightmare_getroleinforesp: "nightmare_getroleinfo",
  studyresp: "study_startgame",
  role_getroleinforesp: "role_getroleinfo",
  hero_recruitresp: "hero_recruit",
  friend_batchresp: "friend_batch",
  system_claimhanguprewardresp: "system_claimhangupreward",
  item_openboxresp: ["item_openbox", "item_batchclaimboxpointreward"],
  bottlehelper_claimresp: "bottlehelper_claim",
  bottlehelper_startresp: "bottlehelper_start",
  bottlehelper_stopresp: "bottlehelper_stop",
  legion_signinresp: "legion_signin",
  fight_startbossresp: "fight_startboss",
  fight_startlegionbossresp: "fight_startlegionboss",
  fight_startareaarenaresp: "fight_startareaarena",
  arena_startarearesp: "arena_startarea",
  arena_getareatargetresp: "arena_getareatarget",
  arena_getarearankresp: "arena_getarearank",
  presetteam_saveteamresp: "presetteam_saveteam",
  presetteam_getinforesp: "presetteam_getinfo",
  mail_claimallattachmentresp: "mail_claimallattachment",
  store_buyresp: "store_purchase",
  system_getdatabundleverresp: "system_getdatabundlever",
  tower_claimrewardresp: "tower_claimreward",
  fight_starttowerresp: "fight_starttower",
  evotowerinforesp: "evotower_getinfo",
  evotower_fightresp: "evotower_fight",
  evotower_getlegionjoinmembersresp: "evotower_getlegionjoinmembers",
  mergeboxinforesp: "mergebox_getinfo",
  mergebox_claimfreeenergyresp: "mergebox_claimfreeenergy",
  mergebox_openboxresp: "mergebox_openbox",
  mergebox_automergeitemresp: "mergebox_automergeitem",
  mergebox_mergeitemresp: "mergebox_mergeitem",
  mergebox_claimcostprogressresp: "mergebox_claimcostprogress",
  mergebox_claimmergeprogressresp: "mergebox_claimmergeprogress",
  evotower_claimtaskresp: "evotower_claimtask",
  item_openpackresp: "item_openpack",
  equipment_quenchresp: "equipment_quench",
  rank_getserverrankresp: "rank_getserverrank",
  legion_claimpayloadtaskresp: "legion_claimpayloadtask",
  legion_claimpayloadtaskprogressresp: "legion_claimpayloadtaskprogress",
  saltroad_getwartyperesp: "saltroad_getwartype",
  saltroad_getsaltroadwartotalrankresp: "saltroad_getsaltroadwartotalrank",
  warguess_getrankresp: "warguess_getrank",
  warguess_startguessresp: "warguess_startguess",
  warguess_getguesscoinrewardresp: "warguess_getguesscoinreward",
  league_getbattlefieldresp: "league_getbattlefield",
  league_getgroupopponentresp: "league_getgroupopponent",
  legion_signupresp: "legion_signup",
  legion_payloadsignupresp: "legion_payloadsignup",
  pearl_replaceskillresp: "pearl_replaceskill",
  pearl_exchangeskillresp: "pearl_exchangeskill",
  pearl_unloadskillresp: "pearl_unloadskill",
  matchteam_getroleteaminforesp: "matchteam_getroleteaminfo",
  bosstower_getinforesp: "bosstower_getinfo",
  bosstower_startbossresp: "bosstower_startboss",
  bosstower_startboxresp: "bosstower_startbox",
  discount_getdiscountinforesp: "discount_getdiscountinfo",
  hero_heroupgradestarresp: "hero_heroupgradestar",
  hero_heroupgradelevelresp: "hero_heroupgradelevel",
  hero_heroupgradeorderresp: "hero_heroupgradeorder",
  book_upgraderesp: "book_upgrade",
  book_claimpointrewardresp: "book_claimpointreward",
  legion_getinforesp: "legion_getinfo",
  legion_getinforresp: "legion_getinfo",
  car_getrolecarresp: "car_getrolecar",
  car_refreshresp: "car_refresh",
  car_claimresp: "car_claim",
  car_sendresp: "car_send",
  car_getmemberhelpingcntresp: "car_getmemberhelpingcnt",
  car_getmemberrankresp: "car_getmemberrank",
  car_researchresp: "car_research",
  car_claimpartconsumerewardresp: "car_claimpartconsumereward",
  role_gettargetteamresp: "role_gettargetteam",
  activity_warorderclaimresp: "activity_recyclewarorderrewardclaim",
  gacha_drawrewardresp: "gacha_drawreward",
  bosstower_gethelprankresp: "bosstower_gethelprank",
  dungeon_selectheroresp: "dungeon_selecthero",
  dungeon_buymerchantresp: "dungeon_buymerchant",
  dungeon_rewardresp: "dungeon_reward",
  legacy_getinforesp: "legacy_getinfo",
  legacy_claimhangupresp: "legacy_claimhangup",
  legacy_sendgiftresp: "legacy_sendgift",
  legacy_getgiftsresp: "legacy_getgifts",
  towers_getinforesp: "towers_getinfo",
  towers_startresp: "towers_start",
  towers_fightresp: "towers_fight",
  task_claimdailyrewardresp: "task_claimdailyreward",
  task_claimweekrewardresp: "task_claimweekreward",
  legion_researchresp: ["legion_research", "legion_resetresearch"],
  syncresp: ["system_mysharecallback", "task_claimdailypoint", "role_commitpassword", "hero_gointobattle", "hero_gobackbattle", "lordweapon_changedefaultweapon"],
  syncrewardresp: ["system_buygold", "discount_claimreward", "card_claimreward", "artifact_lottery", "genie_sweep", "genie_buysweep", "system_signinreward", "dungeon_selecthero", "artifact_exchange", "hero_exchange", "hero_rebirth"],
};

// ======== 简单日志缓存（用于去重） ========
class SendCache {
  constructor() {
    this.cache = new Map();
  }
  async get(key, fn, opts = {}) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.time < (opts.timeout || 1000)) {
      return cached.value;
    }
    const value = await fn(key);
    this.cache.set(key, { time: Date.now(), value });
    return value;
  }
  clear() { this.cache.clear(); }
}

// ======== GameWsClient ========
export class GameWsClient {
  constructor({ url, heartbeatMs = 5000, onLog }) {
    this.url = url;
    this.onLog = onLog || (() => {});
    this.socket = null;
    this.ack = 0;
    this.seq = 0;
    this.sendQueue = [];
    this.sendQueueTimer = null;
    this.heartbeatTimer = null;
    this.heartbeatInterval = heartbeatMs;
    this.sendCache = new SendCache();
    this.connected = false;
    this.handshakeSuccess = false;
    this.isReconnecting = false;
    this.promises = Object.create(null);
    this.registry = registerDefaultCommands(new CommandRegistry());
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;
    this.onTokenExpired = null;
    this.battleVersion = null;
    this._tokenExpiredHandled = false; // 防止 token expired 消息重复触发刷新
  }

  log(msg, level = "info") {
    this.onLog({ time: new Date().toISOString(), message: msg, level });
  }

  // ======== 连接管理 ========

  init() {
    this._tokenExpiredHandled = false;
    this.log(`WebSocket 连接: ${this.url.split("?p=")[0]}?p=<TOKEN_HIDDEN>&e=x&lang=chinese`, "debug");
    // 解码 p 参数查看 token 结构（仅 debug 级别输出，避免泄露）
    try {
      const urlObj = new URL(this.url);
      const pEncoded = urlObj.searchParams.get('p') || '';
      const pDecoded = decodeURIComponent(pEncoded);
      const pObj = JSON.parse(pDecoded);
      this.log(`Token keys: [${Object.keys(pObj).join(', ')}]`, "debug");
      this.log(`roleToken: ${pObj.roleToken ? '✅(' + pObj.roleToken.length + 'chars)' : '❌MISSING'}`, "debug");
      this.log(`roleId: ${pObj.roleId ?? '❌MISSING'}`, "debug");
    } catch(e) {
      this.log(`Token解析失败: ${e.message}`, "debug");
    }

    // 不设置自定义headers — 模仿浏览器 WebSocket(浏览器不允许自定义header)
    this.socket = new WebSocket(this.url, {
      rejectUnauthorized: false,
      handshakeTimeout: 15000,
    });
    this.socket.binaryType = "arraybuffer";

    this.socket.on("open", () => {
      this.log("WebSocket 连接成功");
      this.connected = true;
      this.handshakeSuccess = true;
      this._setupHeartbeat();
      this._processQueueLoop();
      if (this.onConnect) this.onConnect();
    });

    this.socket.on("message", (data) => {
      try {
        let packet;
        if (Buffer.isBuffer(data)) {
          packet = parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), getEnc("auto"));
        } else if (data instanceof ArrayBuffer) {
          packet = parse(data, getEnc("auto"));
        } else {
          // String data (text protocol fallback)
          packet = JSON.parse(data.toString());
        }

        // 检测 Token 过期主动推送
        this._checkTokenExpired(packet);

        // Update ack
        const actualPacket = packet._raw || packet;
        if (typeof actualPacket.seq === "number" && actualPacket.seq >= 0) {
          this.ack = actualPacket.seq;
        }

        // Promise 响应处理
        this._handlePromiseResponse(packet);
      } catch (err) {
        this.log(`消息处理失败: ${err.message}`, "error");
      }
    });

    this.socket.on("close", (code, reason) => {
      const reasonStr = reason instanceof Buffer ? reason.toString() : String(reason || "");
      const codeMeanings = { 1000: "正常关闭", 1001: "端点离开", 1002: "协议错误", 1003: "不支持的数据", 1005: "无状态码", 1006: "异常关闭(服务器断开了TCP连接)", 1007: "数据格式不一致", 1008: "策略违反", 1009: "消息过大", 1010: "扩展协商失败", 1011: "服务器内部错误", 1012: "服务重启", 1013: "临时过载", 1015: "TLS握手失败" };
      const meaning = codeMeanings[code] || "未知";
      this.log(`WebSocket 关闭: code=${code}(${meaning}) reason="${reasonStr}"`, code === 1006 ? "error" : "warn");
      const hadHandshake = this.handshakeSuccess;
      this.connected = false;
      this.handshakeSuccess = false;
      this._clearTimers();
      if (this.onDisconnect) this.onDisconnect(code, reason, hadHandshake);
    });

    this.socket.on("error", (err) => {
      this.log(`WebSocket 错误: ${err.message}`, "error");
      this.connected = false;
      // 握手前出错不标记 handshakeSuccess，保持 false
      this._clearTimers();
      if (this.onError) this.onError(err);
    });
  }

  disconnect() {
    if (this.socket) {
      // terminate 立即强制关闭底层 TCP，避免 close() 只发关闭帧而连接仍挂起
      try { this.socket.terminate(); } catch {}
      this.socket = null;
    }
    this.connected = false;
    this.handshakeSuccess = false;
    this._clearTimers();
  }

  reconnect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    this.log("开始重连...");
    this.disconnect();
    setTimeout(() => {
      try { this.init(); }
      finally { setTimeout(() => { this.isReconnecting = false; }, 2000); }
    }, 1000);
  }

  // ======== 心跳 ========

  _setupHeartbeat() {
    setTimeout(() => {
      if (this.connected && this.socket?.readyState === WebSocket.OPEN) {
        this.sendHeartbeat();
      }
    }, 3000);

    this.heartbeatTimer = setInterval(() => {
      if (this.connected && this.socket?.readyState === WebSocket.OPEN) {
        this.sendHeartbeat();
      }
    }, this.heartbeatInterval);
  }

  sendHeartbeat() {
    this.send("heart_beat", {}, { respKey: "_sys/ack" });
  }

  // ======== 消息发送 ========

  send(cmd, params = {}, options = {}) {
    const assignedSeq =
      options.seq !== undefined
        ? options.seq
        : cmd === "heart_beat" ? 0 : ++this.seq;

    const task = {
      cmd,
      params,
      seq: assignedSeq,
      respKey: options.respKey || cmd,
      sleep: options.sleep || 0,
      onSent: options.onSent,
    };

    this.sendQueue.push(task);
    return task;
  }

  sendWithPromise(cmd, params = {}, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      if (!this.connected && !this.socket) {
        return reject(new Error("WebSocket 连接已关闭"));
      }

      const requestSeq = ++this.seq;
      this.promises[requestSeq] = { resolve, reject, originalCmd: cmd };

      const timer = setTimeout(() => {
        delete this.promises[requestSeq];
        reject(new Error(`请求超时: ${cmd} (${timeoutMs}ms)`));
      }, timeoutMs);

      this.send(cmd, params, { seq: requestSeq });
    });
  }

  async debounceSend(cmd, ...args) {
    if (CmdDebounceMap[cmd]) {
      return this.sendCache.get(cmd, async () => {
        return this.sendWithPromise(cmd, ...args);
      }, { timeout: CmdDebounceMap[cmd] });
    }
    return this.sendWithPromise(cmd, ...args);
  }

  // ======== 队列处理 ========

  _processQueueLoop() {
    if (this.sendQueueTimer) clearInterval(this.sendQueueTimer);

    this.sendQueueTimer = setInterval(async () => {
      if (!this.sendQueue.length) return;
      if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return;

      const task = this.sendQueue.shift();
      if (!task) return;

      try {
        const raw = this.registry.build(task.cmd, this.ack, task.seq, task.params);

        // 发送报文
        const bin = this.registry.encodePacket(raw);

        // Node.js ws 接受 Buffer 或 ArrayBuffer
        if (bin instanceof ArrayBuffer) {
          this.socket.send(bin);
        } else if (bin instanceof Uint8Array) {
          this.socket.send(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
        } else {
          this.socket.send(bin);
        }

        if (task.onSent) {
          try {
            task.onSent({ respKey: task.respKey, cmd: task.cmd, seq: raw?.seq ?? task.seq });
          } catch (e) { /* ignore */ }
        }

        if (task.sleep) await new Promise(r => setTimeout(r, task.sleep));
      } catch (err) {
        this.log(`发送失败 [${task.cmd}]: ${err.message}`, "error");
      }
    }, 50);
  }

  // ======== Promise 响应 ========

  _checkTokenExpired(packet) {
    const errorText = String(packet.error || packet.hint || "").toLowerCase();
    if (errorText.includes("token") && errorText.includes("expired")) {
      if (this._tokenExpiredHandled) return true;
      this._tokenExpiredHandled = true;
      this.log(`检测到 Token 过期错误: ${packet.error || packet.hint}`, "warning");
      if (this.onTokenExpired) this.onTokenExpired();
      return true;
    }
    return false;
  }

  _handlePromiseResponse(packet) {
    // 优先 resp 字段匹配
    if (packet.resp !== undefined && this.promises[packet.resp]) {
      const p = this.promises[packet.resp];
      delete this.promises[packet.resp];
      const body = packet.rawData !== undefined ? packet.rawData : packet.getData?.() || packet.body;

      if (packet.code === 0 || packet.code === undefined) {
        p.resolve(body || packet);
      } else {
        this._checkTokenExpired(packet);
        const desc = errorCodeMap[packet.code] || packet.hint || "未知错误";
        p.reject(new Error(`服务器错误: ${packet.code} - ${desc}`));
      }
      return;
    }

    // 命令映射匹配
    const respCmd = typeof packet.cmd === "string" ? packet.cmd.toLowerCase() : packet.cmd;
    if (!respCmd) return;

    let originalCmds = responseToCommandMap[respCmd];
    if (!originalCmds) originalCmds = [respCmd];
    else if (typeof originalCmds === "string") originalCmds = [originalCmds];

    for (const [requestId, p] of Object.entries(this.promises)) {
      if (originalCmds.includes(p.originalCmd)) {
        delete this.promises[requestId];
        const body = packet.rawData !== undefined ? packet.rawData : packet.getData?.() || packet.body;

        if (packet.code === 0 || packet.code === undefined) {
          p.resolve(body || packet);
        } else {
          this._checkTokenExpired(packet);
          const desc = errorCodeMap[packet.code] || packet.hint || "未知错误";
          p.reject(new Error(`服务器错误: ${packet.code} - ${desc}`));
        }
        break;
      }
    }
  }

  // ======== 便捷方法 ========

  getRoleInfo(params = {}) {
    return this.sendWithPromise("role_getroleinfo", params);
  }

  getDataBundleVersion(params = {}) {
    return this.sendWithPromise("system_getdatabundlever", params);
  }

  // ======== 清理 ========

  _clearTimers() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.sendQueueTimer) { clearInterval(this.sendQueueTimer); this.sendQueueTimer = null; }
  }

  get lastRecvSeq() {
    return this.ack;
  }

  destroy() {
    this._clearTimers();
    this.sendCache.clear();
    this.promises = Object.create(null);
    this.sendQueue.length = 0;
    this.disconnect();
    this._tokenExpiredHandled = false;
  }
}

export default GameWsClient;
