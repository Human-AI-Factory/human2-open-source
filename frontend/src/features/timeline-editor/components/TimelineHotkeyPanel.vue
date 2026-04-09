<template>
  <section class="panel hotkey-panel">
    <div class="inline-between">
      <h3>快捷键面板</h3>
      <button @click="toggleHotkeyHelp">关闭</button>
    </div>
    <div class="hotkey-grid">
      <p><code>Space</code> 播放/暂停</p>
      <p><code>← / →</code> 步进一帧</p>
      <p><code>[ / ]</code> 缩短/延长选中片段</p>
      <p><code>Delete</code> 删除选中片段</p>
      <p><code>Cmd/Ctrl + D</code> 复制选中片段</p>
      <p><code>Cmd/Ctrl + K</code> 聚焦命令条</p>
      <p><code>Cmd/Ctrl + 1/2/3/4</code> 切换工作区预设</p>
      <p><code>J / K</code> 选中上一个/下一个片段</p>
      <p><code>F</code> 切换沉浸模式</p>
      <p><code>?</code> 显示/隐藏本面板</p>
    </div>
  </section>
</template>

<script setup lang="ts">
type AsyncAction = () => void | Promise<void>;

defineProps<{
  toggleHotkeyHelp: AsyncAction;
}>();
</script>

<style scoped>
.hotkey-panel {
  border: 1px solid var(--line);
  background: var(--surface-spotlight);
}

.hotkey-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px 12px;
}

.hotkey-grid p {
  margin: 0;
  font-size: 13px;
  color: var(--ink-1);
}

.hotkey-grid code {
  display: inline-block;
  border-radius: 6px;
  padding: 2px 6px;
  border: 1px solid var(--status-info-border);
  background: var(--status-info-bg);
  color: var(--status-info-ink);
}
</style>
