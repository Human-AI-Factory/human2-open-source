import type { Ref } from 'vue';
import {
  generateDramaFramePromptsByWorkflow,
  generateProjectFramePromptsByWorkflow
} from '@/api/frame-prompts';
import {
  getDramaScripts,
  getScripts
} from '@/api/studio';
import {
  getDramaWorkflowEpisodes,
  getProjectWorkflowEpisodes
} from '@/api/project-workflow';
import {
  generateDramaStoryboards,
  generateStoryboards,
  overrideDramaWorkflowEpisodesBatch,
  overrideProjectWorkflowEpisodesBatch
} from '@/api/workflow-ops';
import type {
  EpisodeWorkflowStatus,
  ProjectFramePromptByWorkflowResult,
  WorkflowEpisodeListItem
} from '@/types/models';

type WorkflowConfirmDraft = {
  episodeIds: string[];
  actor: string;
  comment: string;
  confirmed: boolean;
};

type FramePrecheckRow = {
  episodeId: string;
  orderIndex: number;
  title: string;
  status: EpisodeWorkflowStatus;
  storyboardCount: number;
  eligible: boolean;
  reason: 'no_storyboards' | 'approved' | null;
};

type WorkflowOpLogInput = {
  action: string;
  estimated: string;
  actual: string;
  note?: string;
};

type UseWorkflowFramePromptOpsOptions = {
  hasDramaScopedApi: Ref<boolean>;
  dramaId: Ref<string>;
  projectId: Ref<string>;
  loading: Ref<boolean>;
  error: Ref<string>;
  frameWorkflowStatuses: Ref<Record<EpisodeWorkflowStatus, boolean>>;
  frameType: Ref<'opening' | 'middle' | 'ending' | 'action' | 'emotion'>;
  frameSaveAs: Ref<'none' | 'replace_storyboard_prompt'>;
  frameLimitPerEpisode: Ref<number>;
  frameAutoTransition: Ref<boolean>;
  batchActor: Ref<string>;
  batchComment: Ref<string>;
  framePrecheck: Ref<{ matched: number; eligibleEpisodeIds: string[]; skippedEpisodeIds: string[] }>;
  framePrecheckRows: Ref<FramePrecheckRow[]>;
  frameBatchResult: Ref<ProjectFramePromptByWorkflowResult | null>;
  frameOpsMessage: Ref<string>;
  repairNoStoryboardDraft: Ref<WorkflowConfirmDraft | null>;
  rebuildStructuredStoryboardDraft: Ref<WorkflowConfirmDraft | null>;
  approvedRollbackDraft: Ref<WorkflowConfirmDraft | null>;
  noStoryboardEpisodeIds: Ref<string[]>;
  structuredStoryboardEpisodeIds: Ref<string[]>;
  approvedSkippedEpisodeIds: Ref<string[]>;
  loadWorkflowBoard: () => Promise<void>;
  loadUndoStack: () => Promise<void>;
  pushWorkflowOpLog: (input: WorkflowOpLogInput) => Promise<void>;
};

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const STORYBOARD_GENERATION_RETRY_DELAYS_MS = [600, 1200] as const;

const waitFor = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const isTransientStoryboardGenerationError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /fetch failed|failed to fetch|networkerror|network error|timed out|timeout|econnreset|socket hang up/i.test(message);
};

export const useWorkflowFramePromptOps = (options: UseWorkflowFramePromptOpsOptions) => {
  const requestStoryboardsWithRetry = async (scriptId: string): Promise<ReturnType<typeof generateStoryboards>> => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= STORYBOARD_GENERATION_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return options.hasDramaScopedApi.value
          ? await generateDramaStoryboards(options.dramaId.value, { scriptId })
          : await generateStoryboards(options.projectId.value, { scriptId });
      } catch (err) {
        lastError = err;
        if (!isTransientStoryboardGenerationError(err) || attempt === STORYBOARD_GENERATION_RETRY_DELAYS_MS.length) {
          throw err;
        }
        await waitFor(STORYBOARD_GENERATION_RETRY_DELAYS_MS[attempt]!);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('storyboard generation failed');
  };

  const generateStoryboardsForEpisodes = async (
    episodeIds: string[]
  ): Promise<{
    generatedStoryboardCount: number;
    processedEpisodeCount: number;
    skippedEpisodeCount: number;
    failedEpisodeMessages: string[];
  }> => {
    const scripts = options.hasDramaScopedApi.value ? await getDramaScripts(options.dramaId.value) : await getScripts(options.projectId.value);
    let generatedStoryboardCount = 0;
    let processedEpisodeCount = 0;
    let skippedEpisodeCount = 0;
    const failedEpisodeMessages: string[] = [];

    for (const episodeId of episodeIds) {
      const targetScripts = scripts.filter((item) => item.episodeId === episodeId);
      if (targetScripts.length === 0) {
        skippedEpisodeCount += 1;
        continue;
      }
      let hasGenerated = false;
      let episodeFailed = false;
      for (const script of targetScripts) {
        try {
          const rows = await requestStoryboardsWithRetry(script.id);
          if (rows.length > 0) {
            hasGenerated = true;
            generatedStoryboardCount += rows.length;
          }
        } catch (err) {
          episodeFailed = true;
          const message = err instanceof Error ? err.message : '未知错误';
          failedEpisodeMessages.push(`${script.title}: ${message}`);
        }
      }
      if (hasGenerated) {
        processedEpisodeCount += 1;
      } else {
        skippedEpisodeCount += 1;
      }
      if (episodeFailed && hasGenerated) {
        failedEpisodeMessages.push(`episode=${episodeId}: 部分脚本生成失败`);
      }
    }

    return {
      generatedStoryboardCount,
      processedEpisodeCount,
      skippedEpisodeCount,
      failedEpisodeMessages
    };
  };

  const collectWorkflowEpisodesByStatuses = async (statuses: EpisodeWorkflowStatus[]): Promise<WorkflowEpisodeListItem[]> => {
    const all: WorkflowEpisodeListItem[] = [];
    for (const status of statuses) {
      let page = 1;
      for (let i = 0; i < 20; i += 1) {
        const query = { status, page, pageSize: 200 };
        const resp = options.hasDramaScopedApi.value
          ? await getDramaWorkflowEpisodes(options.dramaId.value, query)
          : await getProjectWorkflowEpisodes(options.projectId.value, query);
        all.push(...resp.items);
        if (resp.page >= Math.max(1, Math.ceil(resp.total / resp.pageSize))) {
          break;
        }
        page += 1;
      }
    }
    const unique = new Map<string, WorkflowEpisodeListItem>();
    for (const item of all) {
      unique.set(item.episode.id, item);
    }
    return Array.from(unique.values());
  };

  const runFramePromptPrecheck = async (): Promise<void> => {
    const statuses = (Object.keys(options.frameWorkflowStatuses.value) as EpisodeWorkflowStatus[]).filter(
      (key) => options.frameWorkflowStatuses.value[key]
    );
    if (statuses.length === 0) {
      options.error.value = '请至少选择一个 workflow 状态';
      return;
    }
    options.loading.value = true;
    try {
      const rows = await collectWorkflowEpisodesByStatuses(statuses);
      const mappedRows = rows
        .map((item) => {
          const noStoryboards = item.storyboardCount <= 0;
          const approved = item.workflow.status === 'approved';
          const eligible = !noStoryboards && !approved;
          return {
            episodeId: item.episode.id,
            orderIndex: item.episode.orderIndex,
            title: item.episode.title,
            status: item.workflow.status,
            storyboardCount: item.storyboardCount,
            eligible,
            reason: noStoryboards ? ('no_storyboards' as const) : approved ? ('approved' as const) : null
          };
        })
        .sort((a, b) => a.orderIndex - b.orderIndex);
      const eligible = mappedRows.filter((item) => item.eligible).map((item) => item.episodeId);
      const skipped = mappedRows.filter((item) => !item.eligible).map((item) => item.episodeId);
      options.framePrecheckRows.value = mappedRows;
      options.framePrecheck.value = {
        matched: rows.length,
        eligibleEpisodeIds: eligible,
        skippedEpisodeIds: skipped
      };
      options.error.value = '';
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : 'Frame Prompt 预检查失败';
      options.framePrecheckRows.value = [];
    } finally {
      options.loading.value = false;
    }
  };

  const runFramePromptWorkflowBatch = async (): Promise<void> => {
    const statuses = (Object.keys(options.frameWorkflowStatuses.value) as EpisodeWorkflowStatus[]).filter(
      (key) => options.frameWorkflowStatuses.value[key]
    );
    if (statuses.length === 0) {
      options.error.value = '请至少选择一个 workflow 状态';
      return;
    }
    options.loading.value = true;
    try {
      const payload = {
        statuses,
        frameType: options.frameType.value,
        saveAs: options.frameSaveAs.value,
        limitPerEpisode: Math.max(1, Math.min(200, Math.floor(options.frameLimitPerEpisode.value || 20))),
        autoTransitionToInReview: options.frameAutoTransition.value,
        actor: options.batchActor.value.trim() || 'operator',
        comment: options.batchComment.value.trim() || undefined
      };
      options.frameBatchResult.value = options.hasDramaScopedApi.value
        ? await generateDramaFramePromptsByWorkflow(options.dramaId.value, payload)
        : await generateProjectFramePromptsByWorkflow(options.projectId.value, payload);
      await Promise.all([options.loadWorkflowBoard(), options.loadUndoStack()]);
      await runFramePromptPrecheck();
      options.frameOpsMessage.value = '';
      options.error.value = '';
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : 'Frame Prompt 批处理失败';
    } finally {
      options.loading.value = false;
    }
  };

  const openRepairNoStoryboardsConfirm = (): void => {
    const episodeIds = options.noStoryboardEpisodeIds.value;
    if (episodeIds.length === 0) {
      options.frameOpsMessage.value = '没有 no_storyboards 的分集需要修复';
      return;
    }
    options.repairNoStoryboardDraft.value = {
      episodeIds,
      actor: options.batchActor.value.trim() || 'operator',
      comment: options.batchComment.value.trim() || 'repair no_storyboards by script generation',
      confirmed: false
    };
  };

  const cancelRepairNoStoryboards = (): void => {
    options.repairNoStoryboardDraft.value = null;
  };

  const updateRepairNoStoryboardDraft = (key: 'actor' | 'comment' | 'confirmed', value: string | boolean): void => {
    const draft = options.repairNoStoryboardDraft.value;
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

  const openRebuildStructuredStoryboardsConfirm = (): void => {
    const episodeIds = options.structuredStoryboardEpisodeIds.value;
    if (episodeIds.length === 0) {
      options.frameOpsMessage.value = '没有已有分镜的分集需要重建';
      return;
    }
    options.rebuildStructuredStoryboardDraft.value = {
      episodeIds,
      actor: options.batchActor.value.trim() || 'operator',
      comment: options.batchComment.value.trim() || 'rebuild existing storyboards with structured planner',
      confirmed: false
    };
  };

  const cancelRebuildStructuredStoryboards = (): void => {
    options.rebuildStructuredStoryboardDraft.value = null;
  };

  const updateRebuildStructuredStoryboardDraft = (key: 'actor' | 'comment' | 'confirmed', value: string | boolean): void => {
    const draft = options.rebuildStructuredStoryboardDraft.value;
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

  const confirmRepairNoStoryboards = async (): Promise<void> => {
    const draft = options.repairNoStoryboardDraft.value;
    if (!draft || !draft.confirmed) {
      return;
    }
    const episodeIds = draft.episodeIds;
    options.loading.value = true;
    try {
      const { generatedStoryboardCount, processedEpisodeCount, skippedEpisodeCount, failedEpisodeMessages } =
        await generateStoryboardsForEpisodes(episodeIds);
      await Promise.all([options.loadWorkflowBoard(), runFramePromptPrecheck()]);
      const failureSummary =
        failedEpisodeMessages.length > 0
          ? `；失败 ${failedEpisodeMessages.length} 项（${failedEpisodeMessages.slice(0, 3).join('；')}${failedEpisodeMessages.length > 3 ? '；...' : ''}）`
          : '';
      options.frameOpsMessage.value = `已修复 ${processedEpisodeCount} 集，新增分镜 ${generatedStoryboardCount} 条，跳过 ${skippedEpisodeCount} 集${failureSummary}`;
      await options.pushWorkflowOpLog({
        action: '修复 no_storyboards',
        estimated: `计划修复 ${episodeIds.length} 集`,
        actual: `已修复 ${processedEpisodeCount} 集，新增分镜 ${generatedStoryboardCount} 条，跳过 ${skippedEpisodeCount} 集，失败 ${failedEpisodeMessages.length} 项`,
        note: `actor=${draft.actor.trim() || 'operator'}${failedEpisodeMessages.length > 0 ? `; failures=${failedEpisodeMessages.slice(0, 5).join(' | ')}` : ''}`
      });
      options.repairNoStoryboardDraft.value = null;
      options.error.value = processedEpisodeCount > 0 ? '' : failedEpisodeMessages[0] || '';
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : '修复 no_storyboards 失败';
    } finally {
      options.loading.value = false;
    }
  };

  const confirmRebuildStructuredStoryboards = async (): Promise<void> => {
    const draft = options.rebuildStructuredStoryboardDraft.value;
    if (!draft || !draft.confirmed) {
      return;
    }
    const episodeIds = draft.episodeIds;
    options.loading.value = true;
    try {
      const { generatedStoryboardCount, processedEpisodeCount, skippedEpisodeCount, failedEpisodeMessages } =
        await generateStoryboardsForEpisodes(episodeIds);
      await Promise.all([options.loadWorkflowBoard(), runFramePromptPrecheck()]);
      const failureSummary =
        failedEpisodeMessages.length > 0
          ? `；失败 ${failedEpisodeMessages.length} 项（${failedEpisodeMessages.slice(0, 3).join('；')}${failedEpisodeMessages.length > 3 ? '；...' : ''}）`
          : '';
      options.frameOpsMessage.value = `已重建 ${processedEpisodeCount} 集分镜，产出 ${generatedStoryboardCount} 条结构化分镜，跳过 ${skippedEpisodeCount} 集${failureSummary}`;
      await options.pushWorkflowOpLog({
        action: '按剧本重建现有分镜',
        estimated: `计划重建 ${episodeIds.length} 集已有分镜`,
        actual: `已重建 ${processedEpisodeCount} 集，产出 ${generatedStoryboardCount} 条结构化分镜，跳过 ${skippedEpisodeCount} 集，失败 ${failedEpisodeMessages.length} 项`,
        note: `actor=${draft.actor.trim() || 'operator'}${failedEpisodeMessages.length > 0 ? `; failures=${failedEpisodeMessages.slice(0, 5).join(' | ')}` : ''}`
      });
      options.rebuildStructuredStoryboardDraft.value = null;
      options.error.value = processedEpisodeCount > 0 ? '' : failedEpisodeMessages[0] || '';
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : '重建结构化分镜失败';
    } finally {
      options.loading.value = false;
    }
  };

  const reopenApprovedEpisodesToInReview = (): void => {
    const episodeIds = options.approvedSkippedEpisodeIds.value;
    if (episodeIds.length === 0) {
      options.frameOpsMessage.value = '没有 approved 的跳过项需要处理';
      return;
    }
    options.approvedRollbackDraft.value = {
      episodeIds,
      actor: options.batchActor.value.trim() || 'operator',
      comment: options.batchComment.value.trim() || 'reopen approved episodes for frame-prompt refinement',
      confirmed: false
    };
  };

  const cancelApprovedRollback = (): void => {
    options.approvedRollbackDraft.value = null;
  };

  const updateApprovedRollbackDraft = (key: 'actor' | 'comment' | 'confirmed', value: string | boolean): void => {
    const draft = options.approvedRollbackDraft.value;
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

  const confirmApprovedRollback = async (): Promise<void> => {
    const draft = options.approvedRollbackDraft.value;
    if (!draft || !draft.confirmed) {
      return;
    }
    options.loading.value = true;
    try {
      const payload: {
        episodeIds: string[];
        toStatus: EpisodeWorkflowStatus;
        actor?: string;
        comment?: string;
      } = {
        episodeIds: draft.episodeIds,
        toStatus: 'in_review',
        actor: draft.actor.trim() || 'operator',
        comment: draft.comment.trim() || 'reopen approved episodes for frame-prompt refinement'
      };
      const result = options.hasDramaScopedApi.value
        ? await overrideDramaWorkflowEpisodesBatch(options.dramaId.value, payload)
        : await overrideProjectWorkflowEpisodesBatch(options.projectId.value, payload);
      await options.pushWorkflowOpLog({
        action: 'approved 回退',
        estimated: `计划回退 ${draft.episodeIds.length} 集 approved -> in_review`,
        actual: `回退 ${result.updated.length} 集，未变化 ${result.unchangedIds.length}，未找到 ${result.notFoundIds.length}`,
        note: result.undoEntryId ? `undoEntryId=${result.undoEntryId}` : undefined
      });
      await Promise.all([options.loadWorkflowBoard(), options.loadUndoStack(), runFramePromptPrecheck()]);
      options.frameOpsMessage.value = `已回退 ${result.updated.length} 集到 in_review，未变化 ${result.unchangedIds.length} 集，未找到 ${result.notFoundIds.length} 集`;
      options.approvedRollbackDraft.value = null;
      options.error.value = '';
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : '回退 approved 失败';
    } finally {
      options.loading.value = false;
    }
  };

  const exportFramePrecheckJson = (): void => {
    const payload = {
      exportedAt: new Date().toISOString(),
      projectId: options.projectId.value,
      summary: options.framePrecheck.value,
      rows: options.framePrecheckRows.value
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `workflow-frame-precheck-${Date.now()}.json`);
  };

  return {
    cancelApprovedRollback,
    cancelRebuildStructuredStoryboards,
    cancelRepairNoStoryboards,
    confirmApprovedRollback,
    confirmRebuildStructuredStoryboards,
    confirmRepairNoStoryboards,
    exportFramePrecheckJson,
    openRebuildStructuredStoryboardsConfirm,
    openRepairNoStoryboardsConfirm,
    reopenApprovedEpisodesToInReview,
    runFramePromptPrecheck,
    runFramePromptWorkflowBatch,
    updateApprovedRollbackDraft,
    updateRebuildStructuredStoryboardDraft,
    updateRepairNoStoryboardDraft
  };
};
