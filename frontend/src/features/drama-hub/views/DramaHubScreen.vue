<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="drama-hub-shell" compact>
      <template #rail>
        <section class="panel drama-hub-hero">
          <div class="inline-between">
            <div>
              <p class="muted">Drama-first Hub</p>
              <h2>剧集生产入口</h2>
              <p class="muted">以 Drama / Episode 组织项目，按角色进入分镜、资产、流程与交付。</p>
            </div>
            <div class="actions">
              <button class="primary" @click="goTaskCenter">任务中心</button>
              <button class="primary" @click="goSettings">设置中心</button>
              <button @click="goProjectList">项目列表</button>
            </div>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
        </section>

        <section class="panel compact-panel">
          <h2>新建 Drama 项目</h2>
          <form class="form" @submit.prevent="createNewDramaProject">
            <input v-model="name" placeholder="项目名称" />
            <input v-model="dramaName" placeholder="Drama 名称（可选，不填则同项目名）" />
            <textarea v-model="description" placeholder="项目描述（可选）" rows="3" />
            <button class="primary" type="submit" :disabled="loading">{{ loading ? '提交中...' : '创建并进入剧集台' }}</button>
          </form>
        </section>
      </template>

      <section class="panel">
        <div class="inline-between">
          <h2>Drama 列表</h2>
          <button class="primary" @click="loadAll">刷新</button>
        </div>
        <div class="actions">
          <input v-model="keyword" placeholder="搜索 Drama / 项目名" />
          <button class="primary" @click="loadAll">搜索</button>
        </div>
        <p v-if="entries.length === 0" class="muted">暂无 Drama 项目</p>
        <div class="list">
          <article class="card" v-for="entry in filteredEntries" :key="entry.project.id">
            <div>
              <h3>{{ entry.dramaName }}</h3>
              <p class="muted">{{ entry.dramaDescription || entry.project.description || '无描述' }}</p>
              <p class="muted">
                Episodes {{ entry.episodeCount }}
                · published {{ entry.publishedCount }}
                · workflow pending {{ entry.pendingCount }}
              </p>
              <p class="muted">
                阶段 {{ stageLabel(entry.workflow?.stage.current) }}
                · 进度 {{ entry.workflow?.stage.progressPercent ?? 0 }}%
              </p>
            </div>
            <div class="actions">
              <button class="primary" @click="goEpisodeStudio(entry.dramaId)">剧集工作台</button>
              <button @click="goDramaTaskCenter(entry.dramaId)">该 Drama 任务</button>
              <button @click="goProduction(entry.project.id, entry.dramaId)">生产总台</button>
              <button @click="goProject(entry.project.id, entry.dramaId)">项目详情</button>
            </div>
          </article>
        </div>
      </section>

      <template #inspector>
        <section class="panel compact-panel">
          <h3>全局概览</h3>
          <div class="stats-grid">
            <article class="card" v-for="item in statItems" :key="item.label">
              <p class="muted">{{ item.label }}</p>
              <h2>{{ item.value }}</h2>
            </article>
          </div>
        </section>

        <section class="panel compact-panel">
          <h3>当前筛选</h3>
          <div class="card">
            <p class="muted">关键词</p>
            <strong>{{ keyword || '全部 Drama' }}</strong>
          </div>
          <div class="card">
            <p class="muted">命中结果</p>
            <strong>{{ filteredEntries.length }} / {{ entries.length }}</strong>
          </div>
        </section>
      </template>
    </DesktopWorkbenchShell>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import DesktopWorkbenchShell from '@/components/DesktopWorkbenchShell.vue';
import { clearToken } from '@/api/client';
import { getDramas, getEpisodeDomainsByDrama, upsertDramaDomain } from '@/api/domain-context';
import { createProject, getProjectWorkflows, getSummary } from '@/api/projects';
import { getProject } from '@/api/timeline-editor';
import type { Project, ProjectWorkflowSummary, Summary } from '@/types/models';
import { toErrorMessage } from '@/utils/errors';
import { buildDramaFallbackMessage, resolveDramaIdForNavigation } from '@/utils/route-context';

type DramaHubEntry = {
  dramaId: string;
  project: Project;
  dramaName: string;
  dramaDescription: string;
  episodeCount: number;
  publishedCount: number;
  pendingCount: number;
  workflow: ProjectWorkflowSummary | null;
};

const router = useRouter();
const loading = ref(false);
const error = ref('');
const summary = ref<Summary>({ projectCount: 0, taskCount: 0, doneCount: 0, doingCount: 0 });
const entries = ref<DramaHubEntry[]>([]);
const keyword = ref('');

const name = ref('');
const dramaName = ref('');
const description = ref('');

const statItems = computed(() => [
  { label: '项目总数', value: summary.value.projectCount },
  { label: '任务总数', value: summary.value.taskCount },
  { label: '进行中任务', value: summary.value.doingCount },
  { label: '已完成任务', value: summary.value.doneCount }
]);

const filteredEntries = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  if (!q) {
    return entries.value;
  }
  return entries.value.filter((item) => {
    const hay = `${item.dramaName} ${item.project.name} ${item.dramaDescription}`.toLowerCase();
    return hay.includes(q);
  });
});

const stageLabel = (stage: ProjectWorkflowSummary['stage']['current'] | undefined): string => {
  switch (stage) {
    case 'writing':
      return '创作';
    case 'storyboard':
      return '分镜';
    case 'asset':
      return '资产';
    case 'video':
      return '视频';
    case 'merge':
      return '合成';
    case 'done':
      return '完成';
    default:
      return '-';
  }
};

const loadAll = async (): Promise<void> => {
  try {
    const [dramas, dashboard] = await Promise.all([getDramas(), getSummary()]);
    summary.value = dashboard;
    const projectIds = dramas.map((item) => item.projectId);
    const workflows = projectIds.length > 0 ? await getProjectWorkflows(projectIds) : [];
    const workflowMap = new Map(workflows.map((item) => [item.projectId, item]));
    const nextEntries = await Promise.all(
      dramas.map(async (drama) => {
        const [project, episodes] = await Promise.all([getProject(drama.projectId), getEpisodeDomainsByDrama(drama.id).catch(() => [])]);
        const pendingCount = episodes.filter((item) => item.status !== 'published').length;
        return {
          dramaId: drama.id,
          project,
          dramaName: drama.name || project.name,
          dramaDescription: drama.description || '',
          episodeCount: episodes.length,
          publishedCount: episodes.filter((item) => item.status === 'published').length,
          pendingCount,
          workflow: workflowMap.get(drama.projectId) || null
        } satisfies DramaHubEntry;
      })
    );
    entries.value = nextEntries;
    error.value = '';
  } catch (err) {
    error.value = toErrorMessage(err, '加载 Drama Hub 失败');
  }
};

const createNewDramaProject = async (): Promise<void> => {
  if (!name.value.trim()) {
    error.value = '项目名称不能为空';
    return;
  }
  loading.value = true;
  try {
    const nextProjectName = name.value.trim();
    const nextDramaName = dramaName.value.trim() || nextProjectName;
    const nextDescription = description.value.trim() || undefined;
    const project = await createProject({
      name: nextProjectName,
      description: nextDescription
    });
    const seedDrama = await upsertDramaDomain(project.id, {
      name: nextDramaName,
      description: nextDescription
    }).catch(() => null);
    name.value = '';
    dramaName.value = '';
    description.value = '';
    const resolvedDrama = await resolveDramaIdForNavigation({
      preferredDramaId: seedDrama?.id || '',
      projectId: project.id,
      fallbackName: nextDramaName,
      fallbackDescription: nextDescription
    });
    const resolvedDramaId = resolvedDrama || '';
    if (resolvedDramaId) {
      error.value = '';
      await router.push(`/dramas/${resolvedDramaId}/episodes`);
      return;
    }
    await navigateProjectFallback(`/projects/${project.id}/episodes`, '未能创建 Drama 域对象，已回退到项目分集入口');
  } catch (err) {
    error.value = toErrorMessage(err, '创建 Drama 项目失败');
  } finally {
    loading.value = false;
  }
};

const goEpisodeStudio = async (dramaId: string): Promise<void> => {
  error.value = '';
  await router.push(`/dramas/${dramaId}/episodes`);
};

const goDramaTaskCenter = async (dramaId: string): Promise<void> => {
  error.value = '';
  await router.push(`/dramas/${dramaId}/tasks`);
};

const resolveDramaIdForEntry = async (projectId: string, dramaId?: string): Promise<string> => {
  const entry = entries.value.find((item) => item.project.id === projectId);
  return resolveDramaIdForNavigation({
    preferredDramaId: dramaId || '',
    projectId,
    fallbackName: entry?.dramaName || entry?.project.name,
    fallbackDescription: entry?.dramaDescription || entry?.project.description
  });
};

const navigateProjectFallback = async (path: string, message: string): Promise<void> => {
  error.value = message;
  await router.push(path);
};

const goProduction = async (projectId: string, dramaId?: string): Promise<void> => {
  try {
    const resolvedDramaId = await resolveDramaIdForEntry(projectId, dramaId);
    if (resolvedDramaId) {
      error.value = '';
      await router.push(`/dramas/${resolvedDramaId}/production`);
      return;
    }
    await navigateProjectFallback(`/projects/${projectId}/production`, buildDramaFallbackMessage('已回退到项目入口'));
    return;
  } catch (err) {
    await navigateProjectFallback(`/projects/${projectId}/production`, buildDramaFallbackMessage('已回退到项目入口', err));
    return;
  }
};

const goProject = async (projectId: string, dramaId?: string): Promise<void> => {
  try {
    const resolvedDramaId = await resolveDramaIdForEntry(projectId, dramaId);
    if (resolvedDramaId) {
      error.value = '';
      await router.push(`/dramas/${resolvedDramaId}`);
      return;
    }
    await navigateProjectFallback(`/projects/${projectId}`, buildDramaFallbackMessage('已回退到项目详情'));
    return;
  } catch (err) {
    await navigateProjectFallback(`/projects/${projectId}`, buildDramaFallbackMessage('已回退到项目详情', err));
    return;
  }
};

const goTaskCenter = async (): Promise<void> => {
  await router.push('/tasks');
};

const goSettings = async (): Promise<void> => {
  await router.push('/settings');
};

const goProjectList = async (): Promise<void> => {
  await router.push('/projects');
};

const logout = async (): Promise<void> => {
  clearToken();
  await router.push('/login');
};

onMounted(() => {
  void loadAll();
});
</script>

<style scoped>
.drama-hub-shell {
  --rail-width: 320px;
  --inspector-width: 300px;
}

.drama-hub-hero {
  background: linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
}

.stats-grid {
  display: grid;
  gap: 12px;
}
</style>
