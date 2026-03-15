<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="library-workbench-shell" compact>
      <template #rail>
    <section class="panel">
      <div class="inline-between">
        <div>
          <h2>角色库批量投放工作台</h2>
          <p class="muted">{{ project?.name || '加载中...' }}</p>
        </div>
        <div class="actions">
          <button @click="goProject">返回项目</button>
          <button @click="loadAll">刷新</button>
        </div>
      </div>
      <RouteRestoreHint :text="routeRestoredTip" />
      <p v-if="error" class="error">{{ error }}</p>
    </section>
      </template>

    <section class="panel">
      <h3>资源筛选</h3>
      <div class="actions">
        <select v-model="typeFilter">
          <option value="">全部类型</option>
          <option value="character">character</option>
          <option value="scene">scene</option>
          <option value="prop">prop</option>
        </select>
        <input v-model="query" placeholder="搜索名称/提示词" />
        <button @click="loadResources">查询</button>
      </div>
      <div class="list" v-if="resources.length > 0">
        <article class="card" :class="{ 'route-focus': focusedResourceId === item.id }" :id="`library-resource-${item.id}`" v-for="item in resources" :key="item.id">
          <div>
            <h4>[{{ item.type }}] {{ item.name }}</h4>
            <p class="muted">{{ item.prompt }}</p>
            <p class="muted">usage={{ item.usageCount }} / sourceProject={{ item.sourceProjectId || '-' }}</p>
          </div>
          <div class="actions">
            <button :class="{ primary: selectedResourceId === item.id }" @click="selectedResourceId = item.id">
              {{ selectedResourceId === item.id ? '已选择' : '选择' }}
            </button>
          </div>
        </article>
      </div>
      <p class="muted" v-else>暂无资源</p>
    </section>

    <section class="panel">
      <h3>批量投放</h3>
      <div class="form">
        <label>
          目标分集
          <select v-model="targetEpisodeId">
            <option value="">请选择分集</option>
            <option v-for="ep in episodes" :key="ep.id" :value="ep.id">{{ ep.orderIndex }} · {{ ep.title }}</option>
          </select>
        </label>
        <label>
          冲突策略
          <select v-model="applyMode">
            <option value="missing_only">missing_only（有同类型资产则跳过）</option>
            <option value="all">all（全部创建）</option>
          </select>
        </label>
        <label>
          名称覆盖（可选）
          <input v-model="overrideName" placeholder="默认沿用资源名称" />
        </label>
      </div>
      <div class="actions" style="margin-top: 8px">
        <button :disabled="loading || !canPreviewApply" @click="previewApply">预检查冲突</button>
        <button class="primary" :disabled="loading || !canPreviewApply" @click="applyResource">执行批量投放</button>
      </div>

      <div class="panel" v-if="previewResult" style="margin-top: 10px">
        <p class="muted">
          total={{ previewResult.totalStoryboards }} / creatable={{ previewResult.creatableStoryboardIds.length }} / conflicts={{
            previewResult.conflictStoryboardIds.length
          }}
        </p>
        <p class="muted">mode={{ previewResult.mode }}</p>
        <div class="list" v-if="previewResult.conflictStoryboards.length > 0">
          <article class="card" v-for="item in previewResult.conflictStoryboards.slice(0, 12)" :key="item.id">
            <div>
              <h4>{{ item.title }}</h4>
              <p class="muted">storyboardId={{ item.id }}</p>
            </div>
          </article>
        </div>
        <div class="actions" v-if="previewResult.conflictStoryboardIds.length > 0">
          <button @click="applyMode = 'missing_only'">切换 missing_only</button>
          <button @click="applyMode = 'all'">切换 all</button>
        </div>
      </div>

      <div class="panel" v-if="applyResult" style="margin-top: 10px">
        <p class="muted">
          已创建 {{ applyResult.created.length }} 条 / 跳过 {{ applyResult.skippedStoryboardIds.length }} 条 / 总分镜 {{ applyResult.totalStoryboards }}
        </p>
      </div>
    </section>

      <template #inspector>
    <section class="panel">
      <h3>投放审计</h3>
      <div class="actions">
        <button :disabled="loading" @click="loadAudits">刷新审计</button>
      </div>
      <div class="timeline" v-if="audits.length > 0">
        <article class="timeline-item" v-for="item in audits" :key="item.id">
          <p class="timeline-time">{{ new Date(item.createdAt).toLocaleString() }}</p>
          <p class="muted">episode={{ item.episodeId }} / resource={{ item.resourceId }} / mode={{ item.mode }}</p>
          <p class="muted">created={{ item.createdCount }} / skipped={{ item.skippedCount }} / total={{ item.totalStoryboards }}</p>
        </article>
      </div>
      <p class="muted" v-else>暂无审计记录</p>
    </section>
      </template>

    <section class="panel">
      <h3>冲突治理（预检/合并/回滚）</h3>
      <div class="actions">
        <select v-model="conflictKind">
          <option value="fingerprint">fingerprint</option>
          <option value="source">source</option>
          <option value="name">name</option>
        </select>
        <select v-model="conflictStrategy">
          <option value="keep_latest">keep_latest</option>
          <option value="keep_most_used">keep_most_used</option>
          <option value="manual_keep">manual_keep</option>
        </select>
        <button :disabled="loading" @click="loadConflictGroups">刷新冲突组</button>
        <select v-model="mergeAuditStrategy">
          <option value="">all strategies</option>
          <option value="keep_latest">keep_latest</option>
          <option value="keep_most_used">keep_most_used</option>
          <option value="manual_keep">manual_keep</option>
        </select>
        <select v-model="mergeAuditKind">
          <option value="">all kinds</option>
          <option value="fingerprint">fingerprint</option>
          <option value="source">source</option>
          <option value="name">name</option>
        </select>
        <input v-model="mergeAuditKeepId" placeholder="keepId" />
        <input v-model="mergeAuditRemovedId" placeholder="removedId" />
        <input v-model="mergeAuditQ" placeholder="关键词(conflictKey/id)" />
        <input v-model="mergeAuditStartAt" type="datetime-local" />
        <input v-model="mergeAuditEndAt" type="datetime-local" />
        <button :disabled="loading" @click="loadMergeAudits">刷新合并审计</button>
        <button :disabled="loading" @click="exportMergeAudits">导出合并审计 CSV</button>
      </div>
      <div class="list" v-if="conflictGroups.length > 0">
        <article
          class="card"
          :class="{ 'route-focus': focusedConflictGroupKey === `${group.conflictKind}:${group.conflictKey}` }"
          :id="`library-conflict-${group.conflictKind}-${group.conflictKey}`"
          v-for="group in conflictGroups"
          :key="`${group.conflictKind}:${group.conflictKey}`">
          <div>
            <h4>[{{ group.type }}] {{ group.name }} · {{ group.conflictKind }} · count={{ group.count }}</h4>
            <p class="muted">{{ group.prompt }}</p>
          </div>
          <div class="actions">
            <button :disabled="loading" @click="previewConflict(group.conflictKind, group.conflictKey)">预检</button>
            <button :disabled="loading" @click="resolveConflict(group.conflictKind, group.conflictKey)">按策略合并</button>
          </div>
        </article>
      </div>
      <p v-else class="muted">暂无冲突组</p>
      <div class="pagination">
        <button :disabled="conflictPage <= 1" @click="changeConflictPage(conflictPage - 1)">上一页</button>
        <span>第 {{ conflictPage }} 页 / 共 {{ conflictPageCount }} 页（{{ conflictTotal }} 条）</span>
        <button :disabled="conflictPage >= conflictPageCount" @click="changeConflictPage(conflictPage + 1)">下一页</button>
      </div>

      <div class="panel" v-if="conflictPreview" style="margin-top: 10px">
        <p class="muted">
          preview: kind={{ conflictPreview.conflictKind }} / keep={{ conflictPreview.keepId }} / remove={{ conflictPreview.removeIds.length }}
        </p>
        <div class="list" v-if="conflictPreview.candidates.length > 0">
          <article class="card" v-for="candidate in conflictPreview.candidates" :key="`candidate-${candidate.id}`">
            <h4>{{ candidate.id }} <span class="muted">(usage={{ candidate.usageCount }})</span></h4>
            <p class="muted">
              sourceStoryboard={{ candidate.sourceStoryboardTitle || '-' }}
              <span v-if="candidate.sourceStoryboardId"> ({{ candidate.sourceStoryboardId }})</span>
            </p>
            <p class="muted">
              sourceProject={{ candidate.sourceProjectId || '-' }} / sourceAsset={{ candidate.sourceAssetId || '-' }}
            </p>
          </article>
        </div>
        <div class="actions" v-if="conflictStrategy === 'manual_keep'">
          <select v-model="manualKeepId">
            <option value="">选择 keepId</option>
            <option v-for="candidate in conflictPreview.candidates" :key="candidate.id" :value="candidate.id">
              {{ candidate.id }} · usage={{ candidate.usageCount }} · {{ candidate.sourceStoryboardTitle || '无分镜标题' }}
            </option>
          </select>
        </div>
      </div>

      <div class="timeline" v-if="mergeAudits.length > 0">
        <article class="timeline-item" v-for="item in mergeAudits.slice(0, 30)" :key="item.id">
          <p class="timeline-time">{{ new Date(item.createdAt).toLocaleString() }}</p>
          <p class="muted">
            {{ item.strategy }} / {{ item.conflictKind }} / keep={{ item.keepId }} / removed={{ item.removedIds.length }}
          </p>
          <div class="actions">
            <button @click="toggleMergeAuditExpand(item.id)">{{ expandedMergeAuditIds[item.id] ? '收起详情' : '展开详情' }}</button>
          </div>
          <div v-if="expandedMergeAuditIds[item.id]" class="panel" style="margin-top: 8px">
            <p class="muted">conflictKey={{ item.conflictKey }}</p>
            <p class="muted">keepId={{ item.keepId }}</p>
            <p class="muted">removedIds:</p>
            <ul>
              <li v-for="id in item.removedIds" :key="`${item.id}-${id}`">{{ id }}</li>
            </ul>
          </div>
        </article>
      </div>
      <p v-else class="muted">暂无合并审计</p>
    </section>
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
import {
  getEpisodeDomains,
  getEpisodeDomainsByDrama,
} from '@/api/domain-context';
import {
  createAssetsByEpisodeFromResource,
  exportResourceLibraryMergeAuditsCsv,
  getResourceLibraryConflicts,
  getResourceLibrary,
  getResourceLibraryApplyAudits,
  getResourceLibraryMergeAudits,
  previewCreateAssetsByEpisodeFromResource,
  previewResourceLibraryConflictGroup,
  resolveResourceLibraryConflictGroup
} from '@/api/resource-library';
import { getProject } from '@/api/timeline-editor';
import {
  EpisodeDomain,
  Project,
  ResourceLibraryApplyAuditEntry,
  ResourceLibraryConflictGroup,
  ResourceLibraryConflictPreview,
  ResourceLibraryItem,
  ResourceLibraryMergeAuditEntry
} from '@/types/models';
import { replaceQueryIfChanged, toSingleQuery, useRouteRestoreContext } from '@/composables/useRouteRestoreContext';
import { buildDramaScopedPath, buildDramaScopedQuery, resolveProjectIdFromRouteContext } from '@/utils/route-context';

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
const episodes = ref<EpisodeDomain[]>([]);
const resources = ref<ResourceLibraryItem[]>([]);
const audits = ref<ResourceLibraryApplyAuditEntry[]>([]);
const conflictGroups = ref<ResourceLibraryConflictGroup[]>([]);
const conflictPreview = ref<ResourceLibraryConflictPreview | null>(null);
const conflictPreviewCache = ref<Record<string, ResourceLibraryConflictPreview>>({});
const mergeAudits = ref<ResourceLibraryMergeAuditEntry[]>([]);
const conflictKind = ref<'fingerprint' | 'source' | 'name'>('fingerprint');
const conflictStrategy = ref<'keep_latest' | 'keep_most_used' | 'manual_keep'>('keep_latest');
const manualKeepId = ref('');
const mergeAuditStrategy = ref<'' | 'keep_latest' | 'keep_most_used' | 'manual_keep'>('');
const mergeAuditKind = ref<'' | 'fingerprint' | 'source' | 'name'>('');
const mergeAuditKeepId = ref('');
const mergeAuditRemovedId = ref('');
const mergeAuditQ = ref('');
const mergeAuditStartAt = ref('');
const mergeAuditEndAt = ref('');
const conflictPage = ref(1);
const conflictPageSize = ref(20);
const conflictTotal = ref(0);
const conflictPageCount = computed(() => Math.max(1, Math.ceil(conflictTotal.value / conflictPageSize.value)));
const expandedMergeAuditIds = ref<Record<string, boolean>>({});
const selectedResourceId = ref('');
const targetEpisodeId = ref('');
const typeFilter = ref<'' | 'character' | 'scene' | 'prop'>('');
const query = ref('');
const applyMode = ref<'missing_only' | 'all'>('missing_only');
const overrideName = ref('');
const previewResult = ref<{
  totalStoryboards: number;
  creatableStoryboardIds: string[];
  conflictStoryboardIds: string[];
  creatableStoryboards: Array<{ id: string; title: string }>;
  conflictStoryboards: Array<{ id: string; title: string }>;
  mode: 'missing_only' | 'all';
} | null>(null);
const applyResult = ref<{
  created: Array<{ id: string }>;
  skippedStoryboardIds: string[];
  totalStoryboards: number;
} | null>(null);
const loading = ref(false);
const error = ref('');
const focusedResourceId = ref('');
const focusedConflictGroupKey = ref('');
const managedQueryKeys = ['resourceId', 'episodeId', 'type', 'q', 'conflictKind', 'conflictKey'] as const;
const {
  restoreTip: routeRestoredTip,
  markRestored: markRouteRestored,
  runRestoreScroll: runRouteRestoreScroll
} = useRouteRestoreContext();

const canPreviewApply = computed(() => Boolean(selectedResourceId.value && targetEpisodeId.value));

const buildPath = (projectPath: string, dramaPath: string): string =>
  buildDramaScopedPath({ dramaId: dramaId.value, projectPath, dramaPath });
const buildQuery = (): Record<string, string> => buildDramaScopedQuery(dramaId.value);

const goProject = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}`, `/dramas/${dramaId.value}`),
    query: buildQuery()
  });
};

const logout = () => {
  clearToken();
  void router.replace('/login');
};

const loadResources = async (): Promise<void> => {
  const page = await getResourceLibrary({
    q: query.value.trim() || undefined,
    type: typeFilter.value || undefined,
    page: 1,
    pageSize: 50
  });
  resources.value = page.items;
  if (!selectedResourceId.value && page.items.length > 0) {
    selectedResourceId.value = page.items[0].id;
  }
};

const loadAudits = async (): Promise<void> => {
  audits.value = await getResourceLibraryApplyAudits({
    projectId: projectId.value,
    limit: 50
  });
};

const loadConflictGroups = async (): Promise<void> => {
  const page = await getResourceLibraryConflicts({
    kind: conflictKind.value,
    type: typeFilter.value || undefined,
    q: query.value.trim() || undefined,
    page: conflictPage.value,
    pageSize: conflictPageSize.value
  });
  conflictGroups.value = page.items;
  conflictTotal.value = page.total;
  conflictPage.value = page.page;
  conflictPageSize.value = page.pageSize;
  if (focusedConflictGroupKey.value) {
    const matched = page.items.find((item) => `${item.conflictKind}:${item.conflictKey}` === focusedConflictGroupKey.value);
    if (!matched) {
      focusedConflictGroupKey.value = '';
    }
  }
};

const changeConflictPage = async (next: number): Promise<void> => {
  conflictPage.value = Math.max(1, next);
  await loadConflictGroups();
};

const loadMergeAudits = async (): Promise<void> => {
  mergeAudits.value = await getResourceLibraryMergeAudits({
    limit: 100,
    strategy: mergeAuditStrategy.value || undefined,
    conflictKind: mergeAuditKind.value || undefined,
    keepId: mergeAuditKeepId.value.trim() || undefined,
    removedId: mergeAuditRemovedId.value.trim() || undefined,
    q: mergeAuditQ.value.trim() || undefined,
    startAt: mergeAuditStartAt.value ? new Date(mergeAuditStartAt.value).toISOString() : undefined,
    endAt: mergeAuditEndAt.value ? new Date(mergeAuditEndAt.value).toISOString() : undefined
  });
};

const exportMergeAudits = async (): Promise<void> => {
  const csv = await exportResourceLibraryMergeAuditsCsv({
    strategy: mergeAuditStrategy.value || undefined,
    conflictKind: mergeAuditKind.value || undefined,
    keepId: mergeAuditKeepId.value.trim() || undefined,
    removedId: mergeAuditRemovedId.value.trim() || undefined,
    q: mergeAuditQ.value.trim() || undefined,
    startAt: mergeAuditStartAt.value ? new Date(mergeAuditStartAt.value).toISOString() : undefined,
    endAt: mergeAuditEndAt.value ? new Date(mergeAuditEndAt.value).toISOString() : undefined
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'resource-library-merge-audits.csv';
  link.click();
  URL.revokeObjectURL(url);
};

const toggleMergeAuditExpand = (id: string): void => {
  expandedMergeAuditIds.value = {
    ...expandedMergeAuditIds.value,
    [id]: !expandedMergeAuditIds.value[id]
  };
};

const previewConflict = async (kind: 'fingerprint' | 'source' | 'name', key: string): Promise<void> => {
  focusedConflictGroupKey.value = `${kind}:${key}`;
  window.setTimeout(() => {
    const target = document.getElementById(`library-conflict-${kind}-${key}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 60);
  const previewStrategy = conflictStrategy.value === 'manual_keep' ? 'keep_latest' : conflictStrategy.value;
  const cacheKey = `${kind}::${key}::${previewStrategy}`;
  const cached = conflictPreviewCache.value[cacheKey];
  if (cached) {
    conflictPreview.value = cached;
    manualKeepId.value = cached.keepId;
    return;
  }
  const preview = await previewResourceLibraryConflictGroup({
    conflictKind: kind,
    conflictKey: key,
    strategy: previewStrategy
  });
  conflictPreview.value = preview;
  conflictPreviewCache.value = {
    ...conflictPreviewCache.value,
    [cacheKey]: preview
  };
  if (preview) {
    manualKeepId.value = preview.keepId;
  }
};

const resolveConflict = async (kind: 'fingerprint' | 'source' | 'name', key: string): Promise<void> => {
  loading.value = true;
  try {
    const payload =
      conflictStrategy.value === 'manual_keep'
        ? { conflictKind: kind, conflictKey: key, strategy: 'manual_keep' as const, keepId: manualKeepId.value || undefined }
        : { conflictKind: kind, conflictKey: key, strategy: conflictStrategy.value };
    await resolveResourceLibraryConflictGroup(payload);
    conflictPreviewCache.value = {};
    await Promise.all([loadResources(), loadConflictGroups(), loadMergeAudits()]);
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '冲突合并失败';
  } finally {
    loading.value = false;
  }
};

const previewApply = async (): Promise<void> => {
  if (!canPreviewApply.value) {
    error.value = '请先选择资源和分集';
    return;
  }
  loading.value = true;
  try {
    previewResult.value = await previewCreateAssetsByEpisodeFromResource(selectedResourceId.value, {
      projectId: projectId.value,
      episodeId: targetEpisodeId.value,
      mode: applyMode.value,
      name: overrideName.value.trim() || undefined
    });
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '预检查失败';
  } finally {
    loading.value = false;
  }
};

const applyResource = async (): Promise<void> => {
  if (!canPreviewApply.value) {
    error.value = '请先选择资源和分集';
    return;
  }
  loading.value = true;
  try {
    applyResult.value = await createAssetsByEpisodeFromResource(selectedResourceId.value, {
      projectId: projectId.value,
      episodeId: targetEpisodeId.value,
      mode: applyMode.value,
      name: overrideName.value.trim() || undefined
    });
    await loadAudits();
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '批量投放失败';
  } finally {
    loading.value = false;
  }
};

const loadAll = async (): Promise<void> => {
  try {
    const queryState = toSingleQuery(route.query);
    if (queryState.type === 'character' || queryState.type === 'scene' || queryState.type === 'prop') {
      typeFilter.value = queryState.type;
    } else if (queryState.type === '') {
      typeFilter.value = '';
    }
    if (typeof queryState.q === 'string') {
      query.value = queryState.q;
    }
    if (queryState.conflictKind === 'fingerprint' || queryState.conflictKind === 'source' || queryState.conflictKind === 'name') {
      conflictKind.value = queryState.conflictKind;
    }
    const routeResourceId = typeof queryState.resourceId === 'string' ? queryState.resourceId : '';
    const routeEpisodeId = typeof queryState.episodeId === 'string' ? queryState.episodeId : '';
    const routeConflictKey = typeof queryState.conflictKey === 'string' ? queryState.conflictKey : '';

    projectId.value = await resolveProjectIdFromRouteContext({
      currentProjectId: projectId.value,
      routeProjectId: routeProjectId.value,
      routeDramaId: routeDramaId.value
    });
    if (!projectId.value) {
      error.value = '无法解析项目上下文';
      return;
    }
    const [projectData, episodeList] = await Promise.all([
      getProject(projectId.value),
      dramaId.value ? getEpisodeDomainsByDrama(dramaId.value) : getEpisodeDomains(projectId.value)
    ]);
    project.value = projectData;
    episodes.value = episodeList;
    if (routeEpisodeId && episodeList.some((item) => item.id === routeEpisodeId)) {
      targetEpisodeId.value = routeEpisodeId;
    } else if (!targetEpisodeId.value && episodeList.length > 0) {
      targetEpisodeId.value = episodeList[0].id;
    }
    conflictPage.value = 1;
    await Promise.all([loadResources(), loadAudits(), loadConflictGroups(), loadMergeAudits()]);
    if (routeResourceId && resources.value.some((item) => item.id === routeResourceId)) {
      selectedResourceId.value = routeResourceId;
      focusedResourceId.value = routeResourceId;
      markRouteRestored('已从分享链接恢复资源/分集/冲突作用域', `library-resource-${routeResourceId}`);
    }
    if (routeConflictKey) {
      const matched = conflictGroups.value.find((item) => item.conflictKey === routeConflictKey);
      if (matched) {
        focusedConflictGroupKey.value = `${matched.conflictKind}:${matched.conflictKey}`;
      }
    }
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  }
};

const syncQuery = async (): Promise<void> => {
  const nextQuery = toSingleQuery(route.query);
  const payload: Record<string, string | undefined> = {
    resourceId: selectedResourceId.value || undefined,
    episodeId: targetEpisodeId.value || undefined,
    type: typeFilter.value || undefined,
    q: query.value.trim() || undefined,
    conflictKind: conflictKind.value || undefined,
    conflictKey: focusedConflictGroupKey.value ? focusedConflictGroupKey.value.split(':').slice(1).join(':') : undefined
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

onMounted(() => {
  void loadAll().then(() => {
    runRouteRestoreScroll();
  });
});

watch(
  () => [selectedResourceId.value, targetEpisodeId.value, typeFilter.value, query.value, conflictKind.value, focusedConflictGroupKey.value],
  () => {
    void syncQuery();
  }
);
</script>

<style scoped>
.library-workbench-shell {
  --rail-width: 320px;
  --inspector-width: 340px;
}

.route-focus {
  border-color: #2f6fec;
  box-shadow: 0 0 0 2px rgba(47, 111, 236, 0.2);
}
</style>
