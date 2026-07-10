<template>
  <div class="container">
    <div class="page-header">
      <button class="btn-back" @click="$router.push('/logs')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span>梦境购买日志</span>
    </div>

    <div class="toolbar">
      <div class="filter-row">
        <label class="filter-label">
          开始
          <input v-model="from" type="date" class="input-sm" />
        </label>
        <label class="filter-label">
          结束
          <input v-model="to" type="date" class="input-sm" />
        </label>
        <label class="filter-label">
          账号
          <input v-model="accountId" type="text" placeholder="账号ID（可选）" class="input-sm" />
        </label>
        <button class="btn btn-sm btn-primary" @click="loadLogs">查询</button>
        <button class="btn btn-sm btn-outline" @click="resetFilters">重置</button>
      </div>
      <div class="action-row">
        <button class="btn btn-sm btn-outline" @click="loadLogs">刷新</button>
        <button class="btn btn-sm btn-outline" @click="exportCSV">导出 CSV</button>
        <button class="btn btn-sm btn-outline" @click="logs = []" style="color:var(--danger)">清屏</button>
        <button class="btn btn-sm btn-outline" @click="clearServerLogs" style="color:var(--danger)">清空服务端记录</button>
        <div class="view-toggle" v-if="!allUsers">
          <button class="btn btn-sm btn-outline" :class="{ active: viewMode === 'detail' }" @click="viewMode = 'detail'">详细记录</button>
          <button class="btn btn-sm btn-outline" :class="{ active: viewMode === 'aggregate' }" @click="viewMode = 'aggregate'">按账号汇总</button>
        </div>
        <label class="admin-toggle" v-if="isAdmin">
          <input v-model="allUsers" type="checkbox" />
          查看全部用户
        </label>
      </div>
    </div>

    <div v-if="loading" class="text-center text-muted" style="padding:40px">加载中...</div>

    <div v-else-if="logs.length === 0" class="text-center text-muted" style="padding:40px">暂无梦境购买记录</div>

    <div v-else>
      <!-- 详细记录 -->
      <template v-if="viewMode === 'detail' || allUsers">
        <div v-for="(group, date) in groupedLogs" :key="date" style="margin-bottom:16px">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;padding-left:4px">{{ date }}</div>
          <div v-for="(log, i) in group" :key="i" class="log-card">
            <div class="log-time">
              {{ formatTime(log.time) }}
              <span v-if="allUsers" class="user-tag">{{ log.userKey }}</span>
            </div>
            <div class="log-msg">
              <span style="font-weight:600">{{ log.accountName }}</span>
              <span style="color:var(--text-muted)"> · </span>
              <span>{{ log.merchantName }}</span>
              <span style="color:var(--text-muted)"> · </span>
              <span style="color:var(--success);font-weight:500">{{ log.itemName }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- 按账号汇总 -->
      <template v-else>
        <div v-for="acc in aggregatedLogs" :key="acc.accountId" class="log-card aggregate">
          <div class="log-msg">
            <span style="font-weight:600">{{ acc.accountName }}</span>
            <span style="color:var(--text-muted)">：</span>
            <span class="aggregate-item" v-for="(part, idx) in acc.parts" :key="idx">{{ part }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
const logs = ref([])
const loading = ref(false)
const viewMode = ref('detail')
const from = ref('')
const to = ref('')
const accountId = ref('')
const isAdmin = ref(false)
const allUsers = ref(false)
const user = ref(null)

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString()
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const logDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = (today - logDay) / (24 * 60 * 60 * 1000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  return d.toLocaleDateString()
}

const groupedLogs = computed(() => {
  const map = {}
  for (const log of logs.value) {
    const date = formatDate(log.time)
    if (!map[date]) map[date] = []
    map[date].push(log)
  }
  return map
})

const aggregatedLogs = computed(() => {
  const map = new Map()
  for (const r of logs.value) {
    const key = r.accountId || r.accountName
    if (!map.has(key)) {
      map.set(key, {
        accountId: r.accountId || r.accountName,
        accountName: r.accountName || r.accountId,
        items: new Map()
      })
    }
    const acc = map.get(key)
    const itemKey = `${r.merchantName}|${r.itemName}`
    acc.items.set(itemKey, (acc.items.get(itemKey) || 0) + 1)
  }

  const result = []
  for (const acc of map.values()) {
    const parts = []
    for (const [key, count] of acc.items.entries()) {
      const [merchantName, itemName] = key.split('|')
      parts.push(`${merchantName}×${count}（${itemName}）`)
    }
    result.push({ ...acc, parts })
  }
  return result
})

async function loadUser() {
  try {
    const me = await api.auth.me()
    user.value = me
    isAdmin.value = me.userKey === 'admin'
  } catch {
    const saved = localStorage.getItem('auth_user')
    if (saved) {
      try {
        user.value = JSON.parse(saved)
        isAdmin.value = user.value.userKey === 'admin'
      } catch {}
    }
  }
}

function buildQuery() {
  const params = new URLSearchParams()
  if (from.value) params.append('from', from.value)
  if (to.value) params.append('to', to.value)
  if (accountId.value.trim()) params.append('accountId', accountId.value.trim())
  return params.toString()
}

async function loadLogs() {
  loading.value = true
  try {
    const endpoint = allUsers.value ? '/api/logs/dream-shop/all' : '/api/logs/dream-shop'
    const query = buildQuery()
    const data = await api.get(`${endpoint}${query ? '?' + query : ''}`)
    if (Array.isArray(data)) {
      logs.value = data
    } else {
      toast.show('加载日志失败')
    }
  } catch (e) {
    toast.show('加载日志失败: ' + e.message)
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  from.value = ''
  to.value = ''
  accountId.value = ''
  allUsers.value = false
  viewMode.value = 'detail'
  loadLogs()
}

async function exportCSV() {
  try {
    const token = localStorage.getItem('auth_token')
    const endpoint = allUsers.value ? '/api/logs/dream-shop/all/export' : '/api/logs/dream-shop/export'
    const query = buildQuery()
    const res = await fetch(`${endpoint}${query ? '?' + query : ''}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = allUsers.value ? 'dream-shop-log-all.csv' : `dream-shop-log-${user.value?.userKey || 'me'}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.show('导出成功')
  } catch (e) {
    toast.show('导出失败: ' + e.message)
  }
}

async function clearServerLogs() {
  if (!confirm('确定要清空服务端梦境购买记录吗？仅影响当前登录用户。')) return
  try {
    const res = await fetch('/api/logs/dream-shop/clear', {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
    })
    if (res.ok) {
      logs.value = []
      toast.show('已清空')
    } else {
      toast.show('清空失败')
    }
  } catch {
    toast.show('清空失败')
  }
}

onMounted(async () => {
  await loadUser()
  await loadLogs()
})

watch(allUsers, () => loadLogs())
</script>

<style scoped>
.container { padding: 20px; max-width: 800px; margin: 0 auto; }
.page-header {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 20px; font-size: 18px; font-weight: 600;
}
.btn-back {
  background: transparent; border: none; cursor: pointer;
  color: var(--text-main); padding: 4px;
}
.toolbar {
  display: flex; flex-direction: column; gap: 10px;
  margin-bottom: 16px;
}
.filter-row, .action-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
}
.filter-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--text-muted);
}
.input-sm {
  padding: 6px 8px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--bg-card);
  color: var(--text-main); font-size: 13px; outline: none;
}
.input-sm:focus { border-color: var(--primary); }
.view-toggle {
  display: flex; gap: 6px; margin-left: auto;
}
.view-toggle .active {
  background: var(--primary); color: #fff; border-color: var(--primary);
}
.admin-toggle {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--text-main); cursor: pointer;
}
.log-card {
  padding: 14px 16px; margin-bottom: 8px; background: var(--bg-card);
  border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 4px;
  box-shadow: var(--shadow-sm); border-left: 3px solid var(--success);
}
.log-card.aggregate { border-left-color: var(--primary); }
.log-time { font-size: 12px; color: var(--text-muted); font-family: monospace; }
.log-msg { font-size: 14px; color: var(--text-main); word-break: break-all; }
.user-tag {
  display: inline-block; margin-left: 8px; padding: 1px 6px;
  background: var(--primary-soft); color: var(--primary);
  border-radius: var(--radius-sm); font-size: 11px;
}
.aggregate-item {
  display: inline-block; margin-right: 10px; margin-bottom: 4px;
  padding: 2px 8px; background: var(--bg-page);
  border-radius: var(--radius-sm); font-size: 13px;
}
@media (max-width: 600px) {
  .filter-row, .action-row { width: 100%; }
  .view-toggle { margin-left: 0; width: 100%; justify-content: flex-end; }
}
</style>
