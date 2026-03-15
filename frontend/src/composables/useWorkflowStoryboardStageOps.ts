import type { ComputedRef, Ref } from 'vue';
import {
  planDramaStoryboards,
  planStoryboards,
  renderDramaStoryboardImages,
  renderStoryboardImages
} from '@/api/workflow-ops';
import type { ScriptDoc, Storyboard } from '@/types/models';

type WorkflowConfirmDraft = {
  episodeIds: string[];
  actor: string;
  comment: string;
  confirmed: boolean;
};

type WorkflowOpLogInput = {
  action: string;
  estimated: string;
  actual: string;
  note?: string;
};

type UseWorkflowStoryboardStageOpsOptions = {
  hasDramaScopedApi: Ref<boolean>;
  dramaId: Ref<string>;
  projectId: Ref<string>;
  loading: Ref<boolean>;
  error: Ref<string>;
  batchActor: Ref<string>;
  batchComment: Ref<string>;
  scripts: Ref<ScriptDoc[]>;
  storyboards: Ref<Storyboard[]>;
  targetEpisodeIds: ComputedRef<string[]>;
  storyboardStageMessage: Ref<string>;
  planStoryboardDraft: Ref<WorkflowConfirmDraft | null>;
  renderStoryboardDraft: Ref<WorkflowConfirmDraft | null>;
  loadAll: () => Promise<void>;
  pushWorkflowOpLog: (input: WorkflowOpLogInput) => Promise<void>;
};

const STORYBOARD_STAGE_RETRY_DELAYS_MS = [600, 1200] as const;

const waitFor = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const isTransientStoryboardStageError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /fetch failed|failed to fetch|networkerror|network error|timed out|timeout|econnreset|socket hang up/i.test(message);
};

export const useWorkflowStoryboardStageOps = (options: UseWorkflowStoryboardStageOpsOptions) => {
  const requestPlanWithRetry = async (scriptId: string): Promise<Storyboard[]> => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= STORYBOARD_STAGE_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return options.hasDramaScopedApi.value
          ? await planDramaStoryboards(options.dramaId.value, { scriptId })
          : await planStoryboards(options.projectId.value, { scriptId });
      } catch (err) {
        lastError = err;
        if (!isTransientStoryboardStageError(err) || attempt === STORYBOARD_STAGE_RETRY_DELAYS_MS.length) {
          throw err;
        }
        await waitFor(STORYBOARD_STAGE_RETRY_DELAYS_MS[attempt]!);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('storyboard planning failed');
  };

  const requestRenderWithRetry = async (storyboardIds: string[]): Promise<Storyboard[]> => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= STORYBOARD_STAGE_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return options.hasDramaScopedApi.value
          ? await renderDramaStoryboardImages(options.dramaId.value, { storyboardIds })
          : await renderStoryboardImages(options.projectId.value, { storyboardIds });
      } catch (err) {
        lastError = err;
        if (!isTransientStoryboardStageError(err) || attempt === STORYBOARD_STAGE_RETRY_DELAYS_MS.length) {
          throw err;
        }
        await waitFor(STORYBOARD_STAGE_RETRY_DELAYS_MS[attempt]!);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('storyboard render failed');
  };

  const resolveScopedScripts = (episodeIds: string[]): ScriptDoc[] => {
    const targetSet = new Set(episodeIds);
    return options.scripts.value.filter((item) => item.episodeId && targetSet.has(item.episodeId));
  };

  const resolveScopedStoryboards = (episodeIds: string[]): Storyboard[] => {
    const targetSet = new Set(episodeIds);
    return options.storyboards.value.filter((item) => item.episodeId && targetSet.has(item.episodeId));
  };

  const openPlanStoryboardsConfirm = (): void => {
    const episodeIds = options.targetEpisodeIds.value;
    const scripts = resolveScopedScripts(episodeIds);
    if (scripts.length === 0) {
      options.storyboardStageMessage.value = '当前作用域没有已绑定分集的剧本可用于规划分镜';
      return;
    }
    const scopedEpisodes = new Set(scripts.map((item) => item.episodeId!).filter(Boolean));
    options.planStoryboardDraft.value = {
      episodeIds: Array.from(scopedEpisodes),
      actor: options.batchActor.value.trim() || 'operator',
      comment: options.batchComment.value.trim() || 'plan structured storyboards from scripts',
      confirmed: false
    };
  };

  const cancelPlanStoryboards = (): void => {
    options.planStoryboardDraft.value = null;
  };

  const updatePlanStoryboardDraft = (key: 'actor' | 'comment' | 'confirmed', value: string | boolean): void => {
    const draft = options.planStoryboardDraft.value;
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

  const confirmPlanStoryboards = async (): Promise<void> => {
    const draft = options.planStoryboardDraft.value;
    if (!draft || !draft.confirmed) {
      return;
    }
    const scripts = resolveScopedScripts(draft.episodeIds);
    options.loading.value = true;
    try {
      let plannedStoryboardCount = 0;
      let processedEpisodeCount = 0;
      let skippedEpisodeCount = 0;
      const failureMessages: string[] = [];

      for (const episodeId of draft.episodeIds) {
        const episodeScripts = scripts.filter((item) => item.episodeId === episodeId);
        if (episodeScripts.length === 0) {
          skippedEpisodeCount += 1;
          continue;
        }
        let plannedAny = false;
        for (const script of episodeScripts) {
          try {
            const planned = await requestPlanWithRetry(script.id);
            if (planned.length > 0) {
              plannedAny = true;
              plannedStoryboardCount += planned.length;
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : '未知错误';
            failureMessages.push(`${script.title}: ${message}`);
          }
        }
        if (plannedAny) {
          processedEpisodeCount += 1;
        } else {
          skippedEpisodeCount += 1;
        }
      }

      await options.loadAll();
      const failureSummary =
        failureMessages.length > 0
          ? `；失败 ${failureMessages.length} 项（${failureMessages.slice(0, 3).join('；')}${failureMessages.length > 3 ? '；...' : ''}）`
          : '';
      options.storyboardStageMessage.value = `已完成 ${processedEpisodeCount} 集的结构化分镜规划，产出 ${plannedStoryboardCount} 条草稿分镜，跳过 ${skippedEpisodeCount} 集${failureSummary}`;
      await options.pushWorkflowOpLog({
        action: '规划分镜',
        estimated: `计划为 ${draft.episodeIds.length} 集按剧本生成结构化分镜`,
        actual: `已处理 ${processedEpisodeCount} 集，产出 ${plannedStoryboardCount} 条草稿分镜，跳过 ${skippedEpisodeCount} 集，失败 ${failureMessages.length} 项`,
        note: `actor=${draft.actor.trim() || 'operator'}${failureMessages.length > 0 ? `; failures=${failureMessages.slice(0, 5).join(' | ')}` : ''}`
      });
      options.planStoryboardDraft.value = null;
      options.error.value = processedEpisodeCount > 0 ? '' : failureMessages[0] || '';
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : '规划分镜失败';
    } finally {
      options.loading.value = false;
    }
  };

  const openRenderStoryboardImagesConfirm = (): void => {
    const episodeIds = options.targetEpisodeIds.value;
    const storyboards = resolveScopedStoryboards(episodeIds).filter((item) => Boolean(item.plan));
    if (storyboards.length === 0) {
      options.storyboardStageMessage.value = '当前作用域没有带结构化 plan 的分镜可用于渲染';
      return;
    }
    const scopedEpisodes = new Set(storyboards.map((item) => item.episodeId!).filter(Boolean));
    options.renderStoryboardDraft.value = {
      episodeIds: Array.from(scopedEpisodes),
      actor: options.batchActor.value.trim() || 'operator',
      comment: options.batchComment.value.trim() || 'render storyboard images from structured plans',
      confirmed: false
    };
  };

  const cancelRenderStoryboardImages = (): void => {
    options.renderStoryboardDraft.value = null;
  };

  const updateRenderStoryboardDraft = (key: 'actor' | 'comment' | 'confirmed', value: string | boolean): void => {
    const draft = options.renderStoryboardDraft.value;
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

  const confirmRenderStoryboardImages = async (): Promise<void> => {
    const draft = options.renderStoryboardDraft.value;
    if (!draft || !draft.confirmed) {
      return;
    }
    options.loading.value = true;
    try {
      let renderedStoryboardCount = 0;
      let processedEpisodeCount = 0;
      let skippedEpisodeCount = 0;
      const failureMessages: string[] = [];

      for (const episodeId of draft.episodeIds) {
        const storyboardIds = resolveScopedStoryboards([episodeId])
          .filter((item) => Boolean(item.plan))
          .map((item) => item.id);
        if (storyboardIds.length === 0) {
          skippedEpisodeCount += 1;
          continue;
        }
        try {
          const rendered = await requestRenderWithRetry(storyboardIds);
          renderedStoryboardCount += rendered.length;
          processedEpisodeCount += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : '未知错误';
          failureMessages.push(`episode=${episodeId}: ${message}`);
        }
      }

      await options.loadAll();
      const failureSummary =
        failureMessages.length > 0
          ? `；失败 ${failureMessages.length} 项（${failureMessages.slice(0, 3).join('；')}${failureMessages.length > 3 ? '；...' : ''}）`
          : '';
      options.storyboardStageMessage.value = `已渲染 ${processedEpisodeCount} 集，生成/更新 ${renderedStoryboardCount} 条分镜图，跳过 ${skippedEpisodeCount} 集${failureSummary}`;
      await options.pushWorkflowOpLog({
        action: '渲染分镜图',
        estimated: `计划渲染 ${draft.episodeIds.length} 集的结构化分镜图`,
        actual: `已处理 ${processedEpisodeCount} 集，更新 ${renderedStoryboardCount} 条分镜图，跳过 ${skippedEpisodeCount} 集，失败 ${failureMessages.length} 项`,
        note: `actor=${draft.actor.trim() || 'operator'}${failureMessages.length > 0 ? `; failures=${failureMessages.slice(0, 5).join(' | ')}` : ''}`
      });
      options.renderStoryboardDraft.value = null;
      options.error.value = processedEpisodeCount > 0 ? '' : failureMessages[0] || '';
    } catch (err) {
      options.error.value = err instanceof Error ? err.message : '渲染分镜图失败';
    } finally {
      options.loading.value = false;
    }
  };

  return {
    cancelPlanStoryboards,
    cancelRenderStoryboardImages,
    confirmPlanStoryboards,
    confirmRenderStoryboardImages,
    openPlanStoryboardsConfirm,
    openRenderStoryboardImagesConfirm,
    updatePlanStoryboardDraft,
    updateRenderStoryboardDraft
  };
};
