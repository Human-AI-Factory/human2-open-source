import { v4 as uuid } from 'uuid';
import type { EpisodeWorkflowStatus, ModelConfig, Storyboard } from '../../core/types.js';
import { type SqliteStore } from '../../db/sqlite.js';
import type { AiProvider, ProviderModelConfig } from './providers/types.js';

const FRAME_PROMPT_HISTORY_KEY_PREFIX = 'frame_prompt_history_v1:';
const FRAME_PROMPT_HISTORY_MAX = 200;
const FRAME_PROMPT_ROLLBACK_AUDIT_KEY_PREFIX = 'frame_prompt_rollback_audit_v1:';
const FRAME_PROMPT_ROLLBACK_AUDIT_MAX = 500;

export type FramePromptHistoryEntry = {
  id: string;
  createdAt: string;
  frameType: 'opening' | 'middle' | 'ending' | 'action' | 'emotion';
  style: string;
  shotSize: string;
  cameraMove: string;
  lighting: string;
  mood: string;
  prompt: string;
  source: 'single' | 'episode_batch' | 'workflow_batch' | 'rollback';
};

export type FramePromptRollbackAuditEntry = {
  id: string;
  createdAt: string;
  projectId: string;
  storyboardId: string;
  historyId: string;
  actor: string;
  comment: string;
  restoredPrompt: string;
};

type FramePromptParams = {
  style: string;
  shotSize: string;
  cameraMove: string;
  lighting: string;
  mood: string;
};

type StoryboardPromptServiceDeps = {
  resolveTextModelName: (modelId?: string, customModel?: string) => string | undefined;
  pickModelConfig: (type: 'text' | 'image' | 'video' | 'audio', modelName?: string) => ModelConfig | null;
  toProviderModelConfig: (modelConfig: ModelConfig) => ProviderModelConfig;
};

export class StoryboardPromptService {
  constructor(
    private readonly store: SqliteStore,
    private readonly provider: AiProvider,
    private readonly deps: StoryboardPromptServiceDeps
  ) {}

  async rewriteStoryboardPrompt(
    projectId: string,
    storyboardId: string,
    input: { instruction: string; modelId?: string; customModel?: string }
  ): Promise<Storyboard | null> {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }
    const { model, modelConfig } = this.buildTextRequest(input.modelId, input.customModel);
    const prompt = `你是分镜导演。请基于原提示词按要求改写，只输出改写后的中文提示词。\n原提示词：${storyboard.prompt}\n改写要求：${input.instruction}`;
    const result = await this.provider.generateText({ prompt, projectId, model, modelConfig });
    return this.store.updateStoryboard(projectId, storyboardId, { prompt: result.text.trim() || storyboard.prompt });
  }

  async generateVideoPrompt(
    projectId: string,
    storyboardId: string,
    input: { style?: string; modelId?: string; customModel?: string }
  ): Promise<{ prompt: string } | null> {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }
    const { model, modelConfig } = this.buildTextRequest(input.modelId, input.customModel);
    const prompt = `你是视频提示词专家。请把以下分镜描述转换为视频生成提示词，风格：${input.style ?? '电影感'}。\n分镜：${storyboard.prompt}`;
    const result = await this.provider.generateText({ prompt, projectId, model, modelConfig });
    return { prompt: result.text.trim() || storyboard.prompt };
  }

  async generateFramePrompt(
    projectId: string,
    storyboardId: string,
    input: {
      frameType: 'opening' | 'middle' | 'ending' | 'action' | 'emotion';
      style?: string;
      shotSize?: 'ecu' | 'cu' | 'mcu' | 'ms' | 'mls' | 'ls' | 'els';
      cameraMove?: 'static' | 'pan' | 'tilt' | 'dolly' | 'truck' | 'handheld';
      lighting?: string;
      mood?: string;
      instruction?: string;
      modelId?: string;
      customModel?: string;
    }
  ): Promise<
    | {
        prompt: string;
        frameType: 'opening' | 'middle' | 'ending' | 'action' | 'emotion';
        style: string;
        shotSize: string;
        cameraMove: string;
        lighting: string;
        mood: string;
      }
    | null
  > {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }
    const { model, modelConfig } = this.buildTextRequest(input.modelId, input.customModel);
    const params = this.normalizeFramePromptParams(input);
    const prompt = this.buildFramePromptInstruction(storyboard.prompt, input.frameType, params, input.instruction);
    const result = await this.provider.generateText({ prompt, projectId, model, modelConfig });
    const generatedPrompt = result.text.trim() || storyboard.prompt;
    this.appendFramePromptHistory(projectId, storyboardId, {
      frameType: input.frameType,
      style: params.style,
      shotSize: params.shotSize,
      cameraMove: params.cameraMove,
      lighting: params.lighting,
      mood: params.mood,
      prompt: generatedPrompt,
      source: 'single',
    });
    return {
      prompt: generatedPrompt,
      frameType: input.frameType,
      style: params.style,
      shotSize: params.shotSize,
      cameraMove: params.cameraMove,
      lighting: params.lighting,
      mood: params.mood,
    };
  }

  async generateEpisodeFramePromptsBatch(
    projectId: string,
    episodeId: string,
    input: {
      frameType: 'opening' | 'middle' | 'ending' | 'action' | 'emotion';
      style?: string;
      shotSize?: 'ecu' | 'cu' | 'mcu' | 'ms' | 'mls' | 'ls' | 'els';
      cameraMove?: 'static' | 'pan' | 'tilt' | 'dolly' | 'truck' | 'handheld';
      lighting?: string;
      mood?: string;
      instruction?: string;
      modelId?: string;
      customModel?: string;
      saveAs?: 'none' | 'replace_storyboard_prompt';
      limit?: number;
    }
  ): Promise<
    | {
        episodeId: string;
        total: number;
        generated: number;
        updatedStoryboardPrompts: number;
        items: Array<{
          storyboardId: string;
          storyboardTitle: string;
          prompt: string;
          updated: boolean;
        }>;
      }
    | null
  > {
    const storyboards = this.store.listStoryboardsByEpisode(projectId, episodeId);
    if (!storyboards) {
      return null;
    }
    const { model, modelConfig } = this.buildTextRequest(input.modelId, input.customModel);
    const params = this.normalizeFramePromptParams(input);
    const max = Math.max(1, Math.min(200, Math.floor(input.limit ?? storyboards.length)));
    const target = storyboards.slice(0, max);
    const items: Array<{ storyboardId: string; storyboardTitle: string; prompt: string; updated: boolean }> = [];
    let updatedStoryboardPrompts = 0;

    for (const storyboard of target) {
      const instruction = this.buildFramePromptInstruction(storyboard.prompt, input.frameType, params, input.instruction);
      const result = await this.provider.generateText({ prompt: instruction, projectId, model, modelConfig });
      const framePrompt = result.text.trim() || storyboard.prompt;
      this.appendFramePromptHistory(projectId, storyboard.id, {
        frameType: input.frameType,
        style: params.style,
        shotSize: params.shotSize,
        cameraMove: params.cameraMove,
        lighting: params.lighting,
        mood: params.mood,
        prompt: framePrompt,
        source: 'episode_batch',
      });
      let updated = false;
      if (input.saveAs === 'replace_storyboard_prompt') {
        const next = this.store.updateStoryboard(projectId, storyboard.id, { prompt: framePrompt });
        if (next) {
          updated = true;
          updatedStoryboardPrompts += 1;
        }
      }
      items.push({
        storyboardId: storyboard.id,
        storyboardTitle: storyboard.title,
        prompt: framePrompt,
        updated,
      });
    }
    return {
      episodeId,
      total: storyboards.length,
      generated: items.length,
      updatedStoryboardPrompts,
      items,
    };
  }

  listStoryboardFramePromptHistory(
    projectId: string,
    storyboardId: string,
    input: {
      limit?: number;
      frameType?: 'opening' | 'middle' | 'ending' | 'action' | 'emotion';
      source?: 'single' | 'episode_batch' | 'workflow_batch' | 'rollback';
      startAt?: string;
      endAt?: string;
    } = {}
  ): FramePromptHistoryEntry[] | null {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }
    const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
    const startAtMs = input.startAt ? Date.parse(input.startAt) : Number.NaN;
    const endAtMs = input.endAt ? Date.parse(input.endAt) : Number.NaN;
    return this.readFramePromptHistory(projectId, storyboardId)
      .filter((item) => {
        if (input.frameType && item.frameType !== input.frameType) {
          return false;
        }
        if (input.source && item.source !== input.source) {
          return false;
        }
        const createdAtMs = Date.parse(item.createdAt);
        if (Number.isFinite(startAtMs) && createdAtMs < startAtMs) {
          return false;
        }
        if (Number.isFinite(endAtMs) && createdAtMs > endAtMs) {
          return false;
        }
        return true;
      })
      .slice(0, limit);
  }

  rollbackStoryboardFramePrompt(
    projectId: string,
    storyboardId: string,
    historyId: string,
    input: { actor?: string; comment?: string } = {}
  ): { storyboard: Storyboard; restored: FramePromptHistoryEntry } | null {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }
    const history = this.readFramePromptHistory(projectId, storyboardId);
    const target = history.find((item) => item.id === historyId);
    if (!target) {
      return null;
    }
    const updated = this.store.updateStoryboard(projectId, storyboardId, { prompt: target.prompt });
    if (!updated) {
      return null;
    }
    this.appendFramePromptHistory(projectId, storyboardId, {
      frameType: target.frameType,
      style: target.style,
      shotSize: target.shotSize,
      cameraMove: target.cameraMove,
      lighting: target.lighting,
      mood: target.mood,
      prompt: target.prompt,
      source: 'rollback',
    });
    this.appendFramePromptRollbackAudit(projectId, storyboardId, {
      historyId: target.id,
      actor: input.actor?.trim() || 'operator',
      comment: input.comment?.trim() || '',
      restoredPrompt: target.prompt,
    });
    return {
      storyboard: updated,
      restored: target,
    };
  }

  listStoryboardFramePromptRollbackAudits(
    projectId: string,
    storyboardId: string,
    input: { limit?: number; actor?: string; startAt?: string; endAt?: string } = {}
  ): FramePromptRollbackAuditEntry[] | null {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }
    const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
    const actor = input.actor?.trim().toLowerCase();
    const startAtMs = input.startAt ? Date.parse(input.startAt) : Number.NaN;
    const endAtMs = input.endAt ? Date.parse(input.endAt) : Number.NaN;
    return this.readFramePromptRollbackAudits(projectId, storyboardId)
      .filter((item) => {
        if (actor && !item.actor.toLowerCase().includes(actor)) {
          return false;
        }
        const createdAtMs = Date.parse(item.createdAt);
        if (Number.isFinite(startAtMs) && createdAtMs < startAtMs) {
          return false;
        }
        if (Number.isFinite(endAtMs) && createdAtMs > endAtMs) {
          return false;
        }
        return true;
      })
      .slice(0, limit);
  }

  async generateProjectFramePromptsByWorkflow(
    projectId: string,
    input: {
      statuses?: EpisodeWorkflowStatus[];
      frameType: 'opening' | 'middle' | 'ending' | 'action' | 'emotion';
      style?: string;
      shotSize?: 'ecu' | 'cu' | 'mcu' | 'ms' | 'mls' | 'ls' | 'els';
      cameraMove?: 'static' | 'pan' | 'tilt' | 'dolly' | 'truck' | 'handheld';
      lighting?: string;
      mood?: string;
      instruction?: string;
      modelId?: string;
      customModel?: string;
      saveAs?: 'none' | 'replace_storyboard_prompt';
      limitPerEpisode?: number;
      autoTransitionToInReview?: boolean;
      actor?: string;
      comment?: string;
    }
  ): Promise<
    | {
        statuses: EpisodeWorkflowStatus[];
        episodesMatched: number;
        episodesProcessed: number;
        generatedTotal: number;
        updatedStoryboardPrompts: number;
        transitionedEpisodeIds: string[];
        skippedTransitionEpisodeIds: string[];
        episodes: Array<{
          episodeId: string;
          generated: number;
          updatedStoryboardPrompts: number;
        }>;
      }
    | null
  > {
    const episodes = this.store.listEpisodes(projectId);
    if (!episodes) {
      return null;
    }
    const statuses = input.statuses && input.statuses.length > 0 ? [...new Set(input.statuses)] : (['draft', 'in_review'] as EpisodeWorkflowStatus[]);
    const picked = episodes.filter((episode) => {
      const workflow = this.store.getEpisodeWorkflowState(projectId, episode.id);
      if (!workflow) {
        return false;
      }
      return statuses.includes(workflow.status);
    });
    const transitionedEpisodeIds: string[] = [];
    const skippedTransitionEpisodeIds: string[] = [];
    const episodeResults: Array<{ episodeId: string; generated: number; updatedStoryboardPrompts: number }> = [];
    let generatedTotal = 0;
    let updatedStoryboardPrompts = 0;
    for (const episode of picked) {
      const batch = await this.generateEpisodeFramePromptsBatch(projectId, episode.id, {
        frameType: input.frameType,
        style: input.style,
        shotSize: input.shotSize,
        cameraMove: input.cameraMove,
        lighting: input.lighting,
        mood: input.mood,
        instruction: input.instruction,
        modelId: input.modelId,
        customModel: input.customModel,
        saveAs: input.saveAs,
        limit: input.limitPerEpisode,
      });
      if (!batch) {
        continue;
      }
      generatedTotal += batch.generated;
      updatedStoryboardPrompts += batch.updatedStoryboardPrompts;
      episodeResults.push({
        episodeId: episode.id,
        generated: batch.generated,
        updatedStoryboardPrompts: batch.updatedStoryboardPrompts,
      });
      if (input.autoTransitionToInReview && batch.generated > 0) {
        const current = this.store.getEpisodeWorkflowState(projectId, episode.id);
        if (current && (current.status === 'draft' || current.status === 'rejected')) {
          const transitioned = this.store.setEpisodeWorkflowState(projectId, episode.id, {
            toStatus: 'in_review',
            actor: input.actor?.trim() || 'operator',
            comment: input.comment?.trim() || 'auto transition after frame-prompt batch',
          });
          if (transitioned) {
            transitionedEpisodeIds.push(episode.id);
          } else {
            skippedTransitionEpisodeIds.push(episode.id);
          }
        } else {
          skippedTransitionEpisodeIds.push(episode.id);
        }
      }
    }
    return {
      statuses,
      episodesMatched: picked.length,
      episodesProcessed: episodeResults.length,
      generatedTotal,
      updatedStoryboardPrompts,
      transitionedEpisodeIds,
      skippedTransitionEpisodeIds,
      episodes: episodeResults,
    };
  }

  private normalizeFramePromptParams(input: {
    style?: string;
    shotSize?: 'ecu' | 'cu' | 'mcu' | 'ms' | 'mls' | 'ls' | 'els';
    cameraMove?: 'static' | 'pan' | 'tilt' | 'dolly' | 'truck' | 'handheld';
    lighting?: string;
    mood?: string;
  }): FramePromptParams {
    return {
      style: input.style?.trim() || '电影感',
      shotSize: input.shotSize || 'ms',
      cameraMove: input.cameraMove || 'static',
      lighting: input.lighting?.trim() || '自然光',
      mood: input.mood?.trim() || '克制',
    };
  }

  private buildFramePromptInstruction(
    storyboardPrompt: string,
    frameType: 'opening' | 'middle' | 'ending' | 'action' | 'emotion',
    params: FramePromptParams,
    extraInstruction?: string
  ): string {
    return [
      '你是影视分镜提示词专家。请基于分镜描述，生成一条“可直接用于图像/视频生成”的单帧提示词。',
      '要求：',
      '1) 输出中文，单段，不要解释。',
      '2) 包含镜头景别、机位运动、光线、情绪、主体动作、背景信息。',
      `3) 帧类型：${frameType}。`,
      `4) 风格：${params.style}。`,
      `5) 镜头景别：${params.shotSize}。`,
      `6) 机位运动：${params.cameraMove}。`,
      `7) 光线：${params.lighting}。`,
      `8) 情绪：${params.mood}。`,
      `分镜原文：${storyboardPrompt}`,
      extraInstruction?.trim() ? `补充要求：${extraInstruction.trim()}` : '',
    ]
      .filter((item) => item.length > 0)
      .join('\n');
  }

  private buildTextRequest(
    modelId?: string,
    customModel?: string
  ): {
    model?: string;
    modelConfig?: ProviderModelConfig;
  } {
    const resolvedModelName = this.deps.resolveTextModelName(modelId, customModel);
    const pickedModelConfig = this.deps.pickModelConfig('text', customModel?.trim() || resolvedModelName);
    return {
      model: this.resolveRequestedModel(pickedModelConfig, resolvedModelName, customModel),
      modelConfig: pickedModelConfig ? this.deps.toProviderModelConfig(pickedModelConfig) : undefined
    };
  }

  private resolveRequestedModel(modelConfig: ModelConfig | null, resolvedModelName?: string, customModel?: string): string | undefined {
    const custom = customModel?.trim();
    if (custom) {
      const matchedExact = modelConfig && (modelConfig.name === custom || modelConfig.model === custom);
      return matchedExact ? modelConfig.model : custom;
    }
    return modelConfig?.model ?? resolvedModelName;
  }

  private getFramePromptHistoryKey(projectId: string, storyboardId: string): string {
    return `${FRAME_PROMPT_HISTORY_KEY_PREFIX}${projectId}:${storyboardId}`;
  }

  private getFramePromptRollbackAuditKey(projectId: string, storyboardId: string): string {
    return `${FRAME_PROMPT_ROLLBACK_AUDIT_KEY_PREFIX}${projectId}:${storyboardId}`;
  }

  private readFramePromptHistory(projectId: string, storyboardId: string): FramePromptHistoryEntry[] {
    const raw = this.store.getSystemSetting(this.getFramePromptHistoryKey(projectId, storyboardId));
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => this.normalizeFramePromptHistoryEntry(item))
        .filter((item): item is FramePromptHistoryEntry => item !== null)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } catch {
      return [];
    }
  }

  private appendFramePromptHistory(
    projectId: string,
    storyboardId: string,
    input: Omit<FramePromptHistoryEntry, 'id' | 'createdAt'>
  ): FramePromptHistoryEntry {
    const item: FramePromptHistoryEntry = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      ...input,
    };
    const next = [item, ...this.readFramePromptHistory(projectId, storyboardId)].slice(0, FRAME_PROMPT_HISTORY_MAX);
    this.store.setSystemSetting(this.getFramePromptHistoryKey(projectId, storyboardId), JSON.stringify(next));
    return item;
  }

  private normalizeFramePromptHistoryEntry(input: unknown): FramePromptHistoryEntry | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }
    const row = input as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      typeof row.createdAt !== 'string' ||
      typeof row.frameType !== 'string' ||
      typeof row.style !== 'string' ||
      typeof row.shotSize !== 'string' ||
      typeof row.cameraMove !== 'string' ||
      typeof row.lighting !== 'string' ||
      typeof row.mood !== 'string' ||
      typeof row.prompt !== 'string'
    ) {
      return null;
    }
    const source =
      row.source === 'single' || row.source === 'episode_batch' || row.source === 'workflow_batch' || row.source === 'rollback'
        ? row.source
        : 'single';
    if (row.frameType !== 'opening' && row.frameType !== 'middle' && row.frameType !== 'ending' && row.frameType !== 'action' && row.frameType !== 'emotion') {
      return null;
    }
    return {
      id: row.id,
      createdAt: row.createdAt,
      frameType: row.frameType,
      style: row.style,
      shotSize: row.shotSize,
      cameraMove: row.cameraMove,
      lighting: row.lighting,
      mood: row.mood,
      prompt: row.prompt,
      source,
    };
  }

  private readFramePromptRollbackAudits(projectId: string, storyboardId: string): FramePromptRollbackAuditEntry[] {
    const raw = this.store.getSystemSetting(this.getFramePromptRollbackAuditKey(projectId, storyboardId));
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => this.normalizeFramePromptRollbackAuditEntry(item))
        .filter((item): item is FramePromptRollbackAuditEntry => item !== null)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } catch {
      return [];
    }
  }

  private appendFramePromptRollbackAudit(
    projectId: string,
    storyboardId: string,
    input: Omit<FramePromptRollbackAuditEntry, 'id' | 'createdAt' | 'projectId' | 'storyboardId'>
  ): FramePromptRollbackAuditEntry {
    const item: FramePromptRollbackAuditEntry = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      projectId,
      storyboardId,
      ...input,
    };
    const next = [item, ...this.readFramePromptRollbackAudits(projectId, storyboardId)].slice(0, FRAME_PROMPT_ROLLBACK_AUDIT_MAX);
    this.store.setSystemSetting(this.getFramePromptRollbackAuditKey(projectId, storyboardId), JSON.stringify(next));
    return item;
  }

  private normalizeFramePromptRollbackAuditEntry(input: unknown): FramePromptRollbackAuditEntry | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }
    const row = input as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      typeof row.createdAt !== 'string' ||
      typeof row.projectId !== 'string' ||
      typeof row.storyboardId !== 'string' ||
      typeof row.historyId !== 'string' ||
      typeof row.actor !== 'string' ||
      typeof row.comment !== 'string' ||
      typeof row.restoredPrompt !== 'string'
    ) {
      return null;
    }
    return {
      id: row.id,
      createdAt: row.createdAt,
      projectId: row.projectId,
      storyboardId: row.storyboardId,
      historyId: row.historyId,
      actor: row.actor,
      comment: row.comment,
      restoredPrompt: row.restoredPrompt,
    };
  }
}
