<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="projects-shell" compact>
      <template #rail>
        <section class="panel project-hero">
          <div class="inline-between">
            <div>
              <p class="muted">Toonflow Studio</p>
              <h2>把创意变成可执行的视频流水线</h2>
              <p class="muted">从项目管理到分镜资产再到视频任务，在一个工作台里完成。</p>
            </div>
            <div class="actions">
              <button @click="goDramaHub">Drama Hub</button>
              <button class="primary" @click="goTaskCenter">任务中心</button>
              <button class="primary" @click="goSettings">设置中心</button>
            </div>
          </div>
        </section>

        <section class="panel compact-panel">
          <h2>新建项目</h2>
          <form class="form" @submit.prevent="createNewProject">
            <input v-model="name" placeholder="项目名称" />
            <textarea v-model="description" placeholder="项目描述（可选）" rows="3" />
            <button class="primary" type="submit" :disabled="loading">{{ loading ? '提交中...' : '创建项目' }}</button>
          </form>
          <p v-if="error" class="error">{{ error }}</p>
        </section>
      </template>

      <section class="panel">
        <div class="inline-between">
          <h2>项目列表</h2>
          <button class="primary" @click="loadAll">刷新</button>
        </div>
        <div class="actions">
          <input v-model="keyword" placeholder="搜索项目名称/描述" />
          <select v-model="sortBy">
            <option value="createdAt">按创建时间</option>
            <option value="updatedAt">按更新时间</option>
            <option value="name">按名称</option>
          </select>
          <select v-model="order">
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
          <button class="primary" @click="searchProjects">搜索</button>
        </div>
        <p v-if="projects.length === 0" class="muted">暂无项目</p>
        <div class="list">
          <article class="card" v-for="project in projects" :key="project.id">
            <div>
              <h3>{{ project.name }}</h3>
              <p class="muted">{{ project.description || '无描述' }}</p>
              <p class="muted">任务数：{{ project.tasks.length }}</p>
              <div class="workflow-meta" v-if="projectWorkflowMap[project.id]">
                <p class="muted">
                  阶段：{{ workflowStageLabel(projectWorkflowMap[project.id].stage.current) }}
                  · 下一步：{{ workflowActionLabel(projectWorkflowMap[project.id].stage.nextAction) }}
                </p>
                <div class="workflow-track">
                  <div class="workflow-fill" :style="{ width: `${projectWorkflowMap[project.id].stage.progressPercent}%` }"></div>
                </div>
                <p class="muted">
                  进度 {{ projectWorkflowMap[project.id].stage.progressPercent }}%
                  · 分镜 {{ projectWorkflowMap[project.id].counts.storyboard }}
                  · 资产 {{ projectWorkflowMap[project.id].counts.asset }}
                  · 视频完成 {{ projectWorkflowMap[project.id].counts.videoTaskDone }}
                </p>
              </div>
              <p v-else class="muted">工作流摘要加载中...</p>
            </div>
            <div class="actions">
              <button class="primary" @click="goDetail(project.id)">查看</button>
              <button @click="continueWorkflow(project.id)">继续流程</button>
              <button @click="goProjectTaskCenter(project.id)">项目任务</button>
              <button class="danger" @click="removeProject(project.id)">删除</button>
            </div>
          </article>
        </div>
        <div class="actions">
          <button :disabled="page <= 1" @click="prevPage">上一页</button>
          <p class="muted">第 {{ page }} 页 / 共 {{ totalPages }} 页（{{ total }} 条）</p>
          <button :disabled="page >= totalPages" @click="nextPage">下一页</button>
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
          <h3>当前排序</h3>
          <div class="card">
            <p class="muted">字段</p>
            <strong>{{ sortBy }}</strong>
          </div>
          <div class="card">
            <p class="muted">顺序</p>
            <strong>{{ order }}</strong>
          </div>
          <div class="card">
            <p class="muted">命中结果</p>
            <strong>{{ projects.length }} / {{ total }}</strong>
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
import { createProject, deleteProject, getProjects, getProjectWorkflows, getSummary } from '@/api/projects';
import type { Project, ProjectWorkflowSummary, Summary } from '@/types/models';
import { toErrorMessage } from '@/utils/errors';
import { buildDramaFallbackMessage, resolveDramaIdForNavigation } from '@/utils/route-context';

const router = useRouter();
const loading = ref(false);
const error = ref('');
const projects = ref<Project[]>([]);
const projectWorkflowMap = ref<Record<string, ProjectWorkflowSummary>>({});
const projectDramaIdMap = ref<Record<string, string>>({});
const summary = ref<Summary>({ projectCount: 0, taskCount: 0, doneCount: 0, doingCount: 0 });
const keyword = ref('');
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const sortBy = ref<'createdAt' | 'updatedAt' | 'name'>('createdAt');
const order = ref<'asc' | 'desc'>('desc');

const name = ref('');
const description = ref('');

const statItems = computed(() => [
  { label: '项目总数', value: summary.value.projectCount },
  { label: '任务总数', value: summary.value.taskCount },
  { label: '进行中', value: summary.value.doingCount },
  { label: '已完成', value: summary.value.doneCount }
]);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

const loadAll = async (): Promise<void> => {
  try {
    const [projectPage, dashboard] = await Promise.all([
      getProjects({
        q: keyword.value.trim() || undefined,
        page: page.value,
        pageSize,
        sortBy: sortBy.value,
        order: order.value
      }),
      getSummary()
    ]);
    projects.value = projectPage.items;
    total.value = projectPage.total;
    summary.value = dashboard;
    if (projectPage.items.length > 0) {
      const [workflows, dramaPairs] = await Promise.all([
        getProjectWorkflows(projectPage.items.map((item) => item.id)),
        Promise.all(
          projectPage.items.map(async (item) => {
            const dramaId = await resolveDramaIdForNavigation({
              projectId: item.id,
              fallbackName: item.name,
              fallbackDescription: item.description || undefined
            });
            return [item.id, dramaId] as const;
          })
        )
      ]);
      projectWorkflowMap.value = Object.fromEntries(workflows.map((item) => [item.projectId, item]));
      projectDramaIdMap.value = Object.fromEntries(dramaPairs);
    } else {
      projectWorkflowMap.value = {};
      projectDramaIdMap.value = {};
    }
    error.value = '';
  } catch (err) {
    error.value = toErrorMessage(err, '加载项目失败');
  }
};

const createNewProject = async (): Promise<void> => {
  if (!name.value.trim()) {
    error.value = '项目名称不能为空';
    return;
  }

  loading.value = true;
  try {
    const project = await createProject({ name: name.value.trim(), description: description.value.trim() || undefined });
    await resolveDramaIdForNavigation({
      projectId: project.id,
      fallbackName: project.name,
      fallbackDescription: project.description || undefined
    });
    name.value = '';
    description.value = '';
    page.value = 1;
    await loadAll();
  } catch (err) {
    error.value = toErrorMessage(err, '创建项目失败');
  } finally {
    loading.value = false;
  }
};

const removeProject = async (projectId: string): Promise<void> => {
  try {
    await deleteProject(projectId);
    await loadAll();
  } catch (err) {
    error.value = toErrorMessage(err, '删除项目失败');
  }
};

const resolveDramaIdForProject = async (projectId: string): Promise<string> => {
  const cached = projectDramaIdMap.value[projectId];
  if (cached) {
    return cached;
  }
  const project = projects.value.find((item) => item.id === projectId);
  const dramaId = await resolveDramaIdForNavigation({
    projectId,
    fallbackName: project?.name,
    fallbackDescription: project?.description || undefined
  });
  if (!dramaId) {
    return '';
  }
  projectDramaIdMap.value = {
    ...projectDramaIdMap.value,
    [projectId]: dramaId
  };
  return dramaId;
};

const navigateDramaFirst = async (
  projectId: string,
  options: {
    dramaPath: (dramaId: string) => string;
    projectPath: (projectId: string) => string;
    dramaQuery?: Record<string, string>;
    projectQuery?: Record<string, string>;
    fallbackMessage: string;
  }
): Promise<void> => {
  try {
    const dramaId = await resolveDramaIdForProject(projectId);
    if (dramaId) {
      error.value = '';
      await router.push({
        path: options.dramaPath(dramaId),
        query: options.dramaQuery || {}
      });
      return;
    }
    error.value = buildDramaFallbackMessage(options.fallbackMessage);
  } catch (err) {
    error.value = buildDramaFallbackMessage(options.fallbackMessage, err);
  }
  await router.push({
    path: options.projectPath(projectId),
    query: options.projectQuery || {}
  });
};

const goDetail = async (projectId: string): Promise<void> => {
  await navigateDramaFirst(projectId, {
    dramaPath: (dramaId) => `/dramas/${dramaId}`,
    projectPath: (id) => `/projects/${id}`,
    fallbackMessage: '未解析到 Drama 上下文，已回退项目详情'
  });
};

const continueWorkflow = async (projectId: string): Promise<void> => {
  const workflow = projectWorkflowMap.value[projectId];
  const stage = workflow?.stage.current === 'done' || workflow?.stage.current === 'merge' ? 'video' : workflow?.stage.current || 'writing';
  await navigateDramaFirst(projectId, {
    dramaPath: (dramaId) => `/dramas/${dramaId}`,
    projectPath: (id) => `/projects/${id}`,
    dramaQuery: { stage },
    projectQuery: { stage },
    fallbackMessage: '未解析到 Drama 上下文，已回退项目流程入口'
  });
};

const goProjectTaskCenter = async (projectId: string): Promise<void> => {
  await navigateDramaFirst(projectId, {
    dramaPath: (dramaId) => `/dramas/${dramaId}/tasks`,
    projectPath: (id) => `/projects/${id}/tasks`,
    fallbackMessage: '未解析到 Drama 上下文，已回退项目任务中心'
  });
};

const searchProjects = async (): Promise<void> => {
  page.value = 1;
  await loadAll();
};

const prevPage = async (): Promise<void> => {
  if (page.value <= 1) {
    return;
  }
  page.value -= 1;
  await loadAll();
};

const nextPage = async (): Promise<void> => {
  if (page.value >= totalPages.value) {
    return;
  }
  page.value += 1;
  await loadAll();
};

const logout = async (): Promise<void> => {
  clearToken();
  await router.push('/login');
};

const goTaskCenter = async (): Promise<void> => {
  await router.push('/tasks');
};

const goDramaHub = async (): Promise<void> => {
  await router.push('/dramas');
};

const goSettings = async (): Promise<void> => {
  await router.push('/settings');
};

const workflowStageLabel = (stage: ProjectWorkflowSummary['stage']['current']): string => {
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
      return stage;
  }
};

const workflowActionLabel = (action: ProjectWorkflowSummary['stage']['nextAction']): string => {
  switch (action) {
    case 'create_novel':
      return '录入原文';
    case 'generate_outline':
      return '生成大纲';
    case 'generate_script':
      return '生成剧本';
    case 'generate_storyboard':
      return '生成分镜';
    case 'generate_asset':
      return '生成资产';
    case 'create_video_task':
      return '创建视频任务';
    case 'create_video_merge':
      return '发起视频合成';
    case 'optimize_result':
      return '优化成片';
    default:
      return action;
  }
};

onMounted(async () => {
  await loadAll();
});
</script>

<style scoped>
.projects-shell {
  --rail-width: 320px;
  --inspector-width: 300px;
}

.stats-grid {
  display: grid;
  gap: 12px;
}

.project-hero {
  background: linear-gradient(120deg, #0f1f3d, #0e5bd8);
  color: #fff;
}

.project-hero .muted {
  color: #d9e7ff;
}

.workflow-meta {
  margin-top: 8px;
}

.workflow-track {
  height: 8px;
  border-radius: 999px;
  background: #e5e7eb;
  margin: 6px 0;
  overflow: hidden;
}

.workflow-fill {
  height: 100%;
  background: linear-gradient(90deg, #1d4ed8, #10b981);
}
</style>
