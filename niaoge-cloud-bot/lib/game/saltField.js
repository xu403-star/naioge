/**
 * 盐场查询模块
 * 匹配信息 / 盐场地图 / 实时战况
 */
export class SaltField {
  constructor(pool) {
    this.pool = pool;
  }

  async _send(accountId, cmd, params = {}, timeout = 8000) {
    return this.pool.sendMessage(accountId, cmd, params, timeout);
  }

  /** 获取盐场匹配信息 */
  async getWarType(accountId) {
    try {
      const res = await this._send(accountId, "saltroad_getwartype", {}, 8000);
      return {
        warType: res?.warType || 0,
        warName: res?.warName || "",
        startTime: res?.startTime || 0,
        endTime: res?.endTime || 0,
        isActive: res?.isActive || false,
        stage: res?.stage || 0,
      };
    } catch { return { warType: 0, warName: "", startTime: 0, endTime: 0, isActive: false }; }
  }

  /** 获取盐场分组排名 */
  async getGroupRank(accountId) {
    try {
      const res = await this._send(accountId, "saltroad_getsaltroadwargrouprank", {}, 8000);
      return {
        myLegion: {
          id: res?.myLegion?.id || 0,
          name: res?.myLegion?.name || "",
          rank: res?.myLegion?.rank || 0,
          score: res?.myLegion?.score || 0,
        },
        group: (res?.group || res?.list || []).map(g => ({
          id: g.id || g.legionId || 0,
          name: g.name || "",
          rank: g.rank || 0,
          score: g.score || 0,
        })),
      };
    } catch { return { myLegion: { id: 0, name: "", rank: 0, score: 0 }, group: [] }; }
  }

  /** 获取盐场战场信息 */
  async getBattlefield(accountId) {
    try {
      const [bf, opponent] = await Promise.allSettled([
        this._send(accountId, "legion_getbattlefield", {}, 8000),
        this._send(accountId, "legion_getopponent", {}, 5000),
      ]);
      const bfData = bf.status === "fulfilled" ? bf.value : {};
      const oppData = opponent.status === "fulfilled" ? opponent.value : {};

      return {
        // 战场信息
        battlefields: (bfData?.battlefields || bfData?.list || []).map(bf => ({
          id: bf.id || 0,
          name: bf.name || "",
          status: bf.status || 0,
          occupier: bf.occupier || "",
          score: bf.score || 0,
        })),
        // 对手信息
        opponents: (oppData?.opponents || oppData?.list || []).map(o => ({
          id: o.id || o.legionId || 0,
          name: o.name || "",
          level: o.level || 0,
          power: o.power || 0,
          memberCount: o.memberCount || 0,
        })),
      };
    } catch { return { battlefields: [], opponents: [] }; }
  }

  /** 获取盐场总排名 */
  async getTotalRank(accountId) {
    try {
      const res = await this._send(accountId, "saltroad_getsaltroadwartotalrank", {}, 8000);
      return {
        myRank: res?.myRank || 0,
        myScore: res?.myScore || 0,
        list: (res?.rankList || res?.list || []).slice(0, 50).map((r, i) => ({
          rank: i + 1,
          id: r.id || r.legionId || 0,
          name: r.name || "",
          score: r.score || 0,
        })),
      };
    } catch { return { myRank: 0, list: [] }; }
  }
}
