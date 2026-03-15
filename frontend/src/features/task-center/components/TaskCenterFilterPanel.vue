<template>
  <aside class="filter-panel" :class="{ open: mobileFilterOpen }">
    <h3>筛选与预设</h3>
    <div class="filter-grid">
      <label class="control">
        <span>关键词</span>
        <input v-model="keywordModel" placeholder="项目名 / 分镜 / 提示词" />
      </label>
      <label class="control">
        <span>厂商任务ID</span>
        <input v-model="providerTaskIdKeywordModel" placeholder="如 abc123" />
      </label>
      <label class="control">
        <span>任务状态</span>
        <select v-model="statusModel">
          <option value="">全部状态</option>
          <option value="queued">queued</option>
          <option value="submitting">submitting</option>
          <option value="polling">polling</option>
          <option value="running">running</option>
          <option value="done">done</option>
          <option value="failed">failed</option>
          <option value="cancelled">cancelled</option>
        </select>
      </label>
      <label class="control">
        <span>错误码</span>
        <select v-model="providerErrorCodeModel">
          <option value="">全部错误码</option>
          <option value="CAPABILITY_MISMATCH">CAPABILITY_MISMATCH</option>
          <option value="PROVIDER_AUTH_FAILED">PROVIDER_AUTH_FAILED</option>
          <option value="PROVIDER_RATE_LIMITED">PROVIDER_RATE_LIMITED</option>
          <option value="PROVIDER_TIMEOUT">PROVIDER_TIMEOUT</option>
          <option value="PROVIDER_UNKNOWN">PROVIDER_UNKNOWN</option>
        </select>
      </label>
      <label class="control">
        <span>起始时间</span>
        <input v-model="createdFromLocalModel" type="datetime-local" />
      </label>
      <label class="control">
        <span>截止时间</span>
        <input v-model="createdToLocalModel" type="datetime-local" />
      </label>
      <label class="control">
        <span>排序字段</span>
        <select v-model="sortByModel">
          <option value="createdAt">按创建时间</option>
          <option value="updatedAt">按更新时间</option>
          <option value="priority">按优先级</option>
          <option value="status">按状态</option>
        </select>
      </label>
      <label class="control">
        <span>排序顺序</span>
        <select v-model="orderModel">
          <option value="desc">降序</option>
          <option value="asc">升序</option>
        </select>
      </label>
    </div>

    <div class="actions compact-actions">
      <button class="primary" @click="search()">查询</button>
      <button @click="clearFilters()">清空筛选</button>
      <button @click="copyCurrentQueryLink()">复制查询链接</button>
    </div>

    <h3 style="margin-top: 12px">预设管理</h3>
    <div class="filter-grid">
      <label class="control">
        <span>预设名称</span>
        <input v-model="presetNameModel" placeholder="输入后保存" />
      </label>
      <label class="control">
        <span>选择预设</span>
        <select v-model="selectedPresetNameModel">
          <option value="">选择预设</option>
          <option v-for="item in presets" :key="item.name" :value="item.name">{{ formatPresetOption(item) }}</option>
        </select>
      </label>
    </div>
    <div class="actions compact-actions">
      <button @click="saveCurrentPreset()">保存预设</button>
      <button :disabled="!selectedPresetName" @click="applySelectedPreset()">加载预设</button>
      <button :disabled="!selectedPresetName" @click="makeSelectedPresetDefault()">设为默认</button>
      <button :disabled="!selectedPresetName" @click="deleteSelectedPreset()">删除预设</button>
    </div>

    <h3 style="margin-top: 12px">批量操作</h3>
    <div class="actions compact-actions">
      <button @click="cancelActiveOnPage()">取消本页进行中</button>
      <button @click="retryFailedOnPage()">重试本页失败</button>
      <button @click="cancelActiveOnFilteredPage()">取消筛选进行中</button>
      <button @click="retryFailedOnFilteredPage()">重试筛选失败</button>
      <button class="primary" @click="repairFailedOnFilteredPageByPolicy()">按策略修复筛选失败</button>
      <button class="primary" @click="repairByPolicyWithServerQuery()">按筛选全量策略修复(≤300)</button>
      <button @click="openAutoRepairLogsInSettings()">查看自动修复日志</button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TaskCenterFilterPreset } from '@/types/models';

type TaskStatusFilter = '' | 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
type ProviderErrorCodeFilter =
  | ''
  | 'CAPABILITY_MISMATCH'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNKNOWN';
type TaskSortField = 'createdAt' | 'updatedAt' | 'priority' | 'status';

const props = defineProps<{
  mobileFilterOpen: boolean;
  keyword: string;
  providerTaskIdKeyword: string;
  status: TaskStatusFilter;
  providerErrorCode: ProviderErrorCodeFilter;
  createdFromLocal: string;
  createdToLocal: string;
  sortBy: TaskSortField;
  order: 'asc' | 'desc';
  presetName: string;
  selectedPresetName: string;
  presets: TaskCenterFilterPreset[];
  formatPresetOption: (item: TaskCenterFilterPreset) => string;
  search: () => void | Promise<void>;
  clearFilters: () => void | Promise<void>;
  copyCurrentQueryLink: () => void | Promise<void>;
  saveCurrentPreset: () => void | Promise<void>;
  applySelectedPreset: () => void | Promise<void>;
  makeSelectedPresetDefault: () => void | Promise<void>;
  deleteSelectedPreset: () => void | Promise<void>;
  cancelActiveOnPage: () => void | Promise<void>;
  retryFailedOnPage: () => void | Promise<void>;
  cancelActiveOnFilteredPage: () => void | Promise<void>;
  retryFailedOnFilteredPage: () => void | Promise<void>;
  repairFailedOnFilteredPageByPolicy: () => void | Promise<void>;
  repairByPolicyWithServerQuery: () => void | Promise<void>;
  openAutoRepairLogsInSettings: () => void | Promise<void>;
}>();

const emit = defineEmits<{
  (e: 'update:keyword', value: string): void;
  (e: 'update:providerTaskIdKeyword', value: string): void;
  (e: 'update:status', value: TaskStatusFilter): void;
  (e: 'update:providerErrorCode', value: ProviderErrorCodeFilter): void;
  (e: 'update:createdFromLocal', value: string): void;
  (e: 'update:createdToLocal', value: string): void;
  (e: 'update:sortBy', value: TaskSortField): void;
  (e: 'update:order', value: 'asc' | 'desc'): void;
  (e: 'update:presetName', value: string): void;
  (e: 'update:selectedPresetName', value: string): void;
}>();

const keywordModel = computed({
  get: () => props.keyword,
  set: (value: string) => emit('update:keyword', value)
});

const providerTaskIdKeywordModel = computed({
  get: () => props.providerTaskIdKeyword,
  set: (value: string) => emit('update:providerTaskIdKeyword', value)
});

const statusModel = computed({
  get: () => props.status,
  set: (value: TaskStatusFilter) => emit('update:status', value)
});

const providerErrorCodeModel = computed({
  get: () => props.providerErrorCode,
  set: (value: ProviderErrorCodeFilter) => emit('update:providerErrorCode', value)
});

const createdFromLocalModel = computed({
  get: () => props.createdFromLocal,
  set: (value: string) => emit('update:createdFromLocal', value)
});

const createdToLocalModel = computed({
  get: () => props.createdToLocal,
  set: (value: string) => emit('update:createdToLocal', value)
});

const sortByModel = computed({
  get: () => props.sortBy,
  set: (value: TaskSortField) => emit('update:sortBy', value)
});

const orderModel = computed({
  get: () => props.order,
  set: (value: 'asc' | 'desc') => emit('update:order', value)
});

const presetNameModel = computed({
  get: () => props.presetName,
  set: (value: string) => emit('update:presetName', value)
});

const selectedPresetNameModel = computed({
  get: () => props.selectedPresetName,
  set: (value: string) => emit('update:selectedPresetName', value)
});
</script>

<style scoped>
.filter-panel {
  border: 1px solid #dbe3f1;
  border-radius: 12px;
  padding: 12px;
  background: #fbfdff;
  position: sticky;
  top: 10px;
}

.filter-panel h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #0f172a;
}

.filter-grid {
  display: grid;
  gap: 8px;
}

.control {
  display: grid;
  gap: 4px;
}

.control span {
  font-size: 12px;
  color: #475569;
}

.compact-actions {
  margin-top: 8px;
}

@media (max-width: 980px) {
  .filter-panel {
    display: none;
    position: static;
  }

  .filter-panel.open {
    display: block;
  }
}
</style>
