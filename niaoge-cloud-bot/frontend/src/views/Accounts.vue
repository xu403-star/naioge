<template>
  <div class="dashboard-page">
    <!-- 定时任务管理条 -->
    <ScheduleManager
      :accounts="accounts"
      :batch-settings="batchSettings"
      @update:count="scheduleCount = $event"
      @refresh="loadStats"
    />

    <!-- 顶部统计 -->
    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
        <div><div class="stat-val">{{ accounts.length }}</div><div class="stat-label">账号总数</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div><div class="stat-val">{{ onlineCount }}</div><div class="stat-label">在线</div></div>
      </div>
      <div class="stat-card" style="cursor:pointer" @click="$router.push('/logs')">
        <div class="stat-icon amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
        <div><div class="stat-val">{{ todayRuns }}</div><div class="stat-label">今日执行</div></div>
      </div>
      <div class="stat-card" style="cursor:pointer" @click="$router.push('/schedules')">
        <div class="stat-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        <div><div class="stat-val">{{ scheduleCount }}</div><div class="stat-label">定时任务</div></div>
      </div>
    </div>

    <div class="dashboard-layout">
      <!-- 左侧：账号列表 -->
      <div class="dashboard-left">
        <div class="panel account-panel">
          <div class="panel-header">
            <h2>账号列表</h2>
            <div class="panel-actions">
              <button class="btn btn-outline btn-sm" @click="refreshAll">刷新</button>
              <button class="btn btn-outline btn-sm" style="color:var(--danger)" @click="disconnectAll">断开全部</button>
              <button class="btn btn-primary btn-sm" @click="$router.push('/bind')">添加</button>
            </div>
          </div>

          <div class="account-toolbar">
            <label class="check-all">
              <input type="checkbox" :checked="allSelected" :indeterminate="isIndeterminate" @change="toggleSelectAll" />
              <span>全选</span>
            </label>
            <button class="btn btn-xs btn-outline" @click="selectConnected">在线</button>
            <button class="btn btn-xs btn-primary" @click="openTaskTemplateModal">任务模板</button>
            <span class="selected-count">已选 {{ selectedCount }} / {{ accounts.length }}</span>
          </div>

          <div v-if="loading" class="flex-center" style="padding:48px"><div class="spinner"></div></div>

          <div v-else-if="accounts.length === 0" class="empty-state">
            <p>还没有添加任何账号</p>
            <button class="btn btn-primary" @click="$router.push('/bind')" style="width:auto">绑定账号</button>
          </div>

          <div v-else class="account-list">
            <div v-for="acc in accounts" :key="acc.id"
              class="account-row" :class="{ selected: selectedIds.has(acc.id), connected: acc.status === 'connected' }"
              @click="toggleSelect(acc.id)"
            >
              <input type="checkbox" :checked="selectedIds.has(acc.id)" @click.stop="toggleSelect(acc.id)" tabindex="-1" />
              <div class="account-avatar-sm" :style="{ background: avatarColor(acc.id) }">
                {{ (acc.name || acc.id)[0]?.toUpperCase() }}
              </div>
              <div class="account-main">
                <div class="account-name-line">
                  <span class="account-name">{{ acc.name || acc.id }}</span>
                  <span class="status-tag" :class="acc.status === 'connected' ? 'status-online' : 'status-offline'">
                    {{ acc.status === 'connected' ? '在线' : '离线' }}
                  </span>
                  <span v-if="dailyPointVisible(acc.id)" class="status-tag" :class="dailyPointClass(acc.id)">
                    {{ dailyPointText(acc.id) }}
                  </span>
                  <span v-if="carStatusVisible(acc.id)" class="status-tag" :class="carStatusClass(acc.id)">
                    {{ carStatusText(acc.id) }}
                  </span>
                </div>
                <div class="account-meta-sm">
                  <span>{{ acc.server || '未知区服' }}</span>
                  <span v-if="acc.level">· Lv.{{ acc.level }}</span>
                  <span v-if="acc.last_login">· {{ formatTime(acc.last_login) }}</span>
                </div>
              </div>
              <div class="account-row-actions" @click.stop>
                <button v-if="acc.status === 'connected'" class="btn btn-xs btn-outline" style="color:var(--danger)" @click="toggleConnect(acc)">断开</button>
                <button v-else class="btn btn-xs btn-primary" @click="toggleConnect(acc)">连接</button>
                <button class="btn btn-xs btn-outline" @click="runDaily(acc)">每日</button>
                <button class="btn btn-xs btn-outline" @click="openAccountSettings(acc)" title="账号设置">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                </button>
                <button class="btn btn-xs btn-outline" style="color:var(--danger)" @click="deleteAccount(acc)" title="删除账号">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：批量操作 + 日志 -->
      <div class="dashboard-right">
        <div class="panel batch-panel">
          <div class="panel-header">
            <h2>批量操作</h2>
            <div class="panel-actions" v-if="hasSelection">
              <button class="btn btn-outline btn-sm" @click="batchConnect">连接</button>
              <button class="btn btn-outline btn-sm" @click="batchDisconnect">断开</button>
              <button class="btn btn-outline btn-sm" @click="batchRefreshTokens" :disabled="refreshingTokens">刷新Token</button>
              <button class="btn btn-outline btn-sm" style="color:var(--danger)" @click="batchDelete">删除</button>
              <button class="btn btn-primary btn-sm" @click="batchDaily">每日</button>
              <button v-if="running" class="btn btn-danger btn-sm" @click="abortBatch">停止</button>
            </div>
          </div>

          <div v-if="runStatus" class="run-status" style="padding: 10px 16px; font-size: 13px; color: var(--text-muted); border-bottom: 1px solid var(--border);">
            状态:
            <span style="color: var(--success)">{{ runStatus.summary?.completed || 0 }} 完成</span> /
            <span style="color: var(--danger)">{{ runStatus.summary?.failed || 0 }} 失败</span> /
            <span>{{ runStatus.summary?.running || 0 }} 执行中</span>
          </div>

          <div class="tab-bar">
            <button v-for="cat in categories" :key="cat.key"
              class="tab-btn" :class="{ active: activeTab === cat.key }"
              @click="activeTab = cat.key">{{ cat.label }}</button>
          </div>

          <div class="op-grid">
            <button v-for="op in currentOps" :key="op.key"
              class="op-btn" :class="{ danger: op.danger }"
              @click="handleOpClick(op.key, op.label)"
              :disabled="!hasSelection || running">
              {{ op.label }}
            </button>
          </div>
        </div>

        <div v-if="logs.length > 0" class="panel log-panel">
          <div class="panel-header">
            <h2>执行日志</h2>
            <div class="panel-actions">
              <label class="auto-scroll-toggle">
                <input type="checkbox" v-model="autoScrollLog" />
                <span>自动滚动</span>
              </label>
              <button class="btn btn-xs btn-outline" @click="openDreamShopModal">梦境日志</button>
              <button class="btn btn-xs btn-outline" @click="openCarLogModal">赛车日志</button>
              <button class="btn btn-xs btn-outline" @click="clearLogs">清空</button>
            </div>
          </div>
          <div class="log-list" ref="logListRef">
            <div v-for="(log, i) in logs" :key="i" class="log-line" :class="log.type">
              <span class="log-time">{{ log.time }}</span>
              <span class="log-message">{{ log.message }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 梦境购买日志弹窗 -->
    <div v-if="showDreamShopModal" class="modal-overlay" @click.self="closeDreamShopModal">
      <div class="modal-card log-modal">
        <div class="modal-header">
          <div style="font-weight:700;font-size:16px">梦境购买日志</div>
          <div class="modal-header-actions">
            <button class="btn btn-xs btn-outline" @click="loadDreamShopLogs">刷新</button>
            <button class="btn btn-xs btn-outline" @click="exportDreamShopJson" :disabled="dreamShopAllUsers">导出JSON</button>
            <button class="btn btn-xs btn-outline" @click="exportDreamShopCsv" :disabled="dreamShopAllUsers">导出CSV</button>
            <label class="btn btn-xs btn-outline" style="margin:0;cursor:pointer">
              导入
              <input type="file" accept=".json" style="display:none" @change="importDreamShopJson" />
            </label>
            <label v-if="isAdmin" class="admin-toggle-inline">
              <input v-model="dreamShopAllUsers" type="checkbox" /> 全部用户
            </label>
            <button class="btn btn-xs btn-outline" @click="closeDreamShopModal">关闭</button>
          </div>
        </div>
        <div class="modal-body">
          <div v-if="dreamShopLoading" class="text-center text-muted" style="padding:30px">加载中...</div>
          <div v-else-if="dreamShopLogs.length === 0" class="text-center text-muted" style="padding:30px">暂无梦境购买记录</div>
          <div v-else>
            <div v-for="(group, date) in dreamShopGrouped" :key="date" style="margin-bottom:12px">
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;padding-left:4px">{{ date }}</div>
              <div v-for="(log, i) in group" :key="i" class="log-modal-card">
                <div class="log-modal-time">
                  {{ formatTime(log.time) }}
                  <span v-if="dreamShopAllUsers" class="user-tag">{{ log.userKey }}</span>
                </div>
                <div class="log-modal-msg">
                  <span style="font-weight:600">{{ log.accountName }}</span>
                  <span style="color:var(--text-muted)"> · </span>
                  <span>{{ log.merchantName }}</span>
                  <span style="color:var(--text-muted)"> · </span>
                  <span style="color:var(--success);font-weight:500">{{ log.itemName }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 赛车发车日志弹窗 -->
    <div v-if="showCarLogModal" class="modal-overlay" @click.self="closeCarLogModal">
      <div class="modal-card log-modal">
        <div class="modal-header">
          <div style="font-weight:700;font-size:16px">赛车发车日志</div>
          <div class="modal-header-actions">
            <button class="btn btn-xs btn-outline" @click="loadCarLogs">刷新</button>
            <button class="btn btn-xs btn-outline" @click="exportCarLogJson" :disabled="carLogAllUsers">导出JSON</button>
            <button class="btn btn-xs btn-outline" @click="exportCarLogCsv" :disabled="carLogAllUsers">导出CSV</button>
            <label class="btn btn-xs btn-outline" style="margin:0;cursor:pointer">
              导入
              <input type="file" accept=".json" style="display:none" @change="importCarLogJson" />
            </label>
            <label v-if="isAdmin" class="admin-toggle-inline">
              <input v-model="carLogAllUsers" type="checkbox" /> 全部用户
            </label>
            <button class="btn btn-xs btn-outline" @click="closeCarLogModal">关闭</button>
          </div>
        </div>
        <div class="modal-body">
          <div v-if="carLogLoading" class="text-center text-muted" style="padding:30px">加载中...</div>
          <div v-else-if="carLogs.length === 0" class="text-center text-muted" style="padding:30px">暂无赛车发车记录</div>
          <div v-else>
            <div v-for="(group, date) in carLogGrouped" :key="date" style="margin-bottom:12px">
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;padding-left:4px">{{ date }}</div>
              <div v-for="(log, i) in group" :key="i" class="log-modal-card car">
                <div class="log-modal-time">
                  {{ formatTime(log.time) }}
                  <span v-if="carLogAllUsers" class="user-tag">{{ log.userKey }}</span>
                </div>
                <div class="log-modal-msg">
                  <span style="font-weight:600">{{ log.accountName }}</span>
                  <span style="color:var(--text-muted)"> · </span>
                  <span style="color:var(--primary)">发车 {{ log.sentCount }} 辆</span>
                </div>
                <div v-if="log.cars && log.cars.length" class="log-modal-cars">
                  <span v-for="(c, idx) in log.cars" :key="idx" class="car-chip" :class="'car-color-' + c.color">
                    赛车{{ idx + 1 }}:{{ c.colorLabel }}<template v-if="c.rewards && c.rewards.length">（<span v-for="(r, ri) in c.rewards" :key="ri">{{ r.count }}{{ r.name }}<span v-if="ri < c.rewards.length - 1">,</span></span>）</template>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 统一任务模板弹窗 -->
    <div v-if="showTaskTemplateModal" class="modal-overlay" @click.self="closeTaskTemplateModal">
      <div class="modal-card unified-modal">
        <div class="modal-header">
          <div style="font-weight:700;font-size:16px">任务模板</div>
          <button class="btn btn-xs btn-outline" @click="closeTaskTemplateModal">关闭</button>
        </div>

        <div class="modal-tabs">
          <button v-for="tab in modalTabs" :key="tab.key"
            class="tab-btn" :class="{ active: templateTab === tab.key }"
            @click="templateTab = tab.key">{{ tab.label }}</button>
        </div>

        <div class="modal-body">
          <!-- 批量设置 -->
          <div v-if="templateTab === 'batchSettings'">
            <div class="settings-section-title">执行调度</div>
            <div class="settings-grid">
              <div class="input-group">
                <label>最大并发账号数</label>
                <input type="number" v-model.number="batchSettings.maxActive" min="1" max="10" />
              </div>
              <div class="input-group">
                <label>最大日志条数</label>
                <input type="number" v-model.number="batchSettings.maxLogEntries" min="100" />
              </div>
            </div>

            <div class="settings-section-title">通用延迟（毫秒）</div>
            <div class="settings-grid">
              <div class="input-group">
                <label>指令延迟</label>
                <input type="number" v-model.number="batchSettings.commandDelay" min="0" />
              </div>
              <div class="input-group">
                <label>任务间延迟</label>
                <input type="number" v-model.number="batchSettings.taskDelay" min="0" />
              </div>
              <div class="input-group">
                <label>动作延迟</label>
                <input type="number" v-model.number="batchSettings.actionDelay" min="0" />
              </div>
              <div class="input-group">
                <label>战斗延迟</label>
                <input type="number" v-model.number="batchSettings.battleDelay" min="0" />
              </div>
              <div class="input-group">
                <label>刷新延迟</label>
                <input type="number" v-model.number="batchSettings.refreshDelay" min="0" />
              </div>
              <div class="input-group">
                <label>长等待延迟</label>
                <input type="number" v-model.number="batchSettings.longDelay" min="0" />
              </div>
            </div>

            <div class="settings-section-title">默认数量</div>
            <div class="settings-grid">
              <div class="input-group">
                <label>开箱数量</label>
                <input type="number" v-model.number="batchSettings.boxCount" min="1" />
              </div>
              <div class="input-group">
                <label>钓鱼次数</label>
                <input type="number" v-model.number="batchSettings.fishCount" min="1" />
              </div>
              <div class="input-group">
                <label>招募次数</label>
                <input type="number" v-model.number="batchSettings.recruitCount" min="1" />
              </div>
            </div>

            <div class="settings-section-title">默认类型</div>
            <div class="settings-grid">
              <div class="input-group">
                <label>默认宝箱</label>
                <select v-model.number="batchSettings.defaultBoxType">
                  <option :value="2001">木质</option>
                  <option :value="2002">青铜</option>
                  <option :value="2003">黄金</option>
                  <option :value="2004">铂金</option>
                </select>
              </div>
              <div class="input-group">
                <label>默认鱼竿</label>
                <select v-model.number="batchSettings.defaultFishType">
                  <option :value="1">普通</option>
                  <option :value="2">黄金</option>
                </select>
              </div>
            </div>

            <div class="settings-section-title">智能发车默认阈值</div>
            <div class="settings-grid">
              <div class="input-group">
                <label>金砖 ≥</label>
                <input type="number" v-model.number="batchSettings.carGoldThreshold" min="0" />
              </div>
              <div class="input-group">
                <label>招募令 ≥</label>
                <input type="number" v-model.number="batchSettings.carRecruitThreshold" min="0" />
              </div>
              <div class="input-group">
                <label>白玉 ≥</label>
                <input type="number" v-model.number="batchSettings.carJadeThreshold" min="0" />
              </div>
              <div class="input-group">
                <label>刷新票 ≥</label>
                <input type="number" v-model.number="batchSettings.carTicketThreshold" min="0" />
              </div>
            </div>

            <div class="modal-actions">
              <button class="btn btn-primary" style="flex:1" @click="saveBatchSettings" :disabled="savingBatch">
                {{ savingBatch ? '保存中...' : '保存全局设置' }}
              </button>
              <button class="btn btn-outline" @click="resetBatchSettings">恢复默认</button>
            </div>
          </div>

          <!-- 应用模板 -->
          <div v-if="templateTab === 'applyTemplate'">
            <div class="empty-tip" v-if="templates.length === 0">暂无模板，请先前往“模板管理”创建</div>
            <div v-else>
              <div class="input-group" style="margin-bottom:16px">
                <label>选择模板</label>
                <select v-model="applyTemplateId">
                  <option value="">— 请选择 —</option>
                  <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
              </div>
              <div class="selected-preview">已选择 {{ selectedCount }} 个账号</div>
              <div class="modal-actions">
                <button class="btn btn-primary" style="flex:1" @click="confirmApplyTemplate" :disabled="!applyTemplateId || applyingTemplate">
                  {{ applyingTemplate ? '应用中...' : '确认应用' }}
                </button>
              </div>
            </div>
          </div>

          <!-- 每日模板 -->
          <div v-if="templateTab === 'templates'">
            <div class="input-group" style="margin-bottom:12px">
              <label>模板名称</label>
              <input v-model="newTemplateName" placeholder="例如：日常精简版" />
            </div>

            <div class="settings-section-title">任务开关</div>
            <div class="template-toggle-grid">
              <label v-for="item in templateToggleItems" :key="item.key" class="checkbox-item">
                <input type="checkbox" v-model="newTemplateSettings[item.key]" />
                <span>{{ item.label }}</span>
                <small v-if="item.desc" class="toggle-desc">{{ item.desc }}</small>
              </label>
            </div>

            <div class="settings-section-title">阵容配置</div>
            <div class="settings-grid">
              <div class="input-group">
                <label>竞技场阵容</label>
                <select v-model.number="newTemplateSettings.arenaFormation">
                  <option v-for="n in 5" :key="n" :value="n">阵容{{ n }}</option>
                </select>
              </div>
              <div class="input-group">
                <label>BOSS阵容</label>
                <select v-model.number="newTemplateSettings.bossFormation">
                  <option v-for="n in 5" :key="n" :value="n">阵容{{ n }}</option>
                </select>
              </div>
              <div class="input-group">
                <label>BOSS次数</label>
                <select v-model.number="newTemplateSettings.bossTimes">
                  <option :value="0">不执行</option>
                  <option :value="1">1次</option>
                  <option :value="2">2次</option>
                  <option :value="3">3次</option>
                </select>
              </div>
            </div>

            <div class="modal-actions">
              <button class="btn btn-primary" style="flex:1" @click="saveTemplate" :disabled="savingTemplate">
                {{ savingTemplate ? '保存中...' : (editingTemplateId ? '更新模板' : '保存模板') }}
              </button>
              <button v-if="editingTemplateId" class="btn btn-outline" @click="cancelEditTemplate">取消编辑</button>
            </div>

            <div class="template-list" v-if="templates.length > 0">
              <div v-for="t in templates" :key="t.id" class="template-list-item">
                <div>
                  <div style="font-weight:600;font-size:14px">{{ t.name }}</div>
                  <div style="font-size:11px;color:var(--text-muted)">{{ formatTemplateTime(t.createdAt) }}</div>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-sm btn-outline" @click="editTemplate(t)">编辑</button>
                  <button class="btn btn-sm" style="background:var(--danger);color:#fff;border:none" @click="deleteTemplate(t.id)">删除</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 梦境商品 -->
          <div v-if="templateTab === 'dreamShop'">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">请勾选需要购买的商品，只对当前商人列表中存在的商品生效。</div>
            <div style="display:flex;gap:8px;margin-bottom:12px">
              <button class="btn btn-xs btn-warning" @click="selectDreamGoldItems">一键勾选金币商品</button>
              <button class="btn btn-xs btn-outline" @click="selectAllDreamItems">全选</button>
              <button class="btn btn-xs btn-outline" @click="clearDreamItems">清空</button>
            </div>
            <div class="dream-shop-body">
              <div v-for="(merchant, id) in dreamMerchantConfig" :key="id" style="margin-bottom:14px">
                <div style="font-weight:600;font-size:14px;margin-bottom:6px">{{ merchant.name }}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                  <label v-for="(item, index) in merchant.items" :key="index" class="checkbox-item">
                    <input type="checkbox" :value="`${id}-${index}`" :checked="dreamBuyList.includes(`${id}-${index}`)" @change="e => toggleDreamItem(`${id}-${index}`, e.target.checked)" />
                    <span style="font-size:12px">{{ item }}</span>
                  </label>
                </div>
              </div>
            </div>
            <div class="modal-actions">
              <button class="btn btn-primary" style="flex:1" @click="saveDreamShopConfig">保存配置</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- 单账号设置弹窗 -->
    <div v-if="showAccountSettingsModal" class="modal-overlay" @click.self="closeAccountSettings">
      <div class="modal-card unified-modal">
        <div class="modal-header">
          <div style="font-weight:700;font-size:16px">账号设置: {{ accountSettingsTarget?.name || accountSettingsTarget?.id }}</div>
          <button class="btn btn-xs btn-outline" @click="closeAccountSettings">关闭</button>
        </div>

        <div class="modal-body">
          <div class="input-group" style="margin-bottom:16px">
            <label>应用模板</label>
            <div style="display:flex;gap:8px">
              <select v-model="accountSelectedTemplate" style="flex:1">
                <option value="">— 请选择 —</option>
                <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
              <button class="btn btn-outline" @click="applyTemplateToAccount" :disabled="!accountSelectedTemplate">应用</button>
            </div>
          </div>

          <div class="settings-section-title">任务开关</div>
          <div class="template-toggle-grid">
            <label v-for="item in templateToggleItems" :key="item.key" class="checkbox-item">
              <input type="checkbox" v-model="accountSettings[item.key]" />
              <span>{{ item.label }}</span>
              <small v-if="item.desc" class="toggle-desc">{{ item.desc }}</small>
            </label>
          </div>

          <div class="settings-section-title">阵容配置</div>
          <div class="settings-grid">
            <div class="input-group">
              <label>竞技场阵容</label>
              <select v-model.number="accountSettings.arenaFormation">
                <option v-for="n in 5" :key="n" :value="n">阵容{{ n }}</option>
              </select>
            </div>
            <div class="input-group">
              <label>BOSS阵容</label>
              <select v-model.number="accountSettings.bossFormation">
                <option v-for="n in 5" :key="n" :value="n">阵容{{ n }}</option>
              </select>
            </div>
            <div class="input-group">
              <label>BOSS次数</label>
              <select v-model.number="accountSettings.bossTimes">
                <option :value="0">不执行</option>
                <option :value="1">1次</option>
                <option :value="2">2次</option>
                <option :value="3">3次</option>
              </select>
            </div>
          </div>

          <div class="settings-section-title">智能发车阈值</div>
          <div class="settings-grid">
            <div class="input-group">
              <label>金砖 ≥</label>
              <input type="number" v-model.number="accountCarThresholds.carGoldThreshold" min="0" />
            </div>
            <div class="input-group">
              <label>招募令 ≥</label>
              <input type="number" v-model.number="accountCarThresholds.carRecruitThreshold" min="0" />
            </div>
            <div class="input-group">
              <label>白玉 ≥</label>
              <input type="number" v-model.number="accountCarThresholds.carJadeThreshold" min="0" />
            </div>
            <div class="input-group">
              <label>刷新票 ≥</label>
              <input type="number" v-model.number="accountCarThresholds.carTicketThreshold" min="0" />
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-primary" style="flex:1" @click="saveAccountSettings" :disabled="savingAccountSettings">
              {{ savingAccountSettings ? '保存中...' : '保存设置' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { api } from '../api'
import { useToastStore } from '../stores/toast'
import ScheduleManager from '../components/ScheduleManager.vue'

const toast = useToastStore()
const accounts = ref([])
const loading = ref(true)
const selectedIds = ref(new Set())
const activeTab = ref('daily')
const running = ref(false)
const currentRunId = ref(null)
const runStatus = ref(null)
const currentOperationLabel = ref('')
const refreshingTokens = ref(false)
let statusTimer = null
const logs = ref([])
const logListRef = ref(null)
const autoScrollLog = ref(true)
let logTimer = null

const accountStatusMap = reactive({})
const statusPollingSet = new Set()

const dreamMerchantConfig = {
  1: { name: '初级商人', items: ['进阶石', '精铁', '木质宝箱', '青铜宝箱', '普通鱼竿', '咸神门票', '咸神火把'] },
  2: { name: '中级商人', items: ['梦魇晶石', '进阶石', '精铁', '黄金宝箱', '黄金鱼竿', '招募令', '橙将碎片', '紫将碎片'] },
  3: { name: '高级商人', items: ['梦魇晶石', '铂金宝箱', '黄金鱼竿', '招募令', '红将碎片', '橙将碎片', '红将碎片', '普通鱼竿'] },
}
const dreamGoldItems = { 1: [5, 6], 2: [6, 7], 3: [5, 6, 7] }
const dreamStorageKey = 'dreamPurchaseList'

const dreamBuyList = ref([])

// ======== 弹窗日志（梦境购买/赛车发车） ========
const isAdmin = ref(false)
const showDreamShopModal = ref(false)
const dreamShopLogs = ref([])
const dreamShopLoading = ref(false)
const dreamShopAllUsers = ref(false)
const showCarLogModal = ref(false)
const carLogs = ref([])
const carLogLoading = ref(false)
const carLogAllUsers = ref(false)

const DEFAULT_BATCH_SETTINGS = {
  maxActive: 2,
  commandDelay: 500,
  taskDelay: 500,
  actionDelay: 300,
  battleDelay: 500,
  refreshDelay: 1000,
  longDelay: 3000,
  boxCount: 100,
  fishCount: 100,
  recruitCount: 10,
  defaultBoxType: 2001,
  defaultFishType: 2,
  carGoldThreshold: 500,
  carRecruitThreshold: 3,
  carJadeThreshold: 500,
  carTicketThreshold: 4,
  maxLogEntries: 1000,
}

const batchSettings = ref({ ...DEFAULT_BATCH_SETTINGS })

const onlineCount = computed(() => accounts.value.filter(a => a.status === 'connected').length)
const todayRuns = ref(0)
const scheduleCount = ref(0)

// 账号状态缓存：活跃度 + 车辆（仅内存，不依赖 localStorage，适配服务器部署）
function dailyPointData(id) {
  const cached = accountStatusMap[id]
  const point = cached?.dailyPoint || 0
  const max = cached?.dailyPointMax || 100
  return { point, max, done: point >= max || point >= 100, pending: !!cached?.pending, snapshot: !!cached?.snapshot }
}

function dailyPointVisible(id) {
  return true
}

function carStatusVisible(id) {
  // 赛车标签只在周一到周三显示（getDay: 1=周一, 2=周二, 3=周三）
  const wd = new Date().getDay()
  return wd === 1 || wd === 2 || wd === 3
}

function dailyPointText(id) {
  const d = dailyPointData(id)
  if (d.pending) return '执行中'
  return `${d.point}/${d.max}`
}

function dailyPointClass(id) {
  const d = dailyPointData(id)
  if (d.pending) return 'status-info'
  if (d.point >= 100) return 'status-success'
  return 'status-default'
}

function carStatusData(id) {
  const cached = accountStatusMap[id]
  const status = cached?.carStatus
  if (!status) return { text: '赛车未查询', type: 'default' }
  if (!status.open) return { text: '赛车未开放', type: 'default' }
  const total = status.total || 0
  const sent = status.sent || 0
  if (total > 0 && sent >= total) return { text: '已发车', type: 'success' }
  if (total > 0) return { text: `已发 ${sent}/${total}`, type: 'warning' }
  return { text: '赛车未查询', type: 'default' }
}

function carStatusText(id) {
  return carStatusData(id).text
}

function carStatusClass(id) {
  return `status-${carStatusData(id).type}`
}

const showTaskTemplateModal = ref(false)
const templateTab = ref('batchSettings')
const modalTabs = [
  { key: 'batchSettings', label: '批量设置' },
  { key: 'applyTemplate', label: '应用模板' },
  { key: 'templates', label: '每日模板' },
  { key: 'dreamShop', label: '梦境商品' },
]

const templates = ref([])
const applyTemplateId = ref('')
const applyingTemplate = ref(false)
const savingBatch = ref(false)

// ======== 单账号设置弹窗 ========
const showAccountSettingsModal = ref(false)
const accountSettingsTarget = ref(null)
const accountSettings = ref({
  arenaFormation: 1,
  bossFormation: 1,
  bossTimes: 0,
})
const accountCarThresholds = ref({
  carGoldThreshold: 500,
  carRecruitThreshold: 3,
  carJadeThreshold: 500,
  carTicketThreshold: 4,
})
const savingAccountSettings = ref(false)
const accountSelectedTemplate = ref('')

function resetAccountSettings() {
  accountSettings.value = {
    arenaFormation: 1,
    bossFormation: 1,
    bossTimes: 0,
  }
  for (const item of templateToggleItems) {
    accountSettings.value[item.key] = false
  }
  accountCarThresholds.value = {
    carGoldThreshold: 500,
    carRecruitThreshold: 3,
    carJadeThreshold: 500,
    carTicketThreshold: 4,
  }
}

async function openAccountSettings(acc) {
  accountSettingsTarget.value = acc
  resetAccountSettings()
  accountSelectedTemplate.value = ''
  try {
    const settings = await api.get(`/api/accounts/${acc.id}/settings`).catch(() => ({}))
    if (settings && typeof settings === 'object') {
      Object.assign(accountSettings.value, settings)
      accountCarThresholds.value = {
        carGoldThreshold: settings.carGoldThreshold ?? 500,
        carRecruitThreshold: settings.carRecruitThreshold ?? 3,
        carJadeThreshold: settings.carJadeThreshold ?? 500,
        carTicketThreshold: settings.carTicketThreshold ?? 4,
      }
    }
  } catch {}
  showAccountSettingsModal.value = true
}

function closeAccountSettings() {
  showAccountSettingsModal.value = false
  accountSettingsTarget.value = null
}

function applyTemplateToAccount() {
  const t = templates.value.find(x => x.id === accountSelectedTemplate.value)
  if (!t || !t.settings) return
  const s = { ...accountSettings.value, ...t.settings }
  accountSettings.value = s
  toast.show(`已应用模板: ${t.name}`)
}

async function saveAccountSettings() {
  if (!accountSettingsTarget.value) return
  savingAccountSettings.value = true
  try {
    const payload = {
      ...accountSettings.value,
      ...accountCarThresholds.value,
    }
    await api.put(`/api/accounts/${accountSettingsTarget.value.id}/settings`, payload)
    toast.show('账号设置已保存')
    closeAccountSettings()
  } catch (e) {
    toast.show('保存失败: ' + e.message)
  } finally {
    savingAccountSettings.value = false
  }
}

const newTemplateName = ref('')
const editingTemplateId = ref(null)
const savingTemplate = ref(false)
// 每日模板中可配置的任务开关列表（key 与后端 taskRunner 设置字段对应）
const templateToggleItems = [
  // 社交/互动类
  { key: 'shareEnable', label: '分享游戏' },      // 每日分享游戏
  { key: 'giveGoldEnable', label: '赠送金币' },    // 给好友赠送金币

  // 招募类
  { key: 'freeRecruit', label: '免费招募' },       // 只执行免费招募
  { key: 'payRecruit', label: '付费招募' },        // 免费招募 + 付费招募（需先完成免费才有前置条件）

  // 点金/盐罐/宝箱
  { key: 'freeGoldEnable', label: '免费点金' },    // 免费点金手
  { key: 'claimBottle', label: '盐罐' },           // 领取盐罐奖励
  { key: 'openBox', label: '开宝箱' },             // 自动开宝箱

  // 钓鱼/扭蛋/挂机/固定奖励
  { key: 'fishingEnable', label: '钓鱼' },         // 自动钓鱼（普通/黄金鱼竿）
  { key: 'freeGachaEnable', label: '免费扭蛋' },   // 领取免费扭蛋
  { key: 'claimHangUp', label: '挂机奖励' },       // 领取挂机奖励
  { key: 'fixedRewardsEnable', label: '固定奖励', desc: '签到/俱乐部/礼包/珍宝阁' }, // 签到/俱乐部/礼包/珍宝阁等固定每日奖励

  // 邮件/竞技场/灯神
  { key: 'claimEmail', label: '邮件奖励' },        // 一键领取邮件
  { key: 'arenaEnable', label: '竞技场' },          // 竞技场挑战
  { key: 'genieSweepEnable', label: '灯神扫荡' },  // 灯神扫荡

  // 黑市/答题
  { key: 'blackMarketPurchase', label: '黑市购买' }, // 黑市快速购买
  { key: 'studyEnable', label: '自动答题' },        // 自动答题
]
// 注意：车辆类任务（智能发车/一键收车）和咸王梦境已移出每日模板，
// 因为车队活动仅在周一至周三开放，咸王梦境仅在周日/周一/周三/周四开放，均不是每日任务
const newTemplateSettings = ref({
  arenaFormation: 1,
  bossFormation: 1,
  bossTimes: 0,
})
for (const item of templateToggleItems) {
  newTemplateSettings.value[item.key] = false
}

const allSelected = computed(() => accounts.value.length > 0 && accounts.value.every(a => selectedIds.value.has(a.id)))
const isIndeterminate = computed(() => selectedIds.value.size > 0 && selectedIds.value.size < accounts.value.length)
const selectedCount = computed(() => selectedIds.value.size)
const hasSelection = computed(() => selectedCount.value > 0)

const categories = [
  { key: 'daily', label: '日常' },
  { key: 'dungeon', label: '副本' },
  { key: 'baoku', label: '宝库' },
  { key: 'weirdTower', label: '怪异塔' },
  { key: 'resource', label: '资源' },
  { key: 'legacy', label: '功法' },
  { key: 'monthly', label: '月度' },
]

const allOps = {
  daily: [
    { key: 'claimHangUp', label: '领取挂机' },
    { key: 'addHangUpTime', label: '一键加钟' },
    { key: 'resetBottles', label: '重置罐子' },
    { key: 'claimBottles', label: '一键领罐子' },
    { key: 'clubSign', label: '俱乐部签到' },
    { key: 'study', label: '一键答题' },
    { key: 'arena', label: '竞技场3次' },
    { key: 'smartSendCar', label: '智能发车' },
    { key: 'claimCars', label: '一键收车' },
    { key: 'blackMarket', label: '黑市采购' },
    { key: 'treasurePavilion', label: '珍宝阁' },
    { key: 'genieSweep', label: '灯神扫荡' },
    { key: 'freeGacha', label: '免费扭蛋' },
  ],
  dungeon: [
    { key: 'tower', label: '一键爬塔' },
    { key: 'dream', label: '一键梦境' },
    { key: 'skinChallenge', label: '换皮闯关' },
    { key: 'peachTasks', label: '蟠桃园任务' },
    { key: 'dreamShop', label: '梦境商品' },
  ],
  baoku: [
    { key: 'baoku13', label: '宝库前3层' },
    { key: 'baoku45', label: '宝库4-5层' },
  ],
  weirdTower: [
    { key: 'weirdTower', label: '爬怪异塔' },
    { key: 'weirdTowerUseItems', label: '使用道具' },
    { key: 'weirdTowerMerge', label: '怪异塔合成' },
    { key: 'weirdTowerFreeEnergy', label: '免费道具' },
  ],
  resource: [
    { key: 'chest', label: '批量开箱' },
    { key: 'chestPoints', label: '宝箱积分' },
    { key: 'fish', label: '批量钓鱼' },
    { key: 'recruit', label: '批量招募' },
    { key: 'heroUpgrade', label: '英雄升星' },
    { key: 'bookUpgrade', label: '图鉴升星' },
    { key: 'fourSaints', label: '四圣碎片' },
    { key: 'skinCoins', label: '5皮肤币' },
  ],
  legacy: [
    { key: 'legacyClaim', label: '功法领取' },
    { key: 'legacyGift', label: '功法赠送' },
  ],
  monthly: [
    { key: 'topUpFish', label: '钓鱼补齐' },
    { key: 'topUpArena', label: '竞技场补齐' },
  ],
}

const currentOps = computed(() => allOps[activeTab.value] || [])

const avatarColors = ['#6366f1','#8b5cf6','#3b82f6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899']
function avatarColor(id) {
  let hash = 0
  for (let i = 0; i < (id || '').length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

function formatTime(t) {
  if (!t) return ''
  let ts = Number(t)
  if (!isNaN(ts) && ts > 0 && String(ts).length <= 10) ts *= 1000
  const d = isNaN(ts) ? new Date(t) : new Date(ts)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  return d.toLocaleDateString()
}

function formatTemplateTime(t) {
  if (!t) return ''
  try { return new Date(t).toLocaleString() } catch { return '' }
}

async function loadAccounts() {
  try {
    accounts.value = await api.get('/api/accounts') || []
  } catch { }
}

async function loadBatchSettings() {
  try {
    const saved = await api.get('/api/settings/batch')
    batchSettings.value = { ...DEFAULT_BATCH_SETTINGS, ...(saved || {}) }
  } catch {
    batchSettings.value = { ...DEFAULT_BATCH_SETTINGS }
  }
}

async function loadTemplates() {
  try {
    templates.value = await api.get('/api/templates') || []
  } catch { templates.value = [] }
}

onMounted(async () => {
  await loadAccounts()
  await loadBatchSettings()
  await loadTemplates()
  loadDreamBuyList()
  await loadStats()
  loadCurrentUser()
  loading.value = false
  startLogPolling()
  refreshAccountStatusForAll()
  startStatusPolling()
})

onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer)
  if (logTimer) clearInterval(logTimer)
})

function startStatusPolling() {
  refreshAccountStatus()
  statusTimer = setInterval(refreshAccountStatus, 30000)
}

async function refreshAccountStatus() {
  const connected = accounts.value.filter(a => a.status === 'connected')
  for (const acc of connected) {
    // 该账号正在执行每日任务时，跳过状态轮询，避免任务完成后又触发查询重连
    if (accountStatusMap[acc.id]?.pending) continue
    if (statusPollingSet.has(acc.id)) continue
    queryAccountStatus(acc.id)
  }
}

async function queryAccountStatus(id) {
  if (statusPollingSet.has(id)) return
  statusPollingSet.add(id)
  try {
    await api.get(`/api/game/daily-status/${id}`).catch(() => null)
    await api.get(`/api/game/car-status/${id}`).catch(() => null)
    await pollAccountStatusResult(id, 'daily-status', 8)
    await pollAccountStatusResult(id, 'car-status', 8)
  } catch {}
  statusPollingSet.delete(id)
}

async function pollAccountStatusResult(id, feature, maxAttempts) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 1500))
    try {
      const res = await api.get(`/api/game/result/${id}/${feature}`)
      if (!res.ready) continue
      if (res.error) break
      const prev = accountStatusMap[id] || {}
      let next = { ...prev }
      if (feature === 'daily-status' && res.data?.dailyTasks) {
        next.dailyPoint = res.data.dailyTasks.dailyPoint || 0
        const role = res.data.role?._raw?.role || res.data.role || {}
        next.dailyPointMax =
          res.data.dailyTasks.maxPoint ||
          res.data.dailyTasks.dailyPointMax ||
          role.dailyTask?.maxPoint ||
          role.dailyTask?.dailyPointMax ||
          100
        // 真实状态已返回，清除执行中标记
        delete next.pending
      }
      if (feature === 'car-status' && res.data) {
        next.carStatus = res.data
      }
      accountStatusMap[id] = next
      break
    } catch {}
  }
}

async function refreshAccountStatusForAll() {
  // 页面加载时先加载所有账号的快照（不触发连接），再对在线账号实时查询
  await Promise.all([loadAllDailySnapshots(), loadAllCarSnapshots()])
  for (const acc of accounts.value.filter(a => a.status === 'connected')) {
    queryAccountStatus(acc.id)
  }
}

async function loadAllDailySnapshots() {
  for (const acc of accounts.value) {
    try {
      const res = await api.get(`/api/game/last-daily-status/${acc.id}`)
      const current = accountStatusMap[acc.id] || {}
      // 快照不覆盖正在执行中的 pending 状态
      if (current.pending) continue
      accountStatusMap[acc.id] = {
        ...current,
        dailyPoint: res.dailyPoint ?? 0,
        dailyPointMax: res.dailyPointMax ?? 100,
        snapshot: !res.expired
      }
    } catch {}
  }
}

async function loadAllCarSnapshots() {
  for (const acc of accounts.value) {
    try {
      const res = await api.get(`/api/game/last-car-status/${acc.id}`)
      accountStatusMap[acc.id] = {
        ...(accountStatusMap[acc.id] || {}),
        carStatus: res
      }
    } catch {}
  }
}

async function refreshAccountStatusForAccount(id) {
  // 手动触发单个账号状态查询（如点击每日时）
  queryAccountStatus(id)
}

async function loadStats() {
  try {
    const [d, scheds] = await Promise.all([
      api.get('/api/control/dashboard').catch(() => null),
      api.get('/api/tasks').catch(() => []),
    ])
    todayRuns.value = d?.todayRuns || 0
    scheduleCount.value = (scheds || []).length
  } catch {}
}

function startLogPolling() {
  if (logTimer) return
  fetchServerLogs()
  logTimer = setInterval(fetchServerLogs, 2000)
}

async function fetchServerLogs() {
  try {
    const serverLogs = await api.get('/api/control/logs?limit=100')
    if (Array.isArray(serverLogs) && serverLogs.length > 0) {
      const existingKeys = new Set(logs.value.map(l => l.isoTime + '|' + l.message))
      for (const entry of serverLogs) {
        const isoTime = entry.time || new Date().toISOString()
        const key = isoTime + '|' + entry.message
        if (!existingKeys.has(key)) {
          logs.value.push({
            time: new Date(isoTime).toLocaleTimeString(),
            isoTime,
            message: dedupeLogMessage(entry.message),
            type: entry.level || 'info'
          })
          if (logs.value.length > 200) logs.value.shift()
        }
      }
    }
  } catch (e) {
    // 忽略日志拉取错误
  }
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(accounts.value.map(a => a.id))
  }
}

function toggleSelect(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function selectConnected() {
  selectedIds.value = new Set(accounts.value.filter(a => a.status === 'connected').map(a => a.id))
}

async function refreshAll() {
  loading.value = true
  await loadAccounts()
  await loadTemplates()
  loading.value = false
  refreshAccountStatus()
  toast.show('已刷新')
}

async function toggleConnect(acc) {
  try {
    if (acc.status === 'connected') {
      await api.post(`/api/control/disconnect/${acc.id}`)
      acc.status = 'disconnected'
      delete accountStatusMap[acc.id]
      toast.show('已断开')
    } else {
      await api.post(`/api/control/connect/${acc.id}`)
      toast.show('连接中...')
    }
    await loadAccounts()
  } catch (e) {
    toast.show('操作失败: ' + e.message)
  }
}

async function runDaily(acc) {
  try {
    const settings = await api.get(`/api/accounts/${acc.id}/settings`).catch(() => ({}))
    await api.post(`/api/control/run-daily/${acc.id}`, { settings })
    toast.show(`已触发: ${acc.name || acc.id}`)
    // 先把账号标记为执行中状态，避免显示离线
    acc.status = 'connected'
    accountStatusMap[acc.id] = { dailyPoint: 0, dailyPointMax: 100, pending: true }
    // 轮询等待任务完成，然后刷新状态
    waitDailyCompleteAndRefresh(acc.id)
  } catch (e) {
    toast.show('执行失败: ' + e.message)
  }
}

async function waitDailyCompleteAndRefresh(id) {
  // 任务执行期间监听后端推送的活跃度更新和日志完成标志
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000))
    try {
      const serverLogs = await api.get('/api/control/logs?limit=200')

      // 1. 解析活跃度实时推送（取最新一条）
      const updateLogs = serverLogs.filter(l =>
        l.accountId === id && l.message?.startsWith('__DAILY_POINT_UPDATE__:')
      )
      const updateLog = updateLogs[updateLogs.length - 1]
      if (updateLog) {
        const match = updateLog.message.match(/:(\d+)\/(\d+)/)
        if (match) {
          const point = parseInt(match[1], 10)
          const max = parseInt(match[2], 10)
          accountStatusMap[id] = {
            ...(accountStatusMap[id] || {}),
            dailyPoint: point,
            dailyPointMax: max,
            pending: true
          }
        }
      }

      // 2. 检测完成标志
      const completed = serverLogs.some(l =>
        l.accountId === id && /手动每日任务完成|所有任务执行完成|每日任务完成/.test(l.message)
      )
      if (completed) {
        await loadAccountDailySnapshot(id)
        await loadAccountCarSnapshot(id)
        const acc = accounts.value.find(a => a.id === id)
        if (acc) {
          acc.status = 'disconnected'
          const s = accountStatusMap[id]
          if (s) delete s.pending
        }
        return
      }
    } catch (e) {
      console.error('waitDailyCompleteAndRefresh error', e)
    }
  }
}

async function loadAccountDailySnapshot(id) {
  try {
    const res = await api.get(`/api/game/last-daily-status/${id}`)
    const current = accountStatusMap[id] || {}
    accountStatusMap[id] = {
      ...current,
      dailyPoint: res.dailyPoint ?? 0,
      dailyPointMax: res.dailyPointMax ?? 100,
      snapshot: !res.expired
    }
  } catch {}
}

async function loadAccountCarSnapshot(id) {
  try {
    const res = await api.get(`/api/game/last-car-status/${id}`)
    accountStatusMap[id] = {
      ...(accountStatusMap[id] || {}),
      carStatus: res
    }
  } catch {}
}

async function batchConnect() {
  const ids = [...selectedIds.value]
  addLog(`批量连接 ${ids.length} 个账号`)
  for (const id of ids) {
    const acc = accounts.value.find(a => a.id === id)
    try {
      await api.post(`/api/control/connect/${id}`, null, { timeout: 60000 })
      addLog(`[${acc?.name || id}] 连接已触发`, 'success')
      const fresh = await api.get(`/api/accounts/${id}`).catch(() => null)
      if (fresh && acc) {
        acc.status = fresh.status || 'connected'
        acc.level = fresh.level ?? acc.level
        acc.last_login = fresh.last_login ?? acc.last_login
      }
    } catch (e) {
      addLog(`[${acc?.name || id}] 连接失败: ${e.message}`, 'error')
    }
    await new Promise(r => setTimeout(r, 1500))
  }
  await loadAccounts()
}

async function batchDisconnect() {
  const ids = [...selectedIds.value]
  addLog(`批量断开 ${ids.length} 个账号`)
  for (const id of ids) {
    const acc = accounts.value.find(a => a.id === id)
    try {
      await api.post(`/api/control/disconnect/${id}`, null, { timeout: 60000 })
      if (acc) {
        acc.status = 'disconnected'
        delete accountStatusMap[id]
      }
      addLog(`[${acc?.name || id}] 已断开`, 'success')
    } catch (e) {
      addLog(`[${acc?.name || id}] 断开失败: ${e.message}`, 'error')
    }
  }
  await loadAccounts()
}

// 删除账号（单个，带确认）
async function deleteAccount(acc) {
  if (!acc) return
  if (!confirm(`确定要删除账号「${acc.name || acc.id}」吗？\n此操作不可恢复，会同时清理会话和缓存。`)) return
  try {
    await api.del(`/api/accounts/${acc.id}`)
    addLog(`[${acc.name || acc.id}] 已删除`, 'success')
    selectedIds.value.delete(acc.id)
    await loadAccounts()
  } catch (e) {
    toast.show('删除失败: ' + e.message)
  }
}

// 批量删除（带确认）
async function batchDelete() {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return
  if (!confirm(`确定要删除选中的 ${ids.length} 个账号吗？\n此操作不可恢复，会同时清理会话和缓存。`)) return
  addLog(`批量删除 ${ids.length} 个账号`)
  try {
    const result = await api.post('/api/accounts/batch-delete', { ids }, { timeout: 60000 })
    addLog(`批量删除完成：成功 ${result.deletedCount}/${ids.length}`, result.failed?.length ? 'warning' : 'success')
    if (result.failed?.length) {
      for (const f of result.failed) {
        const name = accounts.value.find(a => a.id === f.id)?.name || f.id
        addLog(`[${name}] 删除失败: ${f.error}`, 'error')
      }
    }
    // 清理已删除账号的选中状态
    for (const id of result.deleted || []) {
      selectedIds.value.delete(id)
    }
    await loadAccounts()
  } catch (e) {
    toast.show('批量删除失败: ' + e.message)
  }
}

async function batchRefreshTokens() {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return
  if (refreshingTokens.value) return
  refreshingTokens.value = true
  const total = ids.length
  let success = 0, failed = 0, skipped = 0
  addLog(`批量刷新 Token ${total} 个账号（受全局限流 25 次/分钟，超 25 个会自动等待）`)
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const acc = accounts.value.find(a => a.id === id)
    const name = acc?.name || id
    addLog(`[${i + 1}/${total}] [${name}] 刷新中...`)
    try {
      const resp = await api.post(`/api/accounts/${id}/refresh-token`, null, { timeout: 120000 })
      success++
      // 后端返回本次因限流排队等待的毫秒数，>500ms 就明示给用户
      const waitedMs = resp?.waitedMs || 0
      if (waitedMs >= 500) {
        const sec = (waitedMs / 1000).toFixed(1)
        addLog(`[${i + 1}/${total}] [${name}] 成功（限流等待 ${sec}s）`, 'success')
      } else {
        addLog(`[${i + 1}/${total}] [${name}] 成功`, 'success')
      }
    } catch (e) {
      failed++
      const msg = e.message || ''
      if (msg.includes('无 BIN') || msg.includes('不支持')) {
        skipped++
        addLog(`[${i + 1}/${total}] [${name}] 跳过: ${msg}`, 'warning')
      } else {
        addLog(`[${i + 1}/${total}] [${name}] 失败: ${msg}`, 'error')
      }
    }
  }
  addLog(`刷新完成：成功 ${success}/${total}，失败 ${failed}，跳过 ${skipped}`, failed > 0 ? 'error' : 'success')
  await loadAccounts()
  refreshingTokens.value = false
}

// ======== 弹窗日志：梦境购买 + 赛车发车 ========

function formatDateLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const logDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = (today - logDay) / (24 * 60 * 60 * 1000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  return d.toLocaleDateString()
}

const dreamShopGrouped = computed(() => {
  const map = {}
  for (const log of dreamShopLogs.value) {
    const date = formatDateLabel(log.time)
    if (!map[date]) map[date] = []
    map[date].push(log)
  }
  return map
})

const carLogGrouped = computed(() => {
  const map = {}
  for (const log of carLogs.value) {
    const date = formatDateLabel(log.time)
    if (!map[date]) map[date] = []
    map[date].push(log)
  }
  return map
})

async function loadCurrentUser() {
  try {
    const me = await api.auth.me()
    isAdmin.value = me?.userKey === 'admin'
  } catch {
    const saved = localStorage.getItem('auth_user')
    if (saved) {
      try { isAdmin.value = JSON.parse(saved).userKey === 'admin' } catch {}
    }
  }
}

function openDreamShopModal() {
  showDreamShopModal.value = true
  loadDreamShopLogs()
}

function closeDreamShopModal() {
  showDreamShopModal.value = false
}

async function loadDreamShopLogs() {
  dreamShopLoading.value = true
  try {
    const endpoint = dreamShopAllUsers.value ? '/api/logs/dream-shop/all' : '/api/logs/dream-shop'
    const data = await api.get(endpoint)
    dreamShopLogs.value = Array.isArray(data) ? data : []
  } catch (e) {
    toast.show('加载梦境日志失败: ' + e.message)
  } finally {
    dreamShopLoading.value = false
  }
}

function openCarLogModal() {
  showCarLogModal.value = true
  loadCarLogs()
}

function closeCarLogModal() {
  showCarLogModal.value = false
}

async function loadCarLogs() {
  carLogLoading.value = true
  try {
    const endpoint = carLogAllUsers.value ? '/api/logs/car/all' : '/api/logs/car'
    const data = await api.get(endpoint)
    carLogs.value = Array.isArray(data) ? data : []
  } catch (e) {
    toast.show('加载赛车日志失败: ' + e.message)
  } finally {
    carLogLoading.value = false
  }
}

// ======== 日志导入/导出 ========
// 导出：从浏览器下载当前用户的 JSON 日志文件（保存 7 天内的记录）
// 导入：上传之前导出的 JSON，后端会合并到当前用户文件并自动过滤超过 7 天的记录

function exportDreamShopJson() {
  // 用浏览器原生 fetch 拿 blob（api.get 已解析 JSON，这里直接用 token 拼 URL 下载更稳）
  const token = localStorage.getItem('auth_token') || ''
  fetch('/api/logs/dream-shop/export-json', {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dream-shop-log-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.show('梦境日志已导出')
    })
    .catch(e => toast.show('导出失败: ' + e.message))
}

function exportCarLogJson() {
  const token = localStorage.getItem('auth_token') || ''
  fetch('/api/logs/car/export-json', {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `car-log-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.show('赛车日志已导出')
    })
    .catch(e => toast.show('导出失败: ' + e.message))
}

// 通用 CSV 下载（管理员「全部用户」模式走 /all/export，普通用户走 /export）
function downloadCsv(path, filename, allUsers) {
  const token = localStorage.getItem('auth_token') || ''
  const url = allUsers ? path.replace('/export', '/all/export') : path
  fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => {
      if (!r.ok) throw new Error('导出失败')
      return r.blob()
    })
    .then(blob => {
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = filename
      a.click()
      URL.revokeObjectURL(objUrl)
      toast.show('CSV 已导出')
    })
    .catch(e => toast.show('导出失败: ' + e.message))
}

function exportDreamShopCsv() {
  downloadCsv('/api/logs/dream-shop/export', `dream-shop-log-${Date.now()}.csv`, dreamShopAllUsers.value)
}

function exportCarLogCsv() {
  downloadCsv('/api/logs/car/export', `car-log-${Date.now()}.csv`, carLogAllUsers.value)
}

async function importDreamShopJson(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    const records = Array.isArray(data) ? data : data?.records
    if (!Array.isArray(records)) throw new Error('文件格式错误：需要 JSON 数组')
    const result = await api.post('/api/logs/dream-shop/import', records, { timeout: 30000 })
    toast.show(`梦境日志导入完成：新增 ${result.added} 条，共 ${result.total} 条`)
    await loadDreamShopLogs()
  } catch (e) {
    toast.show('导入失败: ' + (e.message || '未知错误'))
  } finally {
    event.target.value = '' // 允许再次选择同一文件
  }
}

async function importCarLogJson(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    const records = Array.isArray(data) ? data : data?.records
    if (!Array.isArray(records)) throw new Error('文件格式错误：需要 JSON 数组')
    const result = await api.post('/api/logs/car/import', records, { timeout: 30000 })
    toast.show(`赛车日志导入完成：新增 ${result.added} 条，共 ${result.total} 条`)
    await loadCarLogs()
  } catch (e) {
    toast.show('导入失败: ' + (e.message || '未知错误'))
  } finally {
    event.target.value = ''
  }
}

// 监听全部用户切换
watch(dreamShopAllUsers, () => { if (showDreamShopModal.value) loadDreamShopLogs() })
watch(carLogAllUsers, () => { if (showCarLogModal.value) loadCarLogs() })

async function disconnectAll() {
  const connected = accounts.value.filter(a => a.status === 'connected')
  if (connected.length === 0) return toast.show('当前没有在线账号')
  addLog(`断开全部 ${connected.length} 个在线账号`)
  for (const acc of connected) {
    try {
      await api.post(`/api/control/disconnect/${acc.id}`, null, { timeout: 60000 })
      acc.status = 'disconnected'
      delete accountStatusMap[acc.id]
      addLog(`[${acc.name || acc.id}] 已断开`, 'success')
    } catch (e) {
      addLog(`[${acc.name || acc.id}] 断开失败: ${e.message}`, 'error')
    }
  }
  await loadAccounts()
}

async function batchDaily() {
  const ids = [...selectedIds.value]
  const maxActive = Math.max(1, batchSettings.value.maxActive || 2)
  addLog(`批量执行每日任务 ${ids.length} 个账号，并发 ${maxActive}`)
  for (let i = 0; i < ids.length; i += maxActive) {
    const batch = ids.slice(i, i + maxActive)
    await Promise.all(batch.map(async (id) => {
      const acc = accounts.value.find(a => a.id === id)
      try {
        const settings = await api.get(`/api/accounts/${id}/settings`).catch(() => ({}))
        await api.post(`/api/control/run-daily/${id}`, { settings })
        addLog(`[${acc?.name || id}] 每日任务已触发`, 'success')
        if (acc) {
          acc.status = 'connected'
          accountStatusMap[acc.id] = { dailyPoint: 0, dailyPointMax: 100, pending: true }
        }
        await waitDailyCompleteAndRefresh(id)
      } catch (e) {
        addLog(`[${acc?.name || id}] 每日任务失败: ${e.message}`, 'error')
      }
    }))
  }
}

async function handleOpClick(operation, label) {
  if (selectedIds.value.size === 0) return toast.show('请选择账号')
  if (running.value) return toast.show('已有批量任务在执行中')

  let extraBody = {}
  switch (operation) {
    case 'chest':
      extraBody = { maxCount: batchSettings.value.boxCount, boxId: batchSettings.value.defaultBoxType }
      break
    case 'fish':
      extraBody = { maxCount: batchSettings.value.fishCount, fishType: batchSettings.value.defaultFishType }
      break
    case 'recruit':
      extraBody = { maxCount: batchSettings.value.recruitCount }
      break
    case 'dreamShop':
      extraBody = { purchaseList: dreamBuyList.value }
      break
    case 'smartSendCar':
      extraBody = {
        thresholds: {
          gold: batchSettings.value.carGoldThreshold,
          recruit: batchSettings.value.carRecruitThreshold,
          jade: batchSettings.value.carJadeThreshold,
          ticket: batchSettings.value.carTicketThreshold,
        },
        assignHelper: true,
      }
      break
  }

  await runBatch(operation, label, extraBody)
}

async function runBatch(operation, label, extraBody = {}) {
  if (selectedIds.value.size === 0) return toast.show('请选择账号')
  if (running.value) return toast.show('已有批量任务在执行中')

  const ids = [...selectedIds.value]
  running.value = true
  currentRunId.value = null
  runStatus.value = null
  addLog(`开始执行 [${label}]，共 ${ids.length} 个账号`)
  currentOperationLabel.value = label

  try {
    const body = { accountIds: ids, ...extraBody }
    const res = await api.post(`/api/batch/run-all/${operation}`, body)
    currentRunId.value = res.runId
    toast.show(res.message || '批量任务已启动')
    startPollingRunStatus()
  } catch (e) {
    addLog(`批量任务启动失败: ${e.message}`, 'error')
    running.value = false
  }
}

function startPollingRunStatus() {
  if (statusTimer) clearInterval(statusTimer)
  const carSnapshotLoaded = new Set()
  statusTimer = setInterval(async () => {
    if (!currentRunId.value) {
      clearInterval(statusTimer)
      return
    }
    try {
      const status = await api.get(`/api/batch/status/${currentRunId.value}`)
      runStatus.value = status
      await fetchRunLogs()
      if (status.status) {
        for (const id of Object.keys(status.status)) {
          if (status.status[id] === 'completed' && !carSnapshotLoaded.has(id)) {
            carSnapshotLoaded.add(id)
            await loadAccountCarSnapshot(id)
          }
          if (['running', 'completed'].includes(status.status[id])) {
            const acc = accounts.value.find(a => a.id === id)
            const fresh = await api.get(`/api/accounts/${id}`).catch(() => null)
            if (fresh && acc) {
              acc.status = fresh.status || acc.status
              acc.level = fresh.level ?? acc.level
              acc.last_login = fresh.last_login ?? acc.last_login
            }
          }
        }
      }
      if (status.completedAt) {
        clearInterval(statusTimer)
        running.value = false
        await loadAccounts()
        for (const id of Object.keys(status.status || {})) {
          if (!carSnapshotLoaded.has(id)) {
            await loadAccountCarSnapshot(id)
          }
        }
        addLog(`[${currentOperationLabel.value || '批量任务'}] 全部执行完成`, 'success')
      }
    } catch (e) {
      // 忽略轮询错误
    }
  }, 1500)
}

async function fetchRunLogs() {
  if (!currentRunId.value) return
  try {
    const serverLogs = await api.get(`/api/batch/logs/${currentRunId.value}?limit=200`)
    if (Array.isArray(serverLogs)) {
      const existingKeys = new Set(logs.value.map(l => l.isoTime + '|' + l.message))
      for (const entry of serverLogs) {
        const isoTime = entry.time || new Date().toISOString()
        const key = isoTime + '|' + entry.message
        if (!existingKeys.has(key)) {
          logs.value.push({
            time: new Date(isoTime).toLocaleTimeString(),
            isoTime,
            message: dedupeLogMessage(entry.message),
            type: entry.type || 'info'
          })
          if (logs.value.length > 200) logs.value.shift()
        }
      }
    }
  } catch (e) {
    // 忽略日志拉取错误
  }
}

async function abortBatch() {
  if (!currentRunId.value) return
  try {
    await api.post(`/api/batch/abort/${currentRunId.value}`)
    toast.show('已发送停止信号')
  } catch (e) {
    toast.show('停止失败: ' + e.message)
  }
}

function loadDreamBuyList() {
  try {
    const saved = localStorage.getItem(dreamStorageKey)
    if (saved) dreamBuyList.value = JSON.parse(saved)
    else dreamBuyList.value = getDefaultDreamBuyList()
  } catch {
    dreamBuyList.value = getDefaultDreamBuyList()
  }
}

function saveDreamBuyList() {
  try { localStorage.setItem(dreamStorageKey, JSON.stringify(dreamBuyList.value)) } catch {}
}

function getDefaultDreamBuyList() {
  const list = []
  for (const merchantId in dreamGoldItems) {
    dreamGoldItems[merchantId].forEach(idx => list.push(`${merchantId}-${idx}`))
  }
  return list
}

function toggleDreamItem(itemKey, checked) {
  if (checked) {
    if (!dreamBuyList.value.includes(itemKey)) dreamBuyList.value.push(itemKey)
  } else {
    dreamBuyList.value = dreamBuyList.value.filter(k => k !== itemKey)
  }
}

function selectDreamGoldItems() {
  const set = new Set(dreamBuyList.value)
  for (const merchantId in dreamGoldItems) {
    dreamGoldItems[merchantId].forEach(idx => set.add(`${merchantId}-${idx}`))
  }
  dreamBuyList.value = Array.from(set)
}

function selectAllDreamItems() {
  const set = new Set()
  for (const merchantId in dreamMerchantConfig) {
    dreamMerchantConfig[merchantId].items.forEach((_, idx) => set.add(`${merchantId}-${idx}`))
  }
  dreamBuyList.value = Array.from(set)
}

function clearDreamItems() {
  dreamBuyList.value = []
}

function saveDreamShopConfig() {
  saveDreamBuyList()
  toast.show('梦境商品配置已保存')
}

// ======== 任务模板弹窗 ========

function openTaskTemplateModal(tab = 'batchSettings') {
  templateTab.value = tab
  showTaskTemplateModal.value = true
}

function closeTaskTemplateModal() {
  showTaskTemplateModal.value = false
  applyTemplateId.value = ''
  editingTemplateId.value = null
  newTemplateName.value = ''
  resetNewTemplateSettings()
}

async function saveBatchSettings() {
  savingBatch.value = true
  try {
    await api.put('/api/settings/batch', batchSettings.value)
    toast.show('全局设置已保存')
  } catch (e) {
    toast.show('保存失败: ' + e.message)
  } finally {
    savingBatch.value = false
  }
}

function resetBatchSettings() {
  if (!confirm('确定恢复默认全局设置吗？')) return
  batchSettings.value = { ...DEFAULT_BATCH_SETTINGS }
}

async function confirmApplyTemplate() {
  if (!applyTemplateId.value) return
  if (selectedCount.value === 0) return toast.show('请先选择账号')
  applyingTemplate.value = true
  try {
    const res = await api.post(`/api/templates/${applyTemplateId.value}/apply`, {
      accountIds: [...selectedIds.value]
    })
    toast.show(`模板已应用到 ${res.applied || 0} 个账号`)
  } catch (e) {
    toast.show('应用模板失败: ' + e.message)
  } finally {
    applyingTemplate.value = false
  }
}

function resetNewTemplateSettings() {
  const s = {
    arenaFormation: 1,
    bossFormation: 1,
    bossTimes: 0,
  }
  for (const item of templateToggleItems) {
    s[item.key] = false
  }
  newTemplateSettings.value = s
}

function editTemplate(t) {
  editingTemplateId.value = t.id
  newTemplateName.value = t.name
  const s = { ...newTemplateSettings.value }
  if (t.settings && typeof t.settings === 'object') {
    Object.assign(s, t.settings)
  }
  newTemplateSettings.value = s
}

function cancelEditTemplate() {
  editingTemplateId.value = null
  newTemplateName.value = ''
  resetNewTemplateSettings()
}

async function saveTemplate() {
  if (!newTemplateName.value.trim()) { toast.show('请输入模板名称'); return }
  savingTemplate.value = true
  try {
    const payload = {
      name: newTemplateName.value.trim(),
      settings: { ...newTemplateSettings.value },
    }
    if (editingTemplateId.value) {
      await api.put(`/api/templates/${editingTemplateId.value}`, payload)
      toast.show('模板已更新')
    } else {
      await api.post('/api/templates', payload)
      toast.show('模板已保存')
    }
    await loadTemplates()
    newTemplateName.value = ''
    editingTemplateId.value = null
    resetNewTemplateSettings()
  } catch (e) {
    toast.show('保存失败: ' + e.message)
  } finally {
    savingTemplate.value = false
  }
}

async function deleteTemplate(id) {
  if (!confirm('确定删除该模板吗？')) return
  try {
    await api.del(`/api/templates/${id}`)
    templates.value = templates.value.filter(t => t.id !== id)
    toast.show('模板已删除')
  } catch (e) {
    toast.show('删除失败: ' + e.message)
  }
}

onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer)
  if (logTimer) clearInterval(logTimer)
})

async function clearLogs() {
  try {
    await api.post('/api/control/clear-logs')
    logs.value = []
  } catch (e) {
    // ignore
  }
}

function dedupeLogMessage(message) {
  if (typeof message !== 'string') return message
  // 去掉连续的重复 [xxx] 前缀，例如 [测试] [账号] [账号] 消息 → [测试] [账号] 消息
  return message.replace(/(\[[^\]]+\])(\s*\1)+/g, '$1')
}

function addLog(message, type = 'info') {
  logs.value.push({ time: new Date().toLocaleTimeString(), message: dedupeLogMessage(message), type })
  if (logs.value.length > 200) logs.value.shift()
  if (autoScrollLog.value) {
    nextTick(() => {
      if (logListRef.value) logListRef.value.scrollTop = logListRef.value.scrollHeight
    })
  }
}

watch(logs, () => {
  if (!autoScrollLog.value) return
  nextTick(() => {
    if (logListRef.value) logListRef.value.scrollTop = logListRef.value.scrollHeight
  })
}, { deep: true })
</script>

<style scoped>
.dashboard-page {
  padding: 20px;
  min-height: 100vh;
  background: var(--bg-body, #f5f6f8);
}
.dashboard-layout {
  display: grid;
  grid-template-columns: 480px 1fr;
  gap: 16px;
  max-width: 1400px;
  margin: 0 auto;
  align-items: start;
}
/* grid 子项默认 min-width: auto 会撑爆容器导致横向滚动，强制设为 0 让内容自适应 */
.dashboard-left, .dashboard-right {
  min-width: 0;
}
.panel {
  background: var(--bg-card, #fff);
  border-radius: 12px;
  border: 1px solid var(--border, #e5e5e5);
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border, #e5e5e5);
  gap: 8px;
  flex-wrap: wrap;
}
.panel-header h2 {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}
.panel-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.stats-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  max-width: 1400px;
  margin: 0 auto 16px;
}
.stats-bar .stat-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.stats-bar .stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stats-bar .stat-icon.purple { background: #ede9fe; color: #7c3aed; }
.stats-bar .stat-icon.green { background: #dcfce7; color: #16a34a; }
.stats-bar .stat-icon.amber { background: #fef3c7; color: #d97706; }
.stats-bar .stat-icon.blue { background: #dbeafe; color: #2563eb; }
.stats-bar .stat-val {
  font-size: 20px;
  font-weight: 800;
  color: var(--text-main, #111);
  line-height: 1;
}
.stats-bar .stat-label {
  font-size: 12px;
  color: var(--text-muted, #888);
  margin-top: 4px;
}
@media (max-width: 900px) {
  .stats-bar { grid-template-columns: repeat(2, 1fr); }
}
.account-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #e5e5e5);
}
.check-all {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}
.check-all input { width: 16px; height: 16px; cursor: pointer; }
.selected-count {
  font-size: 13px;
  color: var(--text-muted, #999);
  margin-left: auto;
}
.account-list {
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}
.account-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border, #f0f0f0);
  cursor: pointer;
  transition: background 0.15s;
}
.account-row:hover { background: var(--bg-body, #f5f6f8); }
.account-row.selected { background: var(--primary-light, rgba(22,119,255,0.08)); }
.account-row input { width: 16px; height: 16px; cursor: pointer; }
.account-avatar-sm {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}
.account-main {
  flex: 1;
  min-width: 0;
}
.account-name-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.account-name {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  font-weight: 600;
}
.status-online { background: var(--success-light, #e6f7e6); color: var(--success, #52c41a); }
.status-offline { background: var(--text-muted-light, #f0f0f0); color: var(--text-muted, #999); }
.status-success { background: #dcfce7; color: #16a34a; }
.status-warning { background: #fef3c7; color: #d97706; }
.status-info { background: #dbeafe; color: #2563eb; }
.status-default { background: #f3f4f6; color: #6b7280; }
.account-meta-sm {
  font-size: 12px;
  color: var(--text-muted, #999);
  margin-top: 2px;
}
.account-row-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.tab-bar {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #e5e5e5);
  overflow-x: auto;
}
.tab-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--border, #e5e5e5);
  background: transparent;
  color: var(--text-secondary, #666);
  cursor: pointer;
  transition: all 0.15s;
}
.tab-btn.active {
  background: var(--primary, #1677ff);
  color: #fff;
  border-color: var(--primary, #1677ff);
}
.op-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  padding: 16px;
}
.op-btn {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--border, #e5e5e5);
  background: var(--bg-card, #fff);
  color: var(--text, #333);
  cursor: pointer;
  transition: all 0.15s;
}
.op-btn:hover:not(:disabled) { border-color: var(--primary, #1677ff); color: var(--primary, #1677ff); }
.op-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.op-btn.danger { border-color: var(--danger, #ff4d4f); color: var(--danger, #ff4d4f); }
.log-panel { margin-top: 16px; }
.log-list {
  max-height: 320px;
  overflow-y: auto;
  padding: 12px 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
}
.log-line { display: flex; gap: 8px; }
.log-time { color: var(--text-muted, #999); flex-shrink: 0; }
.log-line.success { color: var(--success, #52c41a); }
.log-line.error { color: var(--danger, #ff4d4f); }
.log-line.info { color: var(--text, #333); }
.auto-scroll-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary, #666);
  user-select: none;
}
.auto-scroll-toggle input { width: 14px; height: 14px; cursor: pointer; }
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px;
  color: var(--text-muted, #999);
}

.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.4); display: flex; align-items: center;
  justify-content: center; z-index: 1000;
}
.modal-card {
  background: var(--bg-card, #fff); border-radius: 12px;
  padding: 20px; width: 90%; max-width: 400px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
.checkbox-item {
  display: flex; align-items: center; gap: 6px;
  padding: 6px; border-radius: 6px;
  border: 1px solid var(--border, #e5e5e5);
  cursor: pointer; transition: background 0.15s;
  flex-wrap: wrap;
}
.checkbox-item:hover { background: var(--bg-hover, #f5f5f5); }
.checkbox-item input { margin: 0; }
.checkbox-item .toggle-desc {
  width: 100%;
  color: var(--text-muted, #888);
  font-size: 11px;
  margin-left: 22px;
  line-height: 1.3;
}
.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.input-group label {
  font-size: 13px;
  color: var(--text-secondary, #666);
  font-weight: 500;
}
.input-group input {
  padding: 8px 12px;
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}
.input-group input:focus {
  border-color: var(--primary, #1677ff);
}
.input-group select {
  padding: 8px 12px;
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: var(--bg-card, #fff);
}
.input-group select:focus {
  border-color: var(--primary, #1677ff);
}

.unified-modal {
  max-width: 560px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #e5e5e5);
}
.modal-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border, #e5e5e5);
  overflow-x: auto;
  background: var(--bg-body, #f5f6f8);
}
.modal-tabs .tab-btn {
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
}
.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}
.settings-section-title {
  font-size: 13px;
  font-weight: 600;
  margin: 16px 0 10px;
  color: var(--text, #333);
}
.settings-section-title:first-child {
  margin-top: 0;
}
.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.modal-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.empty-tip {
  text-align: center;
  padding: 24px;
  color: var(--text-muted, #999);
  font-size: 14px;
}
.selected-preview {
  font-size: 13px;
  color: var(--text-muted, #999);
  margin-bottom: 12px;
}
.template-toggle-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.template-list {
  margin-top: 16px;
  border-top: 1px solid var(--border, #e5e5e5);
  padding-top: 12px;
}
.template-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border, #f0f0f0);
}
.template-list-item:last-child {
  border-bottom: none;
}
.dream-shop-body {
  max-height: 320px;
  overflow-y: auto;
  margin-bottom: 12px;
}

/* ======== 弹窗日志（梦境/赛车）样式 ======== */
.log-modal {
  max-width: 640px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.log-modal .modal-body {
  overflow-y: auto;
  padding: 16px;
  flex: 1;
}
.modal-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.admin-toggle-inline {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
}
.log-modal-card {
  padding: 10px 14px;
  margin-bottom: 6px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--success);
  display: flex;
  flex-direction: column;
  gap: 3px;
  box-shadow: var(--shadow-sm);
}
.log-modal-card.car {
  border-left-color: var(--primary);
}
.log-modal-time {
  font-size: 12px;
  color: var(--text-muted);
  font-family: monospace;
}
.log-modal-msg {
  font-size: 13px;
  color: var(--text-main);
  word-break: break-all;
}
.log-modal-cars {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.car-chip {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-page);
  color: var(--text-main);
  border: 1px solid var(--border);
}
.car-chip.car-color-5 { color: #e74c3c; border-color: #e74c3c; }
.car-chip.car-color-6 { color: #f39c12; border-color: #f39c12; font-weight: 600; }
.car-chip.car-color-4 { color: #e67e22; border-color: #e67e22; }
.car-chip.car-color-3 { color: #9b59b6; border-color: #9b59b6; }
.car-chip.car-color-2 { color: #3498db; border-color: #3498db; }
.car-chip.car-color-1 { color: #27ae60; border-color: #27ae60; }
.car-chip.car-color-0 { color: var(--text-muted); border-color: var(--text-muted); }
.user-tag {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 6px;
  background: var(--primary-soft);
  color: var(--primary);
  border-radius: var(--radius-sm);
  font-size: 11px;
}
</style>
