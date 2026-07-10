<template>
  <div class="container">
    <div class="page-header">
      <button class="btn-back" @click="$router.push('/')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span>定时调度</span>
    </div>

    <div class="card" style="padding:16px">
      <div class="card-title">Cron 快捷预设</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <button v-for="p in presets" :key="p.label" class="btn btn-sm btn-outline" @click="newSchedule.cronExpression = p.cronExpression; newSchedule.name = p.label">{{ p.label }}</button>
      </div>
    </div>

    <div class="card" style="padding:16px">
      <div class="card-title" style="margin-bottom:12px">新增调度</div>
      <div class="input-group">
        <label>名称</label>
        <input v-model="newSchedule.name" placeholder="例: 每日凌晨执行" />
      </div>
      <div class="input-group">
        <label>Cron 表达式</label>
        <input v-model="newSchedule.cronExpression" placeholder="0 5 * * *" />
      </div>
      <div class="input-group">
        <label>操作类型</label>
        <select v-model="newSchedule.type">
          <option value="daily-all">执行全部每日任务</option>
          <option value="connect-all">连接全部账号</option>
          <option value="disconnect-all">断开全部账号</option>
        </select>
      </div>
      <button class="btn btn-primary" @click="createSchedule" :disabled="!newSchedule.name || !newSchedule.cronExpression">创建调度</button>
    </div>

    <div v-if="schedules.length === 0" class="text-center text-muted" style="padding:20px">暂无定时任务</div>

    <div v-for="s in schedules" :key="s.id" class="card" style="padding:16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:600">{{ s.name || s.id }}</span>
        <button class="btn btn-sm" style="padding:4px 8px;color:var(--danger);background:none;border:none;cursor:pointer" @click="deleteSchedule(s)">删除</button>
      </div>
      <div style="font-size:13px;font-family:monospace;color:var(--primary);margin-bottom:4px">{{ s.cron_expression }}</div>
      <div style="font-size:12px;color:var(--text-muted)">{{ s.task_list }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
const schedules = ref([])
const newSchedule = ref({ name: '', cronExpression: '', type: 'daily-all' })

const presets = [
  { label: '每天05:00', cronExpression: '0 5 * * *' },
  { label: '每天09:00', cronExpression: '0 9 * * *' },
  { label: '每天12:00', cronExpression: '0 12 * * *' },
  { label: '每天18:00', cronExpression: '0 18 * * *' },
  { label: '每天21:00', cronExpression: '0 21 * * *' },
  { label: '每4小时', cronExpression: '0 */4 * * *' },
]

onMounted(async () => {
  try { schedules.value = await api.get('/api/tasks') || [] } catch {}
})

async function createSchedule() {
  try {
    await api.post('/api/tasks', { ...newSchedule.value, enabled: true })
    toast.show('调度已创建')
    schedules.value = await api.get('/api/tasks') || []
    newSchedule.value = { name: '', cronExpression: '', type: 'daily-all' }
  } catch (e) { toast.show('创建失败: ' + e.message) }
}

async function deleteSchedule(s) {
  await api.del(`/api/tasks/${s.id}`)
  schedules.value = await api.get('/api/tasks') || []
  toast.show('已删除')
}
</script>
