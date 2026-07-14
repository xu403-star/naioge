<template>
  <div class="container">
    <div class="page-header">
      <button class="btn-back" @click="$router.push('/')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span>定时调度</span>
    </div>

    <div class="card" style="padding:16px">
      <div class="card-title" style="margin-bottom:12px">新增调度</div>

      <div class="input-group">
        <label>名称</label>
        <input v-model="newSchedule.name" placeholder="例: 每日凌晨执行" />
      </div>

      <div class="input-group">
        <label>调度类型</label>
        <select v-model="newSchedule.scheduleType">
          <option value="cron">Cron 表达式</option>
          <option value="fixed">每天固定时间</option>
        </select>
      </div>

      <div v-if="newSchedule.scheduleType === 'cron'" class="input-group">
        <label>Cron 表达式</label>
        <input v-model="newSchedule.cronExpression" placeholder="0 5 * * *" />
      </div>

      <div v-if="newSchedule.scheduleType === 'cron'" class="card" style="padding:12px;margin-bottom:12px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">快捷预设</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button v-for="p in cronPresets" :key="p.label" class="btn btn-sm btn-outline" @click="applyCronPreset(p)">{{ p.label }}</button>
        </div>
      </div>

      <div v-if="newSchedule.scheduleType === 'fixed'" class="input-group">
        <label>每天执行时间</label>
        <input type="time" v-model="newSchedule.fixedTime" />
      </div>

      <div v-if="newSchedule.scheduleType === 'fixed'" class="card" style="padding:12px;margin-bottom:12px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">快捷预设</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button v-for="p in fixedPresets" :key="p.label" class="btn btn-sm btn-outline" @click="applyFixedPreset(p)">{{ p.label }}</button>
        </div>
      </div>

      <div class="input-group">
        <label>操作组合</label>
        <select v-model="newSchedule.type" @change="onTypeChange">
          <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>

      <div class="input-group">
        <label>执行任务（可多选）</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <label v-for="t in availableTasks" :key="t.value" class="checkbox-tag">
            <input type="checkbox" v-model="newSchedule.taskList" :value="t.value" />
            <span>{{ t.label }}</span>
          </label>
        </div>
      </div>

      <div class="input-group">
        <label>最大并发账号数</label>
        <input type="number" v-model.number="newSchedule.maxActive" min="1" max="10" />
      </div>

      <button class="btn btn-primary" @click="createSchedule" :disabled="!canCreate">创建调度</button>
    </div>

    <div v-if="schedules.length === 0" class="text-center text-muted" style="padding:20px">暂无定时任务</div>

    <div v-for="s in schedules" :key="s.id" class="card" style="padding:16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:600">{{ s.name || s.id }}</span>
        <button class="btn btn-sm" style="padding:4px 8px;color:var(--danger);background:none;border:none;cursor:pointer" @click="deleteSchedule(s)">删除</button>
      </div>
      <div style="font-size:13px;font-family:monospace;color:var(--primary);margin-bottom:4px">
        {{ s.schedule_type === 'fixed' ? `每天 ${s.fixed_time}` : s.cron_expression }}
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">
        任务: {{ formatTaskList(s.task_list) }} · 并发: {{ s.max_active || 2 }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
const schedules = ref([])
const newSchedule = ref({
  name: '',
  scheduleType: 'cron',
  cronExpression: '',
  fixedTime: '05:00',
  maxActive: 2,
  type: 'daily-all',
  taskList: ['daily'],
})

const TYPE_MAP = {
  'daily-all': ['daily'],
  'connect-all': ['connect'],
  'disconnect-all': ['disconnect'],
  'daily-then-disconnect': ['daily', 'disconnect'],
}

const typeOptions = [
  { label: '执行全部每日任务', value: 'daily-all' },
  { label: '连接全部账号', value: 'connect-all' },
  { label: '断开全部账号', value: 'disconnect-all' },
  { label: '每日任务后断开', value: 'daily-then-disconnect' },
]

const availableTasks = [
  { label: '每日任务', value: 'daily' },
  { label: '连接账号', value: 'connect' },
  { label: '断开账号', value: 'disconnect' },
]

const cronPresets = [
  { label: '每天05:00', cronExpression: '0 5 * * *' },
  { label: '每天09:00', cronExpression: '0 9 * * *' },
  { label: '每天12:00', cronExpression: '0 12 * * *' },
  { label: '每天18:00', cronExpression: '0 18 * * *' },
  { label: '每天21:00', cronExpression: '0 21 * * *' },
  { label: '每4小时', cronExpression: '0 */4 * * *' },
]

const fixedPresets = [
  { label: '05:00', fixedTime: '05:00' },
  { label: '09:00', fixedTime: '09:00' },
  { label: '12:00', fixedTime: '12:00' },
  { label: '18:00', fixedTime: '18:00' },
  { label: '21:00', fixedTime: '21:00' },
]

const canCreate = computed(() => {
  if (!newSchedule.value.name) return false
  if (newSchedule.value.scheduleType === 'cron') return !!newSchedule.value.cronExpression
  return !!newSchedule.value.fixedTime
})

onMounted(async () => {
  try { schedules.value = await api.get('/api/tasks') || [] } catch {}
})

function onTypeChange() {
  newSchedule.value.taskList = [...(TYPE_MAP[newSchedule.value.type] || ['daily'])]
}

function applyCronPreset(p) {
  newSchedule.value.scheduleType = 'cron'
  newSchedule.value.cronExpression = p.cronExpression
}

function applyFixedPreset(p) {
  newSchedule.value.scheduleType = 'fixed'
  newSchedule.value.fixedTime = p.fixedTime
}

function formatTaskList(list) {
  try {
    const tasks = typeof list === 'string' ? JSON.parse(list) : list
    return (tasks || []).map(v => availableTasks.find(t => t.value === v)?.label || v).join(' → ')
  } catch {
    return list
  }
}

async function createSchedule() {
  try {
    const body = {
      name: newSchedule.value.name,
      scheduleType: newSchedule.value.scheduleType,
      cronExpression: newSchedule.value.cronExpression,
      fixedTime: newSchedule.value.fixedTime,
      taskList: newSchedule.value.taskList,
      accountIds: '*',
      maxActive: newSchedule.value.maxActive,
      enabled: true,
    }
    await api.post('/api/tasks', body)
    toast.show('调度已创建')
    schedules.value = await api.get('/api/tasks') || []
    newSchedule.value = {
      name: '',
      scheduleType: 'cron',
      cronExpression: '',
      fixedTime: '05:00',
      maxActive: 2,
      type: 'daily-all',
      taskList: ['daily'],
    }
  } catch (e) { toast.show('创建失败: ' + e.message) }
}

async function deleteSchedule(s) {
  await api.del(`/api/tasks/${s.id}`)
  schedules.value = await api.get('/api/tasks') || []
  toast.show('已删除')
}
</script>

<style scoped>
.checkbox-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  user-select: none;
}
.checkbox-tag input {
  margin: 0;
}
.checkbox-tag:has(input:checked) {
  border-color: var(--primary);
  background: rgba(59, 130, 246, 0.08);
}
</style>
