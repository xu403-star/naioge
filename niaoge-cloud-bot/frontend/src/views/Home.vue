<template>
  <div class="container">
    <!-- 系统状态栏 -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <div class="status-dot online" style="width:9px;height:9px"></div>
      <div>
        <div style="font-weight:800;font-size:16px;color:var(--text-main)">鸟哥云端助手</div>
        <div style="font-size:11px;color:var(--success-text);font-weight:500">系统运行中</div>
      </div>
    </div>

    <!-- 统计概览 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon purple">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div>
          <div class="stat-val">{{ stats.total }}</div>
          <div class="stat-label">账号总数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
        <div>
          <div class="stat-val">{{ stats.online }}</div>
          <div class="stat-label">在线</div>
        </div>
      </div>
      <div class="stat-card" @click="$router.push('/logs')" style="cursor:pointer">
        <div class="stat-icon amber">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </div>
        <div>
          <div class="stat-val">{{ stats.todayRuns }}</div>
          <div class="stat-label">今日执行</div>
        </div>
      </div>
      <div class="stat-card" @click="$router.push('/schedules')" style="cursor:pointer">
        <div class="stat-icon blue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div>
          <div class="stat-val">{{ stats.schedules }}</div>
          <div class="stat-label">定时任务</div>
        </div>
      </div>
    </div>

    <!-- 快捷操作 -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="16" height="16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          快捷操作
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr;gap:12px">
        <!--
        <button class="btn btn-primary btn-sm" @click="doAction('connect-all')">
          一键连接
        </button>
        -->
        <button class="btn btn-success btn-sm" @click="$router.push('/accounts')">
          执行每日
        </button>
        <button class="btn btn-outline btn-sm" @click="doAction('disconnect-all')" style="color:var(--danger)">
          断开全部
        </button>
        <!--
        <button class="btn btn-outline btn-sm" @click="$router.push('/accounts')">
          批量操作
        </button>
        -->
        <button class="btn btn-outline btn-sm" @click="$router.push('/logs/dream-shop')">
          梦境日志
        </button>
      </div>
    </div>

    <!-- 账号列表 -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="18" height="18"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
          账号概览
        </div>
        <span style="font-size:13px;color:var(--text-muted);font-weight:500">{{ accounts.length }}个</span>
      </div>

      <div v-if="loading" class="flex-center" style="padding:30px"><div class="spinner"></div></div>

      <div v-else-if="accounts.length === 0" class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" width="40" height="40"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        <p>还没有账号</p>
        <button class="btn btn-primary btn-sm" @click="$router.push('/accounts')">去添加账号</button>
      </div>

      <template v-else>
        <div v-for="acc in accounts.slice(0, 6)" :key="acc.id" class="list-row" style="cursor:pointer" @click="$router.push('/accounts')">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="status-dot" :class="acc.status === 'connected' ? 'online' : 'offline'"></span>
            <div>
              <div style="font-weight:600;font-size:14px">{{ acc.name || acc.id?.slice(0,8) }}</div>
              <div style="font-size:12px;color:var(--text-muted)">{{ acc.server || '—' }} · {{ acc.status === 'connected' ? '在线' : '离线' }}</div>
            </div>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div v-if="accounts.length > 6" class="text-center mt-16">
          <button class="btn btn-outline btn-sm w-full" @click="$router.push('/accounts')">查看全部 {{ accounts.length }} 个账号</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
const loading = ref(true)
const stats = ref({ total: 0, online: 0, todayRuns: 0, schedules: 0 })
const accounts = ref([])

onMounted(async () => {
  try {
    const [d, accs, scheds] = await Promise.all([
      api.get('/api/control/dashboard').catch(() => null),
      api.get('/api/accounts').catch(() => []),
      api.get('/api/tasks').catch(() => []),
    ])
    stats.value = {
      total: d?.totalAccounts || accs.length || 0,
      online: d?.connectedCount || accs.filter(a => a.status === 'connected').length || 0,
      todayRuns: d?.todayRuns || 0,
      schedules: (scheds || []).length,
    }
    accounts.value = (accs || []).map(a => ({
      ...a,
      status: a.status || 'disconnected'
    }))
  } catch (e) {
    toast.show('加载失败')
  } finally {
    loading.value = false
  }
})

async function doAction(action) {
  try {
    const map = {
      'connect-all': { url: '/api/control/connect-all', msg: '已发送连接指令' },
      'daily-all': { url: '/api/control/run-daily-all', msg: '已开始执行每日任务' },
      'disconnect-all': { url: '/api/control/disconnect-all', msg: '已断开所有连接' },
    }
    const act = map[action]
    if (act) {
      await api.post(act.url)
      toast.show(act.msg)
    }
  } catch (e) {
    toast.show('操作失败: ' + e.message)
  }
}
</script>
