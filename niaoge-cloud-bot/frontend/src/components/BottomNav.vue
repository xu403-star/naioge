<template>
  <nav class="bottom-nav">
    <router-link to="/accounts" class="nav-item" active-class="active">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      <span>账号</span>
    </router-link>
    <router-link to="/setting" class="nav-item" active-class="active">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
      <span>设置</span>
    </router-link>
    <!-- 主页入口已隐藏：统计与快捷操作已合并到账号页 -->
    <!--
    <router-link to="/" class="nav-item" exact-active-class="active">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      <span>主页</span>
    </router-link>
    -->
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%);
  width: calc(100% - 24px); max-width: 400px;
  background: rgba(255,255,255,0.92); backdrop-filter: blur(20px);
  border-radius: 16px; display: flex; justify-content: space-around;
  padding: 6px 8px; z-index: 100;
  box-shadow: 0 6px 24px rgba(0,0,0,.1), 0 2px 6px rgba(0,0,0,.05);
  border: 1px solid rgba(255,255,255,.6);
}
.nav-item {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px 10px; color: #94a3b8; text-decoration: none;
  border-radius: 12px; transition: all .25s cubic-bezier(.4,0,.2,1);
  position: relative; min-width: 56px;
}
.nav-item svg { width: 20px; height: 20px; }
.nav-item span { font-size: 10px; font-weight: 600; letter-spacing: .2px; }
.nav-item.active {
  color: #6366f1;
  background: rgba(99,102,241,.08);
}
.nav-item.active::after {
  content: ''; position: absolute; bottom: -1px; left: 50%; transform: translateX(-50%);
  width: 12px; height: 2.5px; background: #6366f1; border-radius: 3px;
}
</style>
