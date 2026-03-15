<template>
  <div v-if="visible" class="panel" style="margin-top: 10px">
    <h4>{{ title }}</h4>
    <p class="muted" v-if="riskLevel">风险级别：{{ riskLevel }}</p>
    <p class="muted" v-if="summary">{{ summary }}</p>
    <ul v-if="impactItems && impactItems.length > 0">
      <li v-for="(item, idx) in impactItems" :key="`${idx}-${item}`" class="muted">{{ item }}</li>
    </ul>
    <div class="form">
      <label>
        actor
        <input :value="actor" @input="$emit('update:actor', ($event.target as HTMLInputElement).value)" />
      </label>
      <label>
        comment
        <input :value="comment" @input="$emit('update:comment', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="check-inline">
        <input
          type="checkbox"
          :checked="confirmed"
          @change="$emit('update:confirmed', ($event.target as HTMLInputElement).checked)" />
        我已确认本次批量操作
      </label>
    </div>
    <div class="actions">
      <button class="primary" :disabled="busy || !confirmed" @click="$emit('confirm')">{{ confirmText || '确认执行' }}</button>
      <button :disabled="busy" @click="$emit('cancel')">{{ cancelText || '取消' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean;
  title: string;
  riskLevel?: 'low' | 'medium' | 'high';
  summary?: string;
  impactItems?: string[];
  actor: string;
  comment: string;
  confirmed: boolean;
  busy?: boolean;
  confirmText?: string;
  cancelText?: string;
}>();

defineEmits<{
  'update:actor': [value: string];
  'update:comment': [value: string];
  'update:confirmed': [value: boolean];
  confirm: [];
  cancel: [];
}>();
</script>
