/**
 * 排行榜查询模块
 * 区服榜 / 巅峰榜 / 俱乐部榜 / 黄金积分榜 / 伟大航路积分榜
 */
export class Rankings {
  constructor(pool) {
    this.pool = pool;
  }

  async _send(accountId, cmd, params = {}, timeout = 8000) {
    return this.pool.sendMessage(accountId, cmd, params, timeout);
  }

  /** 获取区服排行榜 */
  async getServerRank(accountId) {
    try {
      const res = await this._send(accountId, "rank_getserverrank", {}, 8000);
      const list = res?.rankList || res?.list || [];
      return {
        myRank: res?.myRank || 0,
        myScore: res?.myScore || 0,
        list: list.slice(0, 50).map((r, i) => ({
          rank: i + 1,
          id: r.roleId || r.id || 0,
          name: r.name || "",
          level: r.level || 0,
          power: r.power || 0,
          score: r.score || 0,
        })),
      };
    } catch { return { myRank: 0, myScore: 0, list: [] }; }
  }

  /** 获取巅峰排行榜 */
  async getTopRank(accountId) {
    try {
      const res = await this._send(accountId, "rank_getroleinfo", {}, 8000);
      const list = res?.rankList || res?.list || [];
      return {
        myRank: res?.myRank || 0,
        list: list.slice(0, 50).map((r, i) => ({
          rank: i + 1,
          id: r.roleId || r.id || 0,
          name: r.name || "",
          level: r.level || 0,
          power: r.power || 0,
        })),
      };
    } catch { return { myRank: 0, list: [] }; }
  }

  /** 获取俱乐部排行榜 */
  async getTopClubRank(accountId) {
    try {
      const res = await this._send(accountId, "legion_getarearank", {}, 8000);
      const list = res?.rankList || res?.list || [];
      return {
        myRank: res?.myRank || 0,
        list: list.slice(0, 50).map((r, i) => ({
          rank: i + 1,
          id: r.id || r.legionId || 0,
          name: r.name || "",
          level: r.level || 0,
          memberCount: r.memberCount || 0,
          power: r.power || 0,
          score: r.score || 0,
        })),
      };
    } catch { return { myRank: 0, list: [] }; }
  }

  /** 获取黄金积分榜 */
  async getGoldClubRank(accountId) {
    try {
      const res = await this._send(accountId, "legionwar_getgoldmonthwarrank", {}, 8000);
      const list = res?.rankList || res?.list || [];
      return {
        myRank: res?.myRank || 0,
        myScore: res?.myScore || 0,
        list: list.slice(0, 50).map((r, i) => ({
          rank: i + 1,
          id: r.id || r.legionId || 0,
          name: r.name || "",
          score: r.score || 0,
        })),
      };
    } catch { return { myRank: 0, list: [] }; }
  }

  /** 获取伟大航路积分榜 */
  async getGreatRouteRank(accountId) {
    try {
      const res = await this._send(accountId, "saltroad_getsaltroadwartotalrank", {}, 8000);
      const list = res?.rankList || res?.list || [];
      return {
        myRank: res?.myRank || 0,
        myScore: res?.myScore || 0,
        list: list.slice(0, 50).map((r, i) => ({
          rank: i + 1,
          id: r.id || r.legionId || 0,
          name: r.name || "",
          score: r.score || 0,
        })),
      };
    } catch { return { myRank: 0, list: [] }; }
  }
}
