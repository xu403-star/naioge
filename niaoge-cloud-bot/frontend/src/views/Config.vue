<template>
  <div class="container">
    <div class="page-header">
      <button class="btn-back" @click="$router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <h1>任务配置</h1>
    </div>

    <div v-if="loading" class="flex-center" style="padding:40px"><div class="spinner"></div></div>

    <div v-else-if="!selectedAcc">
      <div class="card">
        <div class="input-group">
          <label>选择账号</label>
          <select v-model="selectedAccId" @change="loadSettings">
            <option value="">— 请选择 —</option>
            <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name || a.id }}</option>
          </select>
        </div>
      </div>
    </div>

    <div v-else>
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="account-avatar" style="background:var(--primary)">{{ selectedAcc.name?.[0] || '#' }}</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:15px">{{ selectedAcc.name || selectedAcc.id }}</div>
            <div style="font-size:12px;color:var(--text-muted)">{{ selectedAcc.server || '' }}</div>
          </div>
          <!-- 模板选择 -->
          <div style="display:flex;gap:6px;align-items:center">
            <select v-model="selectedTemplateId" style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--border)">
              <option value="">使用自定义</option>
              <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
            <button class="btn btn-sm btn-outline" @click="applyTemplate" :disabled="!selectedTemplateId">应用</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">阵容配置</div>
        <div class="input-group">
          <label>竞技场阵容</label>
          <select v-model="settings.arenaFormation">
            <option v-for="n in 5" :key="n" :value="n">阵容{{ n }}</option>
          </select>
        </div>
        <div class="input-group">
          <label>BOSS阵容</label>
          <select v-model="settings.bossFormation">
            <option v-for="n in 5" :key="n" :value="n">阵容{{ n }}</option>
          </select>
        </div>
        <div class="input-group">
          <label>BOSS次数</label>
          <select v-model="settings.bossTimes">
            <option :value="0">不执行</option>
            <option :value="1">1次</option>
            <option :value="2">2次</option>
            <option :value="3">3次</option>
          </select>
        </div>
      </div>

      <div v-for="group in taskGroups" :key="group.title" class="card">
        <div class="card-title">{{ group.title }}</div>
        <div v-for="item in group.items" :key="item.key" class="list-row" style="padding:12px 0">
          <div style="flex:1;margin-right:16px">
            <div style="font-weight:500;font-size:14px">{{ item.label }}</div>
            <div style="font-size:12px;color:var(--text-muted)">{{ item.desc }}</div>
          </div>
          <label class="toggle">
            <input type="checkbox" v-model="settings[item.key]" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- 智能发车详细设置 -->
      <div v-if="settings.smartSendCarEnable" class="card">
        <div class="card-title">智能发车策略</div>

        <div style="font-size:13px;font-weight:600;margin-bottom:8px">保底停止条件（满足任一即发车）</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="input-group">
            <label>金砖 ≥</label>
            <input type="number" v-model.number="settings.carGoldThreshold" min="0" />
          </div>
          <div class="input-group">
            <label>招募令 ≥</label>
            <input type="number" v-model.number="settings.carRecruitThreshold" min="0" />
          </div>
          <div class="input-group">
            <label>白玉 ≥</label>
            <input type="number" v-model.number="settings.carJadeThreshold" min="0" />
          </div>
          <div class="input-group">
            <label>刷新票 ≥</label>
            <input type="number" v-model.number="settings.carTicketThreshold" min="0" />
          </div>
        </div>

        <div class="list-row" style="padding:12px 0">
          <div>
            <div style="font-weight:500;font-size:14px">自动分配护卫</div>
            <div style="font-size:12px;color:var(--text-muted)">红色/金色车辆自动分配俱乐部护卫</div>
          </div>
          <label class="toggle">
            <input type="checkbox" v-model="settings.carAssignHelper" />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary" style="flex:1" @click="save" :disabled="saving">
          {{ saving ? '保存中...' : '保存配置' }}
        </button>
        <button class="btn btn-outline" @click="showSaveTemplate = true">存为模板</button>
      </div>
    </div>

    <!-- 保存模板弹窗 -->
    <div v-if="showSaveTemplate" class="modal-overlay" @click.self="showSaveTemplate = false">
      <div class="modal-card">
        <div style="font-weight:700;font-size:16px;margin-bottom:16px">保存为任务模板</div>
        <div class="input-group">
          <label>模板名称</label>
          <input v-model="newTemplateName" placeholder="例如：日常精简版" />
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-sm btn-outline" @click="showSaveTemplate = false">取消</button>
          <button class="btn btn-sm btn-primary" @click="saveAsTemplate">保存</button>
        </div>
      </div>
    </div>

    <!-- 模板管理弹窗 -->
    <div v-if="showTemplateManager" class="modal-overlay" @click.self="showTemplateManager = false">
      <div class="modal-card" style="max-width:500px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div style="font-weight:700;font-size:16px">任务模板管理</div>
          <button class="btn btn-sm btn-outline" @click="showTemplateManager = false">关闭</button>
        </div>
        <div v-if="templates.length === 0" style="text-align:center;padding:24px;color:var(--text-muted)">暂无模板</div>
        <div v-for="t in templates" :key="t.id" class="template-item">
          <div>
            <div style="font-weight:600;font-size:14px">{{ t.name }}</div>
            <div style="font-size:11px;color:var(--text-muted)">{{ new Date(t.createdAt).toLocaleString() }}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-outline" @click="editTemplate(t)">编辑</button>
            <button class="btn btn-sm" style="background:var(--danger);color:#fff;border:none" @click="deleteTemplate(t.id)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const route = useRoute()
const toast = useToastStore()
const loading = ref(true)
const accounts = ref([])
const selectedAccId = ref('')
const selectedAcc = ref(null)
const settings = ref({})
const saving = ref(false)

// 模板相关
const templates = ref([])
const selectedTemplateId = ref('')
const showSaveTemplate = ref(false)
const showTemplateManager = ref(false)
const newTemplateName = ref('')
const editingTemplateId = ref(null)

const taskGroups = [
  { title: '基础活跃度任务', items: [
    { key: 'shareEnable', label: '分享游戏', desc: '每日分享一次获取活跃度' },
    { key: 'giveGoldEnable', label: '赠送金币', desc: '给好友赠送金币' },
    { key: 'freeRecruit', label: '免费招募', desc: '每日免费招募' },
    { key: 'payRecruit', label: '付费招募', desc: '每日付费招募' },
    { key: 'freeGoldEnable', label: '免费点金', desc: '每日免费点金3次' },
    { key: 'claimBottle', label: '盐罐', desc: '重置/领取盐罐奖励' },
    { key: 'openBox', label: '开宝箱', desc: '开启木质宝箱10个' },
    { key: 'fishingEnable', label: '钓鱼', desc: '每日免费钓鱼3次' },
    { key: 'freeGachaEnable', label: '免费扭蛋', desc: '每日免费扭蛋' },
  ]},
  { title: '奖励领取', items: [
    { key: 'claimHangUp', label: '挂机奖励', desc: '领取挂机收益并加钟' },
    { key: 'fixedRewardsEnable', label: '固定奖励', desc: '签到/俱乐部/礼包/珍宝阁' },
    { key: 'claimEmail', label: '邮件奖励', desc: '领取邮件附件' },
  ]},
  { title: '功能任务', items: [
    { key: 'arenaEnable', label: '竞技场', desc: '每天免费挑战3次' },
    { key: 'genieSweepEnable', label: '灯神扫荡', desc: '四国+深海灯神免费扫荡' },
    { key: 'blackMarketPurchase', label: '黑市购买', desc: '采购黑市物品' },
    { key: 'dungeonEnable', label: '咸王梦境', desc: '周日/一/三/四开启' },
    { key: 'studyEnable', label: '自动答题', desc: '自动完成答题任务' },
  ]},
  { title: '车辆任务', items: [
    { key: 'smartSendCarEnable', label: '智能发车', desc: '每日自动发车（可在下方自定义策略）' },
    { key: 'claimCarsEnable', label: '一键收车', desc: '收取已完成的车辆并自动改装升级' },
  ]},
]

onMounted(async () => {
  try {
    accounts.value = await api.get('/api/accounts') || []
    const accParam = route.query.acc
    if (accParam) {
      selectedAccId.value = accParam
      await loadSettings()
    }
  } catch (e) {
    toast.show('加载账号失败')
  } finally {
    loading.value = false
  }
  loadTemplates()
})

async function loadSettings() {
  if (!selectedAccId.value) return
  selectedAcc.value = accounts.value.find(a => a.id === selectedAccId.value)
  try {
    const s = await api.get(`/api/accounts/${selectedAccId.value}/settings`)
    settings.value = s || {}
  } catch {
    settings.value = {}
  }
}

async function save() {
  saving.value = true
  try {
    await api.put(`/api/accounts/${selectedAccId.value}/settings`, settings.value)
    toast.show('保存成功')
  } catch {
    toast.show('保存失败')
  } finally {
    saving.value = false
  }
}

// ======== 模板功能 ========

async function loadTemplates() {
  try {
    templates.value = await api.get('/api/templates') || []
  } catch { templates.value = [] }
}

async function applyTemplate() {
  const t = templates.value.find(t => t.id === selectedTemplateId.value)
  if (!t) return
  // 模板设置合并到当前设置
  settings.value = { ...settings.value, ...t.settings }
  toast.show(`已应用模板: ${t.name}，正在保存...`)
  // 应用后立即保存到账号配置
  await save()
}

async function saveAsTemplate() {
  if (!newTemplateName.value.trim()) { toast.show('请输入模板名称'); return }
  saving.value = true
  try {
    await api.post('/api/templates', {
      name: newTemplateName.value.trim(),
      settings: { ...settings.value },
    })
    await loadTemplates()
    showSaveTemplate.value = false
    newTemplateName.value = ''
    toast.show(`模板已保存`)
  } catch (e) {
    toast.show('保存失败: ' + e.message)
  } finally {
    saving.value = false
  }
}

function editTemplate(t) {
  newTemplateName.value = t.name
  editingTemplateId.value = t.id
  // 把模板设置加载到当前
  settings.value = { ...settings.value, ...t.settings }
  showTemplateManager.value = false
  toast.show(`已加载模板: ${t.name}，修改后点"保存配置"生效`)
}

async function deleteTemplate(id) {
  try {
    await api.del(`/api/templates/${id}`)
    templates.value = templates.value.filter(t => t.id !== id)
    toast.show('模板已删除')
  } catch (e) {
    toast.show('删除失败: ' + e.message)
  }
}
</script>

<style scoped>
.config-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 0; border-bottom: 1px solid var(--bg-body);
}
.config-item:last-child { border-bottom: none; }
.config-item-left { flex: 1; margin-right: 16px; }

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
.template-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 0; border-bottom: 1px solid var(--bg-body, #f5f5f5);
}
.template-item:last-child { border-bottom: none; }
</style>
