<template>
  <div class="shell">
    <header class="shell-header">
      <div class="shell-brand">
        <p class="shell-brand__eyebrow">沪漫二厂 · Creative Workbench</p>
        <h1>Human-AI-Factory 2</h1>
        <p class="runtime-pill" v-if="runtimeReady">
          {{ isDesktop ? `Desktop · ${platform}${appVersion ? ` · v${appVersion}` : ''}` : 'Web Runtime' }}
          ·
          {{ online ? 'Online' : 'Offline' }}
          <span v-if="isDesktop">· Local Assets {{ localResourceCount }}</span>
        </p>
      </div>
      <div class="actions">
        <button v-if="isDesktop" @click="onPickResourceDirectory">本地素材目录</button>
        <button v-if="isDesktop" @click="onPickLocalMediaFiles">导入本地素材到队列</button>
        <button v-if="isDesktop" @click="onToggleQueuePaused">{{ localQueueSummary.paused ? '恢复队列' : '暂停队列' }}</button>
        <button v-if="isDesktop" @click="onProcessLocalQueueNow">执行一轮本地队列</button>
        <button v-if="isDesktop" @click="onExportDiagnostics">导出诊断包</button>
        <button v-if="isDesktop && localResourceDir" @click="onRevealResourceDir">打开目录</button>
        <button v-if="showLogout" class="danger" @click="$emit('logout')">退出登录</button>
      </div>
    </header>
    <main class="shell-main" :class="{ 'shell-main--full': fullWidth }">
      <section v-if="isDesktop && localResourceDir" class="desktop-resource-bar">
        <p class="muted">本地资源目录：{{ localResourceDir }}</p>
        <p class="muted">
          本地队列：total={{ localQueueSummary.total }} · queued={{ localQueueSummary.queued }} · running={{ localQueueSummary.running }} ·
          done={{ localQueueSummary.done }} · failed={{ localQueueSummary.failed }}
        </p>
        <p class="muted" v-if="localQueueSummary.recoveredTaskCount && localQueueSummary.recoveredTaskCount > 0">
          会话恢复：{{ localQueueSummary.recoveredTaskCount }} 个任务已从上次桌面会话恢复到队列
        </p>
        <div class="list desktop-queue-list" v-if="queueTopItems.length > 0">
          <article class="card" v-for="item in queueTopItems" :key="item.id">
            <p class="muted">#{{ item.id }} · {{ item.type }} · {{ item.status }} · {{ item.source }}</p>
            <div class="actions">
              <button v-if="item.status === 'queued' || item.status === 'running'" @click="onCancelLocalTask(item.id)">取消</button>
              <button v-if="item.result && typeof item.result.outputFile === 'string'" @click="onRevealPath(item.result.outputFile)">打开结果</button>
            </div>
          </article>
        </div>
        <details class="desktop-log-panel" v-if="localQueueLogs.length > 0">
          <summary>桌面队列日志（最近 {{ localQueueLogs.length }} 条）</summary>
          <div class="list">
            <article class="card" v-for="(entry, idx) in localQueueLogs.slice(0, 20)" :key="`${entry.time}-${idx}`">
              <p class="muted">{{ entry.time }} · {{ entry.level }} · {{ entry.message }}</p>
            </article>
          </div>
        </details>
        <p class="muted desktop-offline-pill" v-if="!online">离线模式：可继续素材编排与本地任务排队</p>
        <p class="muted" v-if="desktopError">{{ desktopError }}</p>
      </section>
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDesktopLocalMedia } from '@/composables/useDesktopLocalMedia';
import { useDesktopRuntime } from '@/composables/useDesktopRuntime';

withDefaults(
  defineProps<{
    showLogout?: boolean;
    fullWidth?: boolean;
  }>(),
  {
    showLogout: false,
    fullWidth: false
  }
);
defineEmits<{ logout: [] }>();

const desktop = useDesktopRuntime();
const localMedia = useDesktopLocalMedia();
const runtimeReady = computed(() => desktop.runtimeReady.value);
const isDesktop = computed(() => desktop.isDesktop.value);
const platform = computed(() => desktop.platform.value);
const appVersion = computed(() => desktop.appVersion.value);
const online = computed(() => desktop.online.value);
const localResourceDir = computed(() => desktop.localResourceDir.value);
const localResourceCount = computed(() => desktop.localResourceCount.value);
const localQueueSummary = computed(() => desktop.localQueueSummary.value);
const localQueueLogs = computed(() => desktop.localQueueLogs.value);
const queueTopItems = computed(() => desktop.queueTopItems.value);
const desktopError = computed(() => desktop.desktopError.value);

const onPickResourceDirectory = async (): Promise<void> => {
  await localMedia.pickResourceDirectory();
};

const onRevealResourceDir = async (): Promise<void> => {
  if (!localResourceDir.value) {
    return;
  }
  await localMedia.revealLocalPath(localResourceDir.value);
};

const onPickLocalMediaFiles = async (): Promise<void> => {
  await localMedia.pickAndEnqueueLocalMediaFiles('app-shell');
};

const onProcessLocalQueueNow = async (): Promise<void> => {
  await desktop.processLocalQueueNow();
};

const onToggleQueuePaused = async (): Promise<void> => {
  const paused = Boolean(localQueueSummary.value.paused);
  await desktop.setQueuePaused(!paused);
};

const onCancelLocalTask = async (taskId: string): Promise<void> => {
  await desktop.cancelLocalTask(taskId);
};

const onRevealPath = async (targetPath: string): Promise<void> => {
  await localMedia.revealLocalPath(targetPath);
};

const onExportDiagnostics = async (): Promise<void> => {
  const filePath = await desktop.exportDiagnostics();
  if (filePath) {
    await localMedia.revealLocalPath(filePath);
  }
};
</script>

<style scoped>
.shell-brand__eyebrow {
  margin: 0;
}

.runtime-pill {
  margin: 4px 0 0;
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  width: fit-content;
  max-width: 100%;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-pill);
  border: 1px solid var(--status-info-border);
  background: var(--status-info-bg);
  color: var(--status-info-ink);
  font-size: var(--text-2xs);
  letter-spacing: 0.02em;
}

.desktop-resource-bar {
  margin-bottom: var(--space-6);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-panel-strong);
  padding: var(--space-5) var(--space-6);
  box-shadow: var(--shadow-lg);
}

.desktop-queue-list {
  margin-top: var(--space-4);
}

.desktop-offline-pill {
  margin-top: var(--space-4);
  display: inline-block;
  border: 1px solid var(--status-warning-border);
  background: var(--status-warning-bg);
  color: var(--status-warning-ink);
  border-radius: var(--radius-pill);
  padding: var(--space-1) var(--space-4);
  font-size: var(--text-xs);
}

.desktop-log-panel {
  margin-top: var(--space-4);
}
</style>
