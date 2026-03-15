<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="director-execution-shell" compact>
      <template #rail>
        <section class="panel director-execution-hero">
          <div class="inline-between">
            <div>
              <p class="eyebrow">Director Execution</p>
              <h2>导演 · 执行面板</h2>
              <p class="muted">{{ project?.name || '加载中...' }} · 时间线与审核执行</p>
            </div>
            <div class="actions">
              <button @click="goDirectorHome">导演首页</button>
              <button @click="goPlanning">计划面板</button>
              <button @click="refresh">刷新</button>
            </div>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
        </section>

        <section class="panel sticky-summary">
          <div class="inline-between">
            <h3>执行状态（可分享）</h3>
            <div class="actions">
              <button @click="copyShareLink">复制当前链接</button>
            </div>
          </div>
          <p class="muted">
            作用分集：{{ selectedEpisodeTitle || '全局' }}
            <span v-if="lastAction"> · 最近动作：{{ lastActionLabel }}</span>
            <span v-if="lastActionAt"> · {{ lastActionAt }}</span>
            <span v-if="shareTip"> · {{ shareTip }}</span>
          </p>
          <RouteRestoreHint :text="routeRestoredTip" />
        </section>
      </template>

      <section class="panel">
        <h3>执行摘要</h3>
        <div class="summary-grid">
          <article class="card">
            <p class="muted">分镜总数</p>
            <h4>{{ workflow?.counts.storyboard ?? 0 }}</h4>
          </article>
          <article class="card">
            <p class="muted">视频任务完成</p>
            <h4>{{ workflow?.counts.videoTaskDone ?? 0 }} / {{ workflow?.counts.videoTask ?? 0 }}</h4>
          </article>
          <article class="card">
            <p class="muted">合成完成</p>
            <h4>{{ workflow?.counts.videoMergeDone ?? 0 }} / {{ workflow?.counts.videoMerge ?? 0 }}</h4>
          </article>
        </div>
        <div class="actions" style="margin-top: 10px">
          <label>
            作用分集
            <select v-model="selectedEpisodeId">
              <option value="">不限定（全局）</option>
              <option v-for="item in episodes" :key="item.episode.id" :value="item.episode.id">
                第 {{ item.episode.orderIndex }} 集 · {{ item.episode.title }}
              </option>
            </select>
          </label>
          <button class="primary" :disabled="Boolean(timelineBlocker)" :title="timelineBlocker || ''" @click="goTimeline">时间线编辑器</button>
          <button :disabled="Boolean(timelineBlocker)" :title="timelineBlocker || ''" @click="goTimelineBatchTools">时间线批处理工具</button>
          <button :disabled="Boolean(reviewBlocker)" :title="reviewBlocker || ''" @click="goReview">审核工作台</button>
          <button @click="goStoryboard">分镜工作台</button>
        </div>
        <p class="muted" v-if="timelineBlocker || reviewBlocker">阻塞：{{ timelineBlocker || reviewBlocker }}</p>
      </section>

      <template #inspector>
        <section class="panel">
          <div class="inline-between">
            <h3>导演快捷执行台</h3>
            <button @click="showQuickGuide = !showQuickGuide">{{ showQuickGuide ? '隐藏快捷键' : '显示快捷键' }}</button>
          </div>
          <div class="actions">
            <button class="primary" :disabled="Boolean(timelineBlocker)" :title="timelineBlocker || ''" @click="goTimeline">1. 时间线编辑器</button>
            <button :disabled="Boolean(timelineBlocker)" :title="timelineBlocker || ''" @click="goTimelineBatchTools">2. 时间线批处理</button>
            <button :disabled="Boolean(reviewBlocker)" :title="reviewBlocker || ''" @click="goReview">3. 审核工作台</button>
            <button @click="goStoryboard">4. 分镜工作台</button>
          </div>
          <p v-if="showQuickGuide" class="muted">
            快捷键：`1` 时间线，`2` 批处理，`3` 审核，`4` 分镜，`R` 刷新，`S` 复制分享链接
          </p>
        </section>
      </template>
    </DesktopWorkbenchShell>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import DesktopWorkbenchShell from '@/components/DesktopWorkbenchShell.vue';
import RouteRestoreHint from '@/components/RouteRestoreHint.vue';
import { clearToken } from '@/api/client';
import { getProjectWorkflow } from '@/api/projects';
import { getDramaWorkflowEpisodes, getDramaWorkflowSummary, getProjectWorkflowEpisodes } from '@/api/project-workflow';
import { getProject } from '@/api/timeline-editor';
import { buildDramaScopedPath, buildDramaScopedQuery, resolveProjectIdFromRouteContext } from '@/utils/route-context';
import { buildRouteRestoreTip, replaceQueryIfChanged, toSingleQuery, useRouteRestoreContext } from '@/composables/useRouteRestoreContext';
import type { Project, ProjectWorkflowSummary, WorkflowEpisodeListItem } from '@/types/models';

const route = useRoute();
const router = useRouter();
const routeProjectId = computed(() => String(route.params.id || ''));
const routeDramaId = computed(() => String(route.params.dramaId || ''));
const projectId = ref('');
const dramaId = computed(() => {
  const query = toSingleQuery(route.query);
  if (routeDramaId.value) {
    return routeDramaId.value;
  }
  return query.dramaId || '';
});

const buildPath = (projectPath: string, dramaPath: string): string =>
  buildDramaScopedPath({ dramaId: dramaId.value, projectPath, dramaPath });
const buildQuery = (extra?: Record<string, string | undefined>): Record<string, string> =>
  buildDramaScopedQuery(dramaId.value, extra);

const project = ref<Project | null>(null);
const workflow = ref<ProjectWorkflowSummary | null>(null);
const episodes = ref<WorkflowEpisodeListItem[]>([]);
const selectedEpisodeId = ref('');
const lastAction = ref('');
const lastActionAt = ref('');
const shareTip = ref('');
const error = ref('');
const showQuickGuide = ref(false);
const {
  restoreTip: routeRestoredTip,
  markRestored: markRouteRestored
} = useRouteRestoreContext();

const actionLabelMap: Record<string, string> = {
  timeline: '进入时间线编辑器',
  review: '进入审核工作台',
  storyboard: '进入分镜工作台'
};

const selectedEpisodeTitle = computed(() => {
  if (!selectedEpisodeId.value) {
    return '';
  }
  const item = episodes.value.find((entry) => entry.episode.id === selectedEpisodeId.value);
  return item ? `第 ${item.episode.orderIndex} 集 · ${item.episode.title}` : selectedEpisodeId.value;
});

const lastActionLabel = computed(() => actionLabelMap[lastAction.value] || lastAction.value);
const timelineBlocker = computed(() => {
  const done = workflow.value?.counts.videoTaskDone ?? 0;
  if (done <= 0) {
    return '至少需要 1 条视频任务完成后才能进入时间线';
  }
  return '';
});
const reviewBlocker = computed(() => {
  const count = workflow.value?.counts.storyboard ?? 0;
  if (count <= 0) {
    return '需要先生成分镜后才能进入审核';
  }
  return '';
});

const managedQueryKeys = ['episodeId', 'action', 'actionAt'] as const;

const restoreFromQuery = (): void => {
  const query = toSingleQuery(route.query);
  selectedEpisodeId.value = query.episodeId || '';
  lastAction.value = query.action || '';
  lastActionAt.value = query.actionAt || '';
  if (selectedEpisodeId.value || lastAction.value || lastActionAt.value) {
    markRouteRestored(buildRouteRestoreTip('scope_filter'));
  }
};

const syncQuery = async (): Promise<void> => {
  const nextQuery = toSingleQuery(route.query);

  const payload: Record<string, string | undefined> = {
    episodeId: selectedEpisodeId.value || undefined,
    action: lastAction.value || undefined,
    actionAt: lastActionAt.value || undefined
  };

  for (const key of managedQueryKeys) {
    const value = payload[key];
    if (value) {
      nextQuery[key] = value;
    } else {
      delete nextQuery[key];
    }
  }

  await replaceQueryIfChanged({ route, router, nextQuery });
};

const refresh = async (): Promise<void> => {
  projectId.value = await resolveProjectIdFromRouteContext({
    currentProjectId: projectId.value,
    routeProjectId: routeProjectId.value,
    routeDramaId: routeDramaId.value
  });
  if (!projectId.value) {
    error.value = '无法解析项目上下文';
    return;
  }
  try {
    const [projectData, workflowData, episodesData] = await Promise.all([
      getProject(projectId.value),
      dramaId.value ? getDramaWorkflowSummary(dramaId.value) : getProjectWorkflow(projectId.value),
      dramaId.value ? getDramaWorkflowEpisodes(dramaId.value, { page: 1, pageSize: 200 }) : getProjectWorkflowEpisodes(projectId.value, { page: 1, pageSize: 200 })
    ]);
    project.value = projectData;
    workflow.value = workflowData;
    episodes.value = episodesData.items;
    if (selectedEpisodeId.value && !episodes.value.some((item) => item.episode.id === selectedEpisodeId.value)) {
      selectedEpisodeId.value = '';
    }
    error.value = '';
    await syncQuery();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  }
};

const markAction = async (action: string): Promise<void> => {
  lastAction.value = action;
  lastActionAt.value = new Date().toISOString();
  await syncQuery();
};

const withEpisodeQuery = (): Record<string, string> =>
  buildQuery({
    episodeId: selectedEpisodeId.value || undefined
  });

const goDirectorHome = (): void => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/director`, `/dramas/${dramaId.value}/director`),
    query: buildQuery()
  });
};

const goPlanning = (): void => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/director/planning`, `/dramas/${dramaId.value}/director/planning`),
    query: withEpisodeQuery()
  });
};

const goTimeline = async (): Promise<void> => {
  await markAction('timeline');
  await router.push({
    path: buildPath(`/projects/${projectId.value}/timeline`, `/dramas/${dramaId.value}/timeline`),
    query: withEpisodeQuery()
  });
};

const goTimelineBatchTools = async (): Promise<void> => {
  await markAction('timeline');
  await router.push({
    path: buildPath(`/projects/${projectId.value}/timeline`, `/dramas/${dramaId.value}/timeline`),
    query: {
      ...withEpisodeQuery(),
      timelineTool: 'batch'
    }
  });
};

const goReview = async (): Promise<void> => {
  await markAction('review');
  await router.push({
    path: buildPath(`/projects/${projectId.value}/review-workbench`, `/dramas/${dramaId.value}/review-workbench`),
    query: withEpisodeQuery()
  });
};

const goStoryboard = async (): Promise<void> => {
  await markAction('storyboard');
  await router.push({
    path: buildPath(`/projects/${projectId.value}/storyboard-workbench`, `/dramas/${dramaId.value}/storyboard-workbench`),
    query: withEpisodeQuery()
  });
};

const copyShareLink = async (): Promise<void> => {
  shareTip.value = '';
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(window.location.href);
      shareTip.value = '已复制分享链接';
      return;
    }
    shareTip.value = '当前环境不支持复制';
  } catch {
    shareTip.value = '复制失败';
  }
};

const logout = (): void => {
  clearToken();
  void router.replace('/login');
};

const isTypingElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
};

const onDirectorExecutionHotkeyDown = (event: KeyboardEvent): void => {
  if (isTypingElement(event.target)) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === '1') {
    event.preventDefault();
    if (!timelineBlocker.value) {
      void goTimeline();
    }
    return;
  }
  if (key === '2') {
    event.preventDefault();
    if (!timelineBlocker.value) {
      void goTimelineBatchTools();
    }
    return;
  }
  if (key === '3') {
    event.preventDefault();
    if (!reviewBlocker.value) {
      void goReview();
    }
    return;
  }
  if (key === '4') {
    event.preventDefault();
    void goStoryboard();
    return;
  }
  if (key === 'r') {
    event.preventDefault();
    void refresh();
    return;
  }
  if (key === 's') {
    event.preventDefault();
    void copyShareLink();
  }
};

watch(
  () => [selectedEpisodeId.value, lastAction.value, lastActionAt.value],
  () => {
    void syncQuery();
  }
);

onMounted(() => {
  restoreFromQuery();
  void refresh();
  window.addEventListener('keydown', onDirectorExecutionHotkeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onDirectorExecutionHotkeyDown);
});
</script>

<style scoped>
.director-execution-shell {
  --rail-width: 340px;
  --inspector-width: 340px;
}

.director-execution-hero {
  border: 1px solid #d9e4ff;
  background: linear-gradient(160deg, #f7fbff 0%, #eef5ff 100%);
}

.sticky-summary {
  position: sticky;
  top: 12px;
  z-index: 3;
  border: 1px solid #bdd5ff;
  background: linear-gradient(135deg, #f7fbff, #eef6ff);
}

</style>
