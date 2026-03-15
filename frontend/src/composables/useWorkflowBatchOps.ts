import type { Ref } from 'vue';
import type { Router } from 'vue-router';
import {
  createDramaEpisodesVideoTasksBatch,
  createEpisodesVideoTasksBatch,
  generateDramaEpisodesAssetsBatch,
  generateEpisodesAssetsBatch,
  clearDramaWorkflowOpLogs,
  clearProjectWorkflowOpLogs,
  precheckDramaEpisodesAssetsBatch,
  precheckDramaEpisodesVideoTasksBatch,
  precheckEpisodesAssetsBatch,
  precheckEpisodesVideoTasksBatch,
  transitionDramaWorkflowEpisodesBatch,
  transitionProjectWorkflowEpisodesBatch,
  undoDramaWorkflowTransitionBatch,
  undoWorkflowTransitionBatch
} from '@/api/workflow-ops';
import { createAssetsByEpisodeFromResource } from '@/api/resource-library';
import { isVideoTaskQuotaExceededError } from '@/utils/errors';

type EpisodeOption = {
  id: string;
  title: string;
};

type WorkflowListItem = {
  episode: {
    id: string;
  };
};

type UndoStackItem = {
  id: string;
};

type BatchTransitionDraft = {
  episodeIds: string[];
  toStatus: 'draft' | 'in_review' | 'approved' | 'rejected';
  actor: string;
  comment: string;
  confirmed: boolean;
};

type UseWorkflowBatchOpsOptions = {
  router: Router;
  hasDramaScopedApi: Ref<boolean>;
  dramaId: Ref<string>;
  projectId: Ref<string>;
  loading: Ref<boolean>;
  error: Ref<string>;
  quotaExceededHintVisible: Ref<boolean>;
  workflowItems: Ref<WorkflowListItem[]>;
  selectedEpisodeIds: Ref<string[]>;
  batchToStatus: Ref<'draft' | 'in_review' | 'approved' | 'rejected'>;
  batchActor: Ref<string>;
  batchComment: Ref<string>;
  batchTransitionDraft: Ref<BatchTransitionDraft | null>;
  undoStack: Ref<UndoStackItem[]>;
  episodes: Ref<EpisodeOption[]>;
  episodeBatchIds: Ref<string[]>;
  videoTaskPriority: Ref<'low' | 'medium' | 'high'>;
  videoDuration: Ref<number>;
  assetPrecheckByEpisode: Ref<Record<string, { creatableStoryboardIds: string[]; conflictStoryboardIds: string[] }>>;
  videoPrecheckByEpisode: Ref<Record<string, { creatableStoryboardIds: string[]; conflictStoryboardIds: string[] }>>;
  resourceId: Ref<string>;
  targetEpisodeId: Ref<string>;
  applyMode: Ref<'missing_only' | 'all'>;
  loadWorkflowBoard: () => Promise<void>;
  loadUndoStack: () => Promise<void>;
  pushWorkflowOpLog: (input: { action: string; estimated: string; actual: string; note?: string }) => Promise<void>;
};

export const useWorkflowBatchOps = (options: UseWorkflowBatchOpsOptions) => {
  const runBatchPrecheck = async (): Promise<void> => {
    const episodeIds = options.episodeBatchIds.value.length > 0 ? options.episodeBatchIds.value : undefined;
    const [assetInfo, videoInfo] = await Promise.all([
      options.hasDramaScopedApi.value
        ? precheckDramaEpisodesAssetsBatch(options.dramaId.value, { episodeIds })
        : precheckEpisodesAssetsBatch(options.projectId.value, { episodeIds }),
      options.hasDramaScopedApi.value
        ? precheckDramaEpisodesVideoTasksBatch(options.dramaId.value, { episodeIds })
        : precheckEpisodesVideoTasksBatch(options.projectId.value, { episodeIds })
    ]);
    options.assetPrecheckByEpisode.value = Object.fromEntries(
      assetInfo.episodes.map((item) => [item.episodeId, { creatableStoryboardIds: item.creatableStoryboardIds, conflictStoryboardIds: item.conflictStoryboardIds }])
    );
    options.videoPrecheckByEpisode.value = Object.fromEntries(
      videoInfo.episodes.map((item) => [item.episodeId, { creatableStoryboardIds: item.creatableStoryboardIds, conflictStoryboardIds: item.conflictStoryboardIds }])
    );
  };

  const openBatchTransitionConfirm = (): void => {
    if (options.selectedEpisodeIds.value.length === 0) {
      options.error.value = '请先选择 Episode';
      return;
    }
    options.batchTransitionDraft.value = {
      episodeIds: [...options.selectedEpisodeIds.value],
      toStatus: options.batchToStatus.value,
      actor: options.batchActor.value.trim() || 'operator',
      comment: options.batchComment.value.trim(),
      confirmed: false
    };
  };

  const clearWorkflowOpLogs = async (): Promise<void> => {
    if (options.hasDramaScopedApi.value) {
      await clearDramaWorkflowOpLogs(options.dramaId.value);
    } else {
      await clearProjectWorkflowOpLogs(options.projectId.value);
    }
  };

  const cancelBatchTransition = (): void => {
    options.batchTransitionDraft.value = null;
  };

  const updateBatchTransitionDraft = (key: 'actor' | 'comment' | 'confirmed', value: string | boolean): void => {
    const draft = options.batchTransitionDraft.value;
    if (!draft) {
      return;
    }
    if (key === 'actor' && typeof value === 'string') {
      draft.actor = value;
      return;
    }
    if (key === 'comment' && typeof value === 'string') {
      draft.comment = value;
      return;
    }
    if (key === 'confirmed' && typeof value === 'boolean') {
      draft.confirmed = value;
    }
  };

  const confirmBatchTransition = async (): Promise<void> => {
    const draft = options.batchTransitionDraft.value;
    if (!draft || !draft.confirmed) {
      return;
    }
    options.loading.value = true;
    try {
      const payload = {
        episodeIds: draft.episodeIds,
        toStatus: draft.toStatus,
        actor: draft.actor.trim() || 'operator',
        comment: draft.comment.trim() || undefined
      };
      const result = options.hasDramaScopedApi.value
        ? await transitionDramaWorkflowEpisodesBatch(options.dramaId.value, payload)
        : await transitionProjectWorkflowEpisodesBatch(options.projectId.value, payload);
      await options.pushWorkflowOpLog({
        action: '批量流转',
        estimated: `计划处理 ${draft.episodeIds.length} 集 -> ${draft.toStatus}`,
        actual: `更新 ${result.updated.length} 集，非法 ${result.invalidTransitionIds.length}，未找到 ${result.notFoundIds.length}`,
        note: result.undoEntryId ? `undoEntryId=${result.undoEntryId}` : undefined
      });
      options.batchTransitionDraft.value = null;
      await Promise.all([options.loadWorkflowBoard(), options.loadUndoStack()]);
      options.error.value = '';
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : '批量流转失败';
    } finally {
      options.loading.value = false;
    }
  };

  const undoLatest = async (): Promise<void> => {
    options.loading.value = true;
    try {
      if (options.hasDramaScopedApi.value) {
        await undoDramaWorkflowTransitionBatch(options.dramaId.value, { actor: options.batchActor.value.trim() || 'operator' });
      } else {
        await undoWorkflowTransitionBatch(options.projectId.value, { actor: options.batchActor.value.trim() || 'operator' });
      }
      await Promise.all([options.loadWorkflowBoard(), options.loadUndoStack()]);
      options.error.value = '';
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : '撤销失败';
    } finally {
      options.loading.value = false;
    }
  };

  const undoById = async (entryId: string): Promise<void> => {
    options.loading.value = true;
    try {
      const payload = {
        entryId,
        actor: options.batchActor.value.trim() || 'operator'
      };
      if (options.hasDramaScopedApi.value) {
        await undoDramaWorkflowTransitionBatch(options.dramaId.value, payload);
      } else {
        await undoWorkflowTransitionBatch(options.projectId.value, payload);
      }
      await Promise.all([options.loadWorkflowBoard(), options.loadUndoStack()]);
      options.error.value = '';
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : '撤销失败';
    } finally {
      options.loading.value = false;
    }
  };

  const runBatchAssets = async (): Promise<void> => {
    options.loading.value = true;
    try {
      const payload = {
        episodeIds: options.episodeBatchIds.value.length > 0 ? options.episodeBatchIds.value : undefined
      };
      const result = options.hasDramaScopedApi.value
        ? await generateDramaEpisodesAssetsBatch(options.dramaId.value, payload)
        : await generateEpisodesAssetsBatch(options.projectId.value, payload);
      const failures = result.episodes.flatMap((item) => item.failures ?? []);
      const failureSummary =
        failures.length > 0
          ? `部分资产生成失败：${failures
              .slice(0, 3)
              .map((item) => `${item.storyboardTitle}: ${item.message}`)
              .join('；')}${failures.length > 3 ? '；...' : ''}`
          : '';
      await runBatchPrecheck();
      options.error.value = failureSummary;
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : '批量资产失败';
    } finally {
      options.loading.value = false;
    }
  };

  const runBatchVideoTasks = async (): Promise<void> => {
    options.loading.value = true;
    options.quotaExceededHintVisible.value = false;
    try {
      const payload = {
        episodeIds: options.episodeBatchIds.value.length > 0 ? options.episodeBatchIds.value : undefined,
        priority: options.videoTaskPriority.value,
        mode: 'singleImage' as const,
        duration: options.videoDuration.value
      };
      if (options.hasDramaScopedApi.value) {
        await createDramaEpisodesVideoTasksBatch(options.dramaId.value, payload);
      } else {
        await createEpisodesVideoTasksBatch(options.projectId.value, payload);
      }
      await runBatchPrecheck();
      options.error.value = '';
    } catch (err) {
      options.quotaExceededHintVisible.value = isVideoTaskQuotaExceededError(err);
      options.error.value = err instanceof Error ? err.message : '批量视频任务失败';
    } finally {
      options.loading.value = false;
    }
  };

  const goTaskQuotaPanel = async (): Promise<void> => {
    const targetPath = options.hasDramaScopedApi.value ? `/dramas/${options.dramaId.value}/tasks` : '/tasks';
    await options.router.push({
      path: targetPath,
      hash: '#task-slo-quota',
      query: {
        ...(options.hasDramaScopedApi.value ? { dramaId: options.dramaId.value } : {}),
        ...(options.projectId.value ? { taskQuotaProjectId: options.projectId.value } : {})
      }
    });
  };

  const applyResourceToEpisode = async (): Promise<void> => {
    if (!options.resourceId.value || !options.targetEpisodeId.value) {
      options.error.value = '请先选择资源和分集';
      return;
    }
    options.loading.value = true;
    try {
      await createAssetsByEpisodeFromResource(options.resourceId.value, {
        projectId: options.projectId.value,
        episodeId: options.targetEpisodeId.value,
        mode: options.applyMode.value
      });
      await runBatchPrecheck();
      options.error.value = '';
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : '批量投放失败';
    } finally {
      options.loading.value = false;
    }
  };

  const toggleSelectEpisode = (episodeId: string, checked: boolean): void => {
    const set = new Set(options.selectedEpisodeIds.value);
    if (checked) set.add(episodeId);
    else set.delete(episodeId);
    options.selectedEpisodeIds.value = [...set];
  };

  const toggleSelectAll = (checked: boolean): void => {
    options.selectedEpisodeIds.value = checked ? options.workflowItems.value.map((item) => item.episode.id) : [];
  };

  const toggleEpisodeBatch = (episodeId: string, checked: boolean): void => {
    const set = new Set(options.episodeBatchIds.value);
    if (checked) set.add(episodeId);
    else set.delete(episodeId);
    options.episodeBatchIds.value = [...set];
  };

  const toggleSelectAllEpisodes = (checked: boolean): void => {
    options.episodeBatchIds.value = checked ? options.episodes.value.map((item) => item.id) : [];
  };

  return {
    applyResourceToEpisode,
    cancelBatchTransition,
    clearWorkflowOpLogs,
    confirmBatchTransition,
    goTaskQuotaPanel,
    openBatchTransitionConfirm,
    runBatchAssets,
    runBatchPrecheck,
    runBatchVideoTasks,
    toggleEpisodeBatch,
    toggleSelectAll,
    toggleSelectAllEpisodes,
    toggleSelectEpisode,
    undoById,
    undoLatest,
    updateBatchTransitionDraft
  };
};
