<template>
  <div class="container">
    <div class="page-header">
      <h1>任务中心</h1>
    </div>

    <!-- 标签切换 -->
    <div class="tab-bar">
      <button class="tab-item" :class="{ active: tab === 'batch' }" @click="tab = 'batch'">批量日常</button>
      <button class="tab-item" :class="{ active: tab === 'schedule' }" @click="tab = 'schedule'">定时调度</button>
      <button class="tab-item" :class="{ active: tab === 'logs' }" @click="tab = 'logs'">执行日志</button>
    </div>

    <!-- ========== 批量执行 ========== -->
    <template v-if="tab === 'batch'">
      <div class="card">
        <div class="card-header">
          <div class="card-title">选择账号</div>
          <span style="font-size:12px;color:var(--primary);font-weight:600">已选 {{ selectedCount }}</span>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
          <button class="btn btn-outline btn-xs" @click="selectAll">{{ batchAll ? '取消全选' : '全选' }}</button>
          <button class="btn btn-outline btn-xs" @click="selectOnline">仅在线</button>
          <button class="btn btn-ghost btn-xs" style="color:var(--text-muted)" @click="selectedIds = new Set()">清空</button>
        </div>
        <div v-if="batchAccounts.length === 0" style="font-size:13px;color:var(--text-muted);text-align:center;padding:16px">
          暂无账号，请先<a href="/accounts" style="color:var(--primary)">添加账号</a>
        </div>
        <div v-else style="display:flex;flex-wrap:wrap;gap:6px;max-height:140px;overflow-y:auto">
          <span v-for="a in batchAccounts" :key="a.id"
            @click="toggleSelect(a.id)"
            :style="{
              cursor:'pointer', fontSize:'12px', padding:'4px 10px', borderRadius:'16px',
              fontWeight:500, display:'inline-flex', alignItems:'center', gap:'4px',
              transition:'all .12s',
              background: selectedIds.has(a.id) ? 'var(--primary)' : 'var(--bg-hover)',
              color: selectedIds.has(a.id) ? '#fff' : 'var(--text-sub)',
              border: selectedIds.has(a.id) ? '1.5px solid var(--primary)' : '1.5px solid transparent',
            }"
          >
            <span class="status-dot" :class="a.status === 'connected' ? 'online' : 'offline'" style="width:6px;height:6px;flex-shrink:0"></span>
            <span v-if="selectedIds.has(a.id)">✓</span>
            {{ a.name || a.id?.slice(0,8) }}
          </span>
        </div>
      </div>

      <div v-for="group in operationGroups" :key="group.title" class="card">
        <div class="card-title" style="font-size:15px">{{ group.title }}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button v-for="op in group.ops" :key="op.key"
            class="btn btn-outline btn-sm" :disabled="selectedCount === 0"
            @click="handleBatchOp(op.key, op.label)"
          >{{ op.label }}</button>
        </div>
      </div>
    </template>

    <!-- 数量输入弹窗 -->
    <div v-if="showCountInput" class="modal-overlay" @click.self="cancelCountInput">
      <div class="modal-card" style="max-width:320px">
        <div style="font-weight:700;font-size:16px;margin-bottom:16px">{{ countLabel }}</div>
        <div class="input-group">
          <label>{{ countConfig[countOperation]?.label || '数量' }}</label>
          <input type="number" v-model.number="countValue" min="1" @keyup.enter="confirmCountInput" />
        </div>
        <div v-if="countConfig[countOperation]?.options" class="input-group">
          <label>{{ countConfig[countOperation]?.optionsLabel }}</label>
          <select v-model.number="selectedOption">
            <option v-for="opt in countConfig[countOperation]?.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-sm btn-outline" @click="cancelCountInput">取消</button>
          <button class="btn btn-sm btn-primary" @click="confirmCountInput">确定</button>
        </div>
      </div>
    </div>

    <!-- ========== 定时调度 ========== -->
    <template v-if="tab === 'schedule'">
      <div class="card">
        <div class="card-title">Cron 预设</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button v-for="p in presets" :key="p.label"
            class="btn btn-outline btn-xs"
            @click="newSchedule.cronExpression = p.cronExpression; newSchedule.name = p.label"
          >{{ p.label }}</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">新建调度</div>
        <div class="input-group">
          <label>名称</label>
          <input v-model="newSchedule.name" placeholder="例：每日凌晨执行" />
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
        <button class="btn btn-primary" :disabled="!newSchedule.name || !newSchedule.cronExpression" @click="createSchedule">
          创建调度
        </button>
      </div>

      <div v-if="schedules.length === 0" class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" width="40" height="40"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <p>暂无定时任务</p>
      </div>

      <div v-for="s in schedules" :key="s.id" class="card" style="padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div>
            <div style="font-weight:600;font-size:14px">{{ s.name || s.id }}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">{{ s.task_list || s.type || '' }}</div>
          </div>
          <button class="btn btn-ghost btn-xs" style="color:var(--danger)" @click="deleteSchedule(s)">删除</button>
        </div>
        <code style="font-size:13px;color:var(--primary);background:var(--primary-light);padding:4px 10px;border-radius:6px">{{ s.cron_expression }}</code>
      </div>
    </template>

    <!-- ========== 日志 ========== -->
    <template v-if="tab === 'logs'">
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn btn-sm" :class="sseOn ? 'btn-primary' : 'btn-outline'" @click="toggleSSE">
          <span :class="sseOn ? 'status-dot online' : 'status-dot offline'" style="width:6px;height:6px"></span>
          {{ sseOn ? 'SSE 监听中' : '开始监听' }}
        </button>
        <button class="btn btn-sm btn-outline" @click="loadLogs">刷新</button>
        <button class="btn btn-sm btn-outline" @click="logs = []" style="color:var(--danger)">清屏</button>
      </div>

      <div v-if="logs.length === 0" class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" width="40" height="40"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <p>暂无日志</p>
        <p style="font-size:12px">点击「开始监听」接收实时日志</p>
      </div>

      <div v-for="(log, i) in logs" :key="i" class="log-entry" :class="'log-' + (log.level || 'info')">
        <div class="log-time">{{ log.time }}</div>
        <div class="log-msg">{{ log.msg || log.message }}</div>
      </div>
    </template>

    <!-- 梦境商品购买配置弹窗 -->
    <div v-if="showDreamBuyModal" class="modal-overlay" @click.self="cancelDreamBuy">
      <div class="modal-card" style="max-width:420px;max-height:80vh;display:flex;flex-direction:column">
        <div style="font-weight:700;font-size:16px;margin-bottom:12px">{{ dreamBuyLabel }} - 购买配置</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">请勾选需要购买的商品，只对当前商人列表中存在的商品生效。</div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button class="btn btn-xs btn-warning" @click="selectDreamGoldItems">一键勾选金币商品</button>
          <button class="btn btn-xs btn-outline" @click="selectAllDreamItems">全选</button>
          <button class="btn btn-xs btn-outline" @click="clearDreamItems">清空</button>
        </div>
        <div style="overflow-y:auto;flex:1">
          <div v-for="(merchant, id) in dreamMerchantConfig" :key="id" style="margin-bottom:14px">
            <div style="font-weight:600;font-size:14px;margin-bottom:6px">{{ merchant.name }}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
              <label v-for="(item, index) in merchant.items" :key="index" class="checkbox-item">
                <input type="checkbox" :value="`${id}-${index}`" :checked="dreamBuyList.includes(`${id}-${index}`)" @change="e => toggleDreamItem(`${id}-${index}`, e.target.checked)" />
                <span style="font-size:12px">{{ item }}</span>
              </label>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-sm btn-outline" @click="cancelDreamBuy">取消</button>
          <button class="btn btn-sm btn-primary" @click="confirmDreamBuy">保存并执行</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
const tab = ref('batch')

// --- 批量执行 ---
const batchAccounts = ref([])
const selectedIds = ref(new Set())
const selectedCount = computed(() => selectedIds.value.size)
const batchAll = computed(() => batchAccounts.value.length > 0 && selectedCount === batchAccounts.value.length)

const operationGroups = [
  { title: '📦 副本', ops: [
    { key: 'dungeonBaoku13', label: '宝库1-3' },
    { key: 'dungeonBaoku45', label: '宝库4-5' },
    { key: 'dungeonMengjing', label: '咸王梦境' },
    { key: 'dungeonBuyDreamItems', label: '梦境商店' },
  ]},
  { title: '🗼 爬塔', ops: [
    { key: 'towerClimb', label: '咸将塔' },
    { key: 'towerClimbWeird', label: '怪异塔' },
    { key: 'towerClaimFreeEnergy', label: '免费道具' },
  ]},
  { title: '🚗 发车', ops: [
    { key: 'carSmartSend', label: '智能发车' },
    { key: 'carClaimAll', label: '一键收车' },
  ]},
  { title: '📦 资源', ops: [
    { key: 'itemOpenBox', label: '批量开箱' },
    { key: 'itemClaimBoxPoint', label: '宝箱积分' },
    { key: 'itemFish', label: '批量钓鱼' },
    { key: 'itemRecruit', label: '批量招募' },
    { key: 'itemGenieSweep', label: '灯神扫荡' },
    { key: 'itemClaimPeach', label: '蟠桃园' },
    { key: 'itemHeroUpgrade', label: '英雄升星' },
    { key: 'itemBookUpgrade', label: '图鉴升星' },
    { key: 'itemClaimBookReward', label: '图鉴奖励' },
  ]},
  { title: '📚 功法', ops: [
    { key: 'legacyClaim', label: '领取残卷' },
    { key: 'legacyGiftSend', label: '赠送残卷' },
  ]},
  { title: '📅 月度', ops: [
    { key: 'monthlyTopUpFish', label: '钓鱼补齐' },
    { key: 'monthlyTopUpArena', label: '竞技场补齐' },
  ]},
  { title: '🏛 俱乐部', ops: [
    { key: 'clubSignin', label: '签到' },
    { key: 'clubResearch', label: '研究' },
    { key: 'clubApproveAll', label: '审批申请' },
    { key: 'clubSignupMatch', label: '排位报名' },
    { key: 'clubWarGuess', label: '月赛助威' },
  ]},
  { title: '🏪 商店', ops: [
    { key: 'storeFourGuardians', label: '四圣碎片' },
    { key: 'storeSkinCoins', label: '皮肤币' },
    { key: 'storeQuickPurchase', label: '黑市采购' },
    { key: 'storeCollectionFree', label: '珍宝阁' },
  ]},
]

const countOps = ['itemOpenBox', 'itemFish', 'itemRecruit']
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
const countConfig = {
  itemOpenBox: { label: '开箱数量', field: 'maxCount', default: 100, options: boxTypes, optionsField: 'boxId', optionsLabel: '宝箱类型', optionsDefault: 2001 },
  itemFish: { label: '钓鱼次数', field: 'maxCount', default: 100, options: fishTypes, optionsField: 'fishType', optionsLabel: '鱼竿类型', optionsDefault: 2 },
  itemRecruit: { label: '招募次数', field: 'maxCount', default: 10 },
}

const showCountInput = ref(false)
const countOperation = ref('')
const countLabel = ref('')
const countValue = ref(0)
const selectedOption = ref(2001)
const pendingCountResolve = ref(null)

const dreamMerchantConfig = {
  1: { name: '初级商人', items: ['进阶石', '精铁', '木质宝箱', '青铜宝箱', '普通鱼竿', '咸神门票', '咸神火把'] },
  2: { name: '中级商人', items: ['梦魇晶石', '进阶石', '精铁', '黄金宝箱', '黄金鱼竿', '招募令', '橙将碎片', '紫将碎片'] },
  3: { name: '高级商人', items: ['梦魇晶石', '铂金宝箱', '黄金鱼竿', '招募令', '红将碎片', '橙将碎片', '红将碎片', '普通鱼竿'] },
}
const dreamGoldItems = { 1: [5, 6], 2: [6, 7], 3: [5, 6, 7] }
const dreamBuyOps = ['dungeonBuyDreamItems']
const dreamStorageKey = 'dreamPurchaseList'

const showDreamBuyModal = ref(false)
const dreamBuyList = ref([])
const dreamBuyLabel = ref('')
let pendingDreamResolve = null

function loadDreamBuyList() {
  try {
    const saved = localStorage.getItem(dreamStorageKey)
    if (saved) dreamBuyList.value = JSON.parse(saved)
    else dreamBuyList.value = getDefaultDreamBuyList()
  } catch {
    dreamBuyList.value = getDefaultDreamBuyList()
  }
}
function saveDreamBuyList() {
  try { localStorage.setItem(dreamStorageKey, JSON.stringify(dreamBuyList.value)) } catch {}
}
function getDefaultDreamBuyList() {
  const list = []
  for (const merchantId in dreamGoldItems) {
    dreamGoldItems[merchantId].forEach(idx => list.push(`${merchantId}-${idx}`))
  }
  return list
}

function toggleSelect(id) {
  const s = new Set(selectedIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedIds.value = s
}
function selectAll() {
  selectedIds.value = batchAll.value ? new Set() : new Set(batchAccounts.value.map(a => a.id))
}
function selectOnline() {
  selectedIds.value = new Set(batchAccounts.value.filter(a => a.status === 'connected').map(a => a.id))
}
async function runBatch(operation, label, extraBody = {}) {
  if (selectedCount.value === 0) return toast.show('请先选择账号')
  const accountIds = [...selectedIds.value]
  try {
    await api.post(`/api/batch/run-all/${operation}`, { accountIds, ...extraBody })
    toast.show(`已触发: ${accountIds.length}个账号`)
  } catch (e) {
    toast.show('执行失败: ' + e.message)
  }
}

async function handleBatchOp(operation, label) {
  if (countOps.includes(operation)) {
    const cfg = countConfig[operation]
    countOperation.value = operation
    countLabel.value = label
    countValue.value = cfg.default
    selectedOption.value = cfg.optionsDefault || 2001
    showCountInput.value = true
    const result = await new Promise((resolve) => {
      pendingCountResolve.value = resolve
    })
    pendingCountResolve.value = null
    if (result === null) return
    await runBatch(operation, label, result)
  } else if (dreamBuyOps.includes(operation)) {
    const result = await openDreamBuyModal(label)
    if (result === null) return
    await runBatch(operation, label, result)
  } else {
    await runBatch(operation, label)
  }
}

function openDreamBuyModal(label) {
  dreamBuyLabel.value = label
  loadDreamBuyList()
  showDreamBuyModal.value = true
  return new Promise((resolve) => {
    pendingDreamResolve = resolve
  })
}

function toggleDreamItem(itemKey, checked) {
  if (checked) {
    if (!dreamBuyList.value.includes(itemKey)) dreamBuyList.value.push(itemKey)
  } else {
    dreamBuyList.value = dreamBuyList.value.filter(k => k !== itemKey)
  }
}

function confirmDreamBuy() {
  saveDreamBuyList()
  showDreamBuyModal.value = false
  if (pendingDreamResolve) {
    pendingDreamResolve({ purchaseList: dreamBuyList.value })
    pendingDreamResolve = null
  }
}

function cancelDreamBuy() {
  showDreamBuyModal.value = false
  if (pendingDreamResolve) {
    pendingDreamResolve(null)
    pendingDreamResolve = null
  }
}

function selectDreamGoldItems() {
  const set = new Set(dreamBuyList.value)
  for (const merchantId in dreamGoldItems) {
    dreamGoldItems[merchantId].forEach(idx => set.add(`${merchantId}-${idx}`))
  }
  dreamBuyList.value = Array.from(set)
}

function selectAllDreamItems() {
  const set = new Set()
  for (const merchantId in dreamMerchantConfig) {
    dreamMerchantConfig[merchantId].items.forEach((_, idx) => set.add(`${merchantId}-${idx}`))
  }
  dreamBuyList.value = Array.from(set)
}

function clearDreamItems() {
  dreamBuyList.value = []
}

function confirmCountInput() {
  if (pendingCountResolve.value) {
    const cfg = countConfig[countOperation.value]
    const body = { [cfg.field]: Math.max(1, countValue.value || cfg.default) }
    if (cfg.options && cfg.optionsField) {
      body[cfg.optionsField] = selectedOption.value || cfg.optionsDefault
    }
    pendingCountResolve.value(body)
  }
  showCountInput.value = false
}

function cancelCountInput() {
  if (pendingCountResolve.value) pendingCountResolve.value(null)
  selectedOption.value = 2001
  showCountInput.value = false
}

// --- 定时调度 ---
const schedules = ref([])
const newSchedule = ref({ name: '', cronExpression: '', type: 'daily-all' })
const presets = [
  { label: '每天00:00', cronExpression: '0 0 * * *' },
  { label: '每天05:00', cronExpression: '0 5 * * *' },
  { label: '每天09:00', cronExpression: '0 9 * * *' },
  { label: '每天12:00', cronExpression: '0 12 * * *' },
  { label: '每天18:00', cronExpression: '0 18 * * *' },
  { label: '每天21:00', cronExpression: '0 21 * * *' },
  { label: '每4小时', cronExpression: '0 */4 * * *' },
]

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

// --- 日志 ---
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
    if (Array.isArray(data)) logs.value = data.reverse().map(l => ({ ...l, time: l.time || l.timestamp }))
  } catch { toast.show('加载日志失败') }
}
function toggleSSE() {
  sseOn.value ? stopSSE() : startSSE()
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

onMounted(async () => {
  try {
    batchAccounts.value = await api.get('/api/accounts') || []
    schedules.value = await api.get('/api/tasks') || []
    loadLogs()
    // 默认选中所有在线账号
    const onlineIds = batchAccounts.value.filter(a => a.status === 'connected').map(a => a.id)
    if (onlineIds.length) selectedIds.value = new Set(onlineIds)
  } catch { }
})
onUnmounted(stopSSE)
</script>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4); display: flex; align-items: center;
  justify-content: center; z-index: 1000;
}
.modal-card {
  background: var(--bg-card, #fff); border-radius: 12px;
  padding: 20px; width: 90%; max-width: 400px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
.checkbox-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px; border-radius: 6px;
  border: 1px solid var(--border, #e5e5e5);
  cursor: pointer; transition: background 0.15s;
}
.checkbox-item:hover { background: var(--bg-hover, #f5f5f5); }
.checkbox-item input { margin: 0; }
.input-group {
  display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;
}
.input-group label {
  font-size: 13px; color: var(--text-secondary, #666); font-weight: 500;
}
.input-group input, .input-group select {
  padding: 8px 12px; border: 1px solid var(--border, #e5e5e5);
  border-radius: 8px; font-size: 14px; outline: none;
  background: var(--bg-card, #fff);
}
.input-group input:focus, .input-group select:focus {
  border-color: var(--primary, #1677ff);
}
</style>