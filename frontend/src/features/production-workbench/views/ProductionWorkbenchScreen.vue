<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="production-workbench-shell" compact>
      <template #rail>
        <section class="panel production-hero-panel">
          <div class="inline-between">
            <div>
              <h2>Production Workbench</h2>
              <p class="muted">{{ project?.name || '加载中...' }} · 角色驱动生产台</p>
            </div>
            <div class="actions">
              <button @click="goProject">返回项目</button>
              <button @click="loadAll">刷新</button>
            </div>
          </div>
          <RouteRestoreHint :text="routeRestoredTip" />
          <p v-if="error" class="error">{{ error }}</p>
        </section>

        <section class="panel compact-panel" v-if="workflow">
          <h3>生产总览</h3>
          <div class="summary-grid">
            <article class="card">
              <p class="muted">当前阶段</p>
              <h4>{{ workflow.stage.current }}</h4>
            </article>
            <article class="card">
              <p class="muted">进度</p>
              <h4>{{ workflow.stage.progressPercent }}%</h4>
            </article>
            <article class="card">
              <p class="muted">分集总数</p>
              <h4>{{ episodes.length }}</h4>
            </article>
            <article class="card">
              <p class="muted">待处理</p>
              <h4>{{ pendingCount }}</h4>
            </article>
            <article class="card">
              <p class="muted">实体冲突</p>
              <h4>{{ domainConflictCount }}</h4>
            </article>
          </div>
        </section>
      </template>

      <section class="panel">
        <div class="inline-between">
          <h3>角色工序台</h3>
          <p class="muted">按职能切换创作、审核、资产、后期、交付</p>
        </div>
        <div class="lane-grid">
          <article
            class="lane-card"
            :class="{ 'route-focus': focusedLaneId === lane.id }"
            :id="`production-lane-${lane.id}`"
            v-for="lane in roleLanes"
            :key="lane.id">
            <div class="inline-between">
              <h4>{{ lane.title }}</h4>
              <span class="tag">{{ lane.badge }}</span>
            </div>
            <p class="muted">{{ lane.desc }}</p>
            <ul>
              <li class="muted" v-for="item in lane.checks" :key="`${lane.id}-${item}`">{{ item }}</li>
            </ul>
            <div class="actions">
              <button class="primary" @click="goLane(lane.id)">{{ lane.cta }}</button>
            </div>
          </article>
        </div>
      </section>

      <template #inspector>
        <section class="panel compact-panel">
          <h3>工序 Inspector</h3>
          <div v-if="focusedLane" class="card">
            <div class="inline-between">
              <strong>{{ focusedLane.title }}</strong>
              <span class="tag">{{ focusedLane.badge }}</span>
            </div>
            <p class="muted">{{ focusedLane.desc }}</p>
            <ul>
              <li class="muted" v-for="item in focusedLane.checks" :key="`active-${item}`">{{ item }}</li>
            </ul>
            <div class="actions">
              <button class="primary" @click="goLane(focusedLane.id)">{{ focusedLane.cta }}</button>
            </div>
          </div>
          <div v-else class="card">
            <p class="muted">从中间工序台选择一条工序，右侧会显示更聚焦的检视内容。</p>
          </div>
        </section>

        <section class="panel compact-panel">
          <h3>分集状态</h3>
          <div class="episode-status-list">
            <article class="card" v-for="item in episodes.slice(0, 8)" :key="item.episode.id">
              <div class="inline-between">
                <strong>第 {{ item.episode.orderIndex }} 集</strong>
                <span class="tag">{{ item.workflow.status }}</span>
              </div>
              <p class="muted">{{ item.episode.title }}</p>
            </article>
          </div>
        </section>
      </template>
    </DesktopWorkbenchShell>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import DesktopWorkbenchShell from '@/components/DesktopWorkbenchShell.vue';
import RouteRestoreHint from '@/components/RouteRestoreHint.vue';
import { clearToken } from '@/api/client';
import { getDomainEntityConflicts } from '@/api/domain-governance';
import { getProjectWorkflow } from '@/api/projects';
import { getDramaWorkflowEpisodes, getDramaWorkflowSummary, getProjectWorkflowEpisodes } from '@/api/project-workflow';
import { getProject } from '@/api/timeline-editor';
import { toSingleQuery, useRouteRestoreContext } from '@/composables/useRouteRestoreContext';
import { buildDramaScopedPath, buildDramaScopedQuery, resolveProjectIdFromRouteContext } from '@/utils/route-context';
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

const project = ref<Project | null>(null);
const workflow = ref<ProjectWorkflowSummary | null>(null);
const episodes = ref<WorkflowEpisodeListItem[]>([]);
const domainConflictCount = ref(0);
const focusedLaneId = ref('');
const error = ref('');
const {
  restoreTip: routeRestoredTip,
  markRestored: markRouteRestored,
  runRestoreScroll: runRouteRestoreScroll
} = useRouteRestoreContext();

const pendingCount = computed(() => episodes.value.filter((item) => item.workflow.status !== 'approved').length);

const roleLanes = computed(() => {
  const counts = workflow.value?.counts;
  return [
    {
      id: 'writer',
      title: '编剧 / 分镜',
      desc: '剧本到镜头结构化与提示词生成',
      badge: `script ${counts?.script ?? 0} / storyboard ${counts?.storyboard ?? 0}`,
      checks: [`剧本：${counts?.script ?? 0}`, `分镜：${counts?.storyboard ?? 0}`],
      cta: '进入分镜工作台'
    },
    {
      id: 'director',
      title: '导演 / 审核流',
      desc: '分集流转、批量审批、冲突处理',
      badge: `${pendingCount.value} 待处理`,
      checks: [`待处理分集：${pendingCount.value}`, `已通过分集：${episodes.value.length - pendingCount.value}`],
      cta: '进入流程工作台'
    },
    {
      id: 'asset',
      title: '资产导演',
      desc: '角色/场景/道具实体治理与投放',
      badge: `asset ${counts?.asset ?? 0}`,
      checks: [`资产数量：${counts?.asset ?? 0}`, `可追溯实体关系：已启用`],
      cta: '进入资产工作台'
    },
    {
      id: 'post',
      title: '后期 / 时间线',
      desc: '多轨编排、关键帧、效果链与合成',
      badge: `merge ${counts?.videoMergeDone ?? 0}/${counts?.videoMerge ?? 0}`,
      checks: [`视频任务完成：${counts?.videoTaskDone ?? 0}/${counts?.videoTask ?? 0}`, `合成完成：${counts?.videoMergeDone ?? 0}/${counts?.videoMerge ?? 0}`],
      cta: '进入时间线编辑'
    },
    {
      id: 'delivery',
      title: '交付 / 运营',
      desc: '版本对比、交付包导出、验签校验',
      badge: `delivery`,
      checks: ['交付包 ZIP：支持', '签名校验：支持'],
      cta: '进入交付工作台'
    }
  ];
});
const focusedLane = computed(() => roleLanes.value.find((lane) => lane.id === focusedLaneId.value) ?? null);

const buildPath = (projectPath: string, dramaPath: string): string =>
  buildDramaScopedPath({ dramaId: dramaId.value, projectPath, dramaPath });
const buildQuery = (extra?: Record<string, string | undefined>): Record<string, string> =>
  buildDramaScopedQuery(dramaId.value, extra);

const logout = (): void => {
  clearToken();
  void router.replace('/login');
};

const goProject = (): void => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}`, `/dramas/${dramaId.value}`),
    query: buildQuery()
  });
};

const goLane = (lane: string): void => {
  const query = buildQuery({ lane });
  if (lane === 'writer') {
    void router.push({
      path: buildPath(`/projects/${projectId.value}/storyboard-workbench`, `/dramas/${dramaId.value}/storyboard-workbench`),
      query
    });
    return;
  }
  if (lane === 'director') {
    void router.push({
      path: buildPath(`/projects/${projectId.value}/director/planning`, `/dramas/${dramaId.value}/director/planning`),
      query
    });
    return;
  }
  if (lane === 'asset') {
    void router.push({
      path: buildPath(`/projects/${projectId.value}/asset-workbench`, `/dramas/${dramaId.value}/asset-workbench`),
      query
    });
    return;
  }
  if (lane === 'post') {
    void router.push({
      path: buildPath(`/projects/${projectId.value}/director/execution`, `/dramas/${dramaId.value}/director/execution`),
      query
    });
    return;
  }
  void router.push({
    path: buildPath(`/projects/${projectId.value}/producer/delivery`, `/dramas/${dramaId.value}/producer/delivery`),
    query
  });
};

const applyRouteLaneScope = (): void => {
  const lane = toSingleQuery(route.query).lane;
  if (lane !== 'writer' && lane !== 'director' && lane !== 'asset' && lane !== 'post' && lane !== 'delivery') {
    focusedLaneId.value = '';
    return;
  }
  focusedLaneId.value = lane;
  markRouteRestored('已从分享链接恢复工序定位', `production-lane-${lane}`);
};

const loadAll = async (): Promise<void> => {
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
    const [projectData, workflowData, episodesData, conflicts] = await Promise.all([
      getProject(projectId.value),
      dramaId.value ? getDramaWorkflowSummary(dramaId.value) : getProjectWorkflow(projectId.value),
      dramaId.value ? getDramaWorkflowEpisodes(dramaId.value, { page: 1, pageSize: 200 }) : getProjectWorkflowEpisodes(projectId.value, { page: 1, pageSize: 200 }),
      getDomainEntityConflicts(projectId.value).catch(() => ({ byName: [], byPromptFingerprint: [] }))
    ]);
    project.value = projectData;
    workflow.value = workflowData;
    episodes.value = episodesData.items;
    domainConflictCount.value = conflicts.byName.length + conflicts.byPromptFingerprint.length;
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  }
};

onMounted(() => {
  void loadAll().then(() => {
    applyRouteLaneScope();
    runRouteRestoreScroll();
  });
});
</script>

<style scoped>
.production-workbench-shell {
  --rail-width: 320px;
  --inspector-width: 340px;
}

.production-hero-panel {
  background: var(--surface-spotlight);
}

.summary-grid,
.lane-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.episode-status-list {
  display: grid;
  gap: 12px;
}

.lane-card {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
  background: var(--surface-spotlight);
}

.route-focus {
  border-color: var(--brand);
  box-shadow: var(--selection-ring);
}

.tag {
  border: 1px solid var(--status-neutral-border);
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 12px;
  background: var(--status-neutral-bg);
  color: var(--status-neutral-ink);
}
</style>
