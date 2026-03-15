import type { Ref } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';
import {
  getEpisodeDomains,
  getEpisodeDomainsByDrama
} from '@/api/domain-context';
import { getResourceLibrary } from '@/api/resource-library';
import { getModelConfigs } from '@/api/settings-admin';
import {
  getAssets,
  getDramaAssets
} from '@/api/assets';
import {
  getDramaScripts,
  getScripts
} from '@/api/studio';
import {
  getDramaStoryboards,
  getProject,
  getStoryboards
} from '@/api/timeline-editor';
import type { Asset, EpisodeDomain, ModelConfig, Project, ScriptDoc, Storyboard, WorkflowOpLogEntry } from '@/types/models';
import { buildRouteRestoreTip, toSingleQuery } from '@/composables/useRouteRestoreContext';
import { resolveProjectIdFromRouteContext } from '@/utils/route-context';

type ResourceRef = {
  id: string;
  type: 'character' | 'scene' | 'prop';
  name: string;
};

type UseWorkflowWorkbenchRouteScopeOptions = {
  route: RouteLocationNormalizedLoaded;
  router: Router;
  routeProjectId: Ref<string>;
  routeDramaId: Ref<string>;
  dramaId: Ref<string>;
  projectId: Ref<string>;
  hasDramaScopedApi: Ref<boolean>;
  project: Ref<Project | null>;
  episodes: Ref<EpisodeDomain[]>;
  scripts: Ref<ScriptDoc[]>;
  storyboards: Ref<Storyboard[]>;
  assets: Ref<Asset[]>;
  resources: Ref<ResourceRef[]>;
  workflowOpLogs: Ref<WorkflowOpLogEntry[]>;
  audioModels: Ref<ModelConfig[]>;
  workflowMode: Ref<'single' | 'batch'>;
  workflowScopeEpisodeId: Ref<string>;
  workflowStatusFilter: Ref<'' | 'draft' | 'in_review' | 'approved' | 'rejected'>;
  workflowPage: Ref<number>;
  workflowQuery: Ref<string>;
  syncingScopeQuery: Ref<boolean>;
  episodeBatchIds: Ref<string[]>;
  selectedEpisodeIds: Ref<string[]>;
  targetEpisodeId: Ref<string>;
  audioStoryboardId: Ref<string>;
  audioModelId: Ref<string>;
  quotaExceededHintVisible: Ref<boolean>;
  loading: Ref<boolean>;
  error: Ref<string>;
  markWorkflowRouteRestored: (text: string, targetId?: string) => void;
  clearWorkflowRouteRestored: () => void;
  runWorkflowRouteRestoreScroll: () => void;
  ensureAudioDefaults: () => void;
  runBatchPrecheck: () => Promise<void>;
  runFramePromptPrecheck: () => Promise<void>;
  loadWorkflowBoard: () => Promise<void>;
  loadUndoStack: () => Promise<void>;
  loadWorkflowOpLogs: () => Promise<void>;
};

export const useWorkflowWorkbenchRouteScope = (options: UseWorkflowWorkbenchRouteScopeOptions) => {
  const syncScopeQueryToRoute = async (): Promise<void> => {
    if (options.syncingScopeQuery.value) {
      return;
    }
    const currentQuery = toSingleQuery(options.route.query);
    const currentScope = currentQuery.episodeScope;
    const currentEpisodeId = currentQuery.episodeId;

    const nextScope = options.workflowMode.value;
    const nextEpisodeId =
      options.workflowMode.value === 'single' && options.workflowScopeEpisodeId.value ? options.workflowScopeEpisodeId.value : undefined;
    if ((currentScope || undefined) === nextScope && (currentEpisodeId || undefined) === nextEpisodeId) {
      return;
    }

    options.syncingScopeQuery.value = true;
    try {
      await options.router.replace({
        path: options.route.path,
        query: {
          ...currentQuery,
          episodeScope: nextScope,
          ...(nextEpisodeId ? { episodeId: nextEpisodeId } : { episodeId: undefined })
        }
      });
    } finally {
      options.syncingScopeQuery.value = false;
    }
  };

  const applyWorkflowScopeMode = async (): Promise<void> => {
    if (options.workflowMode.value === 'single') {
      if (!options.workflowScopeEpisodeId.value) {
        options.error.value = '单集模式需要先选择分集';
        return;
      }
      options.episodeBatchIds.value = [options.workflowScopeEpisodeId.value];
      options.selectedEpisodeIds.value = [options.workflowScopeEpisodeId.value];
      options.targetEpisodeId.value = options.workflowScopeEpisodeId.value;
      options.workflowPage.value = 1;
      options.workflowQuery.value = '';
    } else {
      options.episodeBatchIds.value = [];
      options.selectedEpisodeIds.value = [];
      options.workflowQuery.value = '';
      options.workflowPage.value = 1;
    }
    await Promise.all([options.loadWorkflowBoard(), options.runBatchPrecheck()]);
  };

  const applyRouteQueryPreset = (): void => {
    if (options.syncingScopeQuery.value) {
      return;
    }
    const query = toSingleQuery(options.route.query);
    const episodeId = query.episodeId;
    const status = query.status;
    const episodeScope = query.episodeScope;
    if (episodeScope === 'single' || episodeScope === 'batch') {
      options.workflowMode.value = episodeScope;
    }
    if (typeof status === 'string' && ['draft', 'in_review', 'approved', 'rejected'].includes(status)) {
      options.workflowStatusFilter.value = status as 'draft' | 'in_review' | 'approved' | 'rejected';
    }
    if (typeof episodeId === 'string' && episodeId.trim() && options.episodes.value.some((item) => item.id === episodeId)) {
      options.workflowScopeEpisodeId.value = episodeId;
      options.selectedEpisodeIds.value = [episodeId];
      options.episodeBatchIds.value = [episodeId];
      options.targetEpisodeId.value = episodeId;
      options.workflowQuery.value = '';
      options.workflowPage.value = 1;
    }
    const hasScopePreset =
      (typeof episodeScope === 'string' && (episodeScope === 'single' || episodeScope === 'batch')) ||
      (typeof episodeId === 'string' && episodeId.trim().length > 0) ||
      (typeof status === 'string' && ['draft', 'in_review', 'approved', 'rejected'].includes(status));
    if (hasScopePreset) {
      const targetId =
        typeof status === 'string' && ['draft', 'in_review', 'approved', 'rejected'].includes(status)
          ? 'workflow-review-board'
          : 'workflow-scope-panel';
      options.markWorkflowRouteRestored(buildRouteRestoreTip('scope_filter'), targetId);
    } else {
      options.clearWorkflowRouteRestored();
    }
  };

  const loadAll = async (): Promise<void> => {
    options.projectId.value = await resolveProjectIdFromRouteContext({
      currentProjectId: options.projectId.value,
      routeProjectId: options.routeProjectId.value,
      routeDramaId: options.routeDramaId.value
    });
    if (!options.projectId.value) {
      options.error.value = '无法解析项目上下文';
      return;
    }
    options.loading.value = true;
    try {
      const [projectData, episodeList, scriptList, storyboardList, assetList, libraryPage, modelList] = await Promise.all([
        getProject(options.projectId.value),
        options.hasDramaScopedApi.value ? getEpisodeDomainsByDrama(options.dramaId.value) : getEpisodeDomains(options.projectId.value),
        options.hasDramaScopedApi.value ? getDramaScripts(options.dramaId.value) : getScripts(options.projectId.value),
        options.hasDramaScopedApi.value ? getDramaStoryboards(options.dramaId.value) : getStoryboards(options.projectId.value),
        options.hasDramaScopedApi.value ? getDramaAssets(options.dramaId.value) : getAssets(options.projectId.value),
        getResourceLibrary({ page: 1, pageSize: 100 }),
        getModelConfigs('audio')
      ]);
      options.project.value = projectData;
      options.episodes.value = episodeList;
      if (!options.workflowScopeEpisodeId.value && episodeList.length > 0) {
        options.workflowScopeEpisodeId.value = episodeList[0].id;
      }
      options.scripts.value = scriptList;
      options.storyboards.value = storyboardList;
      options.assets.value = assetList;
      options.resources.value = libraryPage.items.map((item) => ({ id: item.id, type: item.type, name: item.name }));
      await options.loadWorkflowOpLogs();
      options.audioModels.value = modelList.filter((item) => item.enabled);
      options.ensureAudioDefaults();
      applyRouteQueryPreset();
      if (options.workflowMode.value === 'single' && options.workflowScopeEpisodeId.value) {
        options.episodeBatchIds.value = [options.workflowScopeEpisodeId.value];
        options.selectedEpisodeIds.value = [options.workflowScopeEpisodeId.value];
        options.targetEpisodeId.value = options.workflowScopeEpisodeId.value;
      }
      await Promise.all([options.loadWorkflowBoard(), options.loadUndoStack(), options.runBatchPrecheck()]);
      await options.runFramePromptPrecheck();
      options.runWorkflowRouteRestoreScroll();
      options.error.value = '';
      options.quotaExceededHintVisible.value = false;
    } catch (err) {
      options.quotaExceededHintVisible.value = false;
      options.error.value = err instanceof Error ? err.message : '加载失败';
    } finally {
      options.loading.value = false;
    }
  };

  return {
    applyRouteQueryPreset,
    applyWorkflowScopeMode,
    loadAll,
    syncScopeQueryToRoute
  };
};
