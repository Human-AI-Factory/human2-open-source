<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="producer-planning-shell" compact>
      <template #rail>
        <section class="panel producer-planning-hero">
          <div class="inline-between">
            <div>
              <p class="eyebrow">Producer Planning</p>
              <h2>制片 · 计划面板</h2>
              <p class="muted">{{ project?.name || '加载中...' }} · 批处理预估与冲突导出</p>
            </div>
            <div class="actions">
              <button @click="goProducerHome">制片首页</button>
              <button @click="goDelivery">交付面板</button>
              <button @click="refresh">刷新</button>
            </div>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
        </section>

        <section v-if="precheckSummary" class="panel precheck-sticky">
          <div class="inline-between">
            <h3>预检摘要（可分享）</h3>
            <div class="actions">
              <button @click="copyShareLink">复制当前链接</button>
            </div>
          </div>
          <p class="muted">
            episodes={{ precheckSummary.totalEpisodes }} · storyboards={{ precheckSummary.totalStoryboards }} · creatable={{
              precheckSummary.totalCreatable
            }} · conflicts={{ precheckSummary.totalConflicts }}
          </p>
          <p class="muted">更新时间：{{ precheckAt || '-' }}<span v-if="shareTip"> · {{ shareTip }}</span></p>
          <RouteRestoreHint :text="routeRestoredTip" />
        </section>
      </template>

      <section class="panel">
        <h3>批量任务预估与冲突导出</h3>
        <div class="actions">
          <label class="check-inline">
            <input :checked="isAllEpisodesChecked" type="checkbox" @change="toggleAllEpisodes($event)" />
            全选分集
          </label>
          <button :disabled="checkedEpisodeIds.length === 0" @click="runBatchPrecheck">执行预检查</button>
          <button :disabled="!precheckSummary" @click="exportPrecheckCsv">导出 CSV</button>
          <button v-if="recommendedActionLabel" @click="goRecommendedAction">推荐下一步：{{ recommendedActionLabel }}</button>
        </div>
        <p class="muted" v-if="workflowStageSummary">状态机：{{ workflowStageSummary }}</p>
        <div class="list compact-list">
          <article class="card" v-for="item in episodes" :key="`producer-ep-check-${item.episode.id}`">
            <label class="check-inline">
              <input :checked="checkedEpisodeIds.includes(item.episode.id)" type="checkbox" @change="toggleEpisode(item.episode.id, $event)" />
              第 {{ item.episode.orderIndex }} 集 · {{ item.episode.title }} · {{ item.workflow.status }}
            </label>
          </article>
        </div>
      </section>

      <template #inspector>
        <section class="panel">
          <h3>预检结果</h3>
          <p class="muted" v-if="precheckSummary">
            汇总: episodes={{ precheckSummary.totalEpisodes }} · storyboards={{ precheckSummary.totalStoryboards }} · creatable={{
              precheckSummary.totalCreatable
            }} · conflicts={{ precheckSummary.totalConflicts }}
          </p>
          <p class="muted" v-else>还没有运行预检查</p>
          <div class="list compact-list" v-if="precheckRows.length > 0">
            <article class="card" v-for="row in precheckRows" :key="`producer-precheck-${row.episodeId}`">
              <h4>{{ row.episodeTitle || row.episodeId }}</h4>
              <p class="muted">
                assets_conflicts={{ row.assetConflicts }} / video_conflicts={{ row.videoConflicts }} / total_conflicts={{ row.totalConflicts }}
              </p>
            </article>
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
import { precheckDramaEpisodesAssetsBatch, precheckDramaEpisodesVideoTasksBatch, precheckEpisodesAssetsBatch, precheckEpisodesVideoTasksBatch } from '@/api/production-precheck';
import { getProjectWorkflow } from '@/api/projects';
import { getDramaWorkflowEpisodes, getDramaWorkflowSummary, getProjectWorkflowEpisodes } from '@/api/project-workflow';
import { buildDramaScopedPath, buildDramaScopedQuery, resolveProjectIdFromRouteContext } from '@/utils/route-context';
import { getProject } from '@/api/timeline-editor';
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
const checkedEpisodeIds = ref<string[]>([]);
const precheckSummary = ref<{
  totalEpisodes: number;
  totalStoryboards: number;
  totalCreatable: number;
  totalConflicts: number;
} | null>(null);
const precheckRows = ref<Array<{ episodeId: string; episodeTitle: string; assetConflicts: number; videoConflicts: number; totalConflicts: number }>>(
  []
);
const precheckAt = ref('');
const shareTip = ref('');
const error = ref('');
const {
  restoreTip: routeRestoredTip,
  markRestored: markRouteRestored
} = useRouteRestoreContext();
const isAllEpisodesChecked = computed(
  () => episodes.value.length > 0 && checkedEpisodeIds.value.length === episodes.value.length
);
const workflowStageSummary = computed(() =>
  workflow.value ? `${workflow.value.stage.current} · next=${workflow.value.stage.nextAction} · ${workflow.value.stage.progressPercent}%` : ''
);
const recommendedActionLabel = computed(() => {
  const current = workflow.value?.stage.current;
  if (!current) {
    return '';
  }
  if (current === 'writing' || current === 'storyboard') {
    return '分镜';
  }
  if (current === 'asset') {
    return '资产';
  }
  if (current === 'video') {
    return '流程';
  }
  if (current === 'merge') {
    return '时间线';
  }
  if (current === 'done') {
    return '交付';
  }
  return '';
});

const managedQueryKeys = [
  'checkedEpisodeIds',
  'precheckTotalEpisodes',
  'precheckTotalStoryboards',
  'precheckTotalCreatable',
  'precheckTotalConflicts',
  'precheckAt'
] as const;

const toInt = (value: unknown): number | null => {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const restoreFromQuery = (): void => {
  const query = toSingleQuery(route.query);
  checkedEpisodeIds.value = query.checkedEpisodeIds ? query.checkedEpisodeIds.split(',').filter(Boolean) : [];

  const totalEpisodes = toInt(query.precheckTotalEpisodes);
  const totalStoryboards = toInt(query.precheckTotalStoryboards);
  const totalCreatable = toInt(query.precheckTotalCreatable);
  const totalConflicts = toInt(query.precheckTotalConflicts);
  if (totalEpisodes !== null && totalStoryboards !== null && totalCreatable !== null && totalConflicts !== null) {
    precheckSummary.value = {
      totalEpisodes,
      totalStoryboards,
      totalCreatable,
      totalConflicts
    };
  }
  precheckAt.value = query.precheckAt || '';
  if (checkedEpisodeIds.value.length > 0 || precheckAt.value || precheckSummary.value) {
    markRouteRestored(buildRouteRestoreTip('scope_filter'));
  }
};

const syncQuery = async (): Promise<void> => {
  const nextQuery = toSingleQuery(route.query);
  const payload: Record<string, string | undefined> = {
    checkedEpisodeIds: checkedEpisodeIds.value.length > 0 ? checkedEpisodeIds.value.join(',') : undefined,
    precheckTotalEpisodes: precheckSummary.value ? String(precheckSummary.value.totalEpisodes) : undefined,
    precheckTotalStoryboards: precheckSummary.value ? String(precheckSummary.value.totalStoryboards) : undefined,
    precheckTotalCreatable: precheckSummary.value ? String(precheckSummary.value.totalCreatable) : undefined,
    precheckTotalConflicts: precheckSummary.value ? String(precheckSummary.value.totalConflicts) : undefined,
    precheckAt: precheckAt.value || undefined
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
    if (checkedEpisodeIds.value.length === 0 && episodes.value.length > 0) {
      checkedEpisodeIds.value = episodes.value.map((item) => item.episode.id);
    } else {
      const existing = new Set(episodes.value.map((item) => item.episode.id));
      checkedEpisodeIds.value = checkedEpisodeIds.value.filter((id) => existing.has(id));
    }
    error.value = '';
    await syncQuery();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  }
};

const toggleEpisode = (episodeId: string, event: Event): void => {
  const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
  if (checked) {
    checkedEpisodeIds.value = [...new Set([...checkedEpisodeIds.value, episodeId])];
    return;
  }
  checkedEpisodeIds.value = checkedEpisodeIds.value.filter((id) => id !== episodeId);
};

const toggleAllEpisodes = (event: Event): void => {
  const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
  checkedEpisodeIds.value = checked ? episodes.value.map((item) => item.episode.id) : [];
};

const runBatchPrecheck = async (): Promise<void> => {
  if (checkedEpisodeIds.value.length === 0) {
    error.value = '请先选择分集';
    return;
  }
  const [assetCheck, videoCheck] = await Promise.all([
    dramaId.value
      ? precheckDramaEpisodesAssetsBatch(dramaId.value, { episodeIds: checkedEpisodeIds.value })
      : precheckEpisodesAssetsBatch(projectId.value, { episodeIds: checkedEpisodeIds.value }),
    dramaId.value
      ? precheckDramaEpisodesVideoTasksBatch(dramaId.value, { episodeIds: checkedEpisodeIds.value })
      : precheckEpisodesVideoTasksBatch(projectId.value, { episodeIds: checkedEpisodeIds.value })
  ]);
  precheckSummary.value = {
    totalEpisodes: Math.max(assetCheck.summary.totalEpisodes, videoCheck.summary.totalEpisodes),
    totalStoryboards: Math.max(assetCheck.summary.totalStoryboards, videoCheck.summary.totalStoryboards),
    totalCreatable: assetCheck.summary.totalCreatable + videoCheck.summary.totalCreatable,
    totalConflicts: assetCheck.summary.totalConflicts + videoCheck.summary.totalConflicts
  };
  precheckAt.value = new Date().toISOString();
  const assetByEpisode = new Map(assetCheck.episodes.map((item) => [item.episodeId, item]));
  const videoByEpisode = new Map(videoCheck.episodes.map((item) => [item.episodeId, item]));
  precheckRows.value = checkedEpisodeIds.value.map((episodeId) => {
    const episodeTitle = episodes.value.find((ep) => ep.episode.id === episodeId)?.episode.title || episodeId;
    const assetConflicts = assetByEpisode.get(episodeId)?.conflictStoryboardIds.length ?? 0;
    const videoConflicts = videoByEpisode.get(episodeId)?.conflictStoryboardIds.length ?? 0;
    return {
      episodeId,
      episodeTitle,
      assetConflicts,
      videoConflicts,
      totalConflicts: assetConflicts + videoConflicts
    };
  });
  await syncQuery();
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

const exportPrecheckCsv = (): void => {
  if (!precheckSummary.value) {
    return;
  }
  const header = ['episode_id', 'episode_title', 'asset_conflicts', 'video_conflicts', 'total_conflicts'];
  const rows = precheckRows.value.map((row) =>
    [row.episodeId, row.episodeTitle, String(row.assetConflicts), String(row.videoConflicts), String(row.totalConflicts)]
      .map((cell) => (cell.includes(',') ? `"${cell.replace(/"/g, '""')}"` : cell))
      .join(',')
  );
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `producer-precheck-${projectId.value}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const goProducerHome = (): void => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/producer`, `/dramas/${dramaId.value}/producer`),
    query: buildQuery()
  });
};

const goDelivery = (): void => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/producer/delivery`, `/dramas/${dramaId.value}/producer/delivery`),
    query: buildQuery()
  });
};

const goRecommendedAction = (): void => {
  const current = workflow.value?.stage.current;
  const query = buildQuery();
  if (!current) {
    return;
  }
  if (current === 'writing' || current === 'storyboard') {
    void router.push({
      path: buildPath(`/projects/${projectId.value}/storyboard-workbench`, `/dramas/${dramaId.value}/storyboard-workbench`),
      query
    });
    return;
  }
  if (current === 'asset') {
    void router.push({
      path: buildPath(`/projects/${projectId.value}/asset-workbench`, `/dramas/${dramaId.value}/asset-workbench`),
      query
    });
    return;
  }
  if (current === 'video') {
    void router.push({
      path: buildPath(`/projects/${projectId.value}/workflow`, `/dramas/${dramaId.value}/workflow`),
      query
    });
    return;
  }
  if (current === 'merge') {
    void router.push({
      path: buildPath(`/projects/${projectId.value}/timeline`, `/dramas/${dramaId.value}/timeline`),
      query
    });
    return;
  }
  void router.push({
    path: buildPath(`/projects/${projectId.value}/delivery`, `/dramas/${dramaId.value}/delivery`),
    query
  });
};

const logout = (): void => {
  clearToken();
  void router.replace('/login');
};

watch(
  () => [checkedEpisodeIds.value.join(','), precheckAt.value],
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
.producer-planning-shell {
  --rail-width: 340px;
  --inspector-width: 360px;
}

.producer-planning-hero {
  border: 1px solid var(--status-info-border);
  background: var(--surface-spotlight-angled);
}

.precheck-sticky {
  position: sticky;
  top: 12px;
  z-index: 3;
  border: 1px solid var(--status-info-border);
  background: var(--surface-highlight);
}

</style>
