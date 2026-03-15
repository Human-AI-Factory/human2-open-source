<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="producer-delivery-shell" compact>
      <template #rail>
        <section class="panel producer-delivery-hero">
          <div class="inline-between">
            <div>
              <p class="eyebrow">Producer Delivery</p>
              <h2>制片 · 交付面板</h2>
              <p class="muted">{{ project?.name || '加载中...' }} · 版本导出与交付收口</p>
            </div>
            <div class="actions">
              <button @click="goProducerHome">制片首页</button>
              <button @click="goPlanning">计划面板</button>
              <button @click="refresh">刷新</button>
            </div>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
        </section>

        <section class="panel sticky-summary">
          <div class="inline-between">
            <h3>交付状态（可分享）</h3>
            <div class="actions">
              <button @click="copyShareLink">复制当前链接</button>
            </div>
          </div>
          <p class="muted">
            筛选：status={{ statusFilter }} · query={{ queryText || '-' }} · 命中 {{ filteredEpisodes.length }} / {{ episodes.length }}
          </p>
          <p class="muted">
            <span v-if="selectedEpisodeTitle">最近查看：{{ selectedEpisodeTitle }}</span>
            <span v-if="lastAction"> · 最近动作：{{ lastActionLabel }}</span>
            <span v-if="lastActionAt"> · {{ lastActionAt }}</span>
            <span v-if="shareTip"> · {{ shareTip }}</span>
          </p>
          <RouteRestoreHint :text="routeRestoredTip" />
        </section>

        <section class="panel">
          <h3>交付摘要</h3>
          <div class="summary-grid">
            <article class="card">
              <p class="muted">合成完成</p>
              <h4>{{ workflow?.counts.videoMergeDone ?? 0 }} / {{ workflow?.counts.videoMerge ?? 0 }}</h4>
            </article>
            <article class="card">
              <p class="muted">视频任务完成</p>
              <h4>{{ workflow?.counts.videoTaskDone ?? 0 }} / {{ workflow?.counts.videoTask ?? 0 }}</h4>
            </article>
            <article class="card">
              <p class="muted">待推进分集</p>
              <h4>{{ pendingCount }}</h4>
            </article>
          </div>
          <div class="actions" style="margin-top: 10px">
            <button class="primary" :disabled="Boolean(deliveryBlocker)" :title="deliveryBlocker || ''" @click="goDeliveryWorkbench">进入交付工作台</button>
            <button @click="goTasks">任务中心</button>
            <button @click="goWorkflow">流程工作台</button>
          </div>
          <p class="muted" v-if="deliveryBlocker">阻塞：{{ deliveryBlocker }}</p>
        </section>
      </template>

      <section class="panel">
        <h3>分集清单</h3>
        <div class="list compact-list">
          <article class="card" v-for="item in filteredEpisodes" :key="item.episode.id">
            <div class="inline-between">
              <h4>第 {{ item.episode.orderIndex }} 集 · {{ item.episode.title }}</h4>
              <span class="muted">{{ item.workflow.status }}</span>
            </div>
            <p class="muted">分镜 {{ item.storyboardCount }} · 最近审计 {{ item.lastAuditAt || '无' }}</p>
            <div class="actions">
              <button @click="goEpisodeDelivery(item.episode.id)">交付详情</button>
            </div>
          </article>
        </div>
        <p v-if="filteredEpisodes.length === 0" class="muted">当前筛选无结果</p>
      </section>

      <template #inspector>
        <section class="panel">
          <h3>筛选</h3>
          <div class="actions">
            <label>
              状态
              <select v-model="statusFilter">
                <option value="all">all</option>
                <option value="draft">draft</option>
                <option value="in_review">in_review</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
              </select>
            </label>
            <label>
              搜索
              <input v-model="queryText" placeholder="分集标题/ID" />
            </label>
          </div>
        </section>
      </template>
    </DesktopWorkbenchShell>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
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

type StatusFilter = 'all' | 'draft' | 'in_review' | 'approved' | 'rejected';

const project = ref<Project | null>(null);
const workflow = ref<ProjectWorkflowSummary | null>(null);
const episodes = ref<WorkflowEpisodeListItem[]>([]);
const statusFilter = ref<StatusFilter>('all');
const queryText = ref('');
const selectedEpisodeId = ref('');
const lastAction = ref('');
const lastActionAt = ref('');
const shareTip = ref('');
const error = ref('');
const {
  restoreTip: routeRestoredTip,
  markRestored: markRouteRestored
} = useRouteRestoreContext();

const pendingCount = computed(() =>
  episodes.value.filter((item) => item.workflow.status === 'draft' || item.workflow.status === 'in_review' || item.workflow.status === 'rejected').length
);

const filteredEpisodes = computed(() => {
  const q = queryText.value.trim().toLowerCase();
  return episodes.value.filter((item) => {
    if (statusFilter.value !== 'all' && item.workflow.status !== statusFilter.value) {
      return false;
    }
    if (!q) {
      return true;
    }
    return item.episode.title.toLowerCase().includes(q) || item.episode.id.toLowerCase().includes(q);
  });
});

const selectedEpisodeTitle = computed(() => {
  if (!selectedEpisodeId.value) {
    return '';
  }
  const item = episodes.value.find((entry) => entry.episode.id === selectedEpisodeId.value);
  return item ? `第 ${item.episode.orderIndex} 集 · ${item.episode.title}` : selectedEpisodeId.value;
});

const lastActionLabel = computed(() => (lastAction.value === 'open_delivery' ? '打开交付详情' : lastAction.value));
const deliveryBlocker = computed(() => {
  const done = workflow.value?.counts.videoMergeDone ?? 0;
  if (done <= 0) {
    return '至少需要 1 条合成任务完成后才能进入交付';
  }
  return '';
});

const managedQueryKeys = ['status', 'q', 'selectedEpisodeId', 'lastAction', 'lastActionAt', 'lastActionEpisodeId'] as const;

const restoreFromQuery = (): void => {
  const query = toSingleQuery(route.query);
  const queryStatus = query.status || '';
  if (queryStatus === 'draft' || queryStatus === 'in_review' || queryStatus === 'approved' || queryStatus === 'rejected' || queryStatus === 'all') {
    statusFilter.value = queryStatus;
  }
  queryText.value = query.q || '';
  selectedEpisodeId.value = query.selectedEpisodeId || '';
  lastAction.value = query.lastAction || '';
  lastActionAt.value = query.lastActionAt || '';
  const lastActionEpisodeId = query.lastActionEpisodeId || '';
  if (lastActionEpisodeId && !selectedEpisodeId.value) {
    selectedEpisodeId.value = lastActionEpisodeId;
  }
  if (queryText.value || selectedEpisodeId.value || lastAction.value || lastActionAt.value || statusFilter.value !== 'all') {
    markRouteRestored(buildRouteRestoreTip('scope_filter'));
  }
};

const syncQuery = async (): Promise<void> => {
  const nextQuery = toSingleQuery(route.query);

  const payload: Record<string, string | undefined> = {
    status: statusFilter.value,
    q: queryText.value || undefined,
    selectedEpisodeId: selectedEpisodeId.value || undefined,
    lastAction: lastAction.value || undefined,
    lastActionAt: lastActionAt.value || undefined,
    lastActionEpisodeId: lastAction.value ? selectedEpisodeId.value || undefined : undefined
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

const goProducerHome = (): void => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/producer`, `/dramas/${dramaId.value}/producer`),
    query: buildQuery()
  });
};

const goPlanning = (): void => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/producer/planning`, `/dramas/${dramaId.value}/producer/planning`),
    query: buildQuery()
  });
};

const goDeliveryWorkbench = (): void => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/delivery`, `/dramas/${dramaId.value}/delivery`),
    query: buildQuery()
  });
};

const goWorkflow = (): void => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/workflow`, `/dramas/${dramaId.value}/workflow`),
    query: buildQuery()
  });
};

const goTasks = (): void => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/tasks`, `/dramas/${dramaId.value}/tasks`),
    query: buildQuery()
  });
};

const goEpisodeDelivery = async (episodeId: string): Promise<void> => {
  selectedEpisodeId.value = episodeId;
  await markAction('open_delivery');
  await router.push({
    path: buildPath(`/projects/${projectId.value}/delivery`, `/dramas/${dramaId.value}/delivery`),
    query: buildQuery({ episodeId })
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

watch(
  () => [statusFilter.value, queryText.value, selectedEpisodeId.value, lastAction.value, lastActionAt.value],
  () => {
    void syncQuery();
  }
);

onMounted(() => {
  restoreFromQuery();
  void refresh();
});
</script>

<style scoped>
.producer-delivery-shell {
  --rail-width: 340px;
  --inspector-width: 320px;
}

.producer-delivery-hero {
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
