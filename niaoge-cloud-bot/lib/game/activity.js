/**
 * 活动查询模块
 * 月度任务 / 咸鱼大冲关(答题) / 换皮闯关
 */
export class Activity {
  constructor(pool) {
    this.pool = pool;
  }

  async _send(accountId, cmd, params = {}, timeout = 5000) {
    return this.pool.sendMessage(accountId, cmd, params, timeout);
  }

  /** 获取月度任务进度 */
  async getMonthlyTasks(accountId) {
    try {
      // 月度任务通过 legion payload task 获取
      const res = await this._send(accountId, "legion_getpayloadtask", {}, 5000);
      const tasks = res?.tasks || res?.taskList || [];
      return {
        currentTask: res?.currentTask || 0,
        progress: res?.progress || 0,
        completedCount: res?.completedCount || 0,
        totalCount: res?.totalCount || 0,
        tasks: tasks.map(t => ({
          id: t.id || t.taskId || 0,
          name: t.name || t.title || "",
          progress: t.progress || 0,
          total: t.total || t.maxProgress || 0,
          completed: t.completed || false,
          reward: t.reward || "",
        })),
        _raw: res,
      };
    } catch { return { currentTask: 0, progress: 0, tasks: [] }; }
  }

  /** 获取咸鱼大冲关(答题)状态 */
  async getStudyStatus(accountId) {
    try {
      const res = await this._send(accountId, "study_startgame", {}, 5000);
      return {
        currentQuestion: res?.currentQuestion || 0,
        totalQuestions: res?.totalQuestions || 0,
        score: res?.score || 0,
        canPlay: res?.canPlay !== false,
        questions: res?.questions || [],
        _raw: res,
      };
    } catch (e) {
      // 活动未开放时返回这个
      return { currentQuestion: 0, totalQuestions: 0, score: 0, canPlay: false, questions: [] };
    }
  }

  /** 获取活动开放状态 */
  getActivityDayStatus() {
    const day = new Date().getDay(); // 0=周日
    return {
      isActivityOpen: day >= 1 && day <= 3, // 周一到周三
      isWeekend: day === 0 || day === 6,
      today: day,
    };
  }

  /** 获取邮件列表 */
  async getMailList(accountId) {
    try {
      const res = await this._send(accountId, "mail_getlist", {
        category: [0, 4, 5],
        lastId: 0,
        size: 60,
      }, 5000);
      return {
        total: res?.total || 0,
        unread: res?.unread || 0,
        mails: (res?.mails || res?.list || []).slice(0, 30).map(m => ({
          id: m.id || 0,
          title: m.title || "",
          sender: m.sender || "",
          content: m.content || "",
          hasAttachment: m.hasAttachment || false,
          claimed: m.claimed || false,
          time: m.time || 0,
        })),
      };
    } catch { return { total: 0, unread: 0, mails: [] }; }
  }
}
