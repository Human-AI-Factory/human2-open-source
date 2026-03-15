<template>
  <section class="panel" id="auto-repair-logs">
    <div class="inline-between">
      <h3>自动修复执行日志</h3>
      <div class="actions">
        <select v-model="autoRepairLogOutcomeModel">
          <option value="">全部结果</option>
          <option value="success">success</option>
          <option value="failed">failed</option>
        </select>
        <select v-model="autoRepairLogActionModel">
          <option value="">全部动作</option>
          <option value="retry">retry</option>
          <option value="recreate_conservative">recreate_conservative</option>
          <option value="manual">manual</option>
        </select>
        <input v-model="autoRepairLogProjectIdModel" placeholder="projectId（精确）" />
        <input v-model="autoRepairLogTaskIdModel" placeholder="taskId（精确）" />
        <input v-model="autoRepairLogErrorCodeModel" placeholder="errorCode（精确）" />
        <input v-model="autoRepairLogKeywordModel" placeholder="关键词（detail）" />
        <select v-model.number="autoRepairLogLimitModel">
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
          <option :value="200">200</option>
        </select>
        <button @click="emit('load-auto-repair-logs')">刷新日志</button>
        <button @click="emit('export-auto-repair-logs-as-json')">导出JSON</button>
        <button :disabled="opsLoading" @click="emit('clear-auto-repair-log-history')">
          {{ opsLoading ? '处理中...' : '清空日志' }}
        </button>
      </div>
    </div>
    <p class="muted">当前查询返回 {{ autoRepairLogs.length }} 条</p>
    <div class="ops-grid" v-if="autoRepairLogStats">
      <article class="card">
        <h4>执行统计</h4>
        <p class="muted">缓存：{{ autoRepairLogStats.count }} / {{ autoRepairLogStats.max }}</p>
        <p class="muted">成功：{{ autoRepairLogStats.success }} / 失败：{{ autoRepairLogStats.failed }}</p>
      </article>
      <article class="card">
        <h4>按动作</h4>
        <p class="muted" v-for="item in autoRepairLogStats.byAction" :key="`auto-action-${item.action}`">
          {{ item.action }}：{{ item.count }}（失败 {{ item.failed }}）
        </p>
      </article>
      <article class="card">
        <h4>按错误码</h4>
        <p class="muted" v-for="item in autoRepairLogStats.byErrorCode.slice(0, 5)" :key="`auto-err-${item.errorCode}`">
          {{ item.errorCode }}：{{ item.count }}（失败 {{ item.failed }}）
        </p>
      </article>
    </div>
    <div class="list" v-if="autoRepairLogs.length > 0">
      <article class="card" v-for="item in autoRepairLogs" :key="item.id">
        <div>
          <h3>{{ item.errorCode }} / {{ item.action }} / {{ item.success ? 'success' : 'failed' }}</h3>
          <p class="muted">{{ new Date(item.timestamp).toLocaleString() }}</p>
          <p class="muted">project: {{ item.projectId }} / storyboard: {{ item.storyboardId }}</p>
          <p class="muted">task: {{ item.taskId }}<span v-if="item.resultTaskId"> / resultTask: {{ item.resultTaskId }}</span></p>
          <p class="muted" v-if="item.detail">detail: {{ item.detail }}</p>
        </div>
        <div class="actions">
          <button @click="emit('copy-auto-repair-log-context', item)">复制上下文</button>
          <button @click="emit('go-task-center-for-task', item.taskId, item.errorCode)">定位原任务</button>
          <button @click="emit('copy-task-center-troubleshoot-link', item.taskId, item.errorCode)">复制原任务排障链接</button>
          <button v-if="item.resultTaskId" @click="emit('go-task-center-for-task', item.resultTaskId, item.errorCode)">定位结果任务</button>
          <button v-if="item.resultTaskId" @click="emit('copy-task-center-troubleshoot-link', item.resultTaskId, item.errorCode)">
            复制结果任务排障链接
          </button>
          <button @click="emit('copy-auto-repair-troubleshoot-link', item)">复制修复日志链接</button>
        </div>
      </article>
    </div>
    <p v-else class="muted">暂无自动修复日志</p>
  </section>

  <section class="panel">
    <div class="inline-between">
      <h3>Provider 调用日志</h3>
      <div class="actions">
        <select v-model="providerLogOutcomeModel">
          <option value="">全部结果</option>
          <option value="success">success</option>
          <option value="failed">failed</option>
        </select>
        <select v-model="providerLogTaskTypeModel">
          <option value="">全部任务类型</option>
          <option value="text">text</option>
          <option value="image">image</option>
          <option value="video">video</option>
          <option value="audio">audio</option>
        </select>
        <input v-model="providerLogProviderModel" placeholder="provider（精确，如 vidu）" />
        <input v-model="providerLogKeywordModel" placeholder="关键词（endpoint/message）" />
        <select v-model.number="providerLogLimitModel">
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
          <option :value="200">200</option>
        </select>
        <button @click="emit('load-provider-logs')">刷新日志</button>
        <button @click="emit('export-provider-logs-as-json')">导出JSON</button>
      </div>
    </div>
    <p class="muted">当前查询返回 {{ filteredProviderLogs.length }} 条</p>
    <div class="ops-grid" v-if="providerLogStats">
      <article class="card">
        <h4>按 Provider</h4>
        <p class="muted" v-for="item in providerLogStats.byProvider.slice(0, 5)" :key="`provider-${item.provider}`">
          {{ item.provider }}：{{ item.count }}（失败 {{ item.failed }}）
        </p>
      </article>
      <article class="card">
        <h4>按任务类型</h4>
        <p class="muted" v-for="item in providerLogStats.byTaskType" :key="`task-${item.taskType}`">
          {{ item.taskType }}：{{ item.count }}（失败 {{ item.failed }}）
        </p>
      </article>
    </div>
    <div class="list" v-if="filteredProviderLogs.length > 0">
      <article class="card" v-for="item in filteredProviderLogs" :key="item.id">
        <div>
          <h3>{{ item.provider }} / {{ item.taskType }} / {{ item.success ? 'success' : 'failed' }}</h3>
          <p class="muted">{{ new Date(item.timestamp).toLocaleString() }}</p>
          <p class="muted">endpoint: {{ item.endpoint }}</p>
          <p class="muted">耗时: {{ item.durationMs }}ms<span v-if="item.statusCode"> / status: {{ item.statusCode }}</span></p>
          <p class="error" v-if="item.message">{{ item.message }}</p>
        </div>
        <div class="actions">
          <button @click="emit('copy-provider-log-context', item)">复制上下文</button>
        </div>
      </article>
    </div>
    <p v-else class="muted">暂无匹配的 provider 调用日志</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  AutoRepairLogEntry,
  AutoRepairLogStats,
  ProviderLogBreakdown,
  ProviderLogEntry
} from '@/types/models';

const props = defineProps<{
  autoRepairLogs: AutoRepairLogEntry[];
  autoRepairLogStats: AutoRepairLogStats | null;
  autoRepairLogOutcome: '' | 'success' | 'failed';
  autoRepairLogAction: '' | 'retry' | 'recreate_conservative' | 'manual';
  autoRepairLogProjectId: string;
  autoRepairLogTaskId: string;
  autoRepairLogErrorCode: string;
  autoRepairLogKeyword: string;
  autoRepairLogLimit: number;
  filteredProviderLogs: ProviderLogEntry[];
  opsLoading: boolean;
  providerLogStats: ProviderLogBreakdown | null;
  providerLogOutcome: '' | 'success' | 'failed';
  providerLogTaskType: '' | 'text' | 'image' | 'video' | 'audio';
  providerLogProvider: string;
  providerLogKeyword: string;
  providerLogLimit: number;
}>();

const emit = defineEmits<{
  (e: 'clear-auto-repair-log-history'): void;
  (e: 'copy-auto-repair-log-context', item: AutoRepairLogEntry): void;
  (e: 'copy-auto-repair-troubleshoot-link', item: AutoRepairLogEntry): void;
  (e: 'copy-provider-log-context', item: ProviderLogEntry): void;
  (e: 'copy-task-center-troubleshoot-link', taskId: string, errorCode?: string): void;
  (e: 'export-auto-repair-logs-as-json'): void;
  (e: 'export-provider-logs-as-json'): void;
  (e: 'go-task-center-for-task', taskId: string, errorCode?: string): void;
  (e: 'load-auto-repair-logs'): void;
  (e: 'load-provider-logs'): void;
  (e: 'update:autoRepairLogAction', value: '' | 'retry' | 'recreate_conservative' | 'manual'): void;
  (e: 'update:autoRepairLogErrorCode', value: string): void;
  (e: 'update:autoRepairLogKeyword', value: string): void;
  (e: 'update:autoRepairLogLimit', value: number): void;
  (e: 'update:autoRepairLogOutcome', value: '' | 'success' | 'failed'): void;
  (e: 'update:autoRepairLogProjectId', value: string): void;
  (e: 'update:autoRepairLogTaskId', value: string): void;
  (e: 'update:providerLogKeyword', value: string): void;
  (e: 'update:providerLogLimit', value: number): void;
  (e: 'update:providerLogOutcome', value: '' | 'success' | 'failed'): void;
  (e: 'update:providerLogProvider', value: string): void;
  (e: 'update:providerLogTaskType', value: '' | 'text' | 'image' | 'video' | 'audio'): void;
}>();

const autoRepairLogOutcomeModel = computed({
  get: () => props.autoRepairLogOutcome,
  set: (value: '' | 'success' | 'failed') => emit('update:autoRepairLogOutcome', value)
});
const autoRepairLogActionModel = computed({
  get: () => props.autoRepairLogAction,
  set: (value: '' | 'retry' | 'recreate_conservative' | 'manual') => emit('update:autoRepairLogAction', value)
});
const autoRepairLogProjectIdModel = computed({
  get: () => props.autoRepairLogProjectId,
  set: (value: string) => emit('update:autoRepairLogProjectId', value)
});
const autoRepairLogTaskIdModel = computed({
  get: () => props.autoRepairLogTaskId,
  set: (value: string) => emit('update:autoRepairLogTaskId', value)
});
const autoRepairLogErrorCodeModel = computed({
  get: () => props.autoRepairLogErrorCode,
  set: (value: string) => emit('update:autoRepairLogErrorCode', value)
});
const autoRepairLogKeywordModel = computed({
  get: () => props.autoRepairLogKeyword,
  set: (value: string) => emit('update:autoRepairLogKeyword', value)
});
const autoRepairLogLimitModel = computed({
  get: () => props.autoRepairLogLimit,
  set: (value: number) => emit('update:autoRepairLogLimit', Number(value))
});
const providerLogOutcomeModel = computed({
  get: () => props.providerLogOutcome,
  set: (value: '' | 'success' | 'failed') => emit('update:providerLogOutcome', value)
});
const providerLogTaskTypeModel = computed({
  get: () => props.providerLogTaskType,
  set: (value: '' | 'text' | 'image' | 'video' | 'audio') => emit('update:providerLogTaskType', value)
});
const providerLogProviderModel = computed({
  get: () => props.providerLogProvider,
  set: (value: string) => emit('update:providerLogProvider', value)
});
const providerLogKeywordModel = computed({
  get: () => props.providerLogKeyword,
  set: (value: string) => emit('update:providerLogKeyword', value)
});
const providerLogLimitModel = computed({
  get: () => props.providerLogLimit,
  set: (value: number) => emit('update:providerLogLimit', Number(value))
});
</script>
