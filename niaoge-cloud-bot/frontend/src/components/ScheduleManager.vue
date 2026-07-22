<template>
  <div class="schedule-manager">
    <!-- 顶部汇总条 -->
    <div class="schedule-summary-bar card">
      <div class="summary-left">
        <div class="summary-count">共 {{ schedules.length }} 个定时任务</div>
        <div v-if="shortestCountdownTask" class="summary-countdown" :class="{ near: shortestCountdownTask.countdown.isNearExecution }">
          即将执行：{{ shortestCountdownTask.task.name }} ({{ shortestCountdownTask.countdown.formatted }})
        </div>
        <div v-else class="summary-empty">暂无定时任务</div>
      </div>
      <div class="summary-actions">
        <button class="btn btn-sm btn-primary" @click="openAddModal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增
        </button>
        <button class="btn btn-sm btn-info" @click="showListModal = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          查看
        </button>
        <button class="btn btn-sm btn-success" @click="exportTasks">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          导出
        </button>
        <label class="btn btn-sm btn-warning" style="cursor:pointer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          导入
          <input type="file" accept=".json" style="display:none" @change="importTasks" />
        </label>
      </div>
    </div>

    <!-- 任务列表弹窗 -->
    <div v-if="showListModal" class="modal-overlay" @click.self="showListModal = false">
      <div class="modal-card unified-modal">
        <div class="modal-header">
          <div class="modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            定时任务列表
          </div>
          <button class="modal-close" @click="showListModal = false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div v-for="s in schedules" :key="s.id" class="task-list-item" :class="{ disabled: !s.enabled }">
            <div class="task-list-header">
              <div class="task-title-wrap">
                <span class="task-status-dot" :class="s.enabled ? 'active' : 'inactive'"></span>
                <span class="task-name">{{ s.name }}</span>
              </div>
              <label class="toggle">
                <input type="checkbox" :checked="!!s.enabled" @change="toggleEnabled(s, $event.target.checked)" />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="task-list-grid">
              <div class="task-list-row">
                <span class="task-list-label">运行类型</span>
                <span :class="['task-type-badge', s.schedule_type === 'fixed' ? 'fixed' : 'cron']">
                  {{ s.schedule_type === 'fixed' ? '每天固定时间' : 'Cron表达式' }}
                </span>
              </div>
              <div class="task-list-row">
                <span class="task-list-label">运行时间</span>
                <span class="task-list-value">{{ s.schedule_type === 'fixed' ? s.fixed_time : s.cron_expression }}</span>
              </div>
              <div class="task-list-row">
                <span class="task-list-label">下次执行</span>
                <span :class="['task-countdown', { near: taskCountdowns[s.id]?.isNearExecution }]">
                  {{ s.enabled ? (taskCountdowns[s.id]?.formatted || '计算中...') : '已禁用' }}
                </span>
              </div>
              <div class="task-list-row">
                <span class="task-list-label">选中账号</span>
                <span class="task-list-value">{{ formatAccountIds(s.account_ids) }} 个</span>
              </div>
            </div>
            <div class="task-list-row task-tasks-row">
              <span class="task-list-label">选中任务</span>
              <span class="task-list-value task-flow">{{ formatTaskList(s.task_list) }}</span>
            </div>
            <div class="task-list-actions">
              <button class="btn btn-xs btn-default" @click="editSchedule(s)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                编辑
              </button>
              <button class="btn btn-xs btn-error" @click="deleteSchedule(s)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                删除
              </button>
              <button class="btn btn-xs btn-info" :disabled="executingIds.has(s.id)" @click="runScheduleNow(s)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                {{ executingIds.has(s.id) ? '执行中...' : '立即执行' }}
              </button>
            </div>
          </div>
          <div v-if="schedules.length === 0" class="empty-tip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="40" height="40" style="opacity:0.35;margin-bottom:10px">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <div>暂无定时任务</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增/编辑弹窗 -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="closeEditModal">
      <div class="modal-card unified-modal">
        <div class="modal-header">
          <div class="modal-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {{ editingSchedule ? '编辑定时任务' : '新增定时任务' }}
          </div>
          <button class="modal-close" @click="closeEditModal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="settings-grid">
            <!-- 任务名称 -->
            <div class="input-group">
              <label class="setting-label">任务名称</label>
              <input v-model="form.name" placeholder="请输入任务名称" />
            </div>

            <!-- 运行类型 -->
            <div class="input-group">
              <label class="setting-label">运行类型</label>
              <div class="radio-group">
                <label class="radio-item">
                  <input type="radio" value="daily" v-model="form.runType" @change="resetRunType" />
                  <span>每天固定时间</span>
                </label>
                <label class="radio-item">
                  <input type="radio" value="cron" v-model="form.runType" @change="resetRunType" />
                  <span>Cron表达式</span>
                </label>
              </div>
            </div>

            <!-- 运行时间 -->
            <div v-if="form.runType === 'daily'" class="input-group">
              <label class="setting-label">运行时间</label>
              <input type="time" v-model="form.runTime" />
            </div>

            <!-- Cron表达式 -->
            <div v-if="form.runType === 'cron'" class="input-group">
              <label class="setting-label">Cron表达式</label>
              <input v-model="form.cronExpression" placeholder="0 9 * * *" @input="parseCronExpression" />
              <div v-if="form.cronExpression" class="cron-parser">
                <div :class="['cron-validation', cronValidation.valid ? 'success' : 'error']">
                  {{ cronValidation.valid ? '✓' : '✗' }} {{ cronValidation.message }}
                </div>
                <div v-if="cronValidation.valid && cronNextRuns.length > 0" class="cron-next-runs">
                  <div class="cron-next-title">未来5次执行时间</div>
                  <ul>
                    <li v-for="(run, index) in cronNextRuns" :key="index">{{ run }}</li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- 选择任务 -->
            <div class="input-group">
              <div class="selection-header">
                <label class="setting-label">选择任务</label>
                <div class="selection-actions">
                  <button class="btn btn-xs btn-default" @click="selectAllTasks">全选</button>
                  <button class="btn btn-xs btn-default" @click="deselectAllTasks">全不选</button>
                </div>
              </div>
              <div class="tab-bar">
                <button v-for="cat in categories" :key="cat" class="tab-btn" :class="{ active: activeCategory === cat }" @click="activeCategory = cat">
                  {{ cat }}
                </button>
              </div>
              <div class="checkbox-grid">
                <label v-for="op in currentOps" :key="op.key" class="checkbox-item">
                  <input type="checkbox" :value="op.key" v-model="form.selectedTasks" @change="onTaskToggle(op.key)" />
                  <span>{{ op.label }}</span>
                </label>
              </div>
            </div>

            <!-- 选择账号 -->
            <div class="input-group">
              <div class="selection-header">
                <label class="setting-label">选择账号</label>
                <div class="selection-actions">
                  <button class="btn btn-xs btn-default" @click="selectAllAccounts">全选</button>
                  <button class="btn btn-xs btn-default" @click="deselectAllAccounts">全不选</button>
                </div>
              </div>
              <div class="checkbox-grid">
                <label v-for="acc in internalAccounts" :key="acc.id" class="checkbox-item">
                  <input type="checkbox" :value="acc.id" v-model="form.selectedTokens" />
                  <span class="account-name">{{ acc.name || acc.id }}</span>
                  <span v-if="acc.server" class="account-server">{{ acc.server }}</span>
                </label>
                <div v-if="internalAccounts.length === 0" class="account-empty">暂无账号，请先添加账号</div>
              </div>
            </div>

            <!-- 任务配置面板 -->
            <div v-if="selectedConfigurableOps.length > 0" class="config-panel">
              <div class="config-panel-title">任务配置</div>

              <div v-if="form.selectedTasks.includes('chest')" class="input-group">
                <label class="setting-label">批量开箱</label>
                <div class="config-row">
                  <div class="input-group">
                    <label class="setting-label sub">数量</label>
                    <input type="number" v-model.number="taskConfig('chest').maxCount" min="1" />
                  </div>
                  <div class="input-group">
                    <label class="setting-label sub">宝箱类型</label>
                    <select v-model.number="taskConfig('chest').boxId">
                      <option v-for="bt in boxTypes" :key="bt.value" :value="bt.value">{{ bt.label }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div v-if="form.selectedTasks.includes('fish')" class="input-group">
                <label class="setting-label">批量钓鱼</label>
                <div class="config-row">
                  <div class="input-group">
                    <label class="setting-label sub">次数</label>
                    <input type="number" v-model.number="taskConfig('fish').maxCount" min="1" />
                  </div>
                  <div class="input-group">
                    <label class="setting-label sub">鱼竿类型</label>
                    <select v-model.number="taskConfig('fish').fishType">
                      <option v-for="ft in fishTypes" :key="ft.value" :value="ft.value">{{ ft.label }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div v-if="form.selectedTasks.includes('recruit')" class="input-group">
                <label class="setting-label">批量招募次数</label>
                <input type="number" v-model.number="taskConfig('recruit').maxCount" min="1" />
              </div>

              <div v-if="form.selectedTasks.includes('smartSendCar')" class="input-group">
                <label class="setting-label">智能发车保底条件</label>
                <div class="config-row four">
                  <div class="input-group">
                    <label class="setting-label sub">金砖 ≥</label>
                    <input type="number" v-model.number="taskConfig('smartSendCar').thresholds.gold" min="0" />
                  </div>
                  <div class="input-group">
                    <label class="setting-label sub">招募令 ≥</label>
                    <input type="number" v-model.number="taskConfig('smartSendCar').thresholds.recruit" min="0" />
                  </div>
                  <div class="input-group">
                    <label class="setting-label sub">白玉 ≥</label>
                    <input type="number" v-model.number="taskConfig('smartSendCar').thresholds.jade" min="0" />
                  </div>
                  <div class="input-group">
                    <label class="setting-label sub">刷新票 ≥</label>
                    <input type="number" v-model.number="taskConfig('smartSendCar').thresholds.ticket" min="0" />
                  </div>
                </div>
                <label class="checkbox-tag">
                  <input type="checkbox" v-model="taskConfig('smartSendCar').assignHelper" />
                  <span>自动分配护卫</span>
                </label>
              </div>

              <div v-if="form.selectedTasks.includes('dreamShop')" class="input-group">
                <label class="setting-label">梦境商品购买配置</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
                  <button class="btn btn-xs btn-warning" @click="selectDreamGoldItems">一键勾选金币商品</button>
                  <button class="btn btn-xs btn-default" @click="selectAllDreamItems">全选</button>
                  <button class="btn btn-xs btn-default" @click="clearDreamItems">清空</button>
                </div>
                <div v-for="(merchant, id) in dreamMerchantConfig" :key="id" class="dream-merchant-block">
                  <div class="dream-merchant-name">{{ merchant.name }}</div>
                  <div class="dream-shop-grid">
                    <label v-for="(item, index) in merchant.items" :key="index" class="checkbox-item">
                      <input type="checkbox" :value="`${id}-${index}`" :checked="dreamBuyList().includes(`${id}-${index}`)"
                        @change="e => toggleDreamItem(`${id}-${index}`, e.target.checked)" />
                      <span style="font-size:12px">{{ item }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <!-- 最大并发 -->
            <div class="input-group">
              <label class="setting-label">最大并发账号数</label>
              <input type="number" v-model.number="form.maxActive" min="1" max="10" />
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-default" @click="closeEditModal">取消</button>
            <button class="btn btn-primary" @click="saveSchedule">保存</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { api } from '../api'
import { useToastStore } from '../stores/toast'
import {
  validateCronExpression,
  calculateNextRuns,
  calculateNextExecutionTime,
  formatTimeDifference,
} from '../utils/cronUtils'

const toast = useToastStore()

const props = defineProps({
  accounts: { type: Array, default: undefined },
  operations: { type: Array, default: undefined },
  batchSettings: { type: Object, default: undefined },
})

const emit = defineEmits(['update:count', 'refresh'])

// 内部数据（当 props 未传入时自行加载）
const internalAccounts = ref(props.accounts || [])
watch(() => props.accounts, (val) => {
  if (val && Array.isArray(val)) internalAccounts.value = val
}, { immediate: true })
const internalOperations = ref(props.operations || [])
watch(() => props.operations, (val) => {
  if (val && Array.isArray(val)) internalOperations.value = val
}, { immediate: true })
const internalBatchSettings = ref(props.batchSettings || {})
watch(() => props.batchSettings, (val) => {
  if (val && typeof val === 'object') internalBatchSettings.value = val
}, { immediate: true })

const schedules = ref([])
const showListModal = ref(false)
const showEditModal = ref(false)
const editingSchedule = ref(null)
const executingIds = ref(new Set())
const activeCategory = ref('基础')

const form = ref({
  name: '',
  runType: 'daily',
  runTime: '06:00',
  cronExpression: '',
  selectedTokens: [],
  selectedTasks: [],
  taskList: [],
  maxActive: 2,
  enabled: true,
})

const cronValidation = ref({ valid: true, message: '' })
const cronNextRuns = ref([])
const taskCountdowns = ref({})
const nextExecutionTimes = ref({})
let countdownInterval = null

const baseOps = [
  { key: 'daily', label: '每日任务', category: '基础' },
  { key: 'connect', label: '连接账号', category: '基础' },
  { key: 'disconnect', label: '断开账号', category: '基础' },
]

const configurableOps = ['chest', 'fish', 'recruit', 'smartSendCar', 'dreamShop']

const boxTypes = [
  { value: 2001, label: '木质' },
  { value: 2002, label: '青铜' },
  { value: 2003, label: '黄金' },
  { value: 2004, label: '铂金' },
]

const fishTypes = [
  { value: 1, label: '普通' },
  { value: 2, label: '黄金' },
]

const dreamMerchantConfig = {
  1: { name: '初级商人', items: ['进阶石', '精铁', '木质宝箱', '青铜宝箱', '普通鱼竿', '咸神门票', '咸神火把'] },
  2: { name: '中级商人', items: ['梦魇晶石', '进阶石', '精铁', '黄金宝箱', '黄金鱼竿', '招募令', '橙将碎片', '紫将碎片'] },
  3: { name: '高级商人', items: ['梦魇晶石', '铂金宝箱', '黄金鱼竿', '招募令', '红将碎片', '橙将碎片', '红将碎片', '普通鱼竿'] },
}

const dreamGoldItems = { 1: [5, 6], 2: [6, 7], 3: [5, 6, 7] }

const dreamBuyList = () => {
  const cfg = form.value.taskList.find(t => t.op === 'dreamShop')
  return cfg ? cfg.purchaseList : []
}

const allOps = computed(() => [...baseOps, ...internalOperations.value])
const categories = computed(() => [...new Set(allOps.value.map(o => o.category || '其他'))])
const currentOps = computed(() => allOps.value.filter(o => (o.category || '其他') === activeCategory.value))

const selectedConfigurableOps = computed(() => form.value.selectedTasks.filter(key => configurableOps.includes(key)))

const shortestCountdownTask = computed(() => {
  if (schedules.value.length === 0) return null
  let shortestTask = null
  let shortestTime = Infinity
  schedules.value.forEach(s => {
    if (!s.enabled) return
    const countdown = taskCountdowns.value[s.id]
    if (countdown && countdown.remainingTime < shortestTime) {
      shortestTime = countdown.remainingTime
      shortestTask = { task: s, countdown }
    }
  })
  return shortestTask
})

watch(() => schedules.value.length, (len) => emit('update:count', len), { immediate: true })

onMounted(async () => {
  if (!props.accounts) {
    try { internalAccounts.value = await api.get('/api/accounts') || [] } catch {}
  }
  if (!props.operations) {
    try { internalOperations.value = await api.get('/api/batch/operations') || [] } catch {}
  }
  if (!props.batchSettings) {
    try { internalBatchSettings.value = await api.get('/api/settings/batch') || {} } catch {}
  }
  await loadSchedules()
  startCountdown()
})

onUnmounted(() => {
  if (countdownInterval) clearInterval(countdownInterval)
})

async function loadSchedules() {
  try {
    schedules.value = await api.get('/api/tasks') || []
    nextExecutionTimes.value = {}
    taskCountdowns.value = {}
  } catch (e) {
    schedules.value = []
  }
}

function startCountdown() {
  updateCountdowns()
  countdownInterval = setInterval(updateCountdowns, 1000)
}

function updateCountdowns() {
  const now = Date.now()
  schedules.value.forEach(s => {
    if (!s.enabled) {
      delete taskCountdowns.value[s.id]
      return
    }
    if (!nextExecutionTimes.value[s.id] || nextExecutionTimes.value[s.id] <= now) {
      nextExecutionTimes.value[s.id] = calculateNextExecutionTime(scheduleToUi(s))
    }
    const next = nextExecutionTimes.value[s.id]
    if (next) {
      const diff = next - now
      taskCountdowns.value[s.id] = {
        remainingTime: Math.max(0, diff),
        formatted: formatTimeDifference(Math.max(0, diff)),
        isNearExecution: diff < 5 * 60 * 1000,
      }
    }
  })
}

function scheduleToUi(s) {
  return {
    runType: s.schedule_type === 'fixed' ? 'daily' : 'cron',
    runTime: s.fixed_time,
    cronExpression: s.cron_expression,
  }
}

function openAddModal() {
  editingSchedule.value = null
  form.value = {
    name: '',
    runType: 'daily',
    runTime: '06:00',
    cronExpression: '',
    selectedTokens: internalAccounts.value.map(a => a.id),
    selectedTasks: [],
    taskList: [],
    maxActive: internalBatchSettings.value.maxActive || 2,
    enabled: true,
  }
  cronValidation.value = { valid: true, message: '' }
  cronNextRuns.value = []
  activeCategory.value = categories.value[0] || '基础'
  ensureDefaultConfigs()
  showEditModal.value = true
}

function editSchedule(s) {
  editingSchedule.value = s
  const tasks = parseTaskList(s.task_list)
  form.value = {
    name: s.name || '',
    runType: s.schedule_type === 'fixed' ? 'daily' : 'cron',
    runTime: s.fixed_time || '06:00',
    cronExpression: s.cron_expression || '',
    selectedTokens: s.account_ids === '*' ? internalAccounts.value.map(a => a.id) : (s.account_ids || '').split(',').filter(Boolean),
    selectedTasks: tasks.map(t => typeof t === 'string' ? t : (t?.op || t?.key)),
    taskList: tasks.filter(t => typeof t === 'object' && t?.op).map(t => ({ ...t })),
    maxActive: s.max_active || 2,
    enabled: !!s.enabled,
  }
  parseCronExpression()
  activeCategory.value = categories.value[0] || '基础'
  ensureDefaultConfigs()
  showEditModal.value = true
}

function closeEditModal() {
  showEditModal.value = false
  editingSchedule.value = null
}

function resetRunType() {
  if (form.value.runType === 'daily') {
    form.value.cronExpression = ''
  } else {
    form.value.runTime = '06:00'
  }
}

function parseCronExpression() {
  if (!form.value.cronExpression) {
    cronValidation.value = { valid: true, message: '' }
    cronNextRuns.value = []
    return
  }
  const validation = validateCronExpression(form.value.cronExpression)
  cronValidation.value = validation
  if (validation.valid) {
    const parts = form.value.cronExpression.split(' ').filter(Boolean)
    cronNextRuns.value = calculateNextRuns(parts[0], parts[1], parts[2], parts[3], parts[4], 5)
  } else {
    cronNextRuns.value = []
  }
}

function selectAllAccounts() {
  form.value.selectedTokens = internalAccounts.value.map(a => a.id)
}

function deselectAllAccounts() {
  form.value.selectedTokens = []
}

function selectAllTasks() {
  form.value.selectedTasks = allOps.value.map(o => o.key)
  ensureDefaultConfigs()
}

function deselectAllTasks() {
  form.value.selectedTasks = []
  form.value.taskList = []
}

function onTaskToggle(key) {
  const idx = form.value.selectedTasks.indexOf(key)
  if (idx >= 0) {
    // 已选中：确保配置存在
    if (configurableOps.includes(key) && !form.value.taskList.some(t => t.op === key)) {
      form.value.taskList.push({ op: key, ...defaultConfig(key) })
    }
  } else {
    // 取消选中：移除配置
    form.value.taskList = form.value.taskList.filter(t => t.op !== key)
  }
}

function ensureDefaultConfigs() {
  configurableOps.forEach(key => {
    if (form.value.selectedTasks.includes(key) && !form.value.taskList.some(t => t.op === key)) {
      form.value.taskList.push({ op: key, ...defaultConfig(key) })
    }
  })
}

function taskConfig(key) {
  let cfg = form.value.taskList.find(t => t.op === key)
  if (!cfg) {
    cfg = { op: key, ...defaultConfig(key) }
    form.value.taskList.push(cfg)
  }
  return cfg
}

function defaultConfig(op) {
  const s = internalBatchSettings.value || {}
  switch (op) {
    case 'chest':
      return { maxCount: s.boxCount || 100, boxId: s.defaultBoxType || 2001 }
    case 'fish':
      return { maxCount: s.fishCount || 100, fishType: s.defaultFishType || 2 }
    case 'recruit':
      return { maxCount: s.recruitCount || 10 }
    case 'smartSendCar':
      return {
        thresholds: {
          gold: s.carGoldThreshold || 500,
          recruit: s.carRecruitThreshold || 3,
          jade: s.carJadeThreshold || 500,
          ticket: s.carTicketThreshold || 4,
        },
        assignHelper: true,
      }
    case 'dreamShop':
      return { purchaseList: getDefaultDreamBuyList() }
  }
  return {}
}

function getDefaultDreamBuyList() {
  const list = []
  for (const merchantId in dreamGoldItems) {
    dreamGoldItems[merchantId].forEach(idx => list.push(`${merchantId}-${idx}`))
  }
  return list
}

function toggleDreamItem(itemKey, checked) {
  const cfg = taskConfig('dreamShop')
  if (checked) {
    if (!cfg.purchaseList.includes(itemKey)) cfg.purchaseList.push(itemKey)
  } else {
    cfg.purchaseList = cfg.purchaseList.filter(k => k !== itemKey)
  }
}

function selectDreamGoldItems() {
  const cfg = taskConfig('dreamShop')
  const set = new Set(cfg.purchaseList)
  for (const merchantId in dreamGoldItems) {
    dreamGoldItems[merchantId].forEach(idx => set.add(`${merchantId}-${idx}`))
  }
  cfg.purchaseList = Array.from(set)
}

function selectAllDreamItems() {
  const cfg = taskConfig('dreamShop')
  const set = new Set()
  for (const merchantId in dreamMerchantConfig) {
    dreamMerchantConfig[merchantId].items.forEach((_, idx) => set.add(`${merchantId}-${idx}`))
  }
  cfg.purchaseList = Array.from(set)
}

function clearDreamItems() {
  const cfg = taskConfig('dreamShop')
  if (cfg) cfg.purchaseList = []
}

function parseTaskList(list) {
  try {
    return typeof list === 'string' ? JSON.parse(list) : (list || [])
  } catch {
    return []
  }
}

function buildTaskList() {
  return form.value.selectedTasks.map(key => {
    if (configurableOps.includes(key)) {
      const cfg = form.value.taskList.find(t => t.op === key)
      return cfg ? { ...cfg } : { op: key, ...defaultConfig(key) }
    }
    return { op: key }
  })
}

async function saveSchedule() {
  if (!form.value.name) {
    toast.show('请输入任务名称')
    return
  }
  if (form.value.runType === 'daily' && !form.value.runTime) {
    toast.show('请选择运行时间')
    return
  }
  if (form.value.runType === 'cron') {
    if (!form.value.cronExpression) {
      toast.show('请输入Cron表达式')
      return
    }
    const validation = validateCronExpression(form.value.cronExpression)
    if (!validation.valid) {
      toast.show(validation.message)
      return
    }
  }
  if (form.value.selectedTokens.length === 0) {
    toast.show('请选择至少一个账号')
    return
  }
  if (form.value.selectedTasks.length === 0) {
    toast.show('请选择至少一个任务')
    return
  }

  const body = {
    name: form.value.name,
    scheduleType: form.value.runType === 'daily' ? 'fixed' : 'cron',
    cronExpression: form.value.runType === 'cron' ? form.value.cronExpression : '',
    fixedTime: form.value.runType === 'daily' ? form.value.runTime : '',
    taskList: buildTaskList(),
    accountIds: form.value.selectedTokens.join(','),
    maxActive: form.value.maxActive,
    enabled: form.value.enabled,
  }

  try {
    if (editingSchedule.value) {
      await api.put(`/api/tasks/${editingSchedule.value.id}`, body)
      toast.show('定时任务已更新')
    } else {
      await api.post('/api/tasks', body)
      toast.show('定时任务已创建')
    }
    await loadSchedules()
    closeEditModal()
    emit('refresh')
  } catch (e) {
    toast.show('保存失败: ' + e.message)
  }
}

async function toggleEnabled(s, enabled) {
  try {
    await api.put(`/api/tasks/${s.id}`, { enabled })
    s.enabled = enabled
    toast.show(`定时任务已${enabled ? '启用' : '禁用'}`)
  } catch (e) {
    toast.show('操作失败: ' + e.message)
  }
}

async function deleteSchedule(s) {
  if (!confirm(`确定删除定时任务 "${s.name}" 吗？`)) return
  try {
    await api.del(`/api/tasks/${s.id}`)
    schedules.value = schedules.value.filter(item => item.id !== s.id)
    toast.show('定时任务已删除')
    emit('refresh')
  } catch (e) {
    toast.show('删除失败: ' + e.message)
  }
}

async function runScheduleNow(s) {
  if (executingIds.value.has(s.id)) return
  executingIds.value.add(s.id)
  toast.show(`开始执行任务: ${s.name}`)
  try {
    const ids = s.account_ids === '*' ? internalAccounts.value.map(a => a.id) : (s.account_ids || '').split(',').filter(Boolean)
    const tasks = parseTaskList(s.task_list)
    for (const task of tasks) {
      const key = typeof task === 'string' ? task : (task?.op || task?.key)
      const config = typeof task === 'object' ? task : {}
      await runTaskForAccounts(key, ids, config)
    }
    toast.show(`任务 ${s.name} 执行完成`)
  } catch (e) {
    toast.show('执行失败: ' + e.message)
  } finally {
    executingIds.value.delete(s.id)
  }
}

async function runTaskForAccounts(operation, ids, config) {
  if (operation === 'connect') {
    for (const id of ids) await api.post(`/api/control/connect/${id}`)
    return
  }
  if (operation === 'disconnect') {
    for (const id of ids) await api.post(`/api/control/disconnect/${id}`)
    return
  }
  // daily 走专用接口（taskRunner 自管槽位/连接，仅用 batchEngine 跟踪状态）
  // 其他操作走 batchEngine.run（自带槽位/连接管理）
  let res
  if (operation === 'daily') {
    res = await api.post('/api/control/run-daily-batch', { accountIds: ids })
  } else {
    const body = { accountIds: ids }
    if (operation === 'chest') {
      body.maxCount = config.maxCount
      body.boxId = config.boxId
    } else if (operation === 'fish') {
      body.maxCount = config.maxCount
      body.fishType = config.fishType
    } else if (operation === 'recruit') {
      body.maxCount = config.maxCount
    } else if (operation === 'smartSendCar') {
      body.thresholds = config.thresholds
      body.assignHelper = config.assignHelper
    } else if (operation === 'dreamShop') {
      body.purchaseList = config.purchaseList
    }
    res = await api.post(`/api/batch/run-all/${operation}`, body)
  }
  if (res?.runId) {
    await waitForRunComplete(res.runId)
  }
}

async function waitForRunComplete(runId) {
  while (true) {
    await new Promise(r => setTimeout(r, 1500))
    let status
    try {
      status = await api.get(`/api/batch/status/${runId}`)
    } catch {
      break
    }
    if (status?.completedAt) break
  }
}

function exportTasks() {
  try {
    const validIds = new Set(internalAccounts.value.map(a => a.id))
    const data = {
      version: '1.0',
      exportTime: new Date().toISOString(),
      schedules: schedules.value.map(s => ({
        ...s,
        account_ids: s.account_ids === '*' ? internalAccounts.value.map(a => a.id).join(',') : s.account_ids,
      })).filter(s => {
        const ids = (s.account_ids || '').split(',').filter(Boolean)
        return ids.some(id => validIds.has(id))
      }),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `niaoge_schedules_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.show(`导出成功: ${data.schedules.length} 个定时任务`)
  } catch (e) {
    toast.show('导出失败: ' + e.message)
  }
}

async function importTasks(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    if (!data.schedules || !Array.isArray(data.schedules)) {
      toast.show('无效的配置文件格式')
      return
    }
    const validIds = new Set(internalAccounts.value.map(a => a.id))
    let count = 0
    for (const s of data.schedules) {
      const ids = (s.account_ids || '').split(',').filter(id => validIds.has(id))
      if (ids.length === 0) continue
      const body = {
        name: s.name || '导入任务',
        scheduleType: s.schedule_type || 'fixed',
        cronExpression: s.cron_expression || '',
        fixedTime: s.fixed_time || '06:00',
        taskList: parseTaskList(s.task_list),
        accountIds: ids.join(','),
        maxActive: s.max_active || 2,
        enabled: s.enabled !== false,
      }
      if (body.scheduleType === 'cron' && !body.cronExpression) continue
      await api.post('/api/tasks', body)
      count++
    }
    await loadSchedules()
    toast.show(`导入成功: ${count} 个定时任务`)
    emit('refresh')
  } catch (err) {
    toast.show('导入失败: ' + err.message)
  } finally {
    e.target.value = ''
  }
}

function formatAccountIds(accountIds) {
  if (accountIds === '*') return internalAccounts.value.length
  return (accountIds || '').split(',').filter(Boolean).length
}

function formatTaskList(list) {
  try {
    const tasks = typeof list === 'string' ? JSON.parse(list) : list
    const labels = Object.fromEntries(allOps.value.map(o => [o.key, o.label]))
    return (tasks || []).map(t => {
      const key = typeof t === 'string' ? t : (t?.op || t?.key || '')
      return labels[key] || key
    }).join(' → ')
  } catch {
    return list
  }
}
</script>

<style scoped>
/* === 设计变量（参考 xyzw / Naive UI 风格）=== */
.schedule-manager {
  --n-primary: #6366f1;
  --n-primary-hover: #4f46e5;
  --n-primary-soft: #e0e7ff;
  --n-success: #18a058;
  --n-success-hover: #158f4f;
  --n-success-bg: rgba(24, 160, 88, 0.12);
  --n-error: #d03050;
  --n-error-hover: #b92a45;
  --n-error-bg: rgba(208, 48, 80, 0.12);
  --n-warning: #f0a020;
  --n-warning-hover: #dc911c;
  --n-warning-bg: rgba(240, 160, 32, 0.12);
  --n-info: #2080f0;
  --n-info-hover: #1a6fd6;
  --n-info-bg: rgba(32, 128, 240, 0.12);
  --n-text: #1f2937;
  --n-text-secondary: #6b7280;
  --n-text-tertiary: #9ca3af;
  --n-border: #e5e7eb;
  --n-border-hover: #d1d5db;
  --n-bg: #ffffff;
  --n-bg-secondary: #f5f7fa;
  --n-bg-tertiary: #f3f4f6;
  --n-radius: 8px;
  --n-radius-sm: 6px;
  --n-shadow: 0 1px 2px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.1);
  --n-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  margin-bottom: 16px;
}

/* === 顶部汇总条（xyzw 风格：白底灰边信息栏 + 主色按钮）=== */
.schedule-summary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding: 14px 16px;
  background: var(--n-bg);
  border: 1px solid var(--n-border);
  border-radius: var(--n-radius);
  box-shadow: var(--n-shadow);
  border-left: 4px solid var(--n-primary);
}

.summary-left {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.summary-count {
  font-size: 15px;
  font-weight: 700;
  color: var(--n-text);
  display: flex;
  align-items: center;
  gap: 6px;
}

.summary-countdown {
  font-size: 13px;
  font-weight: 600;
  color: var(--n-info);
  background: var(--n-info-bg);
  padding: 5px 10px;
  border-radius: 6px;
}

.summary-countdown.near {
  color: var(--n-error);
  background: var(--n-error-bg);
  animation: pulse 1.5s infinite;
}

.summary-empty {
  font-size: 13px;
  color: var(--n-text-tertiary);
  background: var(--n-bg-secondary);
  padding: 5px 10px;
  border-radius: 6px;
}

.summary-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* === Naive UI 风格按钮 === */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px 14px;
  border: none;
  border-radius: var(--n-radius);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all .15s ease;
  white-space: nowrap;
  user-select: none;
  line-height: 1;
}

.btn:active { transform: scale(0.98); }
.btn:disabled { opacity: .5; cursor: not-allowed; transform: none; }

.btn-sm { padding: 6px 10px; font-size: 12px; }
.btn-xs { padding: 4px 8px; font-size: 11px; border-radius: var(--n-radius-sm); }

.btn-primary {
  background: var(--n-primary);
  color: #fff;
}
.btn-primary:hover:not(:disabled) { background: var(--n-primary-hover); }

.btn-default {
  background: var(--n-bg);
  color: var(--n-text);
  border: 1px solid var(--n-border);
}
.btn-default:hover:not(:disabled) { border-color: var(--n-primary); color: var(--n-primary); background: var(--n-primary-soft); }

.btn-success {
  background: var(--n-success);
  color: #fff;
}
.btn-success:hover:not(:disabled) { background: var(--n-success-hover); }

.btn-error {
  background: var(--n-error);
  color: #fff;
}
.btn-error:hover:not(:disabled) { background: var(--n-error-hover); }

.btn-warning {
  background: var(--n-warning);
  color: #fff;
}
.btn-warning:hover:not(:disabled) { background: var(--n-warning-hover); }

.btn-info {
  background: var(--n-info);
  color: #fff;
}
.btn-info:hover:not(:disabled) { background: var(--n-info-hover); }

/* === 弹窗（Naive UI modal-card 风格）=== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  backdrop-filter: blur(2px);
}

.modal-card {
  background: var(--n-bg);
  width: 100%;
  max-width: 600px;
  border-radius: var(--n-radius);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  overflow: hidden;
  animation: modalIn .25s ease;
}

.unified-modal { max-width: 640px; }

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--n-border);
  background: var(--n-bg);
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--n-text);
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-close {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--n-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all .15s;
}

.modal-close:hover {
  background: var(--n-bg-secondary);
  color: var(--n-text);
}

.modal-body {
  overflow-y: auto;
  padding: 18px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--n-border);
}

@keyframes modalIn {
  from { opacity: 0; transform: translateY(-12px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* === 任务列表项 === */
.task-list-item {
  margin-bottom: 12px;
  padding: 14px 16px;
  border: 1px solid var(--n-border);
  border-radius: var(--n-radius);
  background: var(--n-bg);
  border-left: 4px solid var(--n-primary);
  transition: all .15s ease;
}

.task-list-item:hover {
  box-shadow: var(--n-shadow-md);
  border-color: var(--n-border-hover);
}

.task-list-item.disabled {
  border-left-color: var(--n-border-hover);
  background: var(--n-bg-secondary);
}

.task-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.task-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.task-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.task-status-dot.active { background: var(--n-success); box-shadow: 0 0 0 3px var(--n-success-bg); }
.task-status-dot.inactive { background: var(--n-text-tertiary); }

.task-name {
  font-weight: 700;
  font-size: 15px;
  color: var(--n-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-list-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
  margin-bottom: 8px;
}

.task-list-row {
  font-size: 13px;
  color: var(--n-text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.task-list-row.task-tasks-row {
  grid-column: 1 / -1;
  display: flex;
  gap: 6px;
}

.task-list-label {
  color: var(--n-text-tertiary);
  flex-shrink: 0;
}

.task-list-value {
  color: var(--n-text);
  min-width: 0;
}

.task-flow {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-countdown {
  font-weight: 600;
  color: var(--n-info);
  background: var(--n-info-bg);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.task-countdown.near {
  color: var(--n-error);
  background: var(--n-error-bg);
}

.task-list-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.task-type-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.task-type-badge.fixed {
  background: var(--n-info-bg);
  color: var(--n-info);
}

.task-type-badge.cron {
  background: #ede9fe;
  color: #7c3aed;
}

/* === 表单 === */
.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--n-text-secondary);
}

.setting-label.sub {
  font-size: 12px;
  font-weight: 500;
  color: var(--n-text-tertiary);
}

.input-group input,
.input-group select,
.input-group textarea {
  width: 100%;
  padding: 8px 12px;
  background: var(--n-bg);
  border: 1px solid var(--n-border);
  border-radius: var(--n-radius);
  font-size: 14px;
  color: var(--n-text);
  outline: none;
  transition: border-color .2s, box-shadow .2s;
  font-family: inherit;
  line-height: 1.4;
}

.input-group input:focus,
.input-group select:focus,
.input-group textarea:focus {
  border-color: var(--n-primary);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12);
}

.input-group input::placeholder { color: var(--n-text-tertiary); }

/* === 选择区域 === */
.selection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.selection-actions {
  display: flex;
  gap: 6px;
}

.checkbox-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--n-border);
  border-radius: var(--n-radius-sm);
  background: var(--n-bg);
  cursor: pointer;
  transition: all .15s ease;
  font-size: 13px;
  color: var(--n-text);
  min-width: 0;
}

.checkbox-item:hover {
  border-color: var(--n-primary);
  background: var(--n-primary-soft);
}

.checkbox-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--n-primary);
  flex-shrink: 0;
  margin: 0;
}

.checkbox-item:has(input:checked) {
  border-color: var(--n-primary);
  background: var(--n-primary-soft);
  color: var(--n-primary);
  font-weight: 600;
}

.account-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-server {
  font-size: 10px;
  color: var(--n-text-secondary);
  background: var(--n-bg-secondary);
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}

.account-empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 18px;
  color: var(--n-text-tertiary);
  font-size: 13px;
  background: var(--n-bg-secondary);
  border-radius: var(--n-radius);
  border: 1px dashed var(--n-border);
}

/* === Tab === */
.tab-bar {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--n-bg-secondary);
  border-radius: var(--n-radius-sm);
  margin-bottom: 10px;
  overflow-x: auto;
}

.tab-btn {
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: var(--n-text-secondary);
  cursor: pointer;
  transition: all .15s;
}

.tab-btn:hover { color: var(--n-text); }

.tab-btn.active {
  background: var(--n-bg);
  color: var(--n-primary);
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}

/* === 单选 === */
.radio-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--n-radius-sm);
  border: 1px solid var(--n-border);
  background: var(--n-bg);
  cursor: pointer;
  font-size: 13px;
  transition: all .15s;
  flex: 1;
  justify-content: center;
  color: var(--n-text);
}

.radio-item:hover {
  border-color: var(--n-primary);
  background: var(--n-primary-soft);
}

.radio-item:has(input:checked) {
  border-color: var(--n-primary);
  background: var(--n-primary-soft);
  color: var(--n-primary);
  font-weight: 600;
}

/* === 配置面板 === */
.config-panel {
  padding: 14px;
  border-radius: var(--n-radius);
  background: var(--n-bg-secondary);
  border: 1px solid var(--n-border);
}

.config-panel-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--n-text);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--n-border);
}

.config-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.config-row.four {
  grid-template-columns: 1fr 1fr 1fr 1fr;
}

.checkbox-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--n-border);
  border-radius: var(--n-radius-sm);
  cursor: pointer;
  font-size: 13px;
  user-select: none;
  margin-top: 8px;
  background: var(--n-bg);
  color: var(--n-text-secondary);
}

.checkbox-tag input {
  margin: 0;
  width: 14px;
  height: 14px;
  accent-color: var(--n-primary);
}

.checkbox-tag:has(input:checked) {
  border-color: var(--n-primary);
  background: var(--n-primary-soft);
  color: var(--n-primary);
  font-weight: 600;
}

.dream-merchant-block {
  margin-bottom: 12px;
}

.dream-merchant-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--n-text);
  margin-bottom: 6px;
}

.dream-shop-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

/* === Cron 解析 === */
.cron-parser {
  margin-top: 10px;
  padding: 12px;
  border-radius: var(--n-radius);
  background: var(--n-bg-secondary);
  border: 1px solid var(--n-border);
}

.cron-validation {
  font-size: 13px;
  margin-bottom: 8px;
  padding: 6px 10px;
  border-radius: var(--n-radius-sm);
  font-weight: 600;
}

.cron-validation.success {
  color: var(--n-success);
  background: var(--n-success-bg);
}

.cron-validation.error {
  color: var(--n-error);
  background: var(--n-error-bg);
}

.cron-next-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
  color: var(--n-text-secondary);
}

.cron-next-runs ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--n-text);
}

.cron-next-runs li {
  margin-bottom: 4px;
}

/* === 开关 === */
.toggle {
  position: relative;
  display: inline-block;
  width: 42px;
  height: 22px;
  flex-shrink: 0;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--n-border-hover);
  border-radius: 22px;
  transition: .25s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: .25s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}

.toggle input:checked + .toggle-slider { background: var(--n-success); }
.toggle input:checked + .toggle-slider::before { transform: translateX(20px); }

/* === 空状态 === */
.empty-tip {
  text-align: center;
  padding: 32px 20px;
  color: var(--n-text-tertiary);
  font-size: 14px;
  background: var(--n-bg-secondary);
  border-radius: var(--n-radius);
  border: 1px dashed var(--n-border);
  display: flex;
  flex-direction: column;
  align-items: center;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .7; }
}

/* === 响应式 === */
@media (max-width: 640px) {
  .schedule-summary-bar {
    flex-direction: column;
    align-items: flex-start;
  }
  .summary-actions {
    width: 100%;
  }
  .summary-actions .btn {
    flex: 1;
  }
  .task-list-grid {
    grid-template-columns: 1fr;
  }
  .checkbox-grid {
    grid-template-columns: 1fr;
  }
  .config-row,
  .config-row.four {
    grid-template-columns: 1fr;
  }
  .dream-shop-grid {
    grid-template-columns: 1fr 1fr;
  }
  .modal-actions {
    flex-direction: column-reverse;
  }
  .modal-actions .btn {
    width: 100%;
  }
}
</style>
