/**
 * PVP切磋模块
 * 查询对手 / 发起切磋
 */
export class Pvp {
  constructor(pool) {
    this.pool = pool;
  }

  async _send(accountId, cmd, params = {}, timeout = 8000) {
    return this.pool.sendMessage(accountId, cmd, params, timeout);
  }

  /** 搜索玩家（通过角色名/ID） */
  async searchPlayer(accountId, keyword) {
    try {
      // 通过 arena 系统搜索对手
      const res = await this._send(accountId, "arena_getareatarget", {
        refresh: false,
        keyword: keyword || "",
      }, 8000);
      return {
        found: res?.found !== false,
        target: res?.target ? {
          id: res.target.roleId || res.target.id || 0,
          name: res.target.name || "",
          level: res.target.level || 0,
          power: res.target.power || 0,
        } : null,
        _raw: res,
      };
    } catch { return { found: false, target: null }; }
  }

  /** 获取竞技场对手列表 */
  async getArenaTargets(accountId, refresh = false) {
    try {
      const res = await this._send(accountId, "arena_getareatarget", { refresh }, 5000);
      const targets = res?.targets || res?.list || [];
      return {
        targets: targets.map(t => ({
          id: t.roleId || t.id || 0,
          name: t.name || "",
          level: t.level || 0,
          power: t.power || 0,
          rank: t.rank || 0,
          score: t.score || 0,
        })),
        refreshCount: res?.refreshCount || 0,
        maxRefresh: res?.maxRefresh || 5,
        _raw: res,
      };
    } catch { return { targets: [], refreshCount: 0, maxRefresh: 5 }; }
  }

  /** 发起切磋 (PVP战斗) */
  async startFight(accountId, targetId) {
    try {
      const res = await this._send(accountId, "fight_startpvp", {
        targetId: targetId,
      }, 10000);
      return {
        success: res?.success !== false,
        result: res?.result || 0,
        battleData: res?.battleData || null,
        message: res?.message || "",
        _raw: res,
      };
    } catch (e) {
      return { success: false, result: 0, message: e.message };
    }
  }

  /** 获取竞技场排名 */
  async getArenaRank(accountId) {
    try {
      const res = await this._send(accountId, "arena_getarearank", {}, 5000);
      return {
        myRank: res?.myRank || 0,
        myScore: res?.myScore || 0,
        list: (res?.rankList || res?.list || []).slice(0, 50).map((r, i) => ({
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
}
