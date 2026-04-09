<template>
  <section>
    <div class="inline-between" style="margin-top: 8px">
      <p class="muted">显示 {{ filteredTasks.length }} / {{ tasks.length }} 条</p>
      <div class="actions">
        <button :class="{ primary: viewMode === 'card' }" @click="setViewMode('card')">卡片视图</button>
        <button :class="{ primary: viewMode === 'table' }" @click="setViewMode('table')">表格视图</button>
      </div>
    </div>

    <div v-if="viewMode === 'table'" class="table-tools">
      <span class="muted">列显示：</span>
      <label><input :checked="tableColumnVisible.scope" type="checkbox" @change="toggleTableColumn('scope')" /> 项目/分镜</label>
      <label><input :checked="tableColumnVisible.status" type="checkbox" @change="toggleTableColumn('status')" /> 状态</label>
      <label><input :checked="tableColumnVisible.progress" type="checkbox" @change="toggleTableColumn('progress')" /> 进度</label>
      <label><input :checked="tableColumnVisible.priority" type="checkbox" @change="toggleTableColumn('priority')" /> 优先级</label>
      <label><input :checked="tableColumnVisible.providerTaskId" type="checkbox" @change="toggleTableColumn('providerTaskId')" /> 厂商任务ID</label>
      <label><input :checked="tableColumnVisible.providerErrorCode" type="checkbox" @change="toggleTableColumn('providerErrorCode')" /> 错误码</label>
      <label><input :checked="tableColumnVisible.updatedAt" type="checkbox" @change="toggleTableColumn('updatedAt')" /> 更新时间</label>
    </div>

    <div v-if="viewMode === 'card'" class="list" style="margin-top: 10px">
      <article class="card" v-for="task in filteredTasks" :key="task.id">
        <div>
          <h3>
            <span v-html="highlightText(task.projectName)"></span>
            /
            <span v-html="highlightText(task.storyboardTitle)"></span>
          </h3>
          <p class="muted">任务ID：<span class="mono-cell" v-html="highlightText(task.id)"></span></p>
          <p class="muted" v-if="task.providerTaskId">厂商任务ID：{{ task.providerTaskId }}</p>
          <p class="muted">优先级：{{ task.priority }}，状态：{{ task.status }}，进度：{{ task.progress }}%</p>
          <p class="muted">尝试次数：{{ task.attempt }}<span v-if="task.nextRetryAt"> / 下次重试：{{ new Date(task.nextRetryAt).toLocaleString() }}</span></p>
          <p class="muted" v-if="task.providerErrorCode">错误码：{{ task.providerErrorCode }}</p>
          <p class="muted">{{ task.prompt }}</p>
          <p class="muted" v-if="task.resultUrl">结果：{{ task.resultUrl }}</p>
          <p class="error" v-if="task.error">{{ task.error }}</p>
        </div>
        <div class="actions">
          <button
            v-if="task.status === 'queued' || task.status === 'submitting' || task.status === 'polling' || task.status === 'running'"
            @click="cancel(task.id)"
          >
            取消
          </button>
          <button v-if="task.status === 'failed' || task.status === 'cancelled'" class="primary" @click="retry(task.id)">重试</button>
          <button @click="viewEvents(task.id)">日志</button>
          <button @click="openAutoRepairLogsForTask(task)">修复日志</button>
          <button @click="copyAutoRepairLogLinkForTask(task)">复制修复日志链接</button>
          <button @click="copyTaskId(task.id)">复制任务ID</button>
          <button @click="copyReconcileIds(task)">复制对单ID</button>
        </div>
      </article>
    </div>

    <div v-else class="table-wrap" style="margin-top: 10px">
      <table class="task-table">
        <thead>
          <tr>
            <th v-if="tableColumnVisible.scope" class="w-scope">项目/分镜</th>
            <th v-if="tableColumnVisible.status" class="w-status" :class="{ sorted: tableSortKey === 'status' }">
              <button class="th-sort" @click="toggleTableSort('status')">状态 {{ sortIndicator('status') }}</button>
            </th>
            <th v-if="tableColumnVisible.progress" class="w-progress" :class="{ sorted: tableSortKey === 'progress' }">
              <button class="th-sort" @click="toggleTableSort('progress')">进度 {{ sortIndicator('progress') }}</button>
            </th>
            <th v-if="tableColumnVisible.priority" class="w-priority">优先级</th>
            <th v-if="tableColumnVisible.providerTaskId" class="w-provider">厂商任务ID</th>
            <th v-if="tableColumnVisible.providerErrorCode" class="w-error">错误码</th>
            <th v-if="tableColumnVisible.updatedAt" class="w-updated" :class="{ sorted: tableSortKey === 'updatedAt' }">
              <button class="th-sort" @click="toggleTableSort('updatedAt')">更新时间 {{ sortIndicator('updatedAt') }}</button>
            </th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in displayTasks" :key="task.id">
            <td v-if="tableColumnVisible.scope">
              <p v-html="highlightText(task.projectName)"></p>
              <p class="muted" v-html="highlightText(task.storyboardTitle)"></p>
              <p class="muted">ID: <span class="mono-cell" v-html="highlightText(task.id)"></span></p>
            </td>
            <td v-if="tableColumnVisible.status">
              <span class="status-pill" :class="statusClassName(task.status)">{{ task.status }}</span>
            </td>
            <td v-if="tableColumnVisible.progress">{{ task.progress }}%</td>
            <td v-if="tableColumnVisible.priority">{{ task.priority }}</td>
            <td v-if="tableColumnVisible.providerTaskId" class="mono-cell">{{ task.providerTaskId || '-' }}</td>
            <td v-if="tableColumnVisible.providerErrorCode">{{ task.providerErrorCode || '-' }}</td>
            <td v-if="tableColumnVisible.updatedAt">{{ new Date(task.updatedAt).toLocaleString() }}</td>
            <td>
              <div class="actions">
                <button
                  v-if="task.status === 'queued' || task.status === 'submitting' || task.status === 'polling' || task.status === 'running'"
                  @click="cancel(task.id)"
                >
                  取消
                </button>
                <button v-if="task.status === 'failed' || task.status === 'cancelled'" class="primary" @click="retry(task.id)">重试</button>
                <button @click="viewEvents(task.id)">日志</button>
                <button @click="openAutoRepairLogsForTask(task)">修复日志</button>
                <button @click="copyAutoRepairLogLinkForTask(task)">复制修复日志链接</button>
                <button @click="copyTaskId(task.id)">复制任务ID</button>
                <button @click="copyReconcileIds(task)">复制对单ID</button>
              </div>
            </td>
          </tr>
          <tr v-if="displayTasks.length === 0">
            <td :colspan="visibleTableColumnCount + 1" class="muted">暂无任务</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="actions pager-row">
      <button :disabled="page <= 1" @click="prevPage()">上一页</button>
      <p class="muted">第 {{ page }} / {{ totalPages }}（{{ total }}）</p>
      <button :disabled="page >= totalPages" @click="nextPage()">下一页</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { VideoTaskListItem } from '@/types/models';

type TableColumnKey = 'scope' | 'status' | 'progress' | 'priority' | 'providerTaskId' | 'providerErrorCode' | 'updatedAt';
type TableSortKey = 'status' | 'progress' | 'updatedAt';

const props = defineProps<{
  tasks: VideoTaskListItem[];
  filteredTasks: VideoTaskListItem[];
  displayTasks: VideoTaskListItem[];
  total: number;
  page: number;
  totalPages: number;
  keyword: string;
  viewMode: 'card' | 'table';
  tableColumnVisible: Record<TableColumnKey, boolean>;
  tableSortKey: TableSortKey;
  tableSortOrder: 'asc' | 'desc';
  visibleTableColumnCount: number;
  setViewMode: (mode: 'card' | 'table') => void;
  toggleTableColumn: (key: TableColumnKey) => void;
  toggleTableSort: (key: TableSortKey) => void;
  retry: (taskId: string) => void | Promise<void>;
  cancel: (taskId: string) => void | Promise<void>;
  viewEvents: (taskId: string) => void | Promise<void>;
  openAutoRepairLogsForTask: (task: VideoTaskListItem) => void | Promise<void>;
  copyAutoRepairLogLinkForTask: (task: VideoTaskListItem) => void | Promise<void>;
  copyTaskId: (taskId: string) => void | Promise<void>;
  copyReconcileIds: (task: VideoTaskListItem) => void | Promise<void>;
  prevPage: () => void | Promise<void>;
  nextPage: () => void | Promise<void>;
}>();

const statusClassName = (statusValue: VideoTaskListItem['status']): string => `status-${statusValue}`;
const sortIndicator = (key: TableSortKey): string =>
  props.tableSortKey === key ? (props.tableSortOrder === 'asc' ? '↑' : '↓') : '↕';

const escapeHtml = (raw: string): string =>
  raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const highlightText = (raw: string): string => {
  const source = typeof raw === 'string' ? raw : String(raw ?? '');
  const keywordValue = props.keyword.trim();
  if (!keywordValue) {
    return escapeHtml(source);
  }
  const escaped = escapeHtml(source);
  const pattern = keywordValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const reg = new RegExp(pattern, 'gi');
    return escaped.replace(reg, (m) => `<mark class="hl">${m}</mark>`);
  } catch {
    return escaped;
  }
};
</script>

<style scoped>
.table-wrap {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: auto;
}

.task-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 920px;
}

.task-table th,
.task-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
  text-align: left;
}

.task-table thead th {
  background: var(--card-soft);
  font-size: 12px;
  color: var(--ink-1);
  position: sticky;
  top: 0;
}

.task-table th.sorted {
  background: var(--status-info-bg);
}

.th-sort {
  border: none;
  background: transparent;
  color: inherit;
  padding: 0;
  margin: 0;
  font: inherit;
  cursor: pointer;
}

.w-scope {
  min-width: 180px;
}

.w-status,
.w-priority,
.w-progress {
  min-width: 80px;
}

.w-provider {
  min-width: 180px;
}

.w-error {
  min-width: 130px;
}

.w-updated {
  min-width: 170px;
}

.mono-cell {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.table-tools {
  margin-top: 8px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.table-tools label {
  font-size: 12px;
  color: var(--ink-1);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.status-queued {
  color: var(--status-info-ink);
  background: var(--status-info-bg);
  border-color: var(--status-info-border);
}

.status-submitting,
.status-polling,
.status-running {
  color: var(--status-warning-ink);
  background: var(--status-warning-bg);
  border-color: var(--status-warning-border);
}

.status-done {
  color: var(--status-success-ink);
  background: var(--status-success-bg);
  border-color: var(--status-success-border);
}

.status-failed,
.status-cancelled {
  color: var(--status-danger-ink);
  background: var(--status-danger-bg);
  border-color: var(--status-danger-border);
}

:deep(mark.hl) {
  background: var(--highlight-bg);
  color: var(--status-warning-ink);
  border-radius: 3px;
  padding: 0 2px;
}

.pager-row {
  margin-top: 10px;
}
</style>
