<template>
  <button
    type="button"
    :class="{ copied: isCopied }"
    :disabled="isCopied"
    :title="isCopied ? '确认词已复制到剪贴板' : '复制确认词到剪贴板'"
    :aria-label="isCopied ? '确认词已复制' : '复制确认词'"
    @click="emit('copy', source)">
    {{ isCopied ? '✓ 已复制' : '复制确认词' }}
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  source: 'summary' | 'failures';
  copiedSource: 'summary' | 'failures' | null;
}>();

const emit = defineEmits<{
  copy: [source: 'summary' | 'failures'];
}>();

const isCopied = computed(() => props.copiedSource === props.source);
</script>

<style scoped>
button.copied {
  background: var(--status-success-bg);
  border-color: var(--status-success-border);
  color: var(--status-success-ink);
}

button.copied:disabled {
  opacity: 1;
  cursor: default;
}
</style>
