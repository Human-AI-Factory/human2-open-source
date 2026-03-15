<template>
  <div v-if="items.length > 0" class="transition-track">
    <article v-for="(item, idx) in items" :key="`transition-${idx}`" class="transition-item">
      <div class="inline-between">
        <p>{{ item.fromTitle }} -> {{ item.toTitle }}</p>
        <span class="transition-tag">{{ item.transitionType }}</span>
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
  border: 1px solid #d7deea;
  border-radius: 10px;
  background: #f9fbff;
  padding: 10px;
}

.transition-tag {
  border: 1px solid #95a3bb;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
}

.transition-filter {
  display: block;
  margin-top: 4px;
  padding: 6px 8px;
  border-radius: 8px;
  background: #eef3fb;
  color: #1a2a42;
  font-size: 12px;
  overflow-x: auto;
}
</style>
