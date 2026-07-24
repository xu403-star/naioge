<template>
  <div class="container">
    <div class="page-header">
      <button class="btn-back" @click="$router.push('/')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span>任务日志</span>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btn btn-sm" :class="polling ? 'btn-primary' : 'btn-outline'" @click="togglePolling">
        {{ polling ? '● 监听中' : '○ 开始监听' }}
      </button>
      <button class="btn btn-sm btn-outline" @click="loadRecent">刷新</button>
      <button class="btn btn-sm btn-outline" @click="logs = []" style="color:var(--danger)">清屏</button>
    </div>

    <div v-for="(log, i) in logs" :key="i" class="log-card" :class="'log-' + log.type">
      <div class="log-time">{{ log.time }}</div>
      <div class="log-msg">{{ log.message }}</div>
    </div>

    <div v-if="logs.length === 0" class="text-center text-muted" style="padding:40px">暂无日志，点击"开始监听"接收实时日志</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
const logs = ref([])
const polling = ref(false)
let timer = null
let lastSeq = 0

async function loadRecent() {
  try {
    const res = await api.get('/api/control/logs/buffer?limit=200')
    if (res && Array.isArray(res.logs)) {
      logs.value = res.logs.map(l => ({
        time: new Date(l.time).toLocaleTimeString(),
        message: l.message,
        type: l.type || 'info',
      }))
      if (res.lastSeq > lastSeq) lastSeq = res.lastSeq
    }
  } catch { toast.show('加载日志失败') }
}

async function fetchIncremental() {
  try {
    const res = await api.get(`/api/control/logs/buffer?since=${lastSeq}&limit=200`)
    if (res && Array.isArray(res.logs) && res.logs.length > 0) {
      for (const entry of res.logs) {
        logs.value.push({
          time: new Date(entry.time).toLocaleTimeString(),
          message: entry.message,
          type: entry.type || 'info',
        })
      }
      if (logs.value.length > 500) logs.value.splice(0, logs.value.length - 500)
      if (res.lastSeq > lastSeq) lastSeq = res.lastSeq
    }
  } catch { /* ignore */ }
}

function togglePolling() {
  polling.value ? stopPolling() : startPolling()
}

function startPolling() {
  fetchIncremental()
  timer = setInterval(fetchIncremental, 1500)
  polling.value = true
}

function stopPolling() {
  if (timer) { clearInterval(timer); timer = null }
  polling.value = false
}

onMounted(loadRecent)
onUnmounted(stopPolling)
</script>

<style scoped>
.log-card {
  padding: 14px 16px; margin-bottom: 8px; background: var(--bg-card);
  border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 4px;
  box-shadow: var(--shadow-sm);
}
.log-time { font-size: 12px; color: var(--text-muted); font-family: monospace; }
.log-msg { font-size: 14px; color: var(--text-main); word-break: break-all; }
.log-success { border-left: 3px solid var(--success); }
.log-error { border-left: 3px solid var(--danger); }
.log-warning { border-left: 3px solid var(--warning); }
.log-info { border-left: 3px solid var(--primary); }
</style>
