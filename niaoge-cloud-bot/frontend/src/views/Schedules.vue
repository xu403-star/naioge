<template>
  <div class="container">
    <div class="page-header">
      <button class="btn-back" @click="$router.push('/')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span>定时调度</span>
    </div>

    <ScheduleManager />
  </div>
</template>

<script setup>
import ScheduleManager from '../components/ScheduleManager.vue'
</script>
