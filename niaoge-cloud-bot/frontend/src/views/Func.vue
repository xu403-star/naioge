<template>
  <div class="container">
    <div class="page-header"><span>功能中心</span></div>

    <!-- 账号 -->
    <div class="card">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="20" height="20"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        账号操作
      </div>
      <div class="list-item" @click="$router.push('/accounts')">
        <div class="list-left"><span>📁 账号管理</span></div>
        <span style="font-size:13px;color:var(--text-muted)">BIN导入 · 连接 · 执行 →</span>
      </div>
    </div>

    <!-- 批量 -->
    <div class="card">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="20" height="20"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        批量执行
      </div>
      <div class="list-item" @click="$router.push('/accounts')">
        <div class="list-left"><span>🚀 批量操作</span></div>
        <span style="font-size:13px;color:var(--text-muted)">副本 · 爬塔 · 资源 · 商店 →</span>
      </div>
      <div class="list-item" @click="$router.push('/schedules')">
        <div class="list-left"><span>⏰ 定时调度</span></div>
        <span style="font-size:13px;color:var(--text-muted)">Cron 定时自动执行 →</span>
      </div>
    </div>

    <!-- 查询 -->
    <div class="card">
      <div class="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="20" height="20"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        游戏查询
      </div>
      <div class="list-item" @click="$router.push('/game')">
        <div class="list-left"><span>🔍 数据查询</span></div>
        <span style="font-size:13px;color:var(--text-muted)">日常 · 俱乐部 · 排行 · 盐场 →</span>
      </div>
    </div>
  </div>
</template>
