<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="task-center-shell" compact>
      <template #rail>
        <section class="panel">
          <TaskCenterHeaderPanel
            :mobile-filter-open="mobileFilterOpen"
            :toggle-mobile-filters="toggleMobileFilters"
            :focus-failed-tasks="focusFailedTasks"
            :go-home="goHome"
            :load-tasks="loadTasks"
          />
        </section>

        <section class="panel compact-panel">
          <TaskCenterFilterPanel
            :mobile-filter-open="mobileFilterOpen"
            :keyword="keyword"
            :provider-task-id-keyword="providerTaskIdKeyword"
            :status="status"
            :provider-error-code="providerErrorCode"
            :created-from-local="createdFromLocal"
            :created-to-local="createdToLocal"
            :sort-by="sortBy"
            :order="order"
            :preset-name="presetName"
            :selected-preset-name="selectedPresetName"
            :presets="presets"
            :format-preset-option="formatPresetOption"
            :search="search"
            :clear-filters="clearFilters"
            :copy-current-query-link="copyCurrentQueryLink"
            :save-current-preset="saveCurrentPreset"
            :apply-selected-preset="applySelectedPreset"
            :make-selected-preset-default="makeSelectedPresetDefault"
            :delete-selected-preset="deleteSelectedPreset"
            :cancel-active-on-page="cancelActiveOnPage"
            :retry-failed-on-page="retryFailedOnPage"
            :cancel-active-on-filtered-page="cancelActiveOnFilteredPage"
            :retry-failed-on-filtered-page="retryFailedOnFilteredPage"
            :repair-failed-on-filtered-page-by-policy="repairFailedOnFilteredPageByPolicy"
            :repair-by-policy-with-server-query="repairByPolicyWithServerQuery"
            :open-auto-repair-logs-in-settings="openAutoRepairLogsInSettings"
            @update:keyword="keyword = $event"
            @update:provider-task-id-keyword="providerTaskIdKeyword = $event"
            @update:status="status = $event"
            @update:provider-error-code="providerErrorCode = $event"
            @update:created-from-local="createdFromLocal = $event"
            @update:created-to-local="createdToLocal = $event"
            @update:sort-by="sortBy = $event"
            @update:order="order = $event"
            @update:preset-name="presetName = $event"
            @update:selected-preset-name="selectedPresetName = $event"
          />
        </section>
      </template>

      <main>
        <section class="panel result-panel">
          <TaskCenterOverviewPanel
            :active-filter-chips="activeFilterChips"
            :error="error"
            :action-message="actionMessage"
            :last-repair-log-shortcut="lastRepairLogShortcut"
            :metrics="metrics"
            :remove-filter-chip="removeFilterChip"
            :open-last-repair-log-shortcut="openLastRepairLogShortcut"
            :copy-last-repair-log-shortcut="copyLastRepairLogShortcut"
            :apply-metric-status-filter="applyMetricStatusFilter"
            :format-percent="formatPercent"
            :format-ms="formatMs"
          />

          <TaskCenterTaskListPanel
            :tasks="tasks"
            :filtered-tasks="filteredTasks"
            :display-tasks="displayTasks"
            :total="total"
            :page="page"
            :total-pages="totalPages"
            :keyword="keyword"
            :view-mode="viewMode"
            :table-column-visible="tableColumnVisible"
            :table-sort-key="tableSortKey"
            :table-sort-order="tableSortOrder"
            :visible-table-column-count="visibleTableColumnCount"
            :set-view-mode="setViewMode"
            :toggle-table-column="toggleTableColumn"
            :toggle-table-sort="toggleTableSort"
            :retry="retry"
            :cancel="cancel"
            :view-events="viewEvents"
            :open-auto-repair-logs-for-task="openAutoRepairLogsForTask"
            :copy-auto-repair-log-link-for-task="copyAutoRepairLogLinkForTask"
            :copy-task-id="copyTaskId"
            :copy-reconcile-ids="copyReconcileIds"
            :prev-page="prevPage"
            :next-page="nextPage"
          />
        </section>
      </main>

      <template #inspector>
        <section class="panel runtime-panel">
          <TaskCenterRuntimePanels
            :runtime="runtime"
            :runtime-trend="runtimeTrend"
            :runtime-trend-points="runtimeTrendPoints"
            :congestion-level="congestionLevel"
            :congestion-label="congestionLabel"
            :queue-threshold-warn="queueThresholdWarn"
            :queue-threshold-critical="queueThresholdCritical"
            :queue-alert-saving="queueAlertSaving"
            :queue-alert-action-loading="queueAlertActionLoading"
            :queue-alert-state="queueAlertState"
            :merged-runtime-alerts="mergedRuntimeAlerts"
            :task-unified-alerts="taskUnifiedAlerts"
            :unified-alert-window-minutes="unifiedAlertWindowMinutes"
            :task-unified-alert-policy="taskUnifiedAlertPolicy"
            :task-unified-alert-policy-loading="taskUnifiedAlertPolicyLoading"
            :task-unified-alert-actions="taskUnifiedAlertActions"
            :task-unified-alert-incidents="taskUnifiedAlertIncidents"
            :task-unified-incident-sla-summary="taskUnifiedIncidentSlaSummary"
            :task-unified-incident-sla-config="taskUnifiedIncidentSlaConfig"
            :unified-incident-sla-loading="unifiedIncidentSlaLoading"
            :task-unified-incident-escalation-config="taskUnifiedIncidentEscalationConfig"
            :task-unified-incident-notification-config="taskUnifiedIncidentNotificationConfig"
            :unified-incident-escalation-loading="unifiedIncidentEscalationLoading"
            :task-unified-incident-escalation-logs="taskUnifiedIncidentEscalationLogs"
            :notification-delivery-summary="notificationDeliverySummary"
            :notification-next-retry-list="notificationNextRetryList"
            :notification-failure-reason-top="notificationFailureReasonTop"
            :filtered-notification-delivery-logs="filteredNotificationDeliveryLogs"
            :task-unified-incident-notification-delivery-logs="taskUnifiedIncidentNotificationDeliveryLogs"
            :unified-incident-draft="unifiedIncidentDraft"
            :unified-incident-action-loading="unifiedIncidentActionLoading"
            :unified-incident-status-filter="unifiedIncidentStatusFilter"
            :unified-incident-notification-delivery-status-filter="unifiedIncidentNotificationDeliveryStatusFilter"
            :unified-incident-notification-delivery-message-keyword="unifiedIncidentNotificationDeliveryMessageKeyword"
            :unified-incident-escalation-actor="unifiedIncidentEscalationActor"
            :task-catalog-loading="taskCatalogLoading"
            :task-catalog="taskCatalog"
            :task-catalog-alerts="taskCatalogAlerts"
            :task-catalog-contract-check="taskCatalogContractCheck"
            :task-catalog-drift-count="taskCatalogDriftCount"
            :filtered-task-catalog="filteredTaskCatalog"
            :task-catalog-diff-by-type="taskCatalogDiffByType"
            :task-catalog-type-filter="taskCatalogTypeFilter"
            :task-slo-state="taskSloState"
            :task-slo-label="taskSloLabel"
            :task-slo-config="taskSloConfig"
            :task-slo-loading="taskSloLoading"
            :quota-panel-restored-hint="quotaPanelRestoredHint"
            :task-quota-config="taskQuotaConfig"
            :task-quota-usage-project-id="taskQuotaUsageProjectId"
            :task-quota-usage="taskQuotaUsage"
            :task-quota-loading="taskQuotaLoading"
            :task-quota-override-rows="taskQuotaOverrideRows"
            :task-quota-tier-limits-form="taskQuotaTierLimitsForm"
            :task-quota-project-tier-rows="taskQuotaProjectTierRows"
            :task-quota-preview-project-id="taskQuotaPreviewProjectId"
            :task-quota-preview-result="taskQuotaPreviewResult"
            :task-quota-diff-entries="taskQuotaDiffEntries"
            :task-quota-usage-events="taskQuotaUsageEvents"
            :task-quota-reject-events="taskQuotaRejectEvents"
            :failure-injection-loading="failureInjectionLoading"
            :failure-injection-config="failureInjectionConfig"
            :failure-injection-report="failureInjectionReport"
            :fi-task-type-filter="fiTaskTypeFilter"
            :fi-error-code-filter="fiErrorCodeFilter"
            :format-percent="formatPercent"
            :format-ms="formatMs"
            :save-queue-alert-config="saveQueueAlertConfig"
            :acknowledge-latest-queue-alert="acknowledgeLatestQueueAlert"
            :export-queue-alerts-json="exportQueueAlertsJson"
            :export-queue-alerts-csv="exportQueueAlertsCsv"
            :refresh-unified-alerts-only="refreshUnifiedAlertsOnly"
            :export-unified-alerts="exportUnifiedAlerts"
            :save-unified-alert-policy="saveUnifiedAlertPolicy"
            :export-unified-alert-actions="exportUnifiedAlertActions"
            :acknowledge-merged-alert="acknowledgeMergedAlert"
            :refresh-unified-incidents-only="refreshUnifiedIncidentsOnly"
            :export-unified-alert-incidents="exportUnifiedAlertIncidents"
            :save-unified-incident-sla-config="saveUnifiedIncidentSlaConfig"
            :refresh-unified-incident-sla-only="refreshUnifiedIncidentSlaOnly"
            :save-unified-incident-escalation-config="saveUnifiedIncidentEscalationConfig"
            :save-unified-incident-notification-config="saveUnifiedIncidentNotificationConfig"
            :process-unified-incident-notifications="processUnifiedIncidentNotifications"
            :export-unified-incident-notification-delivery-logs="exportUnifiedIncidentNotificationDeliveryLogs"
            :trigger-unified-incident-escalations="triggerUnifiedIncidentEscalations"
            :refresh-unified-incident-escalations-only="refreshUnifiedIncidentEscalationsOnly"
            :export-unified-incident-escalations="exportUnifiedIncidentEscalations"
            :update-escalation-notification-status="updateEscalationNotificationStatus"
            :update-unified-incident-status="updateUnifiedIncidentStatus"
            :save-unified-incident-meta="saveUnifiedIncidentMeta"
            :refresh-task-catalog="refreshTaskCatalog"
            :export-task-catalog="exportTaskCatalog"
            :export-task-catalog-alerts="exportTaskCatalogAlerts"
            :save-task-slo-config-action="saveTaskSloConfigAction"
            :refresh-task-quota-usage="refreshTaskQuotaUsage"
            :save-task-quota-config-action="saveTaskQuotaConfigAction"
            :add-task-quota-override-row="addTaskQuotaOverrideRow"
            :remove-task-quota-override-row="removeTaskQuotaOverrideRow"
            :add-task-quota-project-tier-row="addTaskQuotaProjectTierRow"
            :remove-task-quota-project-tier-row="removeTaskQuotaProjectTierRow"
            :export-task-quota-diff-csv="exportTaskQuotaDiffCsv"
            :export-task-quota-usage-events="exportTaskQuotaUsageEvents"
            :export-task-quota-reject-events="exportTaskQuotaRejectEvents"
            :go-timeline-by-quota-usage-event="goTimelineByQuotaUsageEvent"
            :save-failure-injection-config="saveFailureInjectionConfig"
            :load-failure-injection-report="loadFailureInjectionReport"
            :reset-failure-injection-report="resetFailureInjectionReport"
            :export-failure-injection-events="exportFailureInjectionEvents"
            @update:queue-threshold-warn="queueThresholdWarn = $event"
            @update:queue-threshold-critical="queueThresholdCritical = $event"
            @update:unified-alert-window-minutes="unifiedAlertWindowMinutes = $event"
            @update:unified-incident-status-filter="unifiedIncidentStatusFilter = $event"
            @update:unified-incident-notification-delivery-status-filter="unifiedIncidentNotificationDeliveryStatusFilter = $event"
            @update:unified-incident-notification-delivery-message-keyword="unifiedIncidentNotificationDeliveryMessageKeyword = $event"
            @update:unified-incident-escalation-actor="unifiedIncidentEscalationActor = $event"
            @update:task-catalog-type-filter="taskCatalogTypeFilter = $event"
            @update:task-quota-usage-project-id="taskQuotaUsageProjectId = $event"
            @update:task-quota-preview-project-id="taskQuotaPreviewProjectId = $event"
            @update:fi-task-type-filter="fiTaskTypeFilter = $event"
            @update:fi-error-code-filter="fiErrorCodeFilter = $event"
          />
        </section>
      </template>
    </DesktopWorkbenchShell>

    <input
      ref="eventPresetFileInputRef"
      type="file"
      accept="application/json,.json"
      style="display: none"
      @change="onImportEventFilterPresetsFileChange"
    />

    <TaskCenterEventModal
      :events-open="eventsOpen"
      :active-task-id="activeTaskId"
      :active-detail="activeDetail"
      :events-loading="eventsLoading"
      :filtered-events="filteredEvents"
      :events="events"
      :event-status-filter="eventStatusFilter"
      :event-failed-only="eventFailedOnly"
      :event-keyword="eventKeyword"
      :event-created-from-local="eventCreatedFromLocal"
      :event-created-to-local="eventCreatedToLocal"
      :event-export-count="eventExportCount"
      :event-export-count-loading="eventExportCountLoading"
      :event-preset-name="eventPresetName"
      :selected-event-preset-name="selectedEventPresetName"
      :event-filter-presets="eventFilterPresets"
      :selected-event-filter-preset="selectedEventFilterPreset"
      :selected-event-filter-preset-diff="selectedEventFilterPresetDiff"
      :event-preset-share-text="eventPresetShareText"
      :skip-event-preset-apply-confirm-in-session="skipEventPresetApplyConfirmInSession"
      :event-preset-apply-confirm-open="eventPresetApplyConfirmOpen"
      :pending-event-preset-name="pendingEventPresetName"
      :pending-event-preset-changed-fields="pendingEventPresetChangedFields"
      :event-preset-import-confirm-open="eventPresetImportConfirmOpen"
      :pending-import-event-filter-presets="pendingImportEventFilterPresets"
      :pending-import-conflict-names="pendingImportConflictNames"
      :pending-import-source="pendingImportSource"
      :format-event-filter-preset-option="formatEventFilterPresetOption"
      :toggle-event-failed-only="toggleEventFailedOnly"
      :reset-event-filters="resetEventFilters"
      :save-event-filter-preset="saveEventFilterPreset"
      :apply-selected-event-filter-preset="applySelectedEventFilterPreset"
      :rename-selected-event-filter-preset="renameSelectedEventFilterPreset"
      :toggle-favorite-selected-event-filter-preset="toggleFavoriteSelectedEventFilterPreset"
      :delete-selected-event-filter-preset="deleteSelectedEventFilterPreset"
      :export-event-filter-presets-json="exportEventFilterPresetsJson"
      :trigger-import-event-filter-presets="triggerImportEventFilterPresets"
      :copy-selected-event-filter-preset-share-text="copySelectedEventFilterPresetShareText"
      :copy-selected-event-filter-preset-readable-text="copySelectedEventFilterPresetReadableText"
      :import-event-filter-preset-from-share-text="importEventFilterPresetFromShareText"
      :restore-event-preset-apply-confirm="restoreEventPresetApplyConfirm"
      :export-filtered-events-json="exportFilteredEventsJson"
      :export-filtered-events-csv="exportFilteredEventsCsv"
      :copy-filtered-events-text="copyFilteredEventsText"
      :close-events="closeEvents"
      :cancel-apply-event-filter-preset="cancelApplyEventFilterPreset"
      :confirm-apply-event-filter-preset="confirmApplyEventFilterPreset"
      :cancel-import-event-filter-presets="cancelImportEventFilterPresets"
      :confirm-import-event-filter-presets="confirmImportEventFilterPresets"
      @update:event-status-filter="eventStatusFilter = $event"
      @update:event-failed-only="eventFailedOnly = $event"
      @update:event-keyword="eventKeyword = $event"
      @update:event-created-from-local="eventCreatedFromLocal = $event"
      @update:event-created-to-local="eventCreatedToLocal = $event"
      @update:event-preset-name="eventPresetName = $event"
      @update:selected-event-preset-name="selectedEventPresetName = $event"
      @update:event-preset-share-text="eventPresetShareText = $event"
      @update:skip-event-preset-apply-confirm-in-session="skipEventPresetApplyConfirmInSession = $event"
    />
  </AppShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import DesktopWorkbenchShell from '@/components/DesktopWorkbenchShell.vue';
import { clearToken } from '@/api/client';
import type {
  VideoTaskDetail,
  VideoTaskEvent,
  VideoTaskListItem,
  VideoTaskMetrics,
  VideoTaskRuntimeTrendPoint,
  VideoTaskRuntimeSnapshot
} from '@/types/models';
import TaskCenterEventModal from '@/features/task-center/components/TaskCenterEventModal.vue';
import TaskCenterFilterPanel from '@/features/task-center/components/TaskCenterFilterPanel.vue';
import TaskCenterHeaderPanel from '@/features/task-center/components/TaskCenterHeaderPanel.vue';
import TaskCenterOverviewPanel from '@/features/task-center/components/TaskCenterOverviewPanel.vue';
import TaskCenterRuntimePanels from '@/features/task-center/components/TaskCenterRuntimePanels.vue';
import TaskCenterTaskListPanel from '@/features/task-center/components/TaskCenterTaskListPanel.vue';
import { useTaskCenterEventFilterPresets } from '@/composables/useTaskCenterEventFilterPresets';
import { useTaskCenterQueryPresets } from '@/composables/useTaskCenterQueryPresets';
import { useTaskCenterRemoteExports } from '@/composables/useTaskCenterRemoteExports';
import { useTaskCenterCatalogOps } from '@/composables/useTaskCenterCatalogOps';
import { useTaskCenterDataAccess } from '@/composables/useTaskCenterDataAccess';
import { useTaskCenterDerivedState } from '@/composables/useTaskCenterDerivedState';
import { useTaskCenterRuntimeOps } from '@/composables/useTaskCenterRuntimeOps';
import { useTaskCenterScreenShell } from '@/composables/useTaskCenterScreenShell';
import { useTaskCenterTaskActions } from '@/composables/useTaskCenterTaskActions';
import { useTaskCenterUnifiedAlertOps } from '@/composables/useTaskCenterUnifiedAlertOps';
import { useTaskCenterEventPanel } from '@/composables/useTaskCenterEventPanel';
import { useTaskCenterQueryActions } from '@/composables/useTaskCenterQueryActions';
import { toSingleQuery } from '@/composables/useRouteRestoreContext';

const route = useRoute();
const router = useRouter();
const taskCenterQueryKeys = [
  'dramaId',
  'q',
  'providerTaskId',
  'status',
  'providerErrorCode',
  'createdFrom',
  'createdTo',
  'sortBy',
  'order',
  'page',
  'taskCatalogType',
  'unifiedAlertWindowMinutes',
  'unifiedIncidentStatus',
  'unifiedIncidentNotificationDeliveryStatus',
  'unifiedIncidentNotificationDeliveryMessage',
  'taskQuotaProjectId'
] as const;
const scopedDramaId = computed(() => {
  const query = toSingleQuery(route.query);
  const paramDramaId = typeof route.params.dramaId === 'string' ? route.params.dramaId.trim() : '';
  if (paramDramaId) {
    return paramDramaId;
  }
  return query.dramaId?.trim() || '';
});
const hasDramaPathScope = computed(() => typeof route.params.dramaId === 'string' && route.params.dramaId.trim().length > 0);
type TaskStatusFilter = '' | 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
type ProviderErrorCodeFilter =
  | ''
  | 'CAPABILITY_MISMATCH'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNKNOWN';
const tasks = ref<VideoTaskListItem[]>([]);
const keyword = ref('');
const status = ref<TaskStatusFilter>('');
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const providerErrorCode = ref<ProviderErrorCodeFilter>('');
const providerTaskIdKeyword = ref('');
const createdFromLocal = ref('');
const createdToLocal = ref('');
const sortBy = ref<'createdAt' | 'updatedAt' | 'priority' | 'status'>('createdAt');
const order = ref<'asc' | 'desc'>('desc');
const error = ref('');
const actionMessage = ref('');
const metrics = ref<VideoTaskMetrics>({
  total: 0,
  queued: 0,
  running: 0,
  done: 0,
  failed: 0,
  failureRate: 0,
  avgQueueWaitMs: 0,
  avgRunDurationMs: 0
});
const runtime = ref<VideoTaskRuntimeSnapshot>({
  heartbeatAt: '',
  isPumpRunning: false,
  maxConcurrent: 0,
  activeWorkerCount: 0,
  activeTaskIds: [],
  queueDriver: 'internal',
  queueBackend: 'lease',
  bullmqReady: false,
  bullmqWorkerEnabled: false,
  queueLoopEnabled: true,
  queueLeaseOwnerId: '',
  lockOwnerId: null,
  lockExpiresAt: null,
  lockHeartbeatAt: null,
  queuedProjects: 0,
  queuedTotal: 0,
  runningTotal: 0,
  pumpCycleCount: 0,
  pumpErrorCount: 0,
  lastPumpStartedAt: null,
  lastPumpFinishedAt: null,
  lastPumpDurationMs: null,
  lastPumpError: null,
  projects: []
});
const runtimeTrend = ref<VideoTaskRuntimeTrendPoint[]>([]);
const eventsOpen = ref(false);
const eventsLoading = ref(false);
const events = ref<VideoTaskEvent[]>([]);
const eventStatusFilter = ref('');
const eventFailedOnly = ref(false);
const eventKeyword = ref('');
const eventCreatedFromLocal = ref('');
const eventCreatedToLocal = ref('');
const eventExportCount = ref(0);
const eventExportCountLoading = ref(false);
const activeTaskId = ref('');
const activeDetail = ref<VideoTaskDetail | null>(null);
const mobileFilterOpen = ref(false);
const viewMode = ref<'card' | 'table'>('card');

const {
  exportTaskCatalog,
  filteredTaskCatalog,
  refreshTaskCatalog,
  taskCatalog,
  taskCatalogAlerts,
  taskCatalogContractCheck,
  taskCatalogDiffByType,
  taskCatalogDriftCount,
  taskCatalogLoading,
  taskCatalogTypeFilter
} = useTaskCenterCatalogOps({
  error,
  actionMessage
});

const {
  filteredNotificationDeliveryLogs,
  loadUnifiedAlertPolicy,
  mergedRuntimeAlerts,
  notificationDeliverySummary,
  notificationFailureReasonTop,
  notificationNextRetryList,
  processUnifiedIncidentNotifications,
  refreshUnifiedAlertsOnly,
  refreshUnifiedIncidentEscalationsOnly,
  refreshUnifiedIncidentsOnly,
  refreshUnifiedIncidentSlaOnly,
  saveUnifiedAlertPolicy,
  saveUnifiedIncidentEscalationConfig,
  saveUnifiedIncidentMeta,
  saveUnifiedIncidentNotificationConfig,
  saveUnifiedIncidentSlaConfig,
  taskUnifiedAlertActions,
  taskUnifiedAlertIncidents,
  taskUnifiedAlertPolicy,
  taskUnifiedAlertPolicyLoading,
  taskUnifiedAlerts,
  taskUnifiedIncidentEscalationConfig,
  taskUnifiedIncidentEscalationLogs,
  taskUnifiedIncidentNotificationConfig,
  taskUnifiedIncidentNotificationDeliveryLogs,
  taskUnifiedIncidentSlaConfig,
  taskUnifiedIncidentSlaSummary,
  triggerUnifiedIncidentEscalations,
  unifiedAlertWindowMinutes,
  unifiedIncidentActionLoading,
  unifiedIncidentDraft,
  unifiedIncidentEscalationActor,
  unifiedIncidentEscalationLoading,
  unifiedIncidentNotificationDeliveryMessageKeyword,
  unifiedIncidentNotificationDeliveryStatusFilter,
  unifiedIncidentSlaLoading,
  unifiedIncidentStatusFilter,
  updateEscalationNotificationStatus,
  updateUnifiedIncidentStatus
} = useTaskCenterUnifiedAlertOps({
  error,
  actionMessage
});

const {
  acknowledgeLatestQueueAlert,
  acknowledgeMergedAlert,
  addTaskQuotaOverrideRow,
  addTaskQuotaProjectTierRow,
  failureInjectionConfig,
  failureInjectionLoading,
  failureInjectionReport,
  fiErrorCodeFilter,
  fiTaskTypeFilter,
  loadFailureInjectionConfig,
  loadFailureInjectionReport,
  loadQueueAlertConfig,
  loadTaskQuotaConfig,
  loadTaskQuotaRejectEvents,
  loadTaskQuotaUsageEvents,
  loadTaskSloConfig,
  loadTaskSloState,
  queueAlertActionLoading,
  queueAlertSaving,
  queueAlertState,
  queueThresholdCritical,
  queueThresholdWarn,
  quotaPanelRestoredHint,
  refreshTaskQuotaUsage,
  removeTaskQuotaOverrideRow,
  removeTaskQuotaProjectTierRow,
  resetFailureInjectionReport,
  saveFailureInjectionConfig,
  saveQueueAlertConfig,
  saveTaskQuotaConfigAction,
  saveTaskSloConfigAction,
  taskQuotaConfig,
  taskQuotaDiffEntries,
  taskQuotaLoading,
  taskQuotaOverrideRows,
  taskQuotaPreviewProjectId,
  taskQuotaPreviewResult,
  taskQuotaProjectTierRows,
  taskQuotaRejectEvents,
  taskQuotaTierLimitsForm,
  taskQuotaUsage,
  taskQuotaUsageEvents,
  taskQuotaUsageProjectId,
  taskSloConfig,
  taskSloLabel,
  taskSloLoading,
  taskSloState
} = useTaskCenterRuntimeOps({
  error,
  actionMessage
});

const {
  exportFailureInjectionEvents,
  exportFilteredEventsCsv,
  exportFilteredEventsJson,
  exportQueueAlertsCsv,
  exportQueueAlertsJson,
  exportTaskCatalogAlerts,
  exportTaskQuotaRejectEvents,
  exportTaskQuotaUsageEvents,
  exportUnifiedAlertActions,
  exportUnifiedAlertIncidents,
  exportUnifiedAlerts,
  exportUnifiedIncidentEscalations,
  exportUnifiedIncidentNotificationDeliveryLogs,
  refreshEventExportCount
} = useTaskCenterRemoteExports({
  error,
  actionMessage,
  taskQuotaLoading,
  taskCatalogLoading,
  taskUnifiedAlertPolicyLoading,
  queueAlertActionLoading,
  failureInjectionLoading,
  unifiedIncidentEscalationLoading,
  unifiedIncidentActionLoading,
  taskQuotaUsageProjectId,
  unifiedAlertWindowMinutes,
  unifiedIncidentStatusFilter,
  unifiedIncidentNotificationDeliveryStatusFilter,
  fiTaskTypeFilter,
  fiErrorCodeFilter,
  activeTaskId,
  eventStatusFilter,
  eventKeyword,
  eventCreatedFromLocal,
  eventCreatedToLocal,
  eventExportCount,
  eventExportCountLoading
});

const {
  applySelectedEventFilterPreset,
  cancelApplyEventFilterPreset,
  cancelImportEventFilterPresets,
  confirmApplyEventFilterPreset,
  confirmImportEventFilterPresets,
  copySelectedEventFilterPresetReadableText,
  copySelectedEventFilterPresetShareText,
  deleteSelectedEventFilterPreset,
  eventFilterPresets,
  eventPresetApplyConfirmOpen,
  eventPresetFileInputRef,
  eventPresetImportConfirmOpen,
  eventPresetName,
  eventPresetShareText,
  exportEventFilterPresetsJson,
  formatEventFilterPresetOption,
  importEventFilterPresetFromShareText,
  loadStoredEventFilterPresetPreferences,
  onImportEventFilterPresetsFileChange,
  pendingEventPresetChangedFields,
  pendingEventPresetName,
  pendingImportConflictNames,
  pendingImportEventFilterPresets,
  pendingImportSource,
  renameSelectedEventFilterPreset,
  restoreEventPresetApplyConfirm,
  saveEventFilterPreset,
  selectedEventFilterPreset,
  selectedEventFilterPresetDiff,
  selectedEventPresetName,
  skipEventPresetApplyConfirmInSession,
  toggleFavoriteSelectedEventFilterPreset,
  triggerImportEventFilterPresets
} = useTaskCenterEventFilterPresets({
  error,
  actionMessage,
  eventStatusFilter,
  eventFailedOnly,
  eventKeyword,
  eventCreatedFromLocal,
  eventCreatedToLocal
});

type TableColumnKey = 'scope' | 'status' | 'progress' | 'priority' | 'providerTaskId' | 'providerErrorCode' | 'updatedAt';
type TableSortKey = 'status' | 'progress' | 'updatedAt';

const tableColumnVisible = ref<Record<TableColumnKey, boolean>>({
  scope: true,
  status: true,
  progress: true,
  priority: true,
  providerTaskId: true,
  providerErrorCode: true,
  updatedAt: true
});
const tableSortKey = ref<TableSortKey>('updatedAt');
const tableSortOrder = ref<'asc' | 'desc'>('desc');

const setViewMode = (mode: 'card' | 'table'): void => {
  viewMode.value = mode;
};

const toggleMobileFilters = (): void => {
  mobileFilterOpen.value = !mobileFilterOpen.value;
};

const toggleTableColumn = (key: TableColumnKey): void => {
  tableColumnVisible.value[key] = !tableColumnVisible.value[key];
};

const {
  congestionLabel,
  congestionLevel,
  displayTasks,
  filteredEvents,
  filteredTasks,
  runtimeTrendPoints,
  totalPages,
  visibleTableColumnCount
} = useTaskCenterDerivedState({
  tasks,
  total,
  pageSize,
  providerErrorCode,
  providerTaskIdKeyword,
  events,
  eventStatusFilter,
  eventKeyword,
  eventCreatedFromLocal,
  eventCreatedToLocal,
  tableColumnVisible,
  tableSortKey,
  tableSortOrder,
  runtime,
  queueThresholdCritical,
  queueThresholdWarn,
  runtimeTrend
});
const {
  activeFilterChips,
  syncQueryToUrl,
  copyCurrentQueryLink,
  removeFilterChip,
  search,
  clearFilters,
  focusFailedTasks,
  applyMetricStatusFilter,
  prevPage,
  nextPage,
  goHome
} = useTaskCenterQueryActions({
  route,
  router,
  taskCenterQueryKeys,
  scopedDramaId,
  hasDramaPathScope,
  keyword,
  providerTaskIdKeyword,
  status,
  providerErrorCode,
  createdFromLocal,
  createdToLocal,
  sortBy,
  order,
  page,
  totalPages,
  taskCatalogTypeFilter,
  unifiedAlertWindowMinutes,
  unifiedIncidentStatusFilter,
  unifiedIncidentNotificationDeliveryStatusFilter,
  unifiedIncidentNotificationDeliveryMessageKeyword,
  actionMessage,
  error,
  loadTasks: async () => loadTasks()
});
const {
  lastRepairLogShortcut,
  retry,
  cancel,
  cancelActiveOnPage,
  cancelActiveOnFilteredPage,
  retryFailedOnPage,
  retryFailedOnFilteredPage,
  repairFailedOnFilteredPageByPolicy,
  repairByPolicyWithServerQuery,
  openLastRepairLogShortcut,
  copyLastRepairLogShortcut,
  openAutoRepairLogsInSettings,
  openAutoRepairLogsForTask,
  copyAutoRepairLogLinkForTask,
  goTimelineByQuotaUsageEvent,
  copyReconcileIds,
  copyTaskId
} = useTaskCenterTaskActions({
  router,
  scopedDramaId,
  tasks,
  filteredTasks,
  keyword,
  status,
  providerErrorCode,
  providerTaskIdKeyword,
  createdFromLocal,
  createdToLocal,
  sortBy,
  order,
  error,
  actionMessage,
  loadTasks: async () => loadTasks()
});
const {
  copyFilteredEventsText,
  toggleEventFailedOnly,
  resetEventFilters,
  viewEvents,
  closeEvents
} = useTaskCenterEventPanel({
  filteredEvents,
  eventsOpen,
  eventsLoading,
  events,
  eventStatusFilter,
  eventFailedOnly,
  eventKeyword,
  eventCreatedFromLocal,
  eventCreatedToLocal,
  eventExportCount,
  activeTaskId,
  activeDetail,
  error,
  actionMessage,
  eventFiltersStorageKey: 'human2_task_center_event_filters_v1',
  refreshEventExportCount: async () => refreshEventExportCount()
});

const {
  applySelectedPreset,
  deleteSelectedPreset,
  formatPresetOption,
  initializeTaskCenterPresets,
  makeSelectedPresetDefault,
  presetName,
  presets,
  saveCurrentPreset,
  selectedPresetName
} = useTaskCenterQueryPresets({
  error,
  actionMessage,
  keyword,
  providerTaskIdKeyword,
  status,
  providerErrorCode,
  createdFromLocal,
  createdToLocal,
  sortBy,
  order,
  page,
  loadTasks: async () => loadTasks()
});

const { loadTasks, loadRuntimeOnly, formatPercent, formatMs, exportTaskQuotaDiffCsv } = useTaskCenterDataAccess({
  pageSize,
  tasks,
  total,
  metrics,
  runtime,
  runtimeTrend,
  queueAlertState,
  failureInjectionReport,
  keyword,
  providerTaskIdKeyword,
  providerErrorCode,
  createdFromLocal,
  createdToLocal,
  sortBy,
  order,
  status,
  page,
  taskQuotaUsageProjectId,
  taskQuotaDiffEntries,
  error,
  actionMessage,
  refreshTaskCatalog,
  refreshUnifiedAlertsOnly,
  loadTaskSloState,
  refreshTaskQuotaUsage,
  loadTaskQuotaUsageEvents,
  loadTaskQuotaRejectEvents
});

const toggleTableSort = (key: TableSortKey): void => {
  if (tableSortKey.value === key) {
    tableSortOrder.value = tableSortOrder.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  tableSortKey.value = key;
  tableSortOrder.value = 'desc';
};

const logout = async (): Promise<void> => {
  clearToken();
  await router.push('/login');
};

useTaskCenterScreenShell({
  route,
  keyword,
  providerTaskIdKeyword,
  status,
  providerErrorCode,
  createdFromLocal,
  createdToLocal,
  sortBy,
  order,
  page,
  viewMode,
  tableColumnVisible,
  tableSortKey,
  tableSortOrder,
  eventStatusFilter,
  eventFailedOnly,
  eventKeyword,
  eventCreatedFromLocal,
  eventCreatedToLocal,
  eventsOpen,
  activeTaskId,
  taskCatalogTypeFilter,
  unifiedAlertWindowMinutes,
  unifiedIncidentStatusFilter,
  unifiedIncidentNotificationDeliveryStatusFilter,
  unifiedIncidentNotificationDeliveryMessageKeyword,
  taskQuotaUsageProjectId,
  quotaPanelRestoredHint,
  taskCenterQueryKeys,
  totalPages,
  syncQueryToUrl,
  refreshUnifiedIncidentsOnly,
  refreshEventExportCount,
  initializeTaskCenterPresets,
  loadStoredEventFilterPresetPreferences,
  loadQueueAlertConfig,
  loadUnifiedAlertPolicy,
  loadTaskSloConfig,
  loadTaskQuotaConfig,
  loadFailureInjectionConfig,
  loadTasks,
  loadRuntimeOnly
});
</script>

<style scoped>
.task-center-shell {
  --rail-width: 320px;
  --inspector-width: 420px;
}

.result-panel {
  border: 1px solid #dbe3f1;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}

.runtime-panel {
  background: linear-gradient(180deg, #f9fcff 0%, #ffffff 38%);
}

.compact-panel {
  padding-bottom: 10px;
}
</style>
