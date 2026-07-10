import { ref } from 'vue'

const BASE = ''
const token = ref(localStorage.getItem('auth_token') || '')

function setToken(t) { token.value = t; localStorage.setItem('auth_token', t) }
function clearToken() { token.value = ''; localStorage.removeItem('auth_token') }

function handle401() {
  clearToken()
  localStorage.removeItem('auth_user')
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

async function request(path, options = {}) {
  const { method = 'GET', body, timeout = 15000 } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  const headers = { 'Content-Type': 'application/json' }
  if (token.value) headers['Authorization'] = `Bearer ${token.value}`

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    if (res.status === 401) {
      handle401()
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || data.message || '登录已过期，请重新登录')
    }
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`)
    return data
  } finally {
    clearTimeout(timer)
  }
}

async function upload(path, formData, timeout = 30000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  const headers = {}
  if (token.value) headers['Authorization'] = `Bearer ${token.value}`

  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    })
    if (res.status === 401) {
      handle401()
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || data.message || '登录已过期，请重新登录')
    }
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`)
    return data
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  get: (path, options = {}) => request(path, options),
  post: (path, body, options = {}) => request(path, { method: 'POST', body, ...options }),
  put: (path, body, options = {}) => request(path, { method: 'PUT', body, ...options }),
  del: (path, options = {}) => request(path, { method: 'DELETE', ...options }),
  upload,
  setToken,
  clearToken,
  auth: {
    async login(userKey, password) {
      const data = await request('/api/auth/login', { method: 'POST', body: { userKey, password } })
      if (data.token) {
        setToken(data.token)
        if (data.user) localStorage.setItem('auth_user', JSON.stringify(data.user))
      }
      return data
    },
    async logout() {
      try {
        await request('/api/auth/logout', { method: 'POST' })
      } catch {}
      clearToken()
      localStorage.removeItem('auth_user')
    },
    me() {
      return request('/api/auth/me')
    },
  },
}
