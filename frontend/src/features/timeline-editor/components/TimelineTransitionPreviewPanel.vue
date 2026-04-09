<template>
  <div v-if="items.length > 0" class="transition-track">
    <article v-for="(item, idx) in items" :key="`transition-${idx}`" class="transition-item">
      <div class="inline-between">
        <p>{{ item.fromTitle }} -> {{ item.toTitle }}</p>
        <span class="status-pill status-pill--accent transition-tag">{{ item.transitionType }}</span>
      </div>
      <p class="muted">duration={{ item.durationSec }}s · offset={{ item.offsetSec }}s</p>
      <code class="transition-filter">{{ item.filter }}</code>
    </article>
  </div>
</template>

<script setup lang="ts">
type TransitionPreviewItem = {
  fromTitle: string;
  toTitle: string;
  transitionType: string;
  durationSec: number;
  offsetSec: number;
  filter: string;
};

defineProps<{
  items: readonly TransitionPreviewItem[];
}>();
</script>

<style scoped>
.transition-track {
  display: grid;
  gap: 8px;
  margin: 10px 0 12px;
}

.transition-item {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-panel-soft);
  padding: 10px;
}

.transition-tag {
  flex: none;
}

.transition-filter {
  display: block;
  margin-top: 4px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--card-soft);
  color: var(--ink-1);
  font-size: 12px;
  overflow-x: auto;
}
</style>
