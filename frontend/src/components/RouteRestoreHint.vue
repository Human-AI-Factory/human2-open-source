<template>
  <p v-if="text.trim().length > 0" class="route-restore-hint">{{ text }}</p>
</template>

<script setup lang="ts">
defineProps<{
  text: string;
}>();
</script>

<style scoped>
.route-restore-hint {
  margin: 8px 0 0;
  color: var(--status-info-ink);
  font-size: 13px;
}
</style>
