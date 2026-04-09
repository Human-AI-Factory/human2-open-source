<template>
  <div>
    <div v-if="eventsOpen" class="modal-mask" @click.self="closeEvents()">
      <div class="modal-card">
        <div class="inline-between">
          <h3>任务日志 · {{ activeTaskId }}</h3>
          <button @click="closeEvents()">关闭</button>
        </div>
        <div v-if="activeDetail" class="panel" style="margin-top: 8px">
          <p class="muted">项目：{{ activeDetail.project?.name || '-' }}</p>
          <p class="muted">分镜：{{ activeDetail.storyboard?.title || '-' }}</p>
          <p class="muted" v-if="activeDetail.task.providerTaskId">厂商任务ID：{{ activeDetail.task.providerTaskId }}</p>
          <p class="muted">尝试次数：{{ activeDetail.task.attempt }}</p>
          <p class="muted" v-if="activeDetail.task.nextRetryAt">下次重试：{{ new Date(activeDetail.task.nextRetryAt).toLocaleString() }}</p>
          <p class="muted" v-if="activeDetail.task.providerErrorCode">错误码：{{ activeDetail.task.providerErrorCode }}</p>
          <p class="error" v-if="activeDetail.task.error">{{ activeDetail.task.error }}</p>
        </div>
        <div class="actions" style="margin-top: 8px">
          <select v-model="eventStatusFilterModel">
            <option value="">全部状态</option>
            <option value="queued">queued</option>
            <option value="submitting">submitting</option>
            <option value="polling">polling</option>
            <option value="running">running</option>
            <option value="done">done</option>
            <option value="failed">failed</option>
            <option value="cancelled">cancelled</option>
          </select>
          <label class="muted">
            <input v-model="eventFailedOnlyModel" type="checkbox" @change="toggleEventFailedOnly()" /> 仅失败日志
          </label>
          <input v-model="eventKeywordModel" placeholder="搜索错误关键词" />
          <input v-model="eventCreatedFromLocalModel" type="datetime-local" />
          <input v-model="eventCreatedToLocalModel" type="datetime-local" />
          <button @click="resetEventFilters()">重置日志筛选</button>
          <p class="muted">显示 {{ filteredEvents.length }} / {{ events.length }} 条</p>
          <p class="muted">导出预估：{{ eventExportCountLoading ? '计算中...' : eventExportCount }} 条</p>
        </div>
        <div class="actions" style="margin-top: 8px">
          <input v-model="eventPresetNameModel" placeholder="日志预设名" />
          <button @click="saveEventFilterPreset()">保存日志预设</button>
          <select v-model="selectedEventPresetNameModel">
            <option value="">选择日志预设</option>
            <option v-for="item in eventFilterPresets" :key="item.name" :value="item.name">{{ formatEventFilterPresetOption(item.name) }}</option>
          </select>
          <button :disabled="!selectedEventPresetName" @click="applySelectedEventFilterPreset()">加载日志预设</button>
          <button :disabled="!selectedEventPresetName" @click="renameSelectedEventFilterPreset()">重命名</button>
          <button :disabled="!selectedEventPresetName" @click="toggleFavoriteSelectedEventFilterPreset()">收藏/取消收藏</button>
          <button :disabled="!selectedEventPresetName" @click="deleteSelectedEventFilterPreset()">删除日志预设</button>
          <button @click="exportEventFilterPresetsJson()">导出预设JSON</button>
          <button @click="triggerImportEventFilterPresets()">导入预设JSON</button>
          <button :disabled="!selectedEventPresetName" @click="copySelectedEventFilterPresetShareText()">复制机器版分享文本</button>
          <button :disabled="!selectedEventPresetName" @click="copySelectedEventFilterPresetReadableText()">复制可读版分享文本</button>
        </div>
        <div v-if="selectedEventFilterPreset" class="panel" style="margin-top: 8px">
          <p class="muted">预设详情：{{ selectedEventFilterPreset.name }}{{ selectedEventFilterPreset.favorite ? ' ★' : '' }}</p>
          <p class="muted">
            状态：{{ selectedEventFilterPreset.status || '全部' }}
            <span v-if="selectedEventFilterPresetDiff.status" class="diff-badge">将覆盖当前</span>
          </p>
          <p class="muted">
            仅失败：{{ selectedEventFilterPreset.failedOnly ? '是' : '否' }}
            <span v-if="selectedEventFilterPresetDiff.failedOnly" class="diff-badge">将覆盖当前</span>
          </p>
          <p class="muted">
            关键词：{{ selectedEventFilterPreset.keyword || '(空)' }}
            <span v-if="selectedEventFilterPresetDiff.keyword" class="diff-badge">将覆盖当前</span>
          </p>
          <p class="muted">
            起始时间：{{ selectedEventFilterPreset.createdFrom || '(空)' }}
            <span v-if="selectedEventFilterPresetDiff.createdFrom" class="diff-badge">将覆盖当前</span>
          </p>
          <p class="muted">
            截止时间：{{ selectedEventFilterPreset.createdTo || '(空)' }}
            <span v-if="selectedEventFilterPresetDiff.createdTo" class="diff-badge">将覆盖当前</span>
          </p>
        </div>
        <div class="actions" style="margin-top: 8px">
          <input v-model="eventPresetShareTextModel" placeholder="粘贴 TF_EVENT_PRESET:... 或整段可读版分享文本" />
          <button @click="importEventFilterPresetFromShareText()">导入分享文本</button>
          <button v-if="skipEventPresetApplyConfirmInSession" @click="restoreEventPresetApplyConfirm()">恢复加载确认提示</button>
        </div>
        <div class="actions" style="margin-top: 8px">
          <button @click="exportFilteredEventsJson()">导出 JSON</button>
          <button @click="exportFilteredEventsCsv()">导出 CSV</button>
          <button @click="copyFilteredEventsText()">复制日志文本</button>
        </div>
        <p v-if="eventsLoading" class="muted">加载中...</p>
        <p v-else-if="filteredEvents.length === 0" class="muted">暂无日志</p>
        <div v-else class="timeline">
          <article class="timeline-item" v-for="event in filteredEvents" :key="event.id">
            <p class="muted">{{ new Date(event.createdAt).toLocaleString() }}</p>
            <p class="muted">状态：{{ event.status }}，进度：{{ event.progress }}%</p>
            <p v-if="event.error" class="error">{{ event.error }}</p>
          </article>
        </div>
      </div>
    </div>

    <div v-if="eventPresetApplyConfirmOpen" class="modal-mask" @click.self="cancelApplyEventFilterPreset()">
      <div class="modal-card">
        <h3>确认加载日志预设</h3>
        <p class="muted">将加载预设：{{ pendingEventPresetName || '-' }}</p>
        <p class="muted">以下字段会覆盖当前筛选：</p>
        <div class="chip-row" v-if="pendingEventPresetChangedFields.length > 0">
          <span class="chip" v-for="item in pendingEventPresetChangedFields" :key="item">{{ item }}</span>
        </div>
        <label class="muted" style="display: inline-flex; gap: 6px; margin-top: 10px; align-items: center">
          <input v-model="skipEventPresetApplyConfirmInSessionModel" type="checkbox" />
          不再提示（记住此偏好）
        </label>
        <div class="actions" style="margin-top: 12px">
          <button @click="cancelApplyEventFilterPreset()">取消</button>
          <button class="primary" @click="confirmApplyEventFilterPreset()">确认加载</button>
        </div>
      </div>
    </div>

    <div v-if="eventPresetImportConfirmOpen" class="modal-mask" @click.self="cancelImportEventFilterPresets()">
      <div class="modal-card">
        <h3>确认导入日志预设</h3>
        <p class="muted">
          导入来源：{{ pendingImportSource === 'share' ? '分享文本' : 'JSON 文件' }}，
          预设数：{{ pendingImportEventFilterPresets.length }}
        </p>
        <p class="muted">检测到同名预设，将被覆盖：</p>
        <div class="chip-row" v-if="pendingImportConflictNames.length > 0">
          <span class="chip" v-for="name in pendingImportConflictNames" :key="name">{{ name }}</span>
        </div>
        <div class="actions" style="margin-top: 12px">
          <button @click="cancelImportEventFilterPresets()">取消</button>
          <button class="primary" @click="confirmImportEventFilterPresets()">确认覆盖并导入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { EventFilterPreset } from '@/composables/useTaskCenterEventFilterPresets';
import type { VideoTaskDetail, VideoTaskEvent } from '@/types/models';

type EventFilterPresetDiff = {
  status: boolean;
  failedOnly: boolean;
  keyword: boolean;
  createdFrom: boolean;
  createdTo: boolean;
};

const props = defineProps<{
  eventsOpen: boolean;
  activeTaskId: string;
  activeDetail: VideoTaskDetail | null;
  eventsLoading: boolean;
  filteredEvents: VideoTaskEvent[];
  events: VideoTaskEvent[];
  eventStatusFilter: string;
  eventFailedOnly: boolean;
  eventKeyword: string;
  eventCreatedFromLocal: string;
  eventCreatedToLocal: string;
  eventExportCount: number;
  eventExportCountLoading: boolean;
  eventPresetName: string;
  selectedEventPresetName: string;
  eventFilterPresets: EventFilterPreset[];
  selectedEventFilterPreset: EventFilterPreset | null;
  selectedEventFilterPresetDiff: EventFilterPresetDiff;
  eventPresetShareText: string;
  skipEventPresetApplyConfirmInSession: boolean;
  eventPresetApplyConfirmOpen: boolean;
  pendingEventPresetName: string;
  pendingEventPresetChangedFields: string[];
  eventPresetImportConfirmOpen: boolean;
  pendingImportEventFilterPresets: EventFilterPreset[];
  pendingImportConflictNames: string[];
  pendingImportSource: 'share' | 'json';
  formatEventFilterPresetOption: (name: string) => string;
  toggleEventFailedOnly: () => void | Promise<void>;
  resetEventFilters: () => void | Promise<void>;
  saveEventFilterPreset: () => void | Promise<void>;
  applySelectedEventFilterPreset: () => void | Promise<void>;
  renameSelectedEventFilterPreset: () => void | Promise<void>;
  toggleFavoriteSelectedEventFilterPreset: () => void | Promise<void>;
  deleteSelectedEventFilterPreset: () => void | Promise<void>;
  exportEventFilterPresetsJson: () => void | Promise<void>;
  triggerImportEventFilterPresets: () => void | Promise<void>;
  copySelectedEventFilterPresetShareText: () => void | Promise<void>;
  copySelectedEventFilterPresetReadableText: () => void | Promise<void>;
  importEventFilterPresetFromShareText: () => void | Promise<void>;
  restoreEventPresetApplyConfirm: () => void | Promise<void>;
  exportFilteredEventsJson: () => void | Promise<void>;
  exportFilteredEventsCsv: () => void | Promise<void>;
  copyFilteredEventsText: () => void | Promise<void>;
  closeEvents: () => void | Promise<void>;
  cancelApplyEventFilterPreset: () => void | Promise<void>;
  confirmApplyEventFilterPreset: () => void | Promise<void>;
  cancelImportEventFilterPresets: () => void | Promise<void>;
  confirmImportEventFilterPresets: () => void | Promise<void>;
}>();

const emit = defineEmits<{
  (e: 'update:eventStatusFilter', value: string): void;
  (e: 'update:eventFailedOnly', value: boolean): void;
  (e: 'update:eventKeyword', value: string): void;
  (e: 'update:eventCreatedFromLocal', value: string): void;
  (e: 'update:eventCreatedToLocal', value: string): void;
  (e: 'update:eventPresetName', value: string): void;
  (e: 'update:selectedEventPresetName', value: string): void;
  (e: 'update:eventPresetShareText', value: string): void;
  (e: 'update:skipEventPresetApplyConfirmInSession', value: boolean): void;
}>();

const eventStatusFilterModel = computed({
  get: () => props.eventStatusFilter,
  set: (value: string) => emit('update:eventStatusFilter', value)
});

const eventFailedOnlyModel = computed({
  get: () => props.eventFailedOnly,
  set: (value: boolean) => emit('update:eventFailedOnly', value)
});

const eventKeywordModel = computed({
  get: () => props.eventKeyword,
  set: (value: string) => emit('update:eventKeyword', value)
});

const eventCreatedFromLocalModel = computed({
  get: () => props.eventCreatedFromLocal,
  set: (value: string) => emit('update:eventCreatedFromLocal', value)
});

const eventCreatedToLocalModel = computed({
  get: () => props.eventCreatedToLocal,
  set: (value: string) => emit('update:eventCreatedToLocal', value)
});

const eventPresetNameModel = computed({
  get: () => props.eventPresetName,
  set: (value: string) => emit('update:eventPresetName', value)
});

const selectedEventPresetNameModel = computed({
  get: () => props.selectedEventPresetName,
  set: (value: string) => emit('update:selectedEventPresetName', value)
});

const eventPresetShareTextModel = computed({
  get: () => props.eventPresetShareText,
  set: (value: string) => emit('update:eventPresetShareText', value)
});

const skipEventPresetApplyConfirmInSessionModel = computed({
  get: () => props.skipEventPresetApplyConfirmInSession,
  set: (value: boolean) => emit('update:skipEventPresetApplyConfirmInSession', value)
});
</script>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: var(--surface-backdrop-mid);
  display: grid;
  place-items: center;
  z-index: 30;
}

.modal-card {
  width: min(760px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow: auto;
  border-radius: var(--radius-lg);
  background: var(--surface-canvas);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-float-strong);
  padding: 14px;
}

.timeline {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}

.timeline-item {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 10px;
  background: var(--card-soft);
}

.diff-badge {
  margin-left: 6px;
  font-size: 11px;
  color: var(--status-warning-ink);
  background: var(--status-warning-bg);
  border: 1px solid var(--status-warning-border);
  border-radius: var(--radius-pill);
  padding: 0 6px;
}
</style>
