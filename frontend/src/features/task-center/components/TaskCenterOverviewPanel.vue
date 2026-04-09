<template>
  <section>
    <div class="chip-row" v-if="props.activeFilterChips.length > 0">
      <button class="chip" v-for="chip in props.activeFilterChips" :key="chip.key" @click="props.removeFilterChip(chip.key)">
        {{ chip.label }} ×
      </button>
    </div>

    <p v-if="props.error" class="error">{{ props.error }}</p>
    <p v-if="props.actionMessage" class="muted">{{ props.actionMessage }}</p>
    <div class="actions" v-if="props.lastRepairLogShortcut">
      <button @click="props.openLastRepairLogShortcut()">查看{{ props.lastRepairLogShortcut.title }}</button>
      <button @click="props.copyLastRepairLogShortcut()">复制{{ props.lastRepairLogShortcut.title }}链接</button>
    </div>

    <div class="metrics-grid">
      <article class="metric-card clickable" @click="props.applyMetricStatusFilter('')">
        <p class="muted">队列总量</p>
        <h3>{{ props.metrics.total }}</h3>
      </article>
      <article class="metric-card clickable" @click="props.applyMetricStatusFilter('running')">
        <p class="muted">排队/运行</p>
        <h3>{{ props.metrics.queued }} / {{ props.metrics.running }}</h3>
      </article>
      <article class="metric-card clickable" @click="props.applyMetricStatusFilter('done')">
        <p class="muted">完成/失败</p>
        <h3>{{ props.metrics.done }} / {{ props.metrics.failed }}</h3>
      </article>
      <article class="metric-card clickable" @click="props.applyMetricStatusFilter('failed')">
        <p class="muted">失败率</p>
        <h3>{{ props.formatPercent(props.metrics.failureRate) }}</h3>
      </article>
      <article class="metric-card">
        <p class="muted">平均排队耗时</p>
        <h3>{{ props.formatMs(props.metrics.avgQueueWaitMs) }}</h3>
      </article>
      <article class="metric-card">
        <p class="muted">平均执行耗时</p>
        <h3>{{ props.formatMs(props.metrics.avgRunDurationMs) }}</h3>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { VideoTaskMetrics } from '@/types/models';
import type { TaskCenterFilterChipKey } from '@/composables/useTaskCenterQueryActions';

type ActiveFilterChip = {
  key: TaskCenterFilterChipKey;
  label: string;
};

type RepairShortcut = {
  title: string;
  query: Record<string, string>;
};

const props = defineProps<{
  activeFilterChips: ActiveFilterChip[];
  error: string;
  actionMessage: string;
  lastRepairLogShortcut: RepairShortcut | null;
  metrics: VideoTaskMetrics;
  removeFilterChip: (key: TaskCenterFilterChipKey) => void | Promise<void>;
  openLastRepairLogShortcut: () => void | Promise<void>;
  copyLastRepairLogShortcut: () => void | Promise<void>;
  applyMetricStatusFilter: (status: '' | 'running' | 'done' | 'failed') => void | Promise<void>;
  formatPercent: (value: number) => string;
  formatMs: (value: number) => string;
}>();
</script>

<style scoped>
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.metric-card.clickable {
  cursor: pointer;
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
