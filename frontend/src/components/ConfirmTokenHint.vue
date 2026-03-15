<template>
  <div class="confirm-token-hint" :class="{ compact: compact }">
    <CopyConfirmTokenButton
      :source="source"
      :copied-source="copiedSource"
      @copy="emit('copy', $event)" />
    <p class="muted">
      <span v-if="!compact" class="token-label">确认词：</span>
      <code class="confirm-token">{{ token }}</code>
    </p>
  </div>
</template>

<script setup lang="ts">
import CopyConfirmTokenButton from '@/components/CopyConfirmTokenButton.vue';

defineProps<{
  source: 'summary' | 'failures';
  copiedSource: 'summary' | 'failures' | null;
  token: string;
  compact?: boolean;
}>();

const emit = defineEmits<{
  copy: [source: 'summary' | 'failures'];
}>();
</script>

<style scoped>
.confirm-token-hint {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.confirm-token-hint.compact {
  gap: 6px;
}

.confirm-token {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 6px;
  background: #f2f4f7;
  border: 1px solid #e4e7ec;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
}

@media (max-width: 768px) {
  .confirm-token-hint {
    width: 100%;
    justify-content: space-between;
  }

  .token-label {
    display: none;
  }
}
</style>
