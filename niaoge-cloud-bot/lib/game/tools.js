/**
 * 游戏工具查询模块
 * 商店信息 / 宝箱积分 / 梦境信息 / 挂机奖励
 */
export class GameTools {
  constructor(pool) {
    this.pool = pool;
  }

  async _send(accountId, cmd, params = {}, timeout = 5000) {
    return this.pool.sendMessage(accountId, cmd, params, timeout);
  }

  /** 获取商店商品列表 */
  async getStoreGoods(accountId, storeId = 1) {
    try {
      const res = await this._send(accountId, "store_goodslist", { storeId }, 5000);
      return {
        storeId: res?.storeId || storeId,
        refreshCount: res?.refreshCount || 0,
        goods: (res?.goods || res?.list || []).map(g => ({
          id: g.id || g.goodsId || 0,
          name: g.name || "",
          price: g.price || 0,
          currency: g.currency || "",
          bought: g.bought || false,
          limit: g.limit || 1,
        })),
      };
    } catch { return { storeId, refreshCount: 0, goods: [] }; }
  }

  /** 获取宝箱积分信息 */
  async getBoxPoints(accountId) {
    try {
      const res = await this._send(accountId, "item_batchclaimboxpointreward", {}, 3000);
      return {
        points: res?.points || res?.boxPoints || 0,
        nextReward: res?.nextReward || 0,
        canClaim: res?.canClaim !== false,
      };
    } catch { return { points: 0, nextReward: 0, canClaim: false }; }
  }

  /** 获取梦境信息 */
  async getDreamInfo(accountId) {
    try {
      const res = await this._send(accountId, "fight_startdungeon", {}, 5000);
      return {
        currentFloor: res?.currentFloor || 0,
        maxFloor: res?.maxFloor || 0,
        energy: res?.energy || 0,
        canFight: res?.canFight !== false,
        _raw: res,
      };
    } catch { return { currentFloor: 0, maxFloor: 0, energy: 0, canFight: false }; }
  }

  /** 获取挂机奖励预览 */
  async getHangUpReward(accountId) {
    try {
      const res = await this._send(accountId, "system_claimhangupreward", {}, 5000);
      return {
        gold: res?.gold || 0,
        exp: res?.exp || 0,
        items: (res?.items || []).map(i => ({
          id: i.id || i.itemId || 0,
          name: i.name || "",
          count: i.count || 0,
        })),
        _raw: res,
      };
    } catch { return { gold: 0, exp: 0, items: [] }; }
  }
}
