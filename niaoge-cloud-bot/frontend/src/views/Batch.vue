<template>
  <div class="container">
    <div class="page-header">
      <button class="btn-back" @click="$router.push('/')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span>批量操作</span>
    </div>

    <!-- 账号选择 -->
    <div class="card" style="padding:16px">
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
        <label class="toggle" style="font-size:14px;gap:6px;display:flex;align-items:center">
          <input type="checkbox" :checked="allSelected" :indeterminate="isIndeterminate" @change="toggleAll" />
          <span>全选</span>
        </label>
        <button class="btn btn-sm btn-outline" @click="selectConnected">选择已连接</button>
        <button class="btn btn-sm btn-outline" @click="showCarSettings = true">智能发车设置</button>
        <span style="font-size:13px;color:var(--text-muted);margin-left:auto">已选 {{ selectedIds.length }} 个账号</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div v-for="acc in accounts" :key="acc.id"
          class="account-check"
          :class="{ selected: selectedIds.includes(acc.id) }"
          @click="toggleAccount(acc.id)">
          <div class="account-check-left">
            <input type="checkbox" :checked="selectedIds.includes(acc.id)" @click.stop tabindex="-1" />
            <span style="font-size:13px">{{ acc.name || acc.id.slice(0,8) }}</span>
          </div>
          <span class="status-dot" :class="acc.status === 'connected' ? 'online' : 'offline'"></span>
        </div>
      </div>
    </div>

    <!-- 分类标签 -->
    <div class="tab-bar">
      <button v-for="cat in categories" :key="cat.key"
        class="tab-btn" :class="{ active: activeTab === cat.key }"
        @click="activeTab = cat.key">{{ cat.label }}</button>
    </div>

    <!-- 当前分类的功能按钮 -->
    <div class="card" style="padding:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button v-for="op in currentOps" :key="op.key"
          class="btn btn-sm" :class="op.danger ? 'btn-danger' : 'btn-outline'"
          @click="handleOpClick(op.key, op.label)"
          :disabled="selectedIds.length === 0 || running">
          {{ op.label }}
        </button>
      </div>
    </div>

    <!-- 执行日志 -->
    <div v-if="logs.length > 0" class="card" style="padding:12px;max-height:300px;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:700;font-size:14px">执行日志</span>
        <button class="btn btn-sm btn-outline" @click="logs = []">清空</button>
      </div>
      <div v-for="(log, i) in logs" :key="i" style="font-size:12px;padding:2px 0"
        :style="{ color: log.type === 'error' ? 'var(--danger)' : log.type === 'success' ? 'var(--success)' : 'var(--text-muted)' }">
        {{ log.message }}
      </div>
    </div>

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

    <!-- 智能发车设置弹窗 -->
    <div v-if="showCarSettings" class="modal-overlay" @click.self="showCarSettings = false">
      <div class="modal-card" style="max-width:420px">
        <div style="font-weight:700;font-size:16px;margin-bottom:16px">智能发车设置</div>

        <div style="font-size:13px;font-weight:600;margin-bottom:8px">保底停止条件（满足任一即发车）</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="input-group">
            <label>金砖 ≥</label>
            <input type="number" v-model.number="carSettings.goldThreshold" min="0" />
          </div>
          <div class="input-group">
            <label>招募令 ≥</label>
            <input type="number" v-model.number="carSettings.recruitThreshold" min="0" />
          </div>
          <div class="input-group">
            <label>白玉 ≥</label>
            <input type="number" v-model.number="carSettings.jadeThreshold" min="0" />
          </div>
          <div class="input-group">
            <label>刷新票 ≥</label>
            <input type="number" v-model.number="carSettings.ticketThreshold" min="0" />
          </div>
        </div>

        <div class="list-row" style="padding:12px 0">
          <div>
            <div style="font-weight:500;font-size:14px">自动分配护卫</div>
            <div style="font-size:12px;color:var(--text-muted)">红色/金色车辆自动分配俱乐部护卫</div>
          </div>
          <label class="toggle">
            <input type="checkbox" v-model="carSettings.assignHelper" />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-sm btn-outline" @click="showCarSettings = false">关闭</button>
          <button class="btn btn-sm btn-primary" @click="saveCarSettings">保存</button>
        </div>
      </div>
    </div>

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
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
const accounts = ref([])
const selectedIds = ref([])
const activeTab = ref('daily')
const running = ref(false)
const logs = ref([])

const showCarSettings = ref(false)
const carSettings = ref({
  goldThreshold: 500,
  recruitThreshold: 3,
  jadeThreshold: 500,
  ticketThreshold: 4,
  assignHelper: true,
})

const dreamMerchantConfig = {
  1: { name: '初级商人', items: ['进阶石', '精铁', '木质宝箱', '青铜宝箱', '普通鱼竿', '咸神门票', '咸神火把'] },
  2: { name: '中级商人', items: ['梦魇晶石', '进阶石', '精铁', '黄金宝箱', '黄金鱼竿', '招募令', '橙将碎片', '紫将碎片'] },
  3: { name: '高级商人', items: ['梦魇晶石', '铂金宝箱', '黄金鱼竿', '招募令', '红将碎片', '橙将碎片', '红将碎片', '普通鱼竿'] },
}
const dreamGoldItems = { 1: [5, 6], 2: [6, 7], 3: [5, 6, 7] }
const dreamBuyOps = ['dreamShop']
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

const countOps = ['chest', 'fish', 'recruit']
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
  chest: { label: '开箱数量', field: 'maxCount', default: 100, options: boxTypes, optionsField: 'boxId', optionsLabel: '宝箱类型', optionsDefault: 2001 },
  fish: { label: '钓鱼次数', field: 'maxCount', default: 100, options: fishTypes, optionsField: 'fishType', optionsLabel: '鱼竿类型', optionsDefault: 2 },
  recruit: { label: '招募次数', field: 'maxCount', default: 10 },
}

const showCountInput = ref(false)
const countOperation = ref('')
const countLabel = ref('')
const countValue = ref(0)
const selectedOption = ref(2001)
const pendingCountResolve = ref(null)

const allSelected = computed(() => accounts.value.length > 0 && selectedIds.value.length === accounts.value.length)
const isIndeterminate = computed(() => selectedIds.value.length > 0 && selectedIds.value.length < accounts.value.length)

const categories = [
  { key: 'daily', label: '日常' },
  { key: 'dungeon', label: '副本' },
  { key: 'baoku', label: '宝库' },
  { key: 'weirdTower', label: '怪异塔' },
  { key: 'resource', label: '资源' },
  { key: 'legacy', label: '功法' },
  { key: 'monthly', label: '月度' },
]

const allOps = {
  daily: [
    { key: 'claimHangUp', label: '领取挂机' },
    { key: 'addHangUpTime', label: '一键加钟' },
    { key: 'resetBottles', label: '重置罐子' },
    { key: 'claimBottles', label: '一键领罐子' },
    { key: 'clubSign', label: '俱乐部签到' },
    { key: 'study', label: '一键答题' },
    { key: 'arena', label: '竞技场3次' },
    { key: 'smartSendCar', label: '智能发车' },
    { key: 'claimCars', label: '一键收车' },
    { key: 'blackMarket', label: '黑市采购' },
    { key: 'treasurePavilion', label: '珍宝阁' },
    { key: 'genieSweep', label: '灯神扫荡' },
    { key: 'freeGacha', label: '免费扭蛋' },
  ],
  dungeon: [
    { key: 'tower', label: '一键爬塔' },
    { key: 'dream', label: '一键梦境' },
    { key: 'skinChallenge', label: '换皮闯关' },
    { key: 'peachTasks', label: '蟠桃园任务' },
    { key: 'dreamShop', label: '梦境商品' },
  ],
  baoku: [
    { key: 'baoku13', label: '宝库前3层' },
    { key: 'baoku45', label: '宝库4-5层' },
  ],
  weirdTower: [
    { key: 'weirdTower', label: '爬怪异塔' },
    { key: 'weirdTowerUseItems', label: '使用道具' },
    { key: 'weirdTowerMerge', label: '怪异塔合成' },
    { key: 'weirdTowerFreeEnergy', label: '免费道具' },
  ],
  resource: [
    { key: 'chest', label: '批量开箱' },
    { key: 'chestPoints', label: '宝箱积分' },
    { key: 'fish', label: '批量钓鱼' },
    { key: 'recruit', label: '批量招募' },
    { key: 'heroUpgrade', label: '英雄升星' },
    { key: 'bookUpgrade', label: '图鉴升星' },
    { key: 'fourSaints', label: '四圣碎片' },
    { key: 'skinCoins', label: '5皮肤币' },
  ],
  legacy: [
    { key: 'legacyClaim', label: '功法领取' },
    { key: 'legacyGift', label: '功法赠送' },
  ],
  monthly: [
    { key: 'topUpFish', label: '钓鱼补齐' },
    { key: 'topUpArena', label: '竞技场补齐' },
  ],
}

const currentOps = computed(() => allOps[activeTab.value] || [])

onMounted(async () => {
  try { accounts.value = await api.get('/api/accounts') || [] } catch {}
  loadCarSettings()
})

function loadCarSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      carSettings.value = { ...carSettings.value, ...parsed }
    }
  } catch {}
}

function saveCarSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(carSettings.value))
  showCarSettings.value = false
  toast.show('智能发车设置已保存')
}

function toggleAll() {
  if (allSelected.value) { selectedIds.value = []; return }
  selectedIds.value = accounts.value.map(a => a.id)
}

function selectConnected() {
  selectedIds.value = accounts.value.filter(a => a.status === 'connected').map(a => a.id)
}

function toggleAccount(id) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

async function handleOpClick(operation, label) {
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

async function runBatch(operation, label, extraBody = {}) {
  if (selectedIds.value.length === 0) return toast.show('请选择账号')
  running.value = true
  logs.value = []
  addLog(`开始执行 [${label}]，共 ${selectedIds.value.length} 个账号`)

  const body = operation === 'smartSendCar' ? {
    thresholds: {
      gold: carSettings.value.goldThreshold,
      recruit: carSettings.value.recruitThreshold,
      jade: carSettings.value.jadeThreshold,
      ticket: carSettings.value.ticketThreshold,
    },
    assignHelper: carSettings.value.assignHelper,
  } : extraBody

  for (const id of selectedIds.value) {
    const acc = accounts.value.find(a => a.id === id)
    const name = acc?.name || id.slice(0, 8)
    try {
      addLog(`[${name}] 执行中...`)
      await api.post(`/api/batch/${operation}/${id}`, body)
      addLog(`[${name}] 已触发`, 'success')
    } catch (e) {
      addLog(`[${name}] 失败: ${e.message}`, 'error')
    }
    await new Promise(r => setTimeout(r, 500))
  }

  addLog(`[${label}] 全部触发完成`, 'success')
  running.value = false
}

function addLog(message, type = 'info') {
  logs.value.push({ message: `${new Date().toLocaleTimeString()} ${message}`, type })
  if (logs.value.length > 200) logs.value.shift()
}
</script>

<style scoped>
.account-check {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; border-radius: 8px; cursor: pointer;
  background: var(--bg-body); transition: background 0.15s;
}
.account-check:hover { background: var(--bg-card-hover, #f0f0f0); }
.account-check.selected { background: var(--primary-light, rgba(22,119,255,0.08)); }
.account-check-left { display: flex; align-items: center; gap: 6px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; }
.status-dot.online { background: var(--success, #52c41a); }
.status-dot.offline { background: var(--text-muted, #999); }

.tab-bar {
  display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 0;
}
.tab-btn {
  flex-shrink: 0; padding: 6px 14px; border-radius: 20px;
  font-size: 13px; font-weight: 500; border: 1px solid var(--border, #e5e5e5);
  background: transparent; color: var(--text-secondary, #666); cursor: pointer;
  transition: all 0.15s;
}
.tab-btn.active {
  background: var(--primary, #1677ff); color: #fff; border-color: var(--primary, #1677ff);
}
.btn-danger { background: var(--danger, #ff4d4f); color: #fff; border-color: var(--danger, #ff4d4f); }

.checkbox-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px; border-radius: 6px;
  border: 1px solid var(--border, #e5e5e5);
  cursor: pointer; transition: background 0.15s;
}
.checkbox-item:hover { background: var(--bg-hover, #f5f5f5); }
.checkbox-item input { margin: 0; }

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
</style>
