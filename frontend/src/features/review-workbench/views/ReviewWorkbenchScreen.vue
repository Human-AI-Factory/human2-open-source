<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="review-workbench-shell" compact>
      <template #rail>
        <section class="panel review-hero-panel">
          <div class="inline-between">
            <div>
              <h2>Review Workbench</h2>
              <p class="muted">审核流、任务中心、交付入口</p>
            </div>
            <div class="actions">
              <button @click="goProject">返回项目</button>
              <button @click="refreshAll">刷新</button>
            </div>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
        </section>

        <section class="panel compact-panel">
          <h3>审核摘要</h3>
          <div class="summary-grid">
            <article class="card">
              <p class="muted">视频任务</p>
              <h4>{{ videoTasks.length }}</h4>
            </article>
            <article class="card">
              <p class="muted">已完成</p>
              <h4>{{ doneTasks }}</h4>
            </article>
            <article class="card">
              <p class="muted">失败</p>
              <h4>{{ failedTasks }}</h4>
            </article>
          </div>
        </section>

        <section class="panel compact-panel">
          <h3>入口</h3>
          <div class="quick-entry-grid">
            <button class="primary" @click="goWorkflow">Workflow Workbench</button>
            <button class="primary" @click="goDelivery">Delivery Workbench</button>
            <button class="primary" @click="goTaskCenter">Task Center</button>
          </div>
        </section>
      </template>

      <section class="panel">
        <div class="inline-between">
          <h3>任务快照</h3>
          <p class="muted">按最新更新时间展示</p>
        </div>
        <div v-if="videoTasks.length === 0" class="card">
          <p class="muted">当前项目暂无视频任务。</p>
        </div>
        <div v-else class="task-list">
          <article class="card task-card" v-for="item in orderedTasks" :key="item.id">
            <div class="inline-between">
              <strong>{{ getTaskLabel(item) }}</strong>
              <span class="tag" :class="`tag-${item.status}`">{{ item.status }}</span>
            </div>
            <p class="muted">进度 {{ item.progress }}% · 尝试 {{ item.attempt }}</p>
            <p class="muted review-task-prompt">{{ item.prompt }}</p>
            <p v-if="item.error" class="error">{{ item.error }}</p>
          </article>
        </div>
      </section>

      <template #inspector>
        <section class="panel compact-panel">
          <h3>Inspector</h3>
          <div class="inspector-stats">
            <article class="card">
              <p class="muted">进行中</p>
              <h4>{{ runningTasks }}</h4>
            </article>
            <article class="card">
              <p class="muted">排队中</p>
              <h4>{{ queuedTasks }}</h4>
            </article>
            <article class="card">
              <p class="muted">最近失败</p>
              <h4>{{ failedTaskItems.length }}</h4>
            </article>
          </div>
        </section>

        <section class="panel compact-panel">
          <h3>失败聚焦</h3>
          <div v-if="failedTaskItems.length === 0" class="card">
            <p class="muted">当前没有失败任务。</p>
          </div>
          <div v-else class="failed-task-list">
            <article class="card" v-for="item in failedTaskItems" :key="`failed-${item.id}`">
              <div class="inline-between">
                <strong>{{ getTaskLabel(item) }}</strong>
                <span class="tag tag-failed">failed</span>
              </div>
              <p class="muted">更新时间 {{ item.updatedAt }}</p>
              <p class="error">{{ item.error || '未提供错误详情' }}</p>
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
import { clearToken } from '@/api/client';
import { toSingleQuery } from '@/composables/useRouteRestoreContext';
import { getDramaVideoTasks, getVideoTasks } from '@/api/timeline-editor';
import { VideoTask } from '@/types/models';
import { buildDramaScopedPath, buildDramaScopedQuery, resolveProjectIdFromRouteContext } from '@/utils/route-context';

const route = useRoute();
const router = useRouter();
const routeProjectId = computed(() => String(route.params.id || ''));
const routeDramaId = computed(() => String(route.params.dramaId || ''));
const projectId = ref('');
const dramaId = computed(() => {
  if (routeDramaId.value) {
    return routeDramaId.value;
  }
  return toSingleQuery(route.query).dramaId || '';
});

const videoTasks = ref<VideoTask[]>([]);
const error = ref('');

const doneTasks = computed(() => videoTasks.value.filter((item) => item.status === 'done').length);
const failedTasks = computed(() => videoTasks.value.filter((item) => item.status === 'failed').length);
const runningTasks = computed(() => videoTasks.value.filter((item) => item.status === 'running' || item.status === 'polling' || item.status === 'submitting').length);
const queuedTasks = computed(() => videoTasks.value.filter((item) => item.status === 'queued').length);
const orderedTasks = computed(() => [...videoTasks.value].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
const failedTaskItems = computed(() => orderedTasks.value.filter((item) => item.status === 'failed').slice(0, 6));

const getTaskLabel = (task: VideoTask): string => {
  const compactPrompt = task.prompt.trim().split(/[\n。！？]/).find((item) => item.trim().length > 0)?.trim();
  return compactPrompt || task.storyboardId || task.id;
};

const logout = () => {
  clearToken();
  void router.replace('/login');
};

const buildPath = (projectPath: string, dramaPath: string): string =>
  buildDramaScopedPath({ dramaId: dramaId.value, projectPath, dramaPath });
const buildQuery = (): Record<string, string> => buildDramaScopedQuery(dramaId.value);

const goProject = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}`, `/dramas/${dramaId.value}`),
    query: buildQuery()
  });
};

const goWorkflow = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/workflow`, `/dramas/${dramaId.value}/workflow`),
    query: buildQuery()
  });
};

const goDelivery = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/delivery`, `/dramas/${dramaId.value}/delivery`),
    query: buildQuery()
  });
};

const goTaskCenter = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/tasks`, `/dramas/${dramaId.value}/tasks`),
    query: buildQuery()
  });
};

const refreshAll = async (): Promise<void> => {
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
    videoTasks.value = dramaId.value ? await getDramaVideoTasks(dramaId.value) : await getVideoTasks(projectId.value);
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  }
};

onMounted(() => {
  void refreshAll();
});
</script>

<style scoped>
.review-workbench-shell {
  --rail-width: 320px;
  --inspector-width: 360px;
}

.review-hero-panel {
  background: linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.quick-entry-grid,
.inspector-stats,
.failed-task-list,
.task-list {
  display: grid;
  gap: 12px;
}

.compact-panel :deep(.card) {
  padding: 12px;
}

.task-card {
  padding: 14px;
}

.review-task-prompt {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}
</style>
