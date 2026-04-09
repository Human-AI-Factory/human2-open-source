<template>
  <div class="timeline-ops-panel">
    <div class="inline-between">
      <h4>命令历史与撤销栈</h4>
      <div class="actions">
        <button :disabled="undoCount === 0" @click="undoTimelineEdit">撤销</button>
        <button :disabled="redoCount === 0" @click="redoTimelineEdit">重做</button>
      </div>
    </div>
    <p class="muted">undo={{ undoCount }} · redo={{ redoCount }} · history={{ commandHistory.length }}</p>
    <div class="list compact-list">
      <article v-for="item in commandHistory" :key="item.id" class="card">
        <div class="inline-between">
          <strong>{{ item.action }}</strong>
          <span class="muted">{{ item.time }}</span>
        </div>
        <p class="muted">{{ item.detail || '-' }}</p>
        <div class="actions">
          <button :disabled="!item.command" @click="replayHistoryCommand(item.id)">重放</button>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TimelineCommandHistoryItem } from '@/composables/useTimelineHistory';

type AsyncAction = () => void | Promise<void>;

defineProps<{
  undoCount: number;
  redoCount: number;
  commandHistory: TimelineCommandHistoryItem[];
  undoTimelineEdit: AsyncAction;
  redoTimelineEdit: AsyncAction;
  replayHistoryCommand: (id: string) => void | Promise<void>;
}>();
</script>

<style scoped>
.timeline-ops-panel {
  margin-top: 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-panel-soft);
  padding: 10px;
  display: grid;
  gap: 8px;
}

.timeline-ops-panel .card .actions {
  margin-top: 6px;
}
</style>
