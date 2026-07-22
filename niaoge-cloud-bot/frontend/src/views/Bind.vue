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

      <!-- 左右两列：左侧 BIN 列表，右侧上传日志 -->
      <div v-if="singleFiles.length" class="bin-layout">
        <!-- 左侧：已选文件列表 -->
        <div class="bin-left">
          <div class="file-list">
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
          <button class="btn btn-primary" :disabled="singleLoading || !singleFiles.filter(f => f.status === 'pending').length" @click="uploadSingleBatch" style="margin-top:12px">
            <span v-if="singleLoading" class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:8px"></span>
            {{ singleLoading ? '上传中...' : `批量上传(${singleFiles.filter(f => f.status === 'pending').length})` }}
          </button>
        </div>

        <!-- 右侧：上传进度日志（仿刷新 Token 的 [n/total] 格式） -->
        <div v-if="uploadLogs.length || countdown.active" class="bin-right">
          <div class="upload-log-panel">
            <div class="upload-log-header">
              <span>上传日志</span>
              <button class="btn btn-xs btn-outline" @click="uploadLogs = []">清空</button>
            </div>
            <!-- 限流倒计时条 -->
            <div v-if="countdown.active" class="upload-log-countdown">
              <span class="countdown-spinner"></span>
              <span>{{ countdown.batchInfo }}：限流等待中 {{ countdown.seconds }}s</span>
            </div>
            <div class="upload-log-list">
              <div v-for="(log, i) in uploadLogs" :key="i" class="upload-log-line" :class="log.type">
                <span class="upload-log-time">{{ log.time }}</span>
                <span class="upload-log-message">{{ log.message }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
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
const uploadLogs = ref([])
const countdown = ref({ active: false, seconds: 0, batchInfo: '' })
let countdownTimer = null

function addUploadLog(message, type = 'info') {
  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  uploadLogs.value.push({ time, message, type })
}

function startCountdown(seconds, batchInfo) {
  countdown.value = { active: true, seconds, batchInfo }
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    if (countdown.value.seconds > 0) {
      countdown.value = { ...countdown.value, seconds: countdown.value.seconds - 1 }
    } else {
      stopCountdown()
    }
  }, 1000)
}

function stopCountdown() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
  countdown.value = { active: false, seconds: 0, batchInfo: '' }
}

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

  const total = pending.length
  let success = 0, failed = 0, existed = 0, idx = 0
  addUploadLog(`开始批量上传 ${total} 个 BIN（25 个一批并发，超 25 个自动等待限流）`)

  // 25 个一批并发上传（后端 authUserLimiter 25次/分钟，超 25 个会自动等待）
  const BATCH_SIZE = 25
  for (let batchStart = 0; batchStart < pending.length; batchStart += BATCH_SIZE) {
    const batchNo = Math.floor(batchStart / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(total / BATCH_SIZE)
    const batchCount = Math.min(BATCH_SIZE, total - batchStart)
    const batchLabel = `第 ${batchNo}/${totalBatches} 批`

    // 批次开始前查询限流状态，显示预估倒计时
    let estimatedWait = 0
    try {
      const status = await api.get('/api/accounts/rate-limit-status')
      estimatedWait = status.estimatedWaitMs || 0
      if (estimatedWait > 500) {
        const waitSec = Math.ceil(estimatedWait / 1000)
        addUploadLog(`${batchLabel}：限流窗口已满（${status.windowRequests}/${status.maxRequests}），预计等待 ${waitSec}s`, 'warning')
        startCountdown(waitSec, batchLabel)
      } else {
        addUploadLog(`${batchLabel}开始（${batchCount} 个并发，窗口 ${status.windowRequests}/${status.maxRequests}）`)
      }
    } catch (e) {
      addUploadLog(`${batchLabel}开始（${batchCount} 个并发，限流状态查询失败: ${e.message}）`, 'warning')
    }

    const batch = pending.slice(batchStart, batchStart + BATCH_SIZE)
    let firstDone = false
    await Promise.all(batch.map(async (item) => {
      item.status = 'loading'
      const curIdx = ++idx
      try {
        const buf = new Uint8Array(await item.file.arrayBuffer())
        const fd = new FormData()
        fd.append('binFile', new Blob([buf]), item.file.name)
        // 超时 2 分钟，防止限流等待导致前端超时
        const data = await api.upload('/api/accounts/bin', fd, 120000)
        // 第一个请求完成时停止倒计时
        if (!firstDone) { firstDone = true; stopCountdown() }
        item.status = 'success'
        item.roleName = data.name || item.file.name
        // 后端返回耗时信息，显示在文件名旁
        if (data.elapsed) {
          const sec = (data.elapsed / 1000).toFixed(1)
          const wait = data.waitMs > 500 ? `（限流等待 ${(data.waitMs / 1000).toFixed(1)}s）` : ''
          item.roleName = `${data.name || item.file.name} · ${sec}s${wait}`
          addUploadLog(`[${curIdx}/${total}] [${data.name || item.file.name}] 成功 · ${sec}s${wait}`, 'success')
        } else {
          addUploadLog(`[${curIdx}/${total}] [${data.name || item.file.name}] 成功`, 'success')
        }
        if (data.existed) {
          existed++
          addUploadLog(`[${curIdx}/${total}] [${item.file.name}] 已存在`, 'warning')
        } else {
          success++
        }
      } catch (e) {
        if (!firstDone) { firstDone = true; stopCountdown() }
        failed++
        const msg = e.message || '未知错误'
        if (msg.includes('已存在')) {
          item.status = 'existed'
          existed++
          success--
          addUploadLog(`[${curIdx}/${total}] [${item.file.name}] 已存在`, 'warning')
        } else {
          item.status = 'error'
          item.error = msg
          addUploadLog(`[${curIdx}/${total}] [${item.file.name}] 失败: ${msg}`, 'error')
        }
      }
    }))
    stopCountdown()
    addUploadLog(`${batchLabel}完成（累计 ${success + existed + failed}/${total}）`)
  }
  addUploadLog(`全部完成：成功 ${success}/${total}，已存在 ${existed}，失败 ${failed}`, failed > 0 ? 'error' : 'success')
  singleLoading.value = false
  toast.show(`完成：成功${success} 已存在${existed} 失败${failed}`)
}
</script>

<style scoped>
.bin-upload-area { border:2px dashed var(--border); border-radius:16px; padding:40px 20px; text-align:center; background:var(--bg-card); cursor:pointer; transition:all .2s; margin-bottom:16px; display:flex; flex-direction:column; align-items:center; gap:12px; }
.bin-upload-area.has-file { border-color:var(--primary); background:var(--primary-bg, #eff6ff); }
.bin-upload-area.has-file p { color:var(--success); font-weight:600; }
.hidden-input { display:none; }

/* 左右两列布局：左 BIN 列表，右 上传日志 */
.bin-layout { display:flex; gap:16px; align-items:flex-start; }
.bin-left { flex:1; min-width:0; }
.bin-right { flex:1; min-width:0; position:sticky; top:12px; }

.file-list { background:var(--bg-card); border-radius:12px; padding:8px 12px; max-height:60vh; overflow-y:auto; }
.file-item { display:flex; align-items:center; gap:8px; padding:10px 0; border-bottom:1px solid var(--border); }
.file-item:last-child { border-bottom:none; }

@media (max-width: 768px) {
  .bin-layout { flex-direction:column; }
  .bin-right { position:static; }
}

.upload-log-panel { background:var(--bg-card); border:1px solid var(--border); border-radius:12px; margin-top:12px; overflow:hidden; }
.upload-log-header { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-bottom:1px solid var(--border); font-weight:600; font-size:14px; }
.upload-log-countdown { display:flex; align-items:center; gap:8px; padding:8px 14px; background:var(--warning-bg, #fffbeb); color:var(--warning, #d97706); font-size:13px; font-weight:600; border-bottom:1px solid var(--border); }
.countdown-spinner { width:14px; height:14px; border:2px solid currentColor; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.upload-log-list { max-height:320px; overflow-y:auto; padding:8px 14px; font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; line-height:1.6; }
.upload-log-line { display:flex; gap:8px; }
.upload-log-time { color:var(--text-muted); flex-shrink:0; }
.upload-log-message { word-break:break-all; }
.upload-log-line.success .upload-log-message { color:var(--success); }
.upload-log-line.error .upload-log-message { color:var(--danger); }
.upload-log-line.warning .upload-log-message { color:var(--warning, #d97706); }
</style>
