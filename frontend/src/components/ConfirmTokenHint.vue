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
  gap: var(--space-3);
}

.confirm-token-hint.compact {
  gap: var(--space-2);
}

.confirm-token {
  display: inline-block;
  padding: 1px var(--space-2);
  border-radius: 6px;
  background: var(--status-neutral-bg);
  border: 1px solid var(--status-neutral-border);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
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
