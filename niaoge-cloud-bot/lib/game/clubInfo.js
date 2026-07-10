/**
 * 俱乐部信息查询模块
 * 俱乐部详情 / 排位 / 盐场战绩 / 蟠桃园战绩
 */
export class ClubInfo {
  constructor(pool) {
    this.pool = pool;
  }

  async _send(accountId, cmd, params = {}, timeout = 8000) {
    return this.pool.sendMessage(accountId, cmd, params, timeout);
  }

  /** 获取俱乐部基本信息 */
  async getClubInfo(accountId) {
    const res = await this._send(accountId, "legion_getinfo");
    const legion = res?.legion || {};
    return {
      id: legion.id || 0,
      name: legion.name || "",
      level: legion.level || 0,
      memberCount: legion.memberCount || 0,
      maxMember: legion.maxMember || 0,
      notice: legion.notice || "",
      myRole: legion.myRole || 0,
      research: {
        current: legion.research?.current || 0,
        max: legion.research?.max || 0,
        todayCount: legion.research?.todayCount || 0,
      },
      _raw: res,
    };
  }

  /** 获取俱乐部成员列表 */
  async getMembers(accountId) {
    const res = await this._send(accountId, "legion_getinfo");
    const members = res?.legion?.members || [];
    return members.map(m => ({
      id: m.roleId || m.id || 0,
      name: m.name || "",
      level: m.level || 0,
      role: m.role || 0,
      power: m.power || 0,
      weeklyContribution: m.weeklyContribution || 0,
      totalContribution: m.totalContribution || 0,
      lastLogin: m.lastLogin || 0,
    }));
  }

  /** 获取入会申请列表 */
  async getApplyList(accountId) {
    try {
      const res = await this._send(accountId, "legion_applylist", {}, 5000);
      return {
        applications: (res?.applications || res?.applyList || []).map(a => ({
          id: a.roleId || a.id || 0,
          name: a.name || "",
          level: a.level || 0,
          power: a.power || 0,
        })),
      };
    } catch { return { applications: [] }; }
  }

  /** 获取俱乐部排位信息 */
  async getLegionMatch(accountId) {
    try {
      const res = await this._send(accountId, "legion_getinfo", {}, 3000);
      const stats = res?.role?.statistics || {};
      const today = Math.floor(new Date().setHours(0,0,0,0) / 1000);
      return {
        isRegistered: Number(stats["last:legion:match:sign:up:time"]) > today,
        signupTime: stats["last:legion:match:sign:up:time"] || 0,
      };
    } catch { return { isRegistered: false, signupTime: 0 }; }
  }

  /** 获取盐场匹配信息（俱乐部战争排名） */
  async getWarRank(accountId) {
    try {
      const [rank, details] = await Promise.allSettled([
        this._send(accountId, "legion_getwarrank", {}, 8000),
        this._send(accountId, "legionwar_getdetails", {}, 8000),
      ]);
      const rankData = rank.status === "fulfilled" ? rank.value : {};
      const detailData = details.status === "fulfilled" ? details.value : {};

      return {
        warType: rankData?.warType || 0,
        totalRank: rankData?.totalRank || 0,
        groupRank: rankData?.groupRank || 0,
        opponents: (rankData?.opponents || []).map(o => ({
          id: o.id || 0,
          name: o.name || "",
          level: o.level || 0,
          memberCount: o.memberCount || 0,
          power: o.power || 0,
        })),
        // 详细战绩
        members: (detailData?.members || []).map(m => ({
          id: m.roleId || m.id || 0,
          name: m.name || "",
          kills: m.kills || 0,
          deaths: m.deaths || 0,
          revives: m.revives || 0,
          score: m.score || 0,
          isSelf: m.isSelf || false,
        })),
        _raw: { rank: rankData, details: detailData },
      };
    } catch { return { warType: 0, totalRank: 0, groupRank: 0, opponents: [], members: [] }; }
  }

  /** 获取盐场本周战绩 */
  async getWeekBattleRecords(accountId) {
    try {
      const res = await this._send(accountId, "legion_getwarrank", {}, 8000);
      return {
        weekKills: res?.weekKills || 0,
        weekDeaths: res?.weekDeaths || 0,
        weekScore: res?.weekScore || 0,
        records: (res?.weekRecords || []).map(r => ({
          id: r.id || 0,
          opponent: r.opponent || "",
          result: r.result || 0,
          kills: r.kills || 0,
          deaths: r.deaths || 0,
          score: r.score || 0,
          time: r.time || 0,
        })),
      };
    } catch { return { weekKills: 0, weekDeaths: 0, weekScore: 0, records: [] }; }
  }

  /** 获取盐场本月战绩 */
  async getMonthBattleRecords(accountId) {
    try {
      const res = await this._send(accountId, "legion_getwarrank", {}, 8000);
      return {
        monthKills: res?.monthKills || 0,
        monthDeaths: res?.monthDeaths || 0,
        monthScore: res?.monthScore || 0,
        records: (res?.monthRecords || []).map(r => ({
          id: r.id || 0,
          opponent: r.opponent || "",
          kills: r.kills || 0,
          deaths: r.deaths || 0,
          score: r.score || 0,
          time: r.time || 0,
        })),
      };
    } catch { return { monthKills: 0, monthDeaths: 0, monthScore: 0, records: [] }; }
  }

  /** 获取蟠桃园信息 */
  async getPeachInfo(accountId) {
    try {
      const [task, record] = await Promise.allSettled([
        this._send(accountId, "legion_getpayloadtask", {}, 5000),
        this._send(accountId, "legion_getpayloadrecord", {}, 5000),
      ]);
      const taskData = task.status === "fulfilled" ? task.value : {};
      const recordData = record.status === "fulfilled" ? record.value : {};

      return {
        currentTask: taskData?.currentTask || 0,
        taskProgress: taskData?.progress || 0,
        taskReward: taskData?.reward || 0,
        totalScore: recordData?.totalScore || 0,
        seasonScore: recordData?.seasonScore || 0,
        records: (recordData?.records || []).map(r => ({
          id: r.id || 0,
          opponent: r.opponent || "",
          result: r.result || 0,
          kill: r.kill || 0,
          score: r.score || 0,
          time: r.time || 0,
        })),
      };
    } catch { return { currentTask: 0, taskProgress: 0, totalScore: 0, records: [] }; }
  }

  /** 获取蟠桃园战绩 */
  async getPeachBattleRecords(accountId) {
    try {
      const res = await this._send(accountId, "legion_getpayloadkillrecord", {}, 5000);
      return {
        totalKills: res?.totalKills || 0,
        totalDeaths: res?.totalDeaths || 0,
        records: (res?.records || []).map(r => ({
          attacker: r.attacker || "",
          defender: r.defender || "",
          result: r.result || 0,
          time: r.time || 0,
        })),
      };
    } catch { return { totalKills: 0, totalDeaths: 0, records: [] }; }
  }

  /** 俱乐部签到状态 */
  async getSigninStatus(accountId) {
    const res = await this._send(accountId, "legion_getinfo");
    const statsTime = res?.role?.statisticsTime || {};
    const today = Math.floor(new Date().setHours(0,0,0,0) / 1000);
    return {
      isSignedIn: (statsTime["legion:sign:in"] || 0) > today,
      clubName: res?.legion?.name || "",
    };
  }
}
