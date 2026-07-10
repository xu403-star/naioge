import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/Login.vue') },
  { path: '/', redirect: '/accounts' },
  // { path: '/', name: 'home', component: () => import('../views/Home.vue') },
  { path: '/accounts', name: 'accounts', component: () => import('../views/Accounts.vue') },
  // { path: '/tasks', name: 'tasks', component: () => import('../views/Tasks.vue') },
  { path: '/setting', name: 'setting', component: () => import('../views/Setting.vue') },

  // 子页面（不在底部导航中显示）
  { path: '/bind', name: 'bind', component: () => import('../views/Bind.vue') },
  { path: '/schedules', name: 'schedules', component: () => import('../views/Schedules.vue') },
  { path: '/config', name: 'config', component: () => import('../views/Config.vue') },
  { path: '/game', name: 'game', component: () => import('../views/Game.vue') },
  { path: '/logs', name: 'logs', component: () => import('../views/Logs.vue') },
  { path: '/logs/dream-shop', name: 'dreamShopLogs', component: () => import('../views/DreamShopLogs.vue') },
  { path: '/rewards', name: 'rewards', component: () => import('../views/Rewards.vue') },
  // { path: '/batch', name: 'batch', component: () => import('../views/Accounts.vue') },
  { path: '/portal', name: 'portal', component: () => import('../views/PortalCards.vue') },
  { path: '/users', name: 'users', component: () => import('../views/UserManage.vue') },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('auth_token')
  if (!token && to.path !== '/login') {
    next('/login')
  } else if (token && to.path === '/login') {
    next('/accounts')
  } else {
    next()
  }
})

export function logout() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('auth_user')
  router.push('/login')
}

export default router
