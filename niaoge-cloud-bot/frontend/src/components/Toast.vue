<template>
  <div class="toast" :class="{ hidden: !store.visible }">{{ store.message }}</div>
</template>

<script setup>
import { useToastStore } from '../stores/toast'
const store = useToastStore()
</script>
