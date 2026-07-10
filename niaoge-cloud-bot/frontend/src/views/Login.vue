<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <div class="login-logo">鸟</div>
        <h1>鸟哥云端助手</h1>
        <p>请登录以继续</p>
      </div>

      <div v-if="error" class="login-error">{{ error }}</div>

      <div class="input-group">
        <label>用户Key</label>
        <input v-model="userKey" type="text" placeholder="请输入用户Key" @keyup.enter="handleLogin" />
      </div>

      <div class="input-group">
        <label>密码</label>
        <input v-model="password" type="password" placeholder="请输入密码" @keyup.enter="handleLogin" />
      </div>

      <button class="btn btn-primary login-btn" :disabled="loading || !userKey || !password" @click="handleLogin">
        <span v-if="loading" class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:8px"></span>
        {{ loading ? '登录中...' : '登录' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const router = useRouter()
const toast = useToastStore()
const userKey = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  if (!userKey.value || !password.value) return
  loading.value = true
  error.value = ''
  try {
    await api.auth.login(userKey.value, password.value)
    toast.show('登录成功')
    router.push('/')
  } catch (e) {
    error.value = e.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--bg-body);
}
.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 32px 24px;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border-light);
}
.login-header {
  text-align: center;
  margin-bottom: 28px;
}
.login-logo {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: linear-gradient(135deg, #6366f1, #818cf8);
  color: #fff;
  font-size: 28px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  box-shadow: 0 6px 20px rgba(99,102,241,.3);
}
.login-header h1 {
  font-size: 22px;
  font-weight: 800;
  margin-bottom: 4px;
}
.login-header p {
  font-size: 13px;
  color: var(--text-muted);
}
.login-error {
  background: var(--danger-bg);
  color: var(--danger-text);
  padding: 10px 14px;
  border-radius: var(--radius-xs);
  font-size: 13px;
  margin-bottom: 16px;
  text-align: center;
}
.login-btn {
  width: 100%;
  margin-top: 8px;
  padding: 12px;
  font-size: 15px;
}
</style>
