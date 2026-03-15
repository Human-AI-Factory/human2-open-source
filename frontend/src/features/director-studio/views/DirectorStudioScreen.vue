<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="director-studio-shell" compact>
      <template #rail>
        <section class="panel director-studio-hero">
          <div class="inline-between">
            <div>
              <p class="eyebrow">Director Studio</p>
              <h2>导演工作台</h2>
              <p class="muted">统一进入导演计划与执行子流程，保持作用域连续。</p>
            </div>
            <div class="actions">
              <button @click="copyShareLink">复制当前链接</button>
              <button @click="goProject">返回项目</button>
            </div>
          </div>
          <RouteRestoreHint :text="restoredTip" />
          <p v-if="shareTip" class="muted">{{ shareTip }}</p>
        </section>
      </template>

      <section class="panel">
        <div class="inline-between">
          <h3>导演子流程</h3>
          <p class="muted">从计划进入执行，尽量不再回到项目详情页中转。</p>
        </div>
        <div class="nav-grid">
          <article class="card nav-card">
            <h4>计划面板</h4>
            <p class="muted">分集作用域、批量预检、冲突统计与 CSV 导出</p>
            <div class="actions">
              <button class="primary" @click="goPlanning">进入</button>
            </div>
          </article>
          <article class="card nav-card">
            <h4>执行面板</h4>
            <p class="muted">时间线执行、审核流与分镜执行入口</p>
            <div class="actions">
              <button class="primary" @click="goExecution">进入</button>
            </div>
          </article>
        </div>
      </section>

      <template #inspector>
        <section class="panel">
          <h3>当前上下文</h3>
          <p class="muted">project={{ projectId || '-' }}</p>
          <p class="muted">drama={{ dramaId || '-' }}</p>
          <div class="actions">
            <button @click="goPlanning">进入计划</button>
            <button @click="goExecution">进入执行</button>
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
import { buildDramaScopedPath, buildDramaScopedQuery, resolveProjectIdFromRouteContext } from '@/utils/route-context';
import { buildRouteRestoreTip, toSingleQuery, useRouteRestoreContext } from '@/composables/useRouteRestoreContext';

const route = useRoute();
const router = useRouter();
const routeProjectId = computed(() => String(route.params.id || ''));
const routeDramaId = computed(() => String(route.params.dramaId || ''));
const projectId = ref('');
const shareTip = ref('');
const {
  restoreTip: restoredTip,
  markRestored
} = useRouteRestoreContext();
const dramaId = computed(() => {
  if (routeDramaId.value) {
    return routeDramaId.value;
  }
  return toSingleQuery(route.query).dramaId || '';
});

const buildPath = (projectPath: string, dramaPath: string): string =>
  buildDramaScopedPath({ dramaId: dramaId.value, projectPath, dramaPath });
const buildQuery = (extra?: Record<string, string | undefined>): Record<string, string> => {
  const query = buildDramaScopedQuery(dramaId.value);
  const currentQuery = toSingleQuery(route.query);
  for (const [key, value] of Object.entries(currentQuery)) {
    if (value) {
      query[key] = value;
    }
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (typeof value === 'string' && value.length > 0) {
        query[key] = value;
      } else {
        delete query[key];
      }
    }
  }
  return query;
};

const restoreTipFromQuery = (): void => {
  const hasScopedQuery = Object.entries(toSingleQuery(route.query)).some(([key, value]) => key !== 'dramaId' && value.length > 0);
  if (hasScopedQuery) {
    markRestored(buildRouteRestoreTip('scope_filter'));
  }
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

const goProject = (): void => {
  if (!projectId.value) {
    return;
  }
  void router.push({
    path: buildPath(`/projects/${projectId.value}`, `/dramas/${dramaId.value}`),
    query: buildQuery()
  });
};

const goPlanning = (): void => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/director/planning`, `/dramas/${dramaId.value}/director/planning`),
    query: buildQuery()
  });
};

const goExecution = (): void => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/director/execution`, `/dramas/${dramaId.value}/director/execution`),
    query: buildQuery()
  });
};

const logout = (): void => {
  clearToken();
  void router.replace('/login');
};

onMounted(async () => {
  restoreTipFromQuery();
  projectId.value = await resolveProjectIdFromRouteContext({
    currentProjectId: projectId.value,
    routeProjectId: routeProjectId.value,
    routeDramaId: routeDramaId.value
  });
});
</script>

<style scoped>
.director-studio-shell {
  --rail-width: 320px;
  --inspector-width: 320px;
}

.director-studio-hero {
  border: 1px solid #d9e4ff;
  background: linear-gradient(160deg, #f6fbff 0%, #eef4ff 100%);
}

.nav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.nav-card {
  border: 1px solid #d8e0ee;
  border-radius: 12px;
  background: #f8fbff;
}

</style>
