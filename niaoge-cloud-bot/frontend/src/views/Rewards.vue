<template>
  <div class="container">
    <div class="page-header">
      <button class="btn-back" @click="$router.push('/')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span>奖励预览</span>
    </div>
    <div class="card text-center text-muted" style="padding:60px 20px">
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5" width="48" height="48" style="margin-bottom:16px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      <p>奖励系统即将上线</p>
      <p style="font-size:13px;margin-top:8px">将展示每日任务可获得的资源预估</p>
    </div>
  </div>
</template>
