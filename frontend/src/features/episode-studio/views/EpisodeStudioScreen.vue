<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="episode-studio-shell" compact>
      <template #rail>
        <section class="panel">
          <div class="inline-between">
            <div>
              <h2>{{ drama?.name || project?.name || '剧集工作台' }}</h2>
              <p class="muted">{{ drama?.description || project?.description || '无描述' }}</p>
            </div>
            <div class="actions">
              <button @click="goDramaHub">Drama Hub</button>
              <button @click="goProject">项目详情</button>
              <button class="primary" @click="loadAll">刷新</button>
            </div>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
          <p v-else-if="notice" class="muted">{{ notice }}</p>
        </section>

        <section class="panel">
          <h3>新建分集</h3>
          <p class="muted">可以手动创建，也可以按当前未绑定分集的剧本一键批量生成。</p>
          <div class="form">
            <label>
              标题
              <input v-model="newEpisodeTitle" placeholder="例如：第 1 集 开端" />
            </label>
            <label>
              序号
              <input v-model.number="newEpisodeOrderIndex" type="number" min="0" step="1" />
            </label>
          </div>
          <div class="actions">
            <button class="primary" :disabled="loading" @click="createEpisode">创建分集</button>
            <button :disabled="loading || !activeDramaId" @click="importEpisodesFromScripts">按现有剧本批量建分集</button>
          </div>
        </section>

        <section class="panel">
          <h3>概览</h3>
          <p class="muted">分集数：{{ episodeRows.length }}</p>
          <p class="muted">已挂流程：{{ workflowEpisodes.length }}</p>
          <p class="muted">当前聚焦：{{ activeEpisodeRow ? `第 ${activeEpisodeRow.episode.orderIndex} 集 · ${activeEpisodeRow.episode.title}` : '暂无' }}</p>
        </section>
      </template>

      <main>
        <section class="panel">
          <div class="inline-between">
            <h3>分集矩阵</h3>
            <p class="muted">点击分集可在右侧查看细节与快捷入口。</p>
          </div>
          <div class="list" v-if="episodeRows.length > 0">
            <article
              class="card episode-card"
              :class="{ 'episode-card--active': activeEpisodeRow?.episode.id === row.episode.id }"
              v-for="row in episodeRows"
              :key="row.episode.id"
              @click="selectEpisode(row.episode.id)">
              <div>
                <h4>第 {{ row.episode.orderIndex }} 集 · {{ row.episode.title }}</h4>
                <p class="muted">
                  发布状态 {{ row.episode.status }}
                  · 流程状态 {{ row.workflowStatus }}
                  · 分镜 {{ row.storyboardCount }}
                </p>
              </div>
              <div class="actions">
                <select v-model="episodeStatusDraft[row.episode.id]" @click.stop>
                  <option value="draft">draft</option>
                  <option value="ready">ready</option>
                  <option value="published">published</option>
                </select>
                <button :disabled="loading" @click.stop="saveEpisodeStatus(row.episode.id)">保存状态</button>
                <button class="primary" @click.stop="goEpisodeTarget(row.episode.id, 'storyboard')">分镜</button>
                <button @click.stop="goEpisodeTarget(row.episode.id, 'asset')">资产</button>
                <button @click.stop="goEpisodeTarget(row.episode.id, 'workflow')">流程</button>
                <button @click.stop="goEpisodeTarget(row.episode.id, 'timeline')">时间线</button>
                <button @click.stop="goEpisodeTarget(row.episode.id, 'delivery')">交付</button>
              </div>
            </article>
          </div>
          <p v-else class="muted">暂无分集</p>
        </section>
      </main>

      <template #inspector>
        <section class="panel">
          <h3>Episode Inspector</h3>
          <p class="muted">Drama：{{ drama?.name || '未初始化' }}</p>
          <p class="muted">Project：{{ project?.name || '未加载' }}</p>
          <template v-if="activeEpisodeRow">
            <p class="muted">当前分集：第 {{ activeEpisodeRow.episode.orderIndex }} 集 · {{ activeEpisodeRow.episode.title }}</p>
            <p class="muted">发布状态：{{ activeEpisodeRow.episode.status }}</p>
            <p class="muted">流程状态：{{ activeEpisodeRow.workflowStatus }}</p>
            <p class="muted">分镜数：{{ activeEpisodeRow.storyboardCount }}</p>
          </template>
          <p class="muted" v-else>尚未选择分集。</p>
        </section>

        <section class="panel" v-if="activeEpisodeRow">
          <h3>快捷入口</h3>
          <div class="actions column-actions">
            <button class="primary" @click="goEpisodeTarget(activeEpisodeRow.episode.id, 'storyboard')">打开分镜工作台</button>
            <button @click="goEpisodeTarget(activeEpisodeRow.episode.id, 'asset')">打开资产工作台</button>
            <button @click="goEpisodeTarget(activeEpisodeRow.episode.id, 'workflow')">打开流程工作台</button>
            <button @click="goEpisodeTarget(activeEpisodeRow.episode.id, 'timeline')">打开时间线</button>
            <button @click="goEpisodeTarget(activeEpisodeRow.episode.id, 'delivery')">打开交付</button>
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
import { clearToken } from '@/api/client';
import { toSingleQuery } from '@/composables/useRouteRestoreContext';
import {
  createEpisodeDomain,
  createEpisodeDomainByDrama,
  getDramaById,
  getDramaDomain,
  getEpisodeDomains,
  getEpisodeDomainsByDrama,
  importEpisodesFromScriptsByDrama,
  updateEpisodeDomain,
  updateEpisodeDomainByDrama,
  upsertDramaDomain
} from '@/api/domain-context';
import { getDramaWorkflowEpisodes, getProjectWorkflowEpisodes } from '@/api/project-workflow';
import { getProject } from '@/api/timeline-editor';
import type { DramaDomain, EpisodeDomain, Project, WorkflowEpisodeListItem } from '@/types/models';
import { toErrorMessage } from '@/utils/errors';
import { buildDramaFallbackMessage, resolveDramaIdForNavigation, resolveProjectIdFromRouteContext } from '@/utils/route-context';

const route = useRoute();
const router = useRouter();
const projectId = ref('');
const routeProjectId = computed(() => String(route.params.id || ''));
const routeDramaId = computed(() => String(route.params.dramaId || ''));
const queryDramaId = computed(() => {
  return toSingleQuery(route.query).dramaId || '';
});
const activeDramaId = computed(() => drama.value?.id || routeDramaId.value || queryDramaId.value);
const hasDramaScopedApi = computed(() => Boolean(activeDramaId.value));

const project = ref<Project | null>(null);
const drama = ref<DramaDomain | null>(null);
const episodes = ref<EpisodeDomain[]>([]);
const workflowEpisodes = ref<WorkflowEpisodeListItem[]>([]);
const episodeStatusDraft = ref<Record<string, EpisodeDomain['status']>>({});
const newEpisodeTitle = ref('');
const newEpisodeOrderIndex = ref(0);
const loading = ref(false);
const error = ref('');
const notice = ref('');
const WORKFLOW_PAGE_SIZE = 200;

const workflowMap = computed(() => new Map(workflowEpisodes.value.map((item) => [item.episode.id, item])));
const episodeRows = computed(() =>
  episodes.value
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title))
    .map((episode) => {
      const workflow = workflowMap.value.get(episode.id);
      return {
        episode,
        workflowStatus: workflow?.workflow.status || 'draft',
        storyboardCount: workflow?.storyboardCount || 0
      };
    })
);
const selectedEpisodeId = ref('');
const activeEpisodeRow = computed(() => {
  if (selectedEpisodeId.value) {
    const matched = episodeRows.value.find((row) => row.episode.id === selectedEpisodeId.value);
    if (matched) {
      return matched;
    }
  }
  return episodeRows.value[0] || null;
});

const loadAll = async (): Promise<void> => {
  try {
    projectId.value = await resolveProjectIdFromRouteContext({
      currentProjectId: projectId.value,
      routeProjectId: routeProjectId.value,
      routeDramaId: routeDramaId.value
    });
    if (!projectId.value) {
      error.value = '无法解析项目上下文';
      notice.value = '';
      return;
    }
    const [projectData, dramaData] = await Promise.all([
      getProject(projectId.value),
      routeDramaId.value ? getDramaById(routeDramaId.value) : getDramaDomain(projectId.value).catch(() => null)
    ]);
    project.value = projectData;
    if (dramaData) {
      drama.value = dramaData;
    } else {
      drama.value = await upsertDramaDomain(projectId.value, {
        name: projectData.name,
        description: projectData.description || ''
      });
    }
    const episodeList = await (hasDramaScopedApi.value ? getEpisodeDomainsByDrama(activeDramaId.value) : getEpisodeDomains(projectId.value));
    episodes.value = episodeList;
    if (!selectedEpisodeId.value || !episodeList.some((item) => item.id === selectedEpisodeId.value)) {
      selectedEpisodeId.value = episodeList[0]?.id || '';
    }
    episodeStatusDraft.value = Object.fromEntries(episodes.value.map((item) => [item.id, item.status]));
    if (episodes.value.length > 0) {
      newEpisodeOrderIndex.value = Math.max(...episodes.value.map((item) => item.orderIndex)) + 1;
    } else {
      newEpisodeOrderIndex.value = 0;
    }
    try {
      const workflowPage = await (hasDramaScopedApi.value
        ? getDramaWorkflowEpisodes(activeDramaId.value, { page: 1, pageSize: WORKFLOW_PAGE_SIZE })
        : getProjectWorkflowEpisodes(projectId.value, { page: 1, pageSize: WORKFLOW_PAGE_SIZE }));
      workflowEpisodes.value = workflowPage.items;
      error.value = '';
      notice.value = '';
    } catch (workflowErr) {
      workflowEpisodes.value = [];
      error.value = '';
      notice.value = toErrorMessage(workflowErr, '分集已加载，但流程统计暂时不可用');
    }
  } catch (err) {
    error.value = toErrorMessage(err, '加载分集工作台失败');
    notice.value = '';
  }
};

const createEpisode = async (): Promise<void> => {
  if (!drama.value) {
    error.value = 'Drama 未初始化';
    notice.value = '';
    return;
  }
  if (!newEpisodeTitle.value.trim()) {
    error.value = '分集标题不能为空';
    notice.value = '';
    return;
  }
  loading.value = true;
  try {
    if (hasDramaScopedApi.value) {
      await createEpisodeDomainByDrama(activeDramaId.value, {
        title: newEpisodeTitle.value.trim(),
        orderIndex: Math.max(0, Math.floor(newEpisodeOrderIndex.value || 0))
      });
    } else {
      await createEpisodeDomain(projectId.value, {
        dramaId: drama.value.id,
        title: newEpisodeTitle.value.trim(),
        orderIndex: Math.max(0, Math.floor(newEpisodeOrderIndex.value || 0))
      });
    }
    newEpisodeTitle.value = '';
    await loadAll();
    notice.value = '分集已创建';
  } catch (err) {
    error.value = toErrorMessage(err, '创建分集失败');
  } finally {
    loading.value = false;
  }
};

const importEpisodesFromScripts = async (): Promise<void> => {
  if (!activeDramaId.value) {
    error.value = 'Drama 未初始化';
    notice.value = '';
    return;
  }
  loading.value = true;
  try {
    const result = await importEpisodesFromScriptsByDrama(activeDramaId.value);
    await loadAll();
    notice.value = `已创建 ${result.createdEpisodes.length} 个分集，并绑定 ${result.boundScripts.length} 条剧本`;
    if (result.createdEpisodes.length === 0) {
      notice.value = '没有可导入的未绑定剧本';
    }
    error.value = '';
  } catch (err) {
    error.value = toErrorMessage(err, '按剧本批量建分集失败');
    notice.value = '';
  } finally {
    loading.value = false;
  }
};

const saveEpisodeStatus = async (episodeId: string): Promise<void> => {
  loading.value = true;
  try {
    if (hasDramaScopedApi.value) {
      await updateEpisodeDomainByDrama(activeDramaId.value, episodeId, {
        status: episodeStatusDraft.value[episodeId]
      });
    } else {
      await updateEpisodeDomain(projectId.value, episodeId, {
        status: episodeStatusDraft.value[episodeId]
      });
    }
    await loadAll();
    notice.value = '分集状态已更新';
  } catch (err) {
    error.value = toErrorMessage(err, '更新分集状态失败');
  } finally {
    loading.value = false;
  }
};

const selectEpisode = (episodeId: string): void => {
  selectedEpisodeId.value = episodeId;
};

const goEpisodeTarget = async (
  episodeId: string,
  target: 'storyboard' | 'asset' | 'workflow' | 'timeline' | 'delivery'
): Promise<void> => {
  const buildPath = (projectPath: string, dramaPath: string): string => (activeDramaId.value ? dramaPath : projectPath);
  const pathMap: Record<typeof target, string> = {
    storyboard: buildPath(`/projects/${projectId.value}/storyboard-workbench`, `/dramas/${activeDramaId.value}/storyboard-workbench`),
    asset: buildPath(`/projects/${projectId.value}/asset-workbench`, `/dramas/${activeDramaId.value}/asset-workbench`),
    workflow: buildPath(`/projects/${projectId.value}/workflow`, `/dramas/${activeDramaId.value}/workflow`),
    timeline: buildPath(`/projects/${projectId.value}/timeline`, `/dramas/${activeDramaId.value}/timeline`),
    delivery: buildPath(`/projects/${projectId.value}/delivery`, `/dramas/${activeDramaId.value}/delivery`)
  };
  await router.push({
    path: pathMap[target],
    query: { episodeId, ...(activeDramaId.value ? { dramaId: activeDramaId.value } : {}) }
  });
};

const goDramaHub = async (): Promise<void> => {
  await router.push('/');
};

const goProject = async (): Promise<void> => {
  try {
    const dramaId = await resolveDramaIdForNavigation({
      preferredDramaId: activeDramaId.value,
      projectId: projectId.value,
      fallbackName: project.value?.name || 'Untitled Drama',
      fallbackDescription: project.value?.description || undefined
    });
    if (dramaId) {
      error.value = '';
      await router.push(`/dramas/${dramaId}`);
      return;
    }
    error.value = buildDramaFallbackMessage('已回退项目详情');
  } catch (err) {
    error.value = buildDramaFallbackMessage('已回退项目详情', err);
  }
  await router.push(`/projects/${projectId.value}`);
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
.episode-studio-shell {
  --rail-width: 320px;
  --inspector-width: 320px;
}

.episode-card {
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.episode-card--active {
  border-color: #2f6fec;
  box-shadow: 0 12px 28px rgba(47, 111, 236, 0.12);
  transform: translateY(-1px);
}

.column-actions {
  align-items: stretch;
}
</style>
