<template>
  <div class="container" style="display:flex;flex-direction:column;justify-content:center;min-height:100vh">
    <!-- Logo -->
    <div class="text-center" style="margin-bottom:40px">
      <div class="logo-circle">
        <img :src="logoUrl" alt="logo" @error="onImgError" />
      </div>
      <h1 style="font-size:22px;font-weight:800;margin-top:16px;letter-spacing:-.5px">鸟哥云端助手</h1>
      <p style="font-size:14px;margin-top:6px;color:var(--text-muted)">输入卡密开始使用</p>
    </div>

    <!-- 登录表单 -->
    <div class="card" style="padding:24px">
      <div class="input-group">
        <label>卡密</label>
        <input
          v-model="cardCode"
          type="text"
          placeholder="请输入卡密"
          autocomplete="off"
          @keyup.enter="doLogin"
        />
      </div>
      <button class="btn btn-primary" :disabled="!cardCode || loading" @click="doLogin">
        <span v-if="loading" class="spinner" style="width:18px;height:18px;border-width:2px;margin-right:8px"></span>
        {{ loading ? '验证中...' : '进入系统' }}
      </button>
      <p v-if="error" style="color:var(--danger);font-size:13px;text-align:center;margin-top:12px">{{ error }}</p>
    </div>

    <!-- 提示 -->
    <p style="text-align:center;font-size:12px;color:var(--text-light);margin-top:20px">
      首次使用请在服务端生成卡密
    </p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const router = useRouter()
const toast = useToastStore()
const cardCode = ref('')
const loading = ref(false)
const error = ref('')
const logoUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><circle cx="40" cy="40" r="38" fill="#6366f1"/><text x="40" y="48" text-anchor="middle" fill="white" font-size="28" font-weight="700">鸟</text></svg>')

function onImgError(e) {
  e.target.style.display = 'none'
}

async function doLogin() {
  if (!cardCode.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    const res = await api.post('/v1/portal/login', { cardCode: cardCode.value.trim() })
    if (res.token) {
      api.setToken(res.token)
      toast.show('验证成功')
      router.push('/')
    } else {
      error.value = res.error || '验证失败'
    }
  } catch (e) {
    error.value = e.message || '网络错误'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.logo-circle {
  width: 80px; height: 80px; margin: 0 auto;
  border-radius: 50%; background: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -1px rgba(0,0,0,.06);
  padding: 4px;
}
.logo-circle img {
  width: 100%; height: 100%;
  object-fit: contain; border-radius: 50%;
}
</style>
