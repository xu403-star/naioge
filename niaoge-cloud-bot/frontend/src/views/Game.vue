<template>
  <div class="container">
    <div class="page-header">
      <button class="btn-back" @click="$router.push('/')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span>游戏查询</span>
    </div>

    <div class="card" style="padding:16px">
      <div class="input-group">
        <label>选择账号</label>
        <select v-model="selectedId">
          <option value="">— 请选择 —</option>
          <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name || a.id }}</option>
        </select>
      </div>
    </div>

    <div v-if="!selectedId" class="text-center text-muted" style="padding:40px">请先选择账号</div>

    <template v-else>
      <div class="card" style="padding:16px">
        <div class="card-title">日常</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-sm btn-outline" @click="query('daily-status')">日常状态</button>
          <button class="btn btn-sm btn-outline" @click="query('role-info')">角色信息</button>
          <button class="btn btn-sm btn-outline" @click="query('formations')">阵容</button>
          <button class="btn btn-sm btn-outline" @click="query('mail')">邮件</button>
        </div>
      </div>
      <div class="card" style="padding:16px">
        <div class="card-title">俱乐部/排名</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn-sm btn-outline" @click="query('club')">俱乐部</button>
          <button class="btn btn-sm btn-outline" @click="query('club-members')">俱乐部成员</button>
          <button class="btn btn-sm btn-outline" @click="query('rank-server')">区服榜</button>
          <button class="btn btn-sm btn-outline" @click="query('rank-top')">巅峰榜</button>
        </div>
      </div>

      <div v-if="result" class="card" style="padding:16px">
        <div class="card-title">
          查询结果
          <button class="btn btn-sm btn-outline" style="margin-left:auto" @click="result = null">关闭</button>
        </div>
        <pre style="font-size:12px;overflow:auto;white-space:pre-wrap;word-break:break-all;max-height:400px">{{ JSON.stringify(result, null, 2) }}</pre>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
const accounts = ref([])
const selectedId = ref('')
const result = ref(null)

onMounted(async () => {
  try { accounts.value = await api.get('/api/accounts') || [] } catch {}
})

async function query(feature) {
  try {
    result.value = await api.get(`/api/game/${feature}/${selectedId.value}`)
  } catch (e) {
    toast.show('查询失败: ' + e.message)
  }
}
</script>
