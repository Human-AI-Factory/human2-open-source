import type { ModelConfig, Script, Storyboard } from '../../core/types.js';
import { type SqliteStore } from '../../db/sqlite.js';
import type { AiProvider, ProviderModelConfig } from './providers/types.js';

export type DialogueTrackPlanSegment = {
  speaker: string;
  text: string;
  mood: string | null;
  share: number;
};

export type DialogueTrackPlanResult = {
  segments: DialogueTrackPlanSegment[];
  usedConfiguredModel: boolean;
  fallback: boolean;
  modelLabel: string | null;
};

type DialogueTrackPlannerDeps = {
  resolveTextModelName: (modelId?: string, customModel?: string) => string | undefined;
  pickModelConfig: (type: 'text' | 'image' | 'video' | 'audio', modelName?: string) => ModelConfig | null;
  toProviderModelConfig: (modelConfig: ModelConfig) => ProviderModelConfig;
};

const cleanValue = (value: string | null | undefined): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[；;，,]+$/g, '')
    .trim();

const clampText = (value: string, maxLength: number): string => {
  const text = cleanValue(value);
  if (!text) {
    return '';
  }
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

const normalizeShare = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0.2, Math.min(3, Number(value.toFixed(3))));
};

const extractJsonCandidates = (raw: string): string[] => {
  const text = cleanValue(raw);
  if (!text) {
    return [];
  }
  const direct = text.match(/\{[\s\S]*\}/g) ?? [];
  if (direct.length > 0) {
    return direct;
  }
  return [text];
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const splitPeople = (value: string): string[] =>
  cleanValue(value)
    .replace(/[（）()]/g, ' ')
    .split(/[、,，/\\|&与和及跟\s]+/u)
    .map((item) => cleanValue(item))
    .filter((item) => item && !/^(主体|角色|人物|众人|所有人|多人)$/u.test(item));

const dedupe = <T>(items: T[]): T[] => [...new Set(items)];

const buildFallbackDialogueLine = (speaker: string, storyboard: Storyboard, role: 'lead' | 'support'): string => {
  const plan = storyboard.plan;
  const action = cleanValue(plan?.action || storyboard.prompt);
  const scene = cleanValue(plan?.scene);
  if (/[安慰|劝|陪]/u.test(action)) {
    return role === 'lead' ? '别怕，我们先进去看看。' : '我在这，慢慢说。';
  }
  if (/[质问|追问|逼问]/u.test(action)) {
    return role === 'lead' ? '你到底想做什么？' : '先把话说清楚。';
  }
  if (/[宣布|决定|下定决心|契约]/u.test(action)) {
    return role === 'lead' ? '我已经决定了。' : '你真的想好了？';
  }
  if (/[战斗|挥剑|对抗|冲突]/u.test(action)) {
    return role === 'lead' ? '我来拖住它，你快走。' : '小心，它冲过来了。';
  }
  if (scene && /病房|医院/u.test(scene)) {
    return role === 'lead' ? '我会陪着你。' : '他会好起来的。';
  }
  return role === 'lead' ? `${speaker}压低声音说出自己的决定。` : '对方低声回应，气氛变得更紧。';
};

export class DialogueTrackPlannerService {
  constructor(
    private readonly store: SqliteStore,
    private readonly provider: AiProvider,
    private readonly deps: DialogueTrackPlannerDeps
  ) {}

  async planStoryboardDialogue(
    projectId: string,
    storyboardId: string,
    input: { modelId?: string; customModel?: string } = {}
  ): Promise<DialogueTrackPlanResult> {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return {
        segments: [],
        usedConfiguredModel: false,
        fallback: true,
        modelLabel: null,
      };
    }

    const script = (this.store.listScripts(projectId) ?? []).find((item) => item.id === storyboard.scriptId) ?? null;
    const modelName = this.deps.resolveTextModelName(input.modelId, input.customModel);
    const modelConfig = this.deps.pickModelConfig('text', modelName);

    if (modelConfig) {
      try {
        const prompt = this.buildDialoguePlannerPrompt(storyboard, script);
        const result = await this.provider.generateText({
          prompt,
          projectId,
          model: modelConfig.model,
          modelConfig: this.deps.toProviderModelConfig(modelConfig),
        });
        const segments = this.parseDialogueResponse(result.text);
        if (segments.length > 0) {
          return {
            segments,
            usedConfiguredModel: true,
            fallback: false,
            modelLabel: modelConfig.name,
          };
        }
      } catch {
        // fall through to heuristic fallback
      }
    }

    return {
      segments: this.buildFallbackDialogueSegments(storyboard, script),
      usedConfiguredModel: false,
      fallback: true,
      modelLabel: modelConfig?.name ?? null,
    };
  }

  private buildDialoguePlannerPrompt(storyboard: Storyboard, script: Script | null): string {
    const plan = storyboard.plan;
    const scriptExcerpt = clampText(script?.content || '', 900);
    return [
      '你是影视对白导演，要把一个镜头改写成适合 TTS 生成的人物对白片段。',
      '请优先输出角色对白，不要写旁白；如果原镜头对白不足，可以在不改变剧情方向的前提下补出 1-3 句自然对白。',
      '要求：',
      '1. 只输出严格 JSON，不要解释，不要 Markdown 代码块。',
      '2. JSON 结构固定为 {"segments":[{"speaker":"...","text":"...","mood":"...","share":1}]}。',
      '3. 每句 text 控制在 6-22 个中文字符，适合直接做人物台词。',
      '4. speaker 必须是具体角色名，不要写“旁白”“镜头”“角色A”。',
      '5. mood 用简短中文词，例如：克制、焦急、坚定、悲伤、冷静。',
      '6. share 是该句在镜头时长中的相对占比，0.2 到 3 之间。',
      '7. 最多输出 3 句；如果镜头明显是双人或多人互动，尽量覆盖主要角色的来回对话。',
      `镜头标题：${cleanValue(plan?.shotTitle || storyboard.title)}`,
      `场景：${cleanValue(plan?.scene)}`,
      `时间：${cleanValue(plan?.time)}`,
      `主体：${cleanValue(plan?.subject)}`,
      `动作：${cleanValue(plan?.action || storyboard.prompt)}`,
      `构图：${cleanValue(plan?.composition)}`,
      `光线：${cleanValue(plan?.lighting)}`,
      scriptExcerpt ? `相关剧本摘录：${scriptExcerpt}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private parseDialogueResponse(raw: string): DialogueTrackPlanSegment[] {
    for (const candidate of extractJsonCandidates(raw)) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        const rec = asRecord(parsed);
        if (!rec || !Array.isArray(rec.segments)) {
          continue;
        }
        const segments = rec.segments
          .map((item) => {
            const row = asRecord(item);
            if (!row) {
              return null;
            }
            const speaker = clampText(String(row.speaker ?? ''), 12);
            const text = clampText(String(row.text ?? ''), 28);
            if (!speaker || !text || /旁白/u.test(speaker)) {
              return null;
            }
            return {
              speaker,
              text,
              mood: cleanValue(typeof row.mood === 'string' ? row.mood : null) || null,
              share: normalizeShare(row.share),
            } satisfies DialogueTrackPlanSegment;
          })
          .filter((item): item is DialogueTrackPlanSegment => Boolean(item));
        if (segments.length > 0) {
          return segments.slice(0, 3);
        }
      } catch {
        continue;
      }
    }
    return [];
  }

  private buildFallbackDialogueSegments(storyboard: Storyboard, _script: Script | null): DialogueTrackPlanSegment[] {
    const plan = storyboard.plan;
    const speakers = dedupe(splitPeople(plan?.subject || storyboard.title)).slice(0, 3);
    if (speakers.length >= 2) {
      return [
        {
          speaker: speakers[0],
          text: clampText(buildFallbackDialogueLine(speakers[0], storyboard, 'lead'), 28),
          mood: '克制',
          share: 1,
        },
        {
          speaker: speakers[1],
          text: clampText(buildFallbackDialogueLine(speakers[1], storyboard, 'support'), 28),
          mood: '紧张',
          share: 1,
        },
      ];
    }
    const soloSpeaker = speakers[0] || '主角';
    return [
      {
        speaker: soloSpeaker,
        text: clampText(buildFallbackDialogueLine(soloSpeaker, storyboard, 'lead'), 28),
        mood: '克制',
        share: 1,
      },
    ];
  }
}
