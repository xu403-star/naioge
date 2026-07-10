<template>
  <div class="container">
    <div class="page-header">
      <h1>设置</h1>
    </div>

    <!-- 任务管理 -->
    <div class="card">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="18" height="18"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/></svg>
        任务管理
      </div>
      <div class="list-row" @click="$router.push('/accounts')" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:10px;background:#eff6ff;display:flex;align-items:center;justify-content:center;color:#3b82f6">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <div>
            <div style="font-weight:600;font-size:14px">任务模板</div>
            <div style="font-size:12px;color:var(--text-muted)">批量设置 / 应用模板 / 梦境商品</div>
          </div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="list-row" @click="$router.push('/schedules')" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:10px;background:#ecfdf5;display:flex;align-items:center;justify-content:center;color:var(--success)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div>
            <div style="font-weight:600;font-size:14px">定时调度</div>
            <div style="font-size:12px;color:var(--text-muted)">Cron 定时自动执行</div>
          </div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>

    <!-- 游戏查询 -->
    <div class="card">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        游戏查询
      </div>
      <div class="list-row" @click="$router.push('/game')" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:10px;background:#eff6ff;display:flex;align-items:center;justify-content:center;color:#3b82f6">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          </div>
          <div>
            <div style="font-weight:600;font-size:14px">数据查询</div>
            <div style="font-size:12px;color:var(--text-muted)">日常 · 俱乐部 · 排行 · 盐场</div>
          </div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>

    <!-- 安全 -->
    <div class="card">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="18" height="18"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        安全
      </div>
      <div v-if="isAdmin" class="list-row" @click="$router.push('/users')" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:10px;background:#f5f3ff;display:flex;align-items:center;justify-content:center;color:#7c3aed">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div>
            <div style="font-weight:600;font-size:14px">用户管理</div>
            <div style="font-size:12px;color:var(--text-muted)">创建 · 删除 · 配额</div>
          </div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="list-row" @click="$router.push('/portal')" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:10px;background:#fef2f2;display:flex;align-items:center;justify-content:center;color:var(--danger)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div>
            <div style="font-weight:600;font-size:14px">卡密管理</div>
            <div style="font-size:12px;color:var(--text-muted)">生成 · 续期 · 授权</div>
          </div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>

    <!-- 数据 -->
    <div class="card">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="18" height="18"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
        数据
      </div>
      <div class="list-row" @click="$router.push('/logs')" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;color:var(--text-muted)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div>
            <div style="font-weight:600;font-size:14px">任务日志</div>
            <div style="font-size:12px;color:var(--text-muted)">SSE 实时推送</div>
          </div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="list-row" @click="$router.push('/rewards')" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:10px;background:#fffbeb;display:flex;align-items:center;justify-content:center;color:var(--warning)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <div>
            <div style="font-weight:600;font-size:14px">奖励预览</div>
            <div style="font-size:12px;color:var(--text-muted)">即将开放</div>
          </div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </div>

    <!-- 账号 -->
    <div class="card">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="18" height="18"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        账号
      </div>
      <div class="list-row" style="border:none">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--primary-light);display:flex;align-items:center;justify-content:center;color:var(--primary);font-weight:700;font-size:14px">
            {{ userInfo.name?.[0] || 'U' }}
          </div>
          <div>
            <div style="font-weight:600;font-size:14px">{{ userInfo.name || '未登录' }}</div>
            <div style="font-size:12px;color:var(--text-muted)">Key: {{ userInfo.userKey || '-' }} · 账号配额: {{ userInfo.maxAccounts === 0 ? '无限' : (userInfo.maxAccounts ?? '-') }}</div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-outline" style="flex:1" @click="showPwd = true">修改密码</button>
        <button class="btn btn-outline" style="flex:1;color:var(--danger);border-color:var(--danger)" @click="handleLogout" :disabled="loggingOut">
          {{ loggingOut ? '退出中...' : '退出登录' }}
        </button>
      </div>
    </div>

    <!-- 修改密码弹窗 -->
    <div v-if="showPwd" class="modal-overlay" @click.self="showPwd = false">
      <div class="modal-card">
        <div style="font-weight:700;font-size:16px;margin-bottom:16px">修改密码</div>
        <div class="input-group">
          <label>旧密码</label>
          <input v-model="pwdForm.oldPassword" type="password" placeholder="当前密码" />
        </div>
        <div class="input-group">
          <label>新密码（至少6位）</label>
          <input v-model="pwdForm.newPassword" type="password" placeholder="新密码" />
        </div>
        <div class="input-group">
          <label>确认新密码</label>
          <input v-model="pwdForm.confirmPassword" type="password" placeholder="再次输入新密码" />
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-sm btn-outline" @click="showPwd = false">取消</button>
          <button class="btn btn-sm btn-primary" @click="handleChangePwd" :disabled="changingPwd">
            {{ changingPwd ? '修改中...' : '确认修改' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 关于 -->
    <div class="card">
      <div class="list-row" style="border:none">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#818cf8);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px">鸟</div>
          <div>
            <div style="font-weight:600;font-size:14px">鸟哥云端助手 v2.0</div>
            <div style="font-size:12px;color:var(--text-muted)">Vue 3 + Express · SQLite</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const router = useRouter()
const toast = useToastStore()
const userInfo = ref({})
const loggingOut = ref(false)
const isAdmin = ref(false)
const showPwd = ref(false)
const changingPwd = ref(false)
const pwdForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })

onMounted(async () => {
  try {
    userInfo.value = await api.auth.me()
    isAdmin.value = userInfo.value.userKey === 'admin'
  } catch {}
})

async function handleChangePwd() {
  const { oldPassword, newPassword, confirmPassword } = pwdForm.value
  if (!oldPassword || !newPassword) return toast.show('请填写旧密码和新密码')
  if (newPassword.length < 6) return toast.show('新密码至少6位')
  if (newPassword !== confirmPassword) return toast.show('两次新密码不一致')
  changingPwd.value = true
  try {
    await api.put('/api/auth/password', { oldPassword, newPassword })
    toast.show('密码修改成功')
    showPwd.value = false
    pwdForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  } catch (e) {
    toast.show('修改失败: ' + e.message)
  } finally {
    changingPwd.value = false
  }
}

async function handleLogout() {
  if (!confirm('确定退出登录吗？')) return
  loggingOut.value = true
  try {
    await api.auth.logout()
  } finally {
    loggingOut.value = false
    router.push('/login')
  }
}
</script>
