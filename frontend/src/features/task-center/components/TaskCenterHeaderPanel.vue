<template>
  <div class="inline-between">
    <div>
      <h2>全局视频任务中心</h2>
      <p class="muted">分镜视频任务 · 可筛选、预设化、批量操作</p>
    </div>
    <div class="actions">
      <button class="mobile-only" @click="props.toggleMobileFilters()">
        {{ props.mobileFilterOpen ? '收起筛选' : '展开筛选' }}
      </button>
      <button @click="props.focusFailedTasks()">失败任务聚焦</button>
      <button @click="props.goHome()">返回项目页</button>
      <button class="primary" @click="props.loadTasks()">刷新</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  mobileFilterOpen: boolean;
  toggleMobileFilters: () => void | Promise<void>;
  focusFailedTasks: () => void | Promise<void>;
  goHome: () => void | Promise<void>;
  loadTasks: () => void | Promise<void>;
}>();
</script>

<style scoped>
.mobile-only {
  display: none;
}

@media (max-width: 980px) {
  .mobile-only {
    display: inline-flex;
  }
}
</style>
