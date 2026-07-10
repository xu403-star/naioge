<template>
  <div class="container">
    <div class="page-header">
      <button class="btn-back" @click="$router.push('/')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span>任务日志</span>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btn btn-sm" :class="sseOn ? 'btn-primary' : 'btn-outline'" @click="toggleSSE">
        {{ sseOn ? '● SSE 连接中' : '○ 开始监听' }}
      </button>
      <button class="btn btn-sm btn-outline" @click="$router.push('/logs/dream-shop')">梦境购买日志</button>
      <button class="btn btn-sm btn-outline" @click="loadLogs">刷新</button>
      <button class="btn btn-sm btn-outline" @click="logs = []" style="color:var(--danger)">清屏</button>
    </div>

    <div v-for="(log, i) in logs" :key="i" class="log-card" :class="'log-' + log.level">
      <div class="log-time">{{ log.time }}</div>
      <div class="log-msg">{{ log.msg || log.message }}</div>
    </div>

    <div v-if="logs.length === 0" class="text-center text-muted" style="padding:40px">暂无日志，点击"开始监听"接收实时日志</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
const logs = ref([])
const sseOn = ref(false)
let eventSource = null

function addLog(log) {
  logs.value.unshift({ time: new Date().toLocaleTimeString(), ...log })
  if (logs.value.length > 200) logs.value.pop()
}

async function loadLogs() {
  try {
    const res = await fetch('/api/control/logs')
    const data = await res.json()
    if (Array.isArray(data)) {
      logs.value = data.reverse().map(l => ({ ...l, time: l.time || l.timestamp }))
    }
  } catch { toast.show('加载日志失败') }
}

function toggleSSE() {
  if (sseOn.value) { stopSSE(); return }
  startSSE()
}

function startSSE() {
  eventSource = new EventSource('/api/control/logs/stream')
  eventSource.onmessage = (e) => {
    try { addLog(JSON.parse(e.data)) } catch { addLog({ msg: e.data, level: 'info' }) }
  }
  eventSource.onerror = () => { stopSSE(); toast.show('SSE 连接断开') }
  sseOn.value = true
}

function stopSSE() {
  if (eventSource) { eventSource.close(); eventSource = null }
  sseOn.value = false
}

onMounted(loadLogs)
onUnmounted(stopSSE)
</script>

<style scoped>
.log-card {
  padding: 14px 16px; margin-bottom: 8px; background: var(--bg-card);
  border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 4px;
  box-shadow: var(--shadow-sm);
}
.log-card:before { font-size: 11px; font-weight: 600; text-transform: uppercase; }
.log-time { font-size: 12px; color: var(--text-muted); font-family: monospace; }
.log-msg { font-size: 14px; color: var(--text-main); word-break: break-all; }
.log-success { border-left: 3px solid var(--success); }
.log-error { border-left: 3px solid var(--danger); }
.log-warn { border-left: 3px solid var(--warning); }
.log-info { border-left: 3px solid var(--primary); }
</style>
