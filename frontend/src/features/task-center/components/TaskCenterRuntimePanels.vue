<template>
  <div class="task-center-runtime-panels">
    <div class="panel" style="margin-top: 10px">
      <div class="inline-between">
        <h3>Worker / Queue 运行态</h3>
        <p class="muted">heartbeat: {{ runtime.heartbeatAt ? new Date(runtime.heartbeatAt).toLocaleString() : '-' }}</p>
      </div>
      <div class="inline-between" style="margin-top: 8px; align-items: center">
        <div class="actions">
          <span class="status-lamp" :class="`status-${congestionLevel}`"></span>
          <strong>{{ congestionLabel }}</strong>
        </div>
        <div class="actions">
          <label class="muted">
            预警阈值
            <input v-model.number="queueThresholdWarnModel" type="number" min="1" max="9999" step="1" />
          </label>
          <label class="muted">
            拥塞阈值
            <input v-model.number="queueThresholdCriticalModel" type="number" min="1" max="9999" step="1" />
          </label>
          <button :disabled="queueAlertSaving" @click="saveQueueAlertConfig()">{{ queueAlertSaving ? '保存中...' : '保存阈值' }}</button>
          <button :disabled="queueAlertActionLoading" @click="acknowledgeLatestQueueAlert()">
            {{ queueAlertActionLoading ? '处理中...' : '确认最新告警' }}
          </button>
          <button :disabled="queueAlertActionLoading" @click="acknowledgeLatestQueueAlert(30)">
            {{ queueAlertActionLoading ? '处理中...' : '确认并静默30分钟' }}
          </button>
          <button :disabled="queueAlertActionLoading" @click="exportQueueAlertsJson()">导出告警JSON</button>
          <button :disabled="queueAlertActionLoading" @click="exportQueueAlertsCsv()">导出告警CSV</button>
        </div>
      </div>
      <div class="metrics-grid" style="margin-top: 8px">
        <article class="metric-card">
          <p class="muted">pump 状态</p>
          <h3>{{ runtime.isPumpRunning ? 'running' : 'idle' }}</h3>
        </article>
        <article class="metric-card">
          <p class="muted">worker 占用</p>
          <h3>{{ runtime.activeWorkerCount }} / {{ runtime.maxConcurrent }}</h3>
        </article>
        <article class="metric-card">
          <p class="muted">队列项目数</p>
          <h3>{{ runtime.queuedProjects }}</h3>
        </article>
        <article class="metric-card">
          <p class="muted">排队/运行任务</p>
          <h3>{{ runtime.queuedTotal }} / {{ runtime.runningTotal }}</h3>
        </article>
        <article class="metric-card">
          <p class="muted">pump 周期/异常</p>
          <h3>{{ runtime.pumpCycleCount }} / {{ runtime.pumpErrorCount }}</h3>
        </article>
        <article class="metric-card">
          <p class="muted">驱动/后端/锁持有者</p>
          <h3>{{ runtime.queueDriver }} / {{ runtime.queueBackend }} / {{ runtime.lockOwnerId || '-' }}</h3>
        </article>
        <article class="metric-card">
          <p class="muted">最近异常</p>
          <h3 style="font-size: 0.95rem">{{ runtime.lastPumpError || 'none' }}</h3>
        </article>
      </div>
      <p class="muted" style="margin-top: 8px">
        lease owner={{ runtime.queueLeaseOwnerId || '-' }} · expires={{
          runtime.lockExpiresAt ? new Date(runtime.lockExpiresAt).toLocaleString() : '-'
        }} · pump duration={{ runtime.lastPumpDurationMs === null ? '-' : `${runtime.lastPumpDurationMs}ms` }}
      </p>
      <p class="muted" v-if="queueAlertState.silencedUntil">
        告警静默至：{{ new Date(queueAlertState.silencedUntil).toLocaleString() }}
      </p>
      <div class="runtime-trend" v-if="runtimeTrend.length > 1">
        <p class="muted">最近 {{ runtimeTrend.length }} 次 runtime 采样趋势</p>
        <svg viewBox="0 0 280 60" preserveAspectRatio="none" aria-hidden="true">
          <polyline class="line-queued" :points="runtimeTrendPoints.queued" />
          <polyline class="line-running" :points="runtimeTrendPoints.running" />
          <polyline class="line-pump" :points="runtimeTrendPoints.pump" />
        </svg>
        <div class="actions">
          <span class="muted">queued</span>
          <span class="muted">running</span>
          <span class="muted">pump(ms)</span>
        </div>
      </div>
      <div v-if="runtime.projects.length" style="margin-top: 8px">
        <p class="muted">项目队列分布（Top 8）</p>
        <div class="chip-row">
          <span class="chip" v-for="item in runtime.projects.slice(0, 8)" :key="item.projectId">
            {{ item.projectId.slice(0, 8) }} · q{{ item.queued }} / r{{ item.running }}
          </span>
        </div>
      </div>
      <div style="margin-top: 10px" v-if="mergedRuntimeAlerts.length > 0">
        <div class="inline-between">
          <p class="muted">最近告警（统一视图）</p>
          <div class="actions">
            <label class="muted">
              窗口
              <select v-model.number="unifiedAlertWindowMinutesModel" @change="refreshUnifiedAlertsOnly()">
                <option :value="15">15m</option>
                <option :value="30">30m</option>
                <option :value="60">60m</option>
                <option :value="180">180m</option>
                <option :value="360">360m</option>
              </select>
            </label>
            <button @click="refreshUnifiedAlertsOnly()">刷新</button>
            <button :disabled="taskUnifiedAlerts.total === 0" @click="exportUnifiedAlerts('json')">导出统一 JSON</button>
            <button :disabled="taskUnifiedAlerts.total === 0" @click="exportUnifiedAlerts('csv')">导出统一 CSV</button>
          </div>
        </div>
        <p class="muted">
          总量 {{ taskUnifiedAlerts.total }} · level g/y/r={{ taskUnifiedAlerts.byLevel.green }}/{{ taskUnifiedAlerts.byLevel.yellow }}/{{ taskUnifiedAlerts.byLevel.red }} ·
          source q/c={{ taskUnifiedAlerts.bySource.queue }}/{{ taskUnifiedAlerts.bySource.contract }}
        </p>
        <div class="actions">
          <label class="muted">red总阈值<input v-model.number="taskUnifiedAlertPolicy.redTotalThreshold" type="number" min="1" max="1000" /></label>
          <label class="muted">queue阈值<input v-model.number="taskUnifiedAlertPolicy.redQueueThreshold" type="number" min="1" max="1000" /></label>
          <label class="muted">contract阈值<input v-model.number="taskUnifiedAlertPolicy.redContractThreshold" type="number" min="1" max="1000" /></label>
          <label class="muted">冷却(分)<input v-model.number="taskUnifiedAlertPolicy.cooldownMinutes" type="number" min="1" max="1440" /></label>
          <button :disabled="taskUnifiedAlertPolicyLoading" @click="saveUnifiedAlertPolicy()">
            {{ taskUnifiedAlertPolicyLoading ? '保存中...' : '保存统一告警策略' }}
          </button>
          <button :disabled="taskUnifiedAlertActions.length === 0" @click="exportUnifiedAlertActions('json')">导出动作日志 JSON</button>
          <button :disabled="taskUnifiedAlertActions.length === 0" @click="exportUnifiedAlertActions('csv')">导出动作日志 CSV</button>
        </div>
        <div class="list compact-list">
          <article class="card" v-for="item in mergedRuntimeAlerts.slice(0, 6)" :key="item.id">
            <div class="inline-between">
              <strong>[{{ item.level }}] {{ new Date(item.at).toLocaleString() }} · {{ item.source === 'contract' ? 'contract' : 'queue' }}</strong>
              <button
                v-if="item.source === 'queue' && item.level !== 'green' && !item.acknowledgedAt"
                :disabled="queueAlertActionLoading"
                @click="acknowledgeMergedAlert(item)"
              >
                确认
              </button>
            </div>
            <p class="muted" v-if="item.source === 'queue'">
              {{ item.reason }} · q{{ item.queue?.queuedTotal ?? 0 }}/r{{ item.queue?.runningTotal ?? 0 }} · errors {{ item.queue?.pumpErrorCount ?? 0 }}
            </p>
            <p class="muted" v-else>
              {{ item.reason }} · drift {{ item.contract?.driftCount ?? 0 }} / {{ item.contract?.total ?? 0 }}
            </p>
            <p class="muted" v-if="item.source === 'queue' && item.acknowledgedAt">
              已确认：{{ new Date(item.acknowledgedAt).toLocaleString() }}{{ item.acknowledgedBy ? ` · ${item.acknowledgedBy}` : '' }}
            </p>
          </article>
        </div>
        <div class="list compact-list" v-if="taskUnifiedAlertActions.length > 0" style="margin-top: 8px">
          <article class="card" v-for="item in taskUnifiedAlertActions.slice(0, 4)" :key="item.id">
            <p class="muted">[{{ item.level }}] {{ new Date(item.at).toLocaleString() }} · {{ item.reason }}</p>
            <p class="muted">window={{ item.windowMinutes }}m · total={{ item.totals.total }} · red={{ item.totals.red }} · q/c={{ item.totals.queue }}/{{ item.totals.contract }}</p>
          </article>
        </div>
        <div class="panel" style="margin-top: 8px">
          <div class="inline-between">
            <h5>统一告警 Incident</h5>
            <div class="actions">
              <label class="muted">
                状态
                <select v-model="unifiedIncidentStatusFilterModel" @change="refreshUnifiedIncidentsOnly()">
                  <option value="">all</option>
                  <option value="open">open</option>
                  <option value="resolved">resolved</option>
                </select>
              </label>
              <button :disabled="unifiedIncidentActionLoading" @click="refreshUnifiedIncidentsOnly()">
                {{ unifiedIncidentActionLoading ? '处理中...' : '刷新' }}
              </button>
              <button :disabled="taskUnifiedAlertIncidents.length === 0 || unifiedIncidentActionLoading" @click="exportUnifiedAlertIncidents('json')">
                导出 Incident JSON
              </button>
              <button :disabled="taskUnifiedAlertIncidents.length === 0 || unifiedIncidentActionLoading" @click="exportUnifiedAlertIncidents('csv')">
                导出 Incident CSV
              </button>
            </div>
          </div>
          <p class="muted">当前 Incident：{{ taskUnifiedAlertIncidents.length }}</p>
          <p class="muted">
            SLA：open {{ taskUnifiedIncidentSlaSummary.openTotal }} / resolved {{ taskUnifiedIncidentSlaSummary.resolvedTotal }}
            · warn {{ taskUnifiedIncidentSlaSummary.warnTotal }} / critical {{ taskUnifiedIncidentSlaSummary.criticalTotal }}
            · escalate {{ taskUnifiedIncidentSlaSummary.escalationCandidateTotal }}
          </p>
          <div class="actions">
            <label class="muted">
              warn(分)
              <input v-model.number="taskUnifiedIncidentSlaConfig.warnAfterMinutes" type="number" min="1" max="10080" step="1" />
            </label>
            <label class="muted">
              critical(分)
              <input v-model.number="taskUnifiedIncidentSlaConfig.criticalAfterMinutes" type="number" min="2" max="10080" step="1" />
            </label>
            <label class="muted">
              escalation(分)
              <input v-model.number="taskUnifiedIncidentSlaConfig.escalationAfterMinutes" type="number" min="2" max="20160" step="1" />
            </label>
            <button :disabled="unifiedIncidentSlaLoading" @click="saveUnifiedIncidentSlaConfig()">
              {{ unifiedIncidentSlaLoading ? '保存中...' : '保存 SLA 阈值' }}
            </button>
            <button :disabled="unifiedIncidentSlaLoading" @click="refreshUnifiedIncidentSlaOnly()">
              {{ unifiedIncidentSlaLoading ? '刷新中...' : '刷新 SLA' }}
            </button>
          </div>
          <div class="actions">
            <label class="muted">
              auto
              <input v-model="taskUnifiedIncidentEscalationConfig.autoEnabled" type="checkbox" />
            </label>
            <label class="muted">
              cooldown(分)
              <input v-model.number="taskUnifiedIncidentEscalationConfig.autoCooldownMinutes" type="number" min="1" max="1440" step="1" />
            </label>
            <button :disabled="unifiedIncidentEscalationLoading" @click="saveUnifiedIncidentEscalationConfig()">
              {{ unifiedIncidentEscalationLoading ? '保存中...' : '保存自动升级配置' }}
            </button>
            <label class="muted">
              notify
              <input v-model="taskUnifiedIncidentNotificationConfig.enabled" type="checkbox" />
            </label>
            <label class="muted">
              timeout(ms)
              <input v-model.number="taskUnifiedIncidentNotificationConfig.timeoutMs" type="number" min="500" max="60000" step="100" />
            </label>
            <label class="muted">
              maxRetries
              <input v-model.number="taskUnifiedIncidentNotificationConfig.maxRetries" type="number" min="0" max="10" step="1" />
            </label>
            <label class="muted">
              retryBase(s)
              <input v-model.number="taskUnifiedIncidentNotificationConfig.retryBaseDelaySeconds" type="number" min="1" max="3600" step="1" />
            </label>
            <button :disabled="unifiedIncidentEscalationLoading" @click="saveUnifiedIncidentNotificationConfig()">
              {{ unifiedIncidentEscalationLoading ? '保存中...' : '保存通知配置' }}
            </button>
            <button :disabled="unifiedIncidentEscalationLoading" @click="processUnifiedIncidentNotifications()">
              {{ unifiedIncidentEscalationLoading ? '处理中...' : '处理 pending 通知' }}
            </button>
          </div>
          <div class="actions">
            <label class="muted" style="min-width: 320px">
              endpoint
              <input v-model.trim="taskUnifiedIncidentNotificationConfig.endpoint" placeholder="https://example.com/webhook" />
            </label>
            <label class="muted" style="min-width: 240px">
              authHeader
              <input v-model.trim="taskUnifiedIncidentNotificationConfig.authHeader" placeholder="Bearer xxx (可选)" />
            </label>
            <label class="muted">
              status
              <select v-model="unifiedIncidentNotificationDeliveryStatusFilterModel" @change="refreshUnifiedIncidentEscalationsOnly()">
                <option value="">all</option>
                <option value="sent">sent</option>
                <option value="failed">failed</option>
              </select>
            </label>
            <label class="muted">
              message
              <input v-model.trim="unifiedIncidentNotificationDeliveryMessageKeywordModel" placeholder="失败原因关键词" />
            </label>
            <button :disabled="taskUnifiedIncidentNotificationDeliveryLogs.length === 0 || unifiedIncidentEscalationLoading" @click="exportUnifiedIncidentNotificationDeliveryLogs('json')">
              导出投递 JSON
            </button>
            <button :disabled="taskUnifiedIncidentNotificationDeliveryLogs.length === 0 || unifiedIncidentEscalationLoading" @click="exportUnifiedIncidentNotificationDeliveryLogs('csv')">
              导出投递 CSV
            </button>
          </div>
          <div class="actions">
            <label class="muted">
              升级执行人
              <input v-model.trim="unifiedIncidentEscalationActorModel" placeholder="可选，如 oncall" />
            </label>
            <button :disabled="unifiedIncidentEscalationLoading" @click="triggerUnifiedIncidentEscalations()">
              {{ unifiedIncidentEscalationLoading ? '执行中...' : '触发升级动作' }}
            </button>
            <button :disabled="unifiedIncidentEscalationLoading" @click="refreshUnifiedIncidentEscalationsOnly()">
              {{ unifiedIncidentEscalationLoading ? '刷新中...' : '刷新升级日志' }}
            </button>
            <button :disabled="taskUnifiedIncidentEscalationLogs.length === 0 || unifiedIncidentEscalationLoading" @click="exportUnifiedIncidentEscalations('json')">
              导出升级 JSON
            </button>
            <button :disabled="taskUnifiedIncidentEscalationLogs.length === 0 || unifiedIncidentEscalationLoading" @click="exportUnifiedIncidentEscalations('csv')">
              导出升级 CSV
            </button>
          </div>
          <div class="list compact-list" v-if="taskUnifiedIncidentSlaSummary.topAging.length > 0">
            <article class="card" v-for="item in taskUnifiedIncidentSlaSummary.topAging.slice(0, 5)" :key="`sla-${item.incidentId}`">
              <p class="muted">
                {{ item.incidentId.slice(0, 8) }} · age={{ item.ageMinutes }}m · sla={{ item.slaLevel }} · escalate={{ item.shouldEscalate ? 'yes' : 'no' }}
              </p>
            </article>
          </div>
          <div class="list compact-list" v-if="taskUnifiedIncidentEscalationLogs.length > 0">
            <article class="card" v-for="item in taskUnifiedIncidentEscalationLogs.slice(0, 5)" :key="`esc-${item.id}`">
              <p class="muted">
                {{ new Date(item.at).toLocaleString() }} · {{ item.incidentId.slice(0, 8) }} · age={{ item.ageMinutes }}m
                <template v-if="item.actor"> · actor={{ item.actor }}</template>
              </p>
              <p class="muted">
                {{ item.reason }} · notify={{ item.notificationStatus }}
                <template v-if="item.notificationAttempt !== undefined"> · attempt={{ item.notificationAttempt }}</template>
                <template v-if="item.notifiedAt"> · {{ new Date(item.notifiedAt).toLocaleString() }}</template>
              </p>
              <p class="muted" v-if="item.nextRetryAt">nextRetryAt: {{ new Date(item.nextRetryAt).toLocaleString() }}</p>
              <p class="muted" v-if="item.notificationMessage">{{ item.notificationMessage }}</p>
              <div class="actions">
                <button :disabled="unifiedIncidentEscalationLoading || item.notificationStatus === 'sent'" @click="updateEscalationNotificationStatus(item, 'sent')">标记通知成功</button>
                <button :disabled="unifiedIncidentEscalationLoading || item.notificationStatus === 'failed'" @click="updateEscalationNotificationStatus(item, 'failed')">标记通知失败</button>
                <button :disabled="unifiedIncidentEscalationLoading || item.notificationStatus === 'pending'" @click="updateEscalationNotificationStatus(item, 'pending')">重置为 pending</button>
              </div>
            </article>
          </div>
          <div class="metrics-grid" v-if="taskUnifiedIncidentEscalationLogs.length > 0" style="margin-top: 8px">
            <article class="metric-card">
              <p class="muted">通知总升级数</p>
              <h3>{{ notificationDeliverySummary.totalEscalations }}</h3>
            </article>
            <article class="metric-card">
              <p class="muted">sent / failed / pending</p>
              <h3>{{ notificationDeliverySummary.sent }} / {{ notificationDeliverySummary.failed }} / {{ notificationDeliverySummary.pending }}</h3>
            </article>
            <article class="metric-card">
              <p class="muted">重试总次数</p>
              <h3>{{ notificationDeliverySummary.totalAttempts }}</h3>
            </article>
            <article class="metric-card">
              <p class="muted">待重试条数</p>
              <h3>{{ notificationDeliverySummary.nextRetryTotal }}</h3>
            </article>
          </div>
          <div class="list compact-list" v-if="notificationNextRetryList.length > 0">
            <article class="card" v-for="item in notificationNextRetryList" :key="`retry-${item.id}`">
              <p class="muted">
                {{ item.incidentId.slice(0, 8) }} · attempt={{ item.notificationAttempt ?? 0 }} · next={{ new Date(item.nextRetryAt!).toLocaleString() }}
              </p>
              <p class="muted">{{ item.reason }}</p>
            </article>
          </div>
          <div class="list compact-list" v-if="notificationFailureReasonTop.length > 0">
            <article class="card" v-for="item in notificationFailureReasonTop" :key="`reason-${item.reason}`">
              <p class="muted">{{ item.reason }} · {{ item.count }} 次</p>
            </article>
          </div>
          <div class="list compact-list" v-if="filteredNotificationDeliveryLogs.length > 0">
            <article class="card" v-for="item in filteredNotificationDeliveryLogs.slice(0, 5)" :key="`delivery-${item.id}`">
              <p class="muted">
                {{ new Date(item.at).toLocaleString() }} · {{ item.status }} · {{ item.incidentId.slice(0, 8) }}
                <template v-if="item.responseCode"> · HTTP {{ item.responseCode }}</template>
                <template v-if="item.durationMs !== undefined"> · {{ item.durationMs }}ms</template>
              </p>
              <p class="muted">{{ item.endpoint }}</p>
              <p class="muted" v-if="item.message">{{ item.message }}</p>
            </article>
          </div>
          <div class="list compact-list" v-if="taskUnifiedAlertIncidents.length > 0">
            <article class="card" v-for="item in taskUnifiedAlertIncidents.slice(0, 8)" :key="item.id">
              <div class="inline-between">
                <strong>[{{ item.level }}] {{ item.status }} · {{ new Date(item.updatedAt).toLocaleString() }}</strong>
                <div class="actions">
                  <button :disabled="unifiedIncidentActionLoading || item.status === 'resolved'" @click="updateUnifiedIncidentStatus(item, 'resolved')">
                    设为 resolved
                  </button>
                  <button :disabled="unifiedIncidentActionLoading || item.status === 'open'" @click="updateUnifiedIncidentStatus(item, 'open')">
                    重新打开
                  </button>
                </div>
              </div>
              <p class="muted">{{ item.reason }}</p>
              <p class="muted">occurrence={{ item.occurrenceCount }} · action={{ item.latestActionLogId.slice(0, 8) }}</p>
              <div class="actions">
                <label class="muted">
                  assignee
                  <input v-model.trim="unifiedIncidentDraft[item.id].assignee" placeholder="处理人" />
                </label>
                <label class="muted" style="min-width: 260px">
                  note
                  <input v-model.trim="unifiedIncidentDraft[item.id].note" placeholder="处理备注" />
                </label>
                <button :disabled="unifiedIncidentActionLoading" @click="saveUnifiedIncidentMeta(item)">保存备注/指派</button>
              </div>
            </article>
          </div>
          <p v-else class="muted">当前筛选下暂无 Incident</p>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top: 10px">
      <div class="inline-between">
        <h4>Task Catalog 合同矩阵</h4>
        <div class="actions">
          <label class="muted">
            taskType
            <select v-model="taskCatalogTypeFilterModel">
              <option value="">all</option>
              <option value="video">video</option>
              <option value="audio">audio</option>
              <option value="video_merge">video_merge</option>
            </select>
          </label>
          <button :disabled="taskCatalogLoading" @click="refreshTaskCatalog()">{{ taskCatalogLoading ? '加载中...' : '刷新' }}</button>
          <button :disabled="taskCatalog.length === 0" @click="exportTaskCatalog('json')">导出 JSON</button>
          <button :disabled="taskCatalog.length === 0" @click="exportTaskCatalog('csv')">导出 CSV</button>
          <button :disabled="taskCatalogAlerts.length === 0" @click="exportTaskCatalogAlerts('json')">导出告警 JSON</button>
          <button :disabled="taskCatalogAlerts.length === 0" @click="exportTaskCatalogAlerts('csv')">导出告警 CSV</button>
        </div>
      </div>
      <p class="muted" v-if="taskCatalogContractCheck">
        <span class="status-lamp" :class="`status-${taskCatalogContractCheck.level}`"></span>
        {{ taskCatalogContractCheck.reason }}
      </p>
      <p class="muted">合同漂移：{{ taskCatalogDriftCount }} / {{ taskCatalogContractCheck?.total ?? taskCatalog.length }}</p>
      <p class="muted">历史告警：{{ taskCatalogAlerts.length }}</p>
      <div class="list compact-list" v-if="filteredTaskCatalog.length > 0">
        <article class="card" v-for="item in filteredTaskCatalog" :key="item.taskType">
          <div class="inline-between">
            <strong>{{ item.taskType }}</strong>
            <span class="muted">priority={{ item.defaultPriority }}</span>
          </div>
          <p class="muted">topic={{ item.queueTopic }}</p>
          <p class="muted">terminal={{ item.terminalStatuses.join(', ') }}</p>
          <p class="muted">retryable={{ item.retryableStatuses.join(', ') }}</p>
          <p class="muted" v-if="taskCatalogDiffByType[item.taskType]?.drift">
            drift: {{ taskCatalogDiffByType[item.taskType]?.reasons.join(' | ') }}
          </p>
        </article>
      </div>
      <p v-else class="muted">{{ taskCatalog.length > 0 ? '当前筛选无结果' : '暂无任务类型目录' }}</p>
    </div>

    <div id="task-slo-quota" style="margin-top: 10px" class="panel">
      <div class="inline-between">
        <h4>Task SLO / 配额</h4>
        <div class="actions">
          <span class="status-lamp" :class="`status-${taskSloState.level}`"></span>
          <strong>{{ taskSloLabel }}</strong>
        </div>
      </div>
      <RouteRestoreHint :text="quotaPanelRestoredHint ? `已从分享链接恢复配额作用域：${quotaPanelRestoredHint}` : ''" />
      <div class="metrics-grid" style="margin-top: 8px">
        <article class="metric-card">
          <p class="muted">p95 排队耗时</p>
          <h3>{{ formatMs(taskSloState.p95QueueWaitMs) }}</h3>
        </article>
        <article class="metric-card">
          <p class="muted">pump 错误率</p>
          <h3>{{ formatPercent(taskSloState.pumpErrorRate) }}</h3>
        </article>
        <article class="metric-card">
          <p class="muted">样本量</p>
          <h3>{{ taskSloState.sampleSize }}</h3>
        </article>
        <article class="metric-card">
          <p class="muted">判定窗口</p>
          <h3>{{ taskSloState.windowSamples }}</h3>
        </article>
      </div>
      <p class="muted">当前判定：{{ taskSloState.reason }}</p>
      <div class="actions">
        <label class="muted">p95 预警(ms)<input v-model.number="taskSloConfig.p95QueueWaitWarnMs" type="number" min="1000" step="1000" /></label>
        <label class="muted">p95 拥塞(ms)<input v-model.number="taskSloConfig.p95QueueWaitCriticalMs" type="number" min="1000" step="1000" /></label>
        <label class="muted">错误率预警<input v-model.number="taskSloConfig.pumpErrorRateWarn" type="number" min="0" max="1" step="0.001" /></label>
        <label class="muted">错误率拥塞<input v-model.number="taskSloConfig.pumpErrorRateCritical" type="number" min="0" max="1" step="0.001" /></label>
        <label class="muted">窗口样本<input v-model.number="taskSloConfig.windowSamples" type="number" min="5" max="240" step="1" /></label>
        <button :disabled="taskSloLoading" @click="saveTaskSloConfigAction()">{{ taskSloLoading ? '保存中...' : '保存 SLO 阈值' }}</button>
      </div>
      <div class="actions" style="margin-top: 8px">
        <label class="muted">
          默认日配额
          <input v-model.number="taskQuotaConfig.dailyVideoTaskDefault" type="number" min="1" step="1" />
        </label>
        <label class="muted">
          项目配额查看
          <input v-model.trim="taskQuotaUsageProjectIdModel" placeholder="projectId" />
        </label>
        <button :disabled="taskQuotaLoading" @click="refreshTaskQuotaUsage()">{{ taskQuotaLoading ? '加载中...' : '刷新用量' }}</button>
        <button :disabled="taskQuotaLoading" @click="saveTaskQuotaConfigAction()">{{ taskQuotaLoading ? '保存中...' : '保存配额配置' }}</button>
      </div>
      <div class="panel" style="margin-top: 8px">
        <div class="inline-between">
          <h5>项目配额覆盖</h5>
          <button :disabled="taskQuotaLoading" @click="addTaskQuotaOverrideRow()">新增一行</button>
        </div>
        <div class="list compact-list" v-if="taskQuotaOverrideRows.length > 0">
          <article class="card" v-for="(row, idx) in taskQuotaOverrideRows" :key="`quota-row-${idx}`">
            <div class="actions">
              <label class="muted">
                projectId
                <input v-model.trim="row.projectId" placeholder="projectId" />
              </label>
              <label class="muted">
                dailyLimit
                <input v-model.number="row.dailyLimit" type="number" min="1" step="1" />
              </label>
              <button class="danger" :disabled="taskQuotaLoading" @click="removeTaskQuotaOverrideRow(idx)">删除</button>
            </div>
          </article>
        </div>
        <p v-else class="muted">暂无项目配额覆盖</p>
      </div>
      <div class="panel" style="margin-top: 8px">
        <h5>Tier 限额</h5>
        <div class="actions">
          <label class="muted">
            standard
            <input v-model.number="taskQuotaTierLimitsForm.standard" type="number" min="1" step="1" />
          </label>
          <label class="muted">
            pro
            <input v-model.number="taskQuotaTierLimitsForm.pro" type="number" min="1" step="1" />
          </label>
          <label class="muted">
            enterprise
            <input v-model.number="taskQuotaTierLimitsForm.enterprise" type="number" min="1" step="1" />
          </label>
        </div>
      </div>
      <div class="panel" style="margin-top: 8px">
        <div class="inline-between">
          <h5>项目 Tier 覆盖</h5>
          <button :disabled="taskQuotaLoading" @click="addTaskQuotaProjectTierRow()">新增一行</button>
        </div>
        <div class="list compact-list" v-if="taskQuotaProjectTierRows.length > 0">
          <article class="card" v-for="(row, idx) in taskQuotaProjectTierRows" :key="`tier-row-${idx}`">
            <div class="actions">
              <label class="muted">
                projectId
                <input v-model.trim="row.projectId" placeholder="projectId" />
              </label>
              <label class="muted">
                tier
                <select v-model="row.tier">
                  <option value="standard">standard</option>
                  <option value="pro">pro</option>
                  <option value="enterprise">enterprise</option>
                </select>
              </label>
              <button class="danger" :disabled="taskQuotaLoading" @click="removeTaskQuotaProjectTierRow(idx)">删除</button>
            </div>
          </article>
        </div>
        <p v-else class="muted">暂无项目 tier 覆盖</p>
      </div>
      <div class="panel" style="margin-top: 8px">
        <h5>配额冲突预览</h5>
        <div class="actions">
          <label class="muted">
            projectId
            <input v-model.trim="taskQuotaPreviewProjectIdModel" placeholder="projectId" />
          </label>
        </div>
        <p class="muted" v-if="taskQuotaPreviewResult">
          生效限额 {{ taskQuotaPreviewResult.dailyLimit }} / day · source {{ taskQuotaPreviewResult.limitSource }}
          <template v-if="taskQuotaPreviewResult.tier"> · tier {{ taskQuotaPreviewResult.tier }}</template>
        </p>
        <p class="muted" v-else>输入 projectId 查看最终命中规则</p>
      </div>
      <div class="panel" style="margin-top: 8px">
        <div class="inline-between">
          <h5>保存前变更预览</h5>
          <div class="actions">
            <span class="muted">变化 {{ taskQuotaDiffEntries.length }}</span>
            <button :disabled="taskQuotaDiffEntries.length === 0" @click="exportTaskQuotaDiffCsv()">导出变更 CSV</button>
          </div>
        </div>
        <div class="list compact-list" v-if="taskQuotaDiffEntries.length > 0">
          <article class="card" v-for="item in taskQuotaDiffEntries.slice(0, 20)" :key="`quota-diff-${item.projectId}`">
            <div class="inline-between">
              <strong>{{ item.projectId.slice(0, 16) }}</strong>
              <span class="muted">{{ item.before.dailyLimit }} -> {{ item.after.dailyLimit }}</span>
            </div>
            <p class="muted">
              source: {{ item.before.limitSource }} -> {{ item.after.limitSource }}
              <template v-if="item.before.tier || item.after.tier">
                · tier: {{ item.before.tier || '-' }} -> {{ item.after.tier || '-' }}
              </template>
            </p>
          </article>
        </div>
        <p v-else class="muted">当前编辑内容与已保存配置一致</p>
      </div>
      <p class="muted" v-if="taskQuotaUsage">
        用量：{{ taskQuotaUsage.projectId }} · {{ taskQuotaUsage.date }} · used {{ taskQuotaUsage.used }} / limit
        {{ taskQuotaUsage.dailyLimit }} · remaining {{ taskQuotaUsage.remaining }}
        <template v-if="taskQuotaUsage.limitSource"> · source {{ taskQuotaUsage.limitSource }}</template>
        <template v-if="taskQuotaUsage.tier"> · tier {{ taskQuotaUsage.tier }}</template>
      </p>
      <div class="actions" style="margin-top: 6px">
        <button :disabled="taskQuotaLoading" @click="exportTaskQuotaUsageEvents('json')">导出消耗账本 JSON</button>
        <button :disabled="taskQuotaLoading" @click="exportTaskQuotaUsageEvents('csv')">导出消耗账本 CSV</button>
        <button :disabled="taskQuotaLoading" @click="exportTaskQuotaRejectEvents('json')">导出拒绝事件 JSON</button>
        <button :disabled="taskQuotaLoading" @click="exportTaskQuotaRejectEvents('csv')">导出拒绝事件 CSV</button>
      </div>
      <div class="list compact-list" v-if="taskQuotaUsageEvents.length > 0">
        <article class="card" v-for="item in taskQuotaUsageEvents.slice(0, 8)" :key="item.id">
          <div class="inline-between">
            <strong>{{ item.projectId.slice(0, 8) }} · {{ item.date }}</strong>
            <span class="muted">{{ new Date(item.at).toLocaleString() }}</span>
          </div>
          <p class="muted">
            task {{ item.taskId.slice(0, 8) }} · +{{ item.consumed }} => usedAfter {{ item.usedAfter }} / limit {{ item.dailyLimit }}
            <template v-if="item.limitSource"> · {{ item.limitSource }}</template>
            <template v-if="item.tier"> · {{ item.tier }}</template>
          </p>
          <div class="actions">
            <button @click="goTimelineByQuotaUsageEvent(item)">定位到时间线分镜</button>
          </div>
        </article>
      </div>
      <div class="list compact-list" v-if="taskQuotaRejectEvents.length > 0">
        <article class="card" v-for="item in taskQuotaRejectEvents.slice(0, 6)" :key="item.id">
          <div class="inline-between">
            <strong>{{ item.projectId.slice(0, 8) }} · {{ item.date }}</strong>
            <span class="muted">{{ new Date(item.at).toLocaleString() }}</span>
          </div>
          <p class="muted">
            used {{ item.used }} / limit {{ item.dailyLimit }} · {{ item.reason }}
            <template v-if="item.limitSource"> · {{ item.limitSource }}</template>
            <template v-if="item.tier"> · {{ item.tier }}</template>
          </p>
        </article>
      </div>
    </div>

    <div style="margin-top: 10px" class="panel">
      <div class="inline-between">
        <h4>Failure Injection 回放</h4>
        <div class="actions">
          <button :disabled="failureInjectionLoading" @click="saveFailureInjectionConfig()">保存配置</button>
          <button :disabled="failureInjectionLoading" @click="loadFailureInjectionReport()">刷新</button>
          <button :disabled="failureInjectionLoading" @click="resetFailureInjectionReport()">清空事件</button>
        </div>
      </div>
      <div class="actions">
        <label class="muted">
          enabled
          <input v-model="failureInjectionConfig.enabled" type="checkbox" />
        </label>
        <label class="muted">
          ratio
          <input v-model.number="failureInjectionConfig.ratio" type="number" min="0" max="1" step="0.05" />
        </label>
        <label class="muted">
          taskTypes
          <select v-model="failureInjectionConfig.taskTypes" multiple size="3">
            <option value="video">video</option>
            <option value="audio">audio</option>
            <option value="video_merge">video_merge</option>
          </select>
        </label>
        <label class="muted">
          errorCodes
          <select v-model="failureInjectionConfig.errorCodes" multiple size="5">
            <option value="CAPABILITY_MISMATCH">CAPABILITY_MISMATCH</option>
            <option value="PROVIDER_AUTH_FAILED">PROVIDER_AUTH_FAILED</option>
            <option value="PROVIDER_RATE_LIMITED">PROVIDER_RATE_LIMITED</option>
            <option value="PROVIDER_TIMEOUT">PROVIDER_TIMEOUT</option>
            <option value="PROVIDER_UNKNOWN">PROVIDER_UNKNOWN</option>
          </select>
        </label>
      </div>
      <p class="muted">
        enabled={{ failureInjectionReport.enabled ? 'on' : 'off' }}
        · ratio={{ failureInjectionReport.ratio }}
        · types={{ failureInjectionReport.taskTypes.join(',') || '-' }}
        · codes={{ failureInjectionReport.errorCodes.join(',') || '-' }}
      </p>
      <p class="muted">
        generated={{ failureInjectionReport.generatedAt ? new Date(failureInjectionReport.generatedAt).toLocaleString() : '-' }}
        · total={{ failureInjectionReport.totalEvents }}
      </p>
      <div class="actions">
        <label class="muted">
          taskType filter
          <select v-model="fiTaskTypeFilterModel">
            <option value="">all</option>
            <option value="video">video</option>
            <option value="audio">audio</option>
            <option value="video_merge">video_merge</option>
          </select>
        </label>
        <label class="muted">
          errorCode filter
          <select v-model="fiErrorCodeFilterModel">
            <option value="">all</option>
            <option value="CAPABILITY_MISMATCH">CAPABILITY_MISMATCH</option>
            <option value="PROVIDER_AUTH_FAILED">PROVIDER_AUTH_FAILED</option>
            <option value="PROVIDER_RATE_LIMITED">PROVIDER_RATE_LIMITED</option>
            <option value="PROVIDER_TIMEOUT">PROVIDER_TIMEOUT</option>
            <option value="PROVIDER_UNKNOWN">PROVIDER_UNKNOWN</option>
          </select>
        </label>
        <button :disabled="failureInjectionLoading" @click="exportFailureInjectionEvents('json')">导出 JSON</button>
        <button :disabled="failureInjectionLoading" @click="exportFailureInjectionEvents('csv')">导出 CSV</button>
      </div>
      <div class="list compact-list" v-if="failureInjectionReport.events.length > 0">
        <article class="card" v-for="item in failureInjectionReport.events.slice(0, 8)" :key="item.id">
          <div class="inline-between">
            <strong>{{ item.taskType }} · {{ item.errorCode }}</strong>
            <span class="muted">{{ new Date(item.at).toLocaleString() }}</span>
          </div>
          <p class="muted">{{ item.projectId.slice(0, 8) }} / {{ item.taskId.slice(0, 8) }} · stage={{ item.stage }}</p>
          <p class="muted">{{ item.message }}</p>
        </article>
      </div>
      <p v-else class="muted">暂无注入事件</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import RouteRestoreHint from '@/components/RouteRestoreHint.vue';
import type {
  FailureInjectionConfig,
  FailureInjectionReport,
  QueueRuntimeAlertState,
  TaskCatalogAlertEvent,
  TaskCatalogContractCheckResult,
  TaskCatalogItem,
  TaskQuotaConfig,
  TaskQuotaRejectEvent,
  TaskQuotaUsage,
  TaskQuotaUsageEvent,
  TaskSloConfig,
  TaskSloState,
  TaskUnifiedAlertActionLog,
  TaskUnifiedAlertEvent,
  TaskUnifiedAlertIncident,
  TaskUnifiedAlertIncidentEscalationConfig,
  TaskUnifiedAlertIncidentEscalationLog,
  TaskUnifiedAlertIncidentNotificationConfig,
  TaskUnifiedAlertIncidentNotificationDeliveryLog,
  TaskUnifiedAlertIncidentSlaConfig,
  TaskUnifiedAlertIncidentSlaSummary,
  TaskUnifiedAlertPolicyConfig,
  TaskUnifiedAlertState,
  VideoTaskRuntimeSnapshot,
  VideoTaskRuntimeTrendPoint
} from '@/types/models';

type QueueAlertLevel = 'green' | 'yellow' | 'red';
type TaskCatalogTypeFilter = '' | 'video' | 'audio' | 'video_merge';
type NotificationStatusFilter = '' | 'sent' | 'failed';
type IncidentStatusFilter = '' | 'open' | 'resolved';
type FailureInjectionTaskTypeFilter = '' | 'video' | 'audio' | 'video_merge';
type FailureInjectionErrorCodeFilter =
  | ''
  | 'CAPABILITY_MISMATCH'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNKNOWN';
type TaskQuotaDiffEntry = {
  projectId: string;
  before: { dailyLimit: number; limitSource: string; tier?: string };
  after: { dailyLimit: number; limitSource: string; tier?: string };
};
type TaskQuotaPreviewResult = {
  dailyLimit: number;
  limitSource: string;
  tier?: string;
};

const props = defineProps<{
  runtime: VideoTaskRuntimeSnapshot;
  runtimeTrend: VideoTaskRuntimeTrendPoint[];
  runtimeTrendPoints: { queued: string; running: string; pump: string };
  congestionLevel: QueueAlertLevel;
  congestionLabel: string;
  queueThresholdWarn: number;
  queueThresholdCritical: number;
  queueAlertSaving: boolean;
  queueAlertActionLoading: boolean;
  queueAlertState: QueueRuntimeAlertState;
  mergedRuntimeAlerts: TaskUnifiedAlertEvent[];
  taskUnifiedAlerts: TaskUnifiedAlertState;
  unifiedAlertWindowMinutes: number;
  taskUnifiedAlertPolicy: TaskUnifiedAlertPolicyConfig;
  taskUnifiedAlertPolicyLoading: boolean;
  taskUnifiedAlertActions: TaskUnifiedAlertActionLog[];
  taskUnifiedAlertIncidents: TaskUnifiedAlertIncident[];
  taskUnifiedIncidentSlaSummary: TaskUnifiedAlertIncidentSlaSummary;
  taskUnifiedIncidentSlaConfig: TaskUnifiedAlertIncidentSlaConfig;
  unifiedIncidentSlaLoading: boolean;
  taskUnifiedIncidentEscalationConfig: TaskUnifiedAlertIncidentEscalationConfig;
  taskUnifiedIncidentNotificationConfig: TaskUnifiedAlertIncidentNotificationConfig;
  unifiedIncidentEscalationLoading: boolean;
  taskUnifiedIncidentEscalationLogs: TaskUnifiedAlertIncidentEscalationLog[];
  notificationDeliverySummary: {
    totalEscalations: number;
    sent: number;
    failed: number;
    pending: number;
    totalAttempts: number;
    nextRetryTotal: number;
  };
  notificationNextRetryList: TaskUnifiedAlertIncidentEscalationLog[];
  notificationFailureReasonTop: Array<{ reason: string; count: number }>;
  filteredNotificationDeliveryLogs: TaskUnifiedAlertIncidentNotificationDeliveryLog[];
  taskUnifiedIncidentNotificationDeliveryLogs: TaskUnifiedAlertIncidentNotificationDeliveryLog[];
  unifiedIncidentDraft: Record<string, { assignee: string; note: string }>;
  unifiedIncidentActionLoading: boolean;
  unifiedIncidentStatusFilter: IncidentStatusFilter;
  unifiedIncidentNotificationDeliveryStatusFilter: NotificationStatusFilter;
  unifiedIncidentNotificationDeliveryMessageKeyword: string;
  unifiedIncidentEscalationActor: string;
  taskCatalogLoading: boolean;
  taskCatalog: TaskCatalogItem[];
  taskCatalogAlerts: TaskCatalogAlertEvent[];
  taskCatalogContractCheck: TaskCatalogContractCheckResult | null;
  taskCatalogDriftCount: number;
  filteredTaskCatalog: TaskCatalogItem[];
  taskCatalogDiffByType: Record<string, { drift: boolean; reasons: string[] }>;
  taskCatalogTypeFilter: TaskCatalogTypeFilter;
  taskSloState: TaskSloState;
  taskSloLabel: string;
  taskSloConfig: TaskSloConfig;
  taskSloLoading: boolean;
  quotaPanelRestoredHint: string;
  taskQuotaConfig: TaskQuotaConfig;
  taskQuotaUsageProjectId: string;
  taskQuotaUsage: TaskQuotaUsage | null;
  taskQuotaLoading: boolean;
  taskQuotaOverrideRows: Array<{ projectId: string; dailyLimit: number }>;
  taskQuotaTierLimitsForm: { standard: number; pro: number; enterprise: number };
  taskQuotaProjectTierRows: Array<{ projectId: string; tier: 'standard' | 'pro' | 'enterprise' }>;
  taskQuotaPreviewProjectId: string;
  taskQuotaPreviewResult: TaskQuotaPreviewResult | null;
  taskQuotaDiffEntries: TaskQuotaDiffEntry[];
  taskQuotaUsageEvents: TaskQuotaUsageEvent[];
  taskQuotaRejectEvents: TaskQuotaRejectEvent[];
  failureInjectionLoading: boolean;
  failureInjectionConfig: FailureInjectionConfig;
  failureInjectionReport: FailureInjectionReport;
  fiTaskTypeFilter: FailureInjectionTaskTypeFilter;
  fiErrorCodeFilter: FailureInjectionErrorCodeFilter;
  formatPercent: (value: number) => string;
  formatMs: (value: number) => string;
  saveQueueAlertConfig: () => void | Promise<void>;
  acknowledgeLatestQueueAlert: (minutes?: number) => void | Promise<void>;
  exportQueueAlertsJson: () => void | Promise<void>;
  exportQueueAlertsCsv: () => void | Promise<void>;
  refreshUnifiedAlertsOnly: () => void | Promise<void>;
  exportUnifiedAlerts: (format: 'json' | 'csv') => void | Promise<void>;
  saveUnifiedAlertPolicy: () => void | Promise<void>;
  exportUnifiedAlertActions: (format: 'json' | 'csv') => void | Promise<void>;
  acknowledgeMergedAlert: (item: TaskUnifiedAlertEvent) => void | Promise<void>;
  refreshUnifiedIncidentsOnly: () => void | Promise<void>;
  exportUnifiedAlertIncidents: (format: 'json' | 'csv') => void | Promise<void>;
  saveUnifiedIncidentSlaConfig: () => void | Promise<void>;
  refreshUnifiedIncidentSlaOnly: () => void | Promise<void>;
  saveUnifiedIncidentEscalationConfig: () => void | Promise<void>;
  saveUnifiedIncidentNotificationConfig: () => void | Promise<void>;
  processUnifiedIncidentNotifications: () => void | Promise<void>;
  exportUnifiedIncidentNotificationDeliveryLogs: (format: 'json' | 'csv') => void | Promise<void>;
  triggerUnifiedIncidentEscalations: () => void | Promise<void>;
  refreshUnifiedIncidentEscalationsOnly: () => void | Promise<void>;
  exportUnifiedIncidentEscalations: (format: 'json' | 'csv') => void | Promise<void>;
  updateEscalationNotificationStatus: (
    item: TaskUnifiedAlertIncidentEscalationLog,
    status: 'pending' | 'sent' | 'failed'
  ) => void | Promise<void>;
  updateUnifiedIncidentStatus: (item: TaskUnifiedAlertIncident, status: 'open' | 'resolved') => void | Promise<void>;
  saveUnifiedIncidentMeta: (item: TaskUnifiedAlertIncident) => void | Promise<void>;
  refreshTaskCatalog: () => void | Promise<void>;
  exportTaskCatalog: (format: 'json' | 'csv') => void | Promise<void>;
  exportTaskCatalogAlerts: (format: 'json' | 'csv') => void | Promise<void>;
  saveTaskSloConfigAction: () => void | Promise<void>;
  refreshTaskQuotaUsage: () => void | Promise<void>;
  saveTaskQuotaConfigAction: () => void | Promise<void>;
  addTaskQuotaOverrideRow: () => void | Promise<void>;
  removeTaskQuotaOverrideRow: (idx: number) => void | Promise<void>;
  addTaskQuotaProjectTierRow: () => void | Promise<void>;
  removeTaskQuotaProjectTierRow: (idx: number) => void | Promise<void>;
  exportTaskQuotaDiffCsv: () => void | Promise<void>;
  exportTaskQuotaUsageEvents: (format: 'json' | 'csv') => void | Promise<void>;
  exportTaskQuotaRejectEvents: (format: 'json' | 'csv') => void | Promise<void>;
  goTimelineByQuotaUsageEvent: (item: TaskQuotaUsageEvent) => void | Promise<void>;
  saveFailureInjectionConfig: () => void | Promise<void>;
  loadFailureInjectionReport: () => void | Promise<void>;
  resetFailureInjectionReport: () => void | Promise<void>;
  exportFailureInjectionEvents: (format: 'json' | 'csv') => void | Promise<void>;
}>();

const emit = defineEmits<{
  (e: 'update:queueThresholdWarn', value: number): void;
  (e: 'update:queueThresholdCritical', value: number): void;
  (e: 'update:unifiedAlertWindowMinutes', value: number): void;
  (e: 'update:unifiedIncidentStatusFilter', value: IncidentStatusFilter): void;
  (e: 'update:unifiedIncidentNotificationDeliveryStatusFilter', value: NotificationStatusFilter): void;
  (e: 'update:unifiedIncidentNotificationDeliveryMessageKeyword', value: string): void;
  (e: 'update:unifiedIncidentEscalationActor', value: string): void;
  (e: 'update:taskCatalogTypeFilter', value: TaskCatalogTypeFilter): void;
  (e: 'update:taskQuotaUsageProjectId', value: string): void;
  (e: 'update:taskQuotaPreviewProjectId', value: string): void;
  (e: 'update:fiTaskTypeFilter', value: FailureInjectionTaskTypeFilter): void;
  (e: 'update:fiErrorCodeFilter', value: FailureInjectionErrorCodeFilter): void;
}>();

const queueThresholdWarnModel = computed({
  get: () => props.queueThresholdWarn,
  set: (value: number) => emit('update:queueThresholdWarn', Number(value))
});

const queueThresholdCriticalModel = computed({
  get: () => props.queueThresholdCritical,
  set: (value: number) => emit('update:queueThresholdCritical', Number(value))
});

const unifiedAlertWindowMinutesModel = computed({
  get: () => props.unifiedAlertWindowMinutes,
  set: (value: number) => emit('update:unifiedAlertWindowMinutes', Number(value))
});

const unifiedIncidentStatusFilterModel = computed({
  get: () => props.unifiedIncidentStatusFilter,
  set: (value: IncidentStatusFilter) => emit('update:unifiedIncidentStatusFilter', value)
});

const unifiedIncidentNotificationDeliveryStatusFilterModel = computed({
  get: () => props.unifiedIncidentNotificationDeliveryStatusFilter,
  set: (value: NotificationStatusFilter) => emit('update:unifiedIncidentNotificationDeliveryStatusFilter', value)
});

const unifiedIncidentNotificationDeliveryMessageKeywordModel = computed({
  get: () => props.unifiedIncidentNotificationDeliveryMessageKeyword,
  set: (value: string) => emit('update:unifiedIncidentNotificationDeliveryMessageKeyword', value)
});

const unifiedIncidentEscalationActorModel = computed({
  get: () => props.unifiedIncidentEscalationActor,
  set: (value: string) => emit('update:unifiedIncidentEscalationActor', value)
});

const taskCatalogTypeFilterModel = computed({
  get: () => props.taskCatalogTypeFilter,
  set: (value: TaskCatalogTypeFilter) => emit('update:taskCatalogTypeFilter', value)
});

const taskQuotaUsageProjectIdModel = computed({
  get: () => props.taskQuotaUsageProjectId,
  set: (value: string) => emit('update:taskQuotaUsageProjectId', value)
});

const taskQuotaPreviewProjectIdModel = computed({
  get: () => props.taskQuotaPreviewProjectId,
  set: (value: string) => emit('update:taskQuotaPreviewProjectId', value)
});

const fiTaskTypeFilterModel = computed({
  get: () => props.fiTaskTypeFilter,
  set: (value: FailureInjectionTaskTypeFilter) => emit('update:fiTaskTypeFilter', value)
});

const fiErrorCodeFilterModel = computed({
  get: () => props.fiErrorCodeFilter,
  set: (value: FailureInjectionErrorCodeFilter) => emit('update:fiErrorCodeFilter', value)
});
</script>

<style scoped>
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.status-lamp {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  border: 1px solid var(--line-strong);
}

.status-green {
  background: var(--success);
}

.status-yellow {
  background: var(--warning);
}

.status-red {
  background: var(--danger);
}

.runtime-trend {
  margin-top: 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 8px;
  background: var(--card-soft);
}

.runtime-trend svg {
  width: 100%;
  height: 80px;
}

.runtime-trend .line-queued,
.runtime-trend .line-running,
.runtime-trend .line-pump {
  fill: none;
  stroke-width: 1.6;
}

.runtime-trend .line-queued {
  stroke: var(--status-info-ink);
}

.runtime-trend .line-running {
  stroke: var(--status-accent-ink);
}

.runtime-trend .line-pump {
  stroke: var(--status-success-ink);
}

@media (max-width: 980px) {
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .metrics-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
