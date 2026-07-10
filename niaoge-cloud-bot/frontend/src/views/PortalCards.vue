<template>
  <div class="container">
    <div class="page-header">
      <button class="btn-back" @click="$router.push('/setting')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span>卡密管理</span>
      <button class="btn btn-sm btn-primary" style="width:auto;padding:6px 16px" @click="showAdd = true">+ 生成</button>
    </div>

    <!-- 添加卡密弹窗 -->
    <div v-if="showAdd" class="modal-mask" @click.self="showAdd = false">
      <div class="modal-content">
        <div class="modal-header">
          生成卡密
          <div class="modal-close" @click="showAdd = false">&times;</div>
        </div>
        <div class="modal-body">
          <div class="input-group">
            <label>卡密前缀（可选）</label>
            <input v-model="newCard.prefix" placeholder="留空自动生成" />
          </div>
          <div class="input-group">
            <label>最大账号数</label>
            <input v-model.number="newCard.maxAccounts" type="number" min="1" max="100" />
          </div>
          <div class="input-group">
            <label>过期时间（可选）</label>
            <input v-model="newCard.expiry" type="date" />
          </div>
          <div class="input-group">
            <label>备注</label>
            <input v-model="newCard.label" placeholder="例: 用户A" />
          </div>
          <div class="input-group">
            <label>卡密密码（可选）</label>
            <input v-model="newCard.password" placeholder="留空则无密码" />
          </div>
          <button class="btn btn-primary" @click="generateCard">生成卡密</button>
          <button class="btn btn-outline" style="margin-top:8px" @click="generateBatch">批量生成 5 张</button>
        </div>
      </div>
    </div>

    <!-- 续期弹窗 -->
    <div v-if="renewTarget" class="modal-mask" @click.self="renewTarget = null">
      <div class="modal-content">
        <div class="modal-header">
          续期卡密
          <div class="modal-close" @click="renewTarget = null">&times;</div>
        </div>
        <div class="modal-body">
          <p style="margin-bottom:16px;word-break:break-all">卡密: {{ renewTarget.card_code }}</p>
          <div class="input-group">
            <label>新过期时间</label>
            <input v-model="renewExpiry" type="date" />
          </div>
          <button class="btn btn-primary" @click="doRenew">确认续期</button>
        </div>
      </div>
    </div>

    <!-- 卡密列表 -->
    <div v-if="loading" class="flex-center" style="padding:40px"><div class="spinner"></div></div>

    <div v-else-if="cards.length === 0" class="text-center text-muted" style="padding:40px">暂无卡密，点击右上角生成</div>

    <div v-for="c in cards" :key="c.id" class="card" style="padding:16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div>
          <div style="font-family:monospace;font-weight:600;font-size:15px;word-break:break-all">{{ c.card_code }}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
            {{ c.label || '无备注' }}
            <span v-if="c.password" style="margin-left:8px;color:var(--warning)">🔒 有密码</span>
          </div>
        </div>
        <button class="btn btn-sm" style="padding:2px 8px;color:var(--danger);background:none;border:none;font-size:20px;cursor:pointer" @click="deleteCard(c)">&times;</button>
      </div>
      <div style="display:flex;gap:16px;font-size:13px;color:var(--text-muted);margin-bottom:12px">
        <span>绑定: {{ c.bound_count || 0 }}/{{ c.max_accounts }}</span>
        <span v-if="c.expiry">到期: {{ c.expiry }}</span>
        <span v-else>永不过期</span>
        <span class="badge" :class="c.enabled ? 'badge-on' : 'badge-off'">{{ c.enabled ? '启用' : '停用' }}</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm btn-outline" @click="copyCard(c.card_code)">复制</button>
        <button class="btn btn-sm btn-outline" @click="renewTarget = c">续期</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
const cards = ref([])
const loading = ref(true)
const showAdd = ref(false)
const renewTarget = ref(null)
const renewExpiry = ref('')
const newCard = ref({ prefix: '', maxAccounts: 5, expiry: '', label: '', password: '' })

onMounted(loadCards)

async function loadCards() {
  loading.value = true
  try { cards.value = await api.get('/v1/portal/cards') || [] } catch {}
  loading.value = false
}

function genCode(prefix = '') {
  const ts = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase()
  return prefix ? `${prefix}-${ts}` : `NCB-${ts}-${rand}`
}

async function generateCard() {
  const n = newCard.value
  const r = await api.post('/v1/portal/cards', {
    cardCode: genCode(n.prefix),
    password: n.password,
    label: n.label,
    expiry: n.expiry,
    maxAccounts: n.maxAccounts
  })
  if (r.success) {
    toast.show('卡密已生成')
    showAdd.value = false
    newCard.value = { prefix: '', maxAccounts: 5, expiry: '', label: '', password: '' }
    loadCards()
  } else {
    toast.show(r.error || '生成失败')
  }
}

async function generateBatch() {
  const n = newCard.value
  const list = Array.from({ length: 5 }, () => ({
    cardCode: genCode(n.prefix),
    password: n.password,
    label: n.label,
    expiry: n.expiry,
    maxAccounts: n.maxAccounts
  }))
  const res = await api.post('/v1/portal/cards/batch', { cards: list })
  toast.show(`生成 ${res.success}/${res.total} 张卡密`)
  showAdd.value = false
  loadCards()
}

async function deleteCard(c) {
  if (!confirm(`删除卡密 ${c.card_code}？`)) return
  await api.del(`/v1/portal/cards/${c.id}`)
  toast.show('已删除')
  loadCards()
}

async function doRenew() {
  await api.post(`/v1/portal/cards/${renewTarget.value.id}/renew`, { expiry: renewExpiry.value })
  toast.show('已续期')
  renewTarget.value = null
  loadCards()
}

function copyCard(code) {
  navigator.clipboard?.writeText(code)
  toast.show('已复制卡密')
}
</script>
