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
  border-radius: 10px;
  border: 1px solid #d0d7de;
  background: #f8fafc;
}

.connection-result.success {
  border-color: #86efac;
  background: #f0fdf4;
}

.connection-result.failure {
  border-color: #f5c2c7;
  background: #fff7f7;
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
  color: #64748b;
}

.preview {
  margin-top: 6px;
  color: #0f172a;
}
</style>
