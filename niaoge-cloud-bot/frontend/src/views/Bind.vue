<template>
  <div class="container">
    <div class="page-header">
      <button class="btn-back" @click="$router.push('/')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span>绑定账号</span>
    </div>

    <!-- 批量上传 BIN，每个 BIN 一个角色 -->
    <div>
      <div
        class="bin-upload-area" :class="{ 'has-file': singleFiles.length }"
        @click="$refs.singleFileInput?.click()" @dragover.prevent @drop.prevent="onDropSingle"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <p>{{ singleFiles.length ? `已选择 ${singleFiles.length} 个 BIN 文件` : '点击或拖拽上传多个 BIN 文件' }}</p>
        <p v-if="singleFiles.length" style="font-size:12px;color:var(--text-muted)">点击继续添加</p>
        <input ref="singleFileInput" type="file" accept=".bin" multiple class="hidden-input" @change="onSingleFileChange" />
      </div>

      <!-- 已选文件列表 -->
      <div v-if="singleFiles.length" class="file-list">
        <div v-for="(f, i) in singleFiles" :key="i" class="file-item">
          <span style="flex:1;font-size:13px">{{ f.file.name }}</span>
          <span v-if="f.status === 'pending'" style="font-size:12px;color:var(--text-muted)">等待中</span>
          <span v-else-if="f.status === 'loading'" style="font-size:12px;color:var(--primary)">处理中...</span>
          <span v-else-if="f.status === 'success'" style="font-size:12px;color:var(--success)">✓ {{ f.roleName || '成功' }}</span>
          <span v-else-if="f.status === 'error'" style="font-size:12px;color:var(--danger)">✗ {{ f.error }}</span>
          <span v-else-if="f.status === 'existed'" style="font-size:12px;color:var(--text-muted)">已存在</span>
          <button v-if="f.status === 'pending'" class="btn btn-sm btn-outline" style="padding:2px 8px;font-size:11px" @click="singleFiles.splice(i, 1)">移除</button>
        </div>
      </div>

      <button v-if="singleFiles.length" class="btn btn-primary" :disabled="singleLoading || !singleFiles.filter(f => f.status === 'pending').length" @click="uploadSingleBatch" style="margin-top:12px">
        <span v-if="singleLoading" class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:8px"></span>
        {{ singleLoading ? '上传中...' : `批量上传(${singleFiles.filter(f => f.status === 'pending').length})` }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { api } from '../api'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()

// ======== 单角色批量模式 ========
const singleFiles = ref([])
const singleLoading = ref(false)

function onSingleFileChange(e) {
  const files = Array.from(e.target.files || [])
  for (const f of files) {
    if (f.name.endsWith('.bin')) {
      singleFiles.value.push({ file: f, status: 'pending', roleName: '', error: '' })
    }
  }
  e.target.value = ''  // 允许重复选择同一文件
}

function onDropSingle(e) {
  const files = Array.from(e.dataTransfer?.files || [])
  for (const f of files) {
    if (f.name.endsWith('.bin')) {
      singleFiles.value.push({ file: f, status: 'pending', roleName: '', error: '' })
    }
  }
}

async function uploadSingleBatch() {
  const pending = singleFiles.value.filter(f => f.status === 'pending')
  if (!pending.length) return
  singleLoading.value = true

  for (const item of pending) {
    item.status = 'loading'
    try {
      const buf = new Uint8Array(await item.file.arrayBuffer())
      const fd = new FormData()
      fd.append('binFile', new Blob([buf]), item.file.name)
      const data = await api.upload('/api/accounts/bin', fd)
      item.status = 'success'
      item.roleName = data.name || item.file.name
    } catch (e) {
      const msg = e.message || '未知错误'
      if (msg.includes('已存在')) {
        item.status = 'existed'
      } else {
        item.status = 'error'
        item.error = msg
      }
    }
  }
  singleLoading.value = false
  const success = singleFiles.value.filter(f => f.status === 'success').length
  const existed = singleFiles.value.filter(f => f.status === 'existed').length
  const failed = singleFiles.value.filter(f => f.status === 'error').length
  toast.show(`完成：成功${success} 已存在${existed} 失败${failed}`)
}
</script>

<style scoped>
.bin-upload-area { border:2px dashed var(--border); border-radius:16px; padding:40px 20px; text-align:center; background:var(--bg-card); cursor:pointer; transition:all .2s; margin-bottom:16px; display:flex; flex-direction:column; align-items:center; gap:12px; }
.bin-upload-area.has-file { border-color:var(--primary); background:var(--primary-bg, #eff6ff); }
.bin-upload-area.has-file p { color:var(--success); font-weight:600; }
.hidden-input { display:none; }

.file-list { background:var(--bg-card); border-radius:12px; padding:8px 12px; margin-top:12px; }
.file-item { display:flex; align-items:center; gap:8px; padding:10px 0; border-bottom:1px solid var(--border); }
.file-item:last-child { border-bottom:none; }
</style>
