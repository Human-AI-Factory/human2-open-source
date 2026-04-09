<template>
  <div v-if="loading || result" :class="['connection-result', result?.ok ? 'success' : 'failure']">
    <p v-if="loading" class="muted">正在测试连接...</p>
    <template v-else-if="result">
      <p class="headline">{{ result.ok ? '连接成功' : '连接失败' }}</p>
      <p class="message">{{ result.message }}</p>
      <p class="meta">
        {{ result.manufacturer }} / {{ result.model }} / {{ result.latencyMs }}ms
        <span v-if="result.statusCode !== null"> / HTTP {{ result.statusCode }}</span>
      </p>
      <p v-if="result.preview" class="preview">{{ result.preview }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ModelConnectionTestResult } from '@/types/models';

defineProps<{
  loading?: boolean;
  result?: ModelConnectionTestResult | null;
}>();
</script>

<style scoped>
.connection-result {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--status-neutral-border);
  background: var(--status-neutral-bg);
}

.connection-result.success {
  border-color: var(--status-success-border);
  background: var(--status-success-bg);
}

.connection-result.failure {
  border-color: var(--status-danger-border);
  background: var(--status-danger-bg);
}

.headline {
  margin: 0 0 4px;
  font-weight: 600;
}

.message,
.meta,
.preview {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.meta {
  color: var(--ink-2);
}

.preview {
  margin-top: 6px;
  color: var(--ink-1);
}
</style>
