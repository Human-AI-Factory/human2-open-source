import { v4 as uuid } from 'uuid';
import { ModelConfig, Novel, Outline, Script } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import { MediaModelPolicyService } from '../ai/media-model-policy.service.js';
import { AiProvider, ProviderModelConfig } from '../pipeline/providers/types.js';

const MAX_OUTLINE_SOURCE_CHARS = 16000;
const MAX_SCRIPT_SOURCE_CHARS = 12000;

export type StudioTextGenerationMeta = {
  usedConfiguredModel: boolean;
  model: string | null;
  modelLabel: string | null;
  provider: string | null;
  manufacturer: string | null;
};

export type StudioOutlineGenerationResult = {
  items: Outline[];
  generation: StudioTextGenerationMeta;
};

export type StudioScriptGenerationResult = {
  script: Script;
  generation: StudioTextGenerationMeta;
};

type StudioTextRequest = {
  model?: string;
  modelConfig?: ProviderModelConfig;
  generation: StudioTextGenerationMeta;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const firstNonEmptyString = (...values: Array<unknown>): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const trimModelText = (text: string): string => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json|text)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
};

const truncateForModel = (content: string, maxChars: number): string => {
  if (content.length <= maxChars) {
    return content;
  }
  return `${content.slice(0, maxChars)}\n\n[原文过长，已截断到前 ${maxChars} 字作为生成参考]`;
};

export class StudioService {
  private readonly mediaModelPolicyService: MediaModelPolicyService;

  constructor(
    private readonly store: SqliteStore,
    private readonly provider: AiProvider
  ) {
    this.mediaModelPolicyService = new MediaModelPolicyService(this.store);
  }

  resolveProjectIdByDrama(dramaId: string): string | null {
    const drama = this.store.getDramaById(dramaId);
    return drama ? drama.projectId : null;
  }

  getNovel(projectId: string): Novel | null {
    return this.store.getNovel(projectId);
  }

  saveNovel(projectId: string, input: { title: string; content: string }): Novel | null {
    return this.store.upsertNovel(projectId, input.title, input.content);
  }

  async generateNovel(projectId: string, input: { title?: string; idea: string; targetLength?: number; modelId?: string; customModel?: string }): Promise<Novel | null> {
    const project = this.store.getProjectById(projectId);
    if (!project) {
      return null;
    }
    const { model, modelConfig } = this.buildTextRequest(input.modelId, input.customModel);
    const targetLength = Math.max(400, Math.min(input.targetLength ?? 1200, 6000));
    const prompt = `请根据以下创意生成中文小说正文，目标字数约${targetLength}字，分幕清晰，叙事流畅。\n创意：${input.idea}`;
    const result = await this.provider.generateText({
      prompt,
      projectId,
      model,
      modelConfig
    });
    return this.store.upsertNovel(projectId, input.title?.trim() || `${project.name}-小说草稿`, result.text);
  }

  listOutlines(projectId: string): Outline[] | null {
    return this.store.listOutlines(projectId);
  }

  async generateOutlines(
    projectId: string,
    input: { chapterCount?: number; modelId?: string; customModel?: string }
  ): Promise<Outline[] | null> {
    const generated = await this.generateOutlinesWithMeta(projectId, input);
    return generated?.items ?? null;
  }

  async generateOutlinesWithMeta(
    projectId: string,
    input: { chapterCount?: number; modelId?: string; customModel?: string }
  ): Promise<StudioOutlineGenerationResult | null> {
    const novel = this.store.getNovel(projectId);
    if (!novel) {
      return null;
    }

    const count = Math.max(1, Math.min(input.chapterCount ?? 6, 20));
    const request = this.buildTextRequest(input.modelId, input.customModel);
    const prompt = [
      `你是资深影视编剧统筹。请基于下面的中文小说正文，拆解成 ${count} 个连续的大纲章节。`,
      '要求：',
      '1. 每一章都要有具体标题，突出关键事件推进，不要只写“第一章/第二章”。',
      '2. summary 使用中文，80-180 字，写清人物目标、冲突升级和阶段变化。',
      '3. 全部章节首尾衔接，覆盖完整故事，不要重复，不要空泛。',
      '4. 只输出严格 JSON，不要解释，不要 Markdown 代码块。',
      '5. JSON 格式必须为：{"outlines":[{"title":"...","summary":"..."}]}',
      `小说标题：${novel.title}`,
      '小说正文：',
      truncateForModel(novel.content, MAX_OUTLINE_SOURCE_CHARS),
    ].join('\n');
    const result = await this.provider.generateText({
      prompt,
      projectId,
      model: request.model,
      modelConfig: request.modelConfig
    });
    const drafts = this.parseOutlineDrafts(result.text, count);
    const outlines = this.store.replaceOutlines(
      projectId,
      drafts.map((item, index) => ({
        id: uuid(),
        title: item.title,
        summary: item.summary,
        orderIndex: index + 1
      }))
    );
    if (!outlines) {
      return null;
    }
    return {
      items: outlines,
      generation: request.generation
    };
  }

  listScripts(projectId: string): Script[] | null {
    return this.store.listScripts(projectId);
  }

  async generateScript(
    projectId: string,
    input: { outlineId: string; modelId?: string; customModel?: string }
  ): Promise<Script | null> {
    const generated = await this.generateScriptWithMeta(projectId, input);
    return generated?.script ?? null;
  }

  async generateScriptWithMeta(
    projectId: string,
    input: { outlineId: string; modelId?: string; customModel?: string }
  ): Promise<StudioScriptGenerationResult | null> {
    const outline = this.store.getOutline(projectId, input.outlineId);
    if (!outline) {
      return null;
    }

    const novel = this.store.getNovel(projectId);
    const request = this.buildTextRequest(input.modelId, input.customModel);
    const prompt = [
      '你是影视编剧，请把下面的大纲改写成可继续用于分镜拆解的中文分场脚本。',
      '重要约束：只根据以下大纲标题和大纲摘要生成剧本，不要超出这个大纲的范围，不要包含后续大纲的内容。',
      '要求：',
      '1. 输出纯文本，不要 Markdown 代码块，不要解释过程。',
      '2. 必须使用以下结构：',
      '【场次标题】...',
      '【剧情概述】...',
      '【分场脚本】',
      '1. 场景：...',
      '2. 场景：...',
      '3. 场景：...',
      '3. 至少 4 场，至多 8 场；每场都要写清地点/时间、角色动作、冲突推进和情绪变化。',
      '4. 可以包含少量对白，但以可拍摄的动作和调度为主，避免重复大纲原句。',
      `小说标题：${novel?.title || '未命名小说'}`,
      `目标大纲标题：${outline.title}`,
      `目标大纲摘要：${outline.summary}`,
      '小说正文参考（仅作为背景，不要超出当前大纲范围）：',
      truncateForModel(novel?.content || '', MAX_SCRIPT_SOURCE_CHARS),
    ].join('\n');
    const result = await this.provider.generateText({
      prompt,
      projectId,
      model: request.model,
      modelConfig: request.modelConfig
    });
    const content = this.normalizeGeneratedScriptContent(result.text);
    const script = this.store.createScript({
      id: uuid(),
      projectId,
      outlineId: outline.id,
      title: `${outline.title} - 脚本`,
      content
    });
    if (!script) {
      return null;
    }
    return {
      script,
      generation: request.generation
    };
  }

  private buildTextRequest(
    modelId?: string,
    customModel?: string
  ): StudioTextRequest {
    const resolvedModelName = this.mediaModelPolicyService.resolveModelName('text', modelId, customModel);
    const pickedModelConfig = this.mediaModelPolicyService.pickModelConfig('text', customModel?.trim() || resolvedModelName);
    const resolvedModel = this.resolveRequestedModel(pickedModelConfig, resolvedModelName, customModel);
    return {
      model: resolvedModel,
      modelConfig: pickedModelConfig ? this.mediaModelPolicyService.toProviderModelConfig(pickedModelConfig) : undefined,
      generation: {
        usedConfiguredModel: Boolean(pickedModelConfig),
        model: resolvedModel ?? null,
        modelLabel: firstNonEmptyString(pickedModelConfig?.name, customModel, resolvedModelName),
        provider: pickedModelConfig?.provider ?? null,
        manufacturer: pickedModelConfig?.manufacturer ?? null
      }
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

  private parseOutlineDrafts(text: string, maxCount: number): Array<{ title: string; summary: string }> {
    const payload = this.parseLooseJson(text);
    const payloadRecord = asRecord(payload);
    const rawItems = Array.isArray(payload)
      ? payload
      : Array.isArray(payloadRecord?.outlines)
        ? payloadRecord!.outlines
        : Array.isArray(payloadRecord?.items)
          ? payloadRecord!.items
          : Array.isArray(payloadRecord?.chapters)
            ? payloadRecord!.chapters
            : [];
    const items = rawItems
      .map((item, index) => {
        const record = asRecord(item);
        const title = firstNonEmptyString(record?.title, record?.name, record?.heading) ?? `第${index + 1}幕`;
        const summary = firstNonEmptyString(record?.summary, record?.synopsis, record?.content, record?.description);
        if (!summary) {
          return null;
        }
        return {
          title: title.slice(0, 80),
          summary: summary.slice(0, 240)
        };
      })
      .filter((item): item is { title: string; summary: string } => Boolean(item))
      .slice(0, maxCount);
    if (items.length === 0) {
      throw new Error('Outline generation returned invalid JSON payload');
    }
    return items;
  }

  private parseLooseJson(text: string): unknown {
    const normalized = trimModelText(text);
    const candidates = [normalized];
    const arrayStart = normalized.indexOf('[');
    const arrayEnd = normalized.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      candidates.push(normalized.slice(arrayStart, arrayEnd + 1));
    }
    const objectStart = normalized.indexOf('{');
    const objectEnd = normalized.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      candidates.push(normalized.slice(objectStart, objectEnd + 1));
    }
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        // try next candidate
      }
    }
    throw new Error('Outline generation did not return parseable JSON');
  }

  private normalizeGeneratedScriptContent(text: string): string {
    const normalized = trimModelText(text);
    if (!normalized) {
      throw new Error('Script generation returned empty content');
    }
    return normalized;
  }
}
