<template>
  <div class="container">
    <div class="page-header">
      <button class="btn-back" @click="$router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <h1>用户管理</h1>
    </div>

    <div v-if="loading" class="flex-center" style="padding:40px"><div class="spinner"></div></div>

    <div v-else-if="error" class="card">
      <div style="color:var(--danger);text-align:center;padding:20px">{{ error }}</div>
    </div>

    <div v-else>
      <!-- 创建用户按钮 -->
      <div class="card">
        <button class="btn btn-primary" style="width:100%" @click="showCreate = true">
          + 创建新用户
        </button>
      </div>

      <!-- 用户列表 -->
      <div class="card">
        <div class="card-title">所有用户 ({{ users.length }})</div>
        <div v-for="u in users" :key="u.user_key" class="user-item">
          <div style="display:flex;align-items:center;gap:12px;flex:1">
            <div class="user-avatar" :style="{background: u.user_key === 'admin' ? 'var(--warning)' : 'var(--primary)'}">
              {{ (u.name || u.user_key)[0] }}
            </div>
            <div style="flex:1">
              <div style="font-weight:600;font-size:14px">
                {{ u.name || u.user_key }}
                <span v-if="u.user_key === 'admin'" style="font-size:11px;color:var(--warning)">管理员</span>
              </div>
              <div style="font-size:12px;color:var(--text-muted)">
                Key: {{ u.user_key }} · 配额: {{ u.max_accounts === 0 ? '无限' : u.max_accounts }} · {{ u.enabled ? '启用' : '禁用' }}
              </div>
              <div v-if="u.expiry" style="font-size:11px;color:var(--warning)">到期: {{ u.expiry }}</div>
            </div>
          </div>
          <button v-if="u.user_key !== 'admin'" class="btn btn-sm btn-outline" style="margin-right:6px" @click="handleEdit(u)">
            编辑
          </button>
          <button v-if="u.user_key !== 'admin'" class="btn btn-sm" style="background:var(--danger);color:#fff;border:none" @click="handleDelete(u)">
            删除
          </button>
        </div>
      </div>

      <!-- 使用说明 -->
      <div class="card" style="background:var(--bg-hover)">
        <div style="font-size:13px;color:var(--text-muted);line-height:1.8">
          <div style="font-weight:600;color:var(--text);margin-bottom:8px">使用说明</div>
          1. 创建用户后，把 <b>用户名(Key)</b> 和 <b>密码</b> 发给对方<br>
          2. 对方访问网站，用这组账号密码登录<br>
          3. 每个用户只能看到自己的账号/模板/任务，互不干扰<br>
          4. 删除用户会同时删除其所有数据
        </div>
      </div>
    </div>

    <!-- 创建用户弹窗 -->
    <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
      <div class="modal-card">
        <div style="font-weight:700;font-size:16px;margin-bottom:16px">创建新用户</div>
        <div class="input-group">
          <label>用户名 (Key) *</label>
          <input v-model="form.userKey" placeholder="例如：friend1" />
        </div>
        <div class="input-group">
          <label>密码 *</label>
          <input v-model="form.password" placeholder="设置密码" />
        </div>
        <div class="input-group">
          <label>显示名称</label>
          <input v-model="form.name" placeholder="例如：朋友一号" />
        </div>
        <div class="input-group">
          <label>账号配额（0=无限）</label>
          <input v-model.number="form.maxAccounts" type="number" min="0" placeholder="可管理的游戏账号数量" />
        </div>
        <div class="input-group">
          <label>到期时间（可选）</label>
          <input v-model="form.expiry" type="date" />
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-sm btn-outline" @click="showCreate = false">取消</button>
          <button class="btn btn-sm btn-primary" @click="handleCreate" :disabled="creating">
            {{ creating ? '创建中...' : '创建' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 编辑用户弹窗 -->
    <div v-if="showEdit" class="modal-overlay" @click.self="showEdit = false">
      <div class="modal-card">
        <div style="font-weight:700;font-size:16px;margin-bottom:16px">编辑用户</div>
        <div class="input-group">
          <label>用户名 (Key)</label>
          <input v-model="editForm.newUserKey" placeholder="新用户名" />
        </div>
        <div class="input-group">
          <label>新密码（留空不修改）</label>
          <input v-model="editForm.password" type="password" placeholder="输入新密码" />
        </div>
        <div class="input-group">
          <label>显示名称</label>
          <input v-model="editForm.name" placeholder="显示名称" />
        </div>
        <div class="input-group">
          <label>账号配额（0=无限）</label>
          <input v-model.number="editForm.maxAccounts" type="number" min="0" />
        </div>
        <div class="input-group">
          <label>到期时间（可选）</label>
          <input v-model="editForm.expiry" type="date" />
        </div>
        <div class="input-group">
          <label>启用状态</label>
          <select v-model="editForm.enabled">
            <option :value="1">启用</option>
            <option :value="0">禁用</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-sm btn-outline" @click="showEdit = false">取消</button>
          <button class="btn btn-sm btn-primary" @click="handleSaveEdit" :disabled="saving">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
const loading = ref(true)
const error = ref('')
const users = ref([])
const showCreate = ref(false)
const creating = ref(false)
const showEdit = ref(false)
const saving = ref(false)

const form = ref({
  userKey: '',
  password: '',
  name: '',
  maxAccounts: 10,
  expiry: '',
})

const editForm = ref({
  oldKey: '',
  newUserKey: '',
  password: '',
  name: '',
  maxAccounts: 10,
  expiry: '',
  enabled: 1,
})

onMounted(async () => {
  await loadUsers()
})

async function loadUsers() {
  loading.value = true
  error.value = ''
  try {
    users.value = await api.get('/api/auth/users') || []
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  if (!form.value.userKey || !form.value.password) {
    toast.show('请填写用户名和密码')
    return
  }
  creating.value = true
  try {
    await api.post('/api/auth/users', {
      userKey: form.value.userKey,
      password: form.value.password,
      name: form.value.name || form.value.userKey,
      maxAccounts: form.value.maxAccounts || 10,
      expiry: form.value.expiry || null,
    })
    toast.show(`用户 ${form.value.userKey} 创建成功`)
    showCreate.value = false
    form.value = { userKey: '', password: '', name: '', maxAccounts: 10, expiry: '' }
    await loadUsers()
  } catch (e) {
    toast.show('创建失败: ' + e.message)
  } finally {
    creating.value = false
  }
}

function handleEdit(u) {
  editForm.value = {
    oldKey: u.user_key,
    newUserKey: u.user_key,
    password: '',
    name: u.name || '',
    maxAccounts: u.max_accounts || 10,
    expiry: u.expiry || '',
    enabled: u.enabled ?? 1,
  }
  showEdit.value = true
}

async function handleSaveEdit() {
  saving.value = true
  try {
    const data = {
      newUserKey: editForm.value.newUserKey,
      name: editForm.value.name,
      maxAccounts: editForm.value.maxAccounts,
      expiry: editForm.value.expiry || null,
      enabled: editForm.value.enabled,
    }
    if (editForm.value.password) data.password = editForm.value.password
    await api.put(`/api/auth/users/${editForm.value.oldKey}`, data)
    toast.show('用户信息已更新')
    showEdit.value = false
    await loadUsers()
  } catch (e) {
    toast.show('保存失败: ' + e.message)
  } finally {
    saving.value = false
  }
}

async function handleDelete(u) {
  if (!confirm(`确定删除用户 ${u.name || u.user_key} 吗？\n该用户的所有账号、模板、任务数据都会被删除！`)) return
  try {
    await api.del(`/api/auth/users/${u.user_key}`)
    toast.show('用户已删除')
    await loadUsers()
  } catch (e) {
    toast.show('删除失败: ' + e.message)
  }
}
</script>

<style scoped>
.user-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--bg-body, #f5f5f5);
}
.user-item:last-child { border-bottom: none; }
.user-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; font-size: 14px;
}
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
