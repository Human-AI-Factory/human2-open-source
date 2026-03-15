import type { AudioTask, ModelConfig, Storyboard, TimelineClip, TimelinePlan, TimelineTrack } from '../../core/types.js';
import { type SqliteStore } from '../../db/sqlite.js';
import type { AiProvider, ProviderModelConfig } from './providers/types.js';

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

const stripLeadingLabel = (value: string): string =>
  cleanValue(value).replace(/^(场景|时间|主体|动作|构图|光线|镜头标题|旁白文案)[：:]\s*/u, '');

type TimelinePostProductionServiceDeps = {
  getTimelinePlan: (projectId: string, episodeId: string | null) => TimelinePlan | null;
  saveTimelinePlan: (
    projectId: string,
    input: { id?: string; episodeId?: string | null; title?: string; tracks?: TimelineTrack[]; clips: TimelineClip[] }
  ) => TimelinePlan | null;
  resolveAudioTaskSourceUrl: (projectId: string, taskId: string) => string | null;
  resolveAudioTaskTiming: (projectId: string, taskId: string) => { sourceUrl: string | null; durationSec: number | null };
  resolveTextModelName: (modelId?: string, customModel?: string) => string | undefined;
  pickModelConfig: (type: 'text' | 'image' | 'video' | 'audio', modelName?: string) => ModelConfig | null;
  toProviderModelConfig: (modelConfig: ModelConfig) => ProviderModelConfig;
};

type TimelineSpan = {
  clip: TimelineClip;
  storyboard: Storyboard | null;
  startMs: number;
  endMs: number;
  durationSec: number;
};

type AudioPlacement = {
  task: AudioTask;
  sourceUrl: string;
  startMs: number;
  endMs: number;
  durationSec: number;
  speed: number;
};

export type TimelineAudioTrackSyncResult = {
  plan: TimelinePlan;
  syncedClipCount: number;
  syncedTrackCount: number;
  dialogueClipCount: number;
  skippedMockClipCount: number;
  requiresRealAudioModel: boolean;
};

export type TimelineSubtitleTrackGenerationResult = {
  plan: TimelinePlan;
  generatedClipCount: number;
  usedConfiguredModel: boolean;
  fallback: boolean;
  modelLabel: string | null;
};

export class TimelinePostProductionService {
  constructor(
    private readonly store: SqliteStore,
    private readonly provider: AiProvider,
    private readonly deps: TimelinePostProductionServiceDeps
  ) {}

  syncTimelineAudioTrack(projectId: string, episodeId: string | null): TimelineAudioTrackSyncResult | null {
    const plan = this.deps.getTimelinePlan(projectId, episodeId);
    if (!plan) {
      return null;
    }

    const spans = this.resolveTimelineSpans(projectId, plan);
    const { tasksByStoryboard, skippedMockClipCount } = this.buildLatestDoneAudioTaskIndex(projectId);
    const { tracks, syncedClipCount, dialogueClipCount } = this.buildAudioTracksFromTimelineSpans(projectId, spans, tasksByStoryboard);
    const nextPlan = this.replaceTracksByType(
      plan,
      'audio',
      tracks.length > 0
        ? tracks
        : [{
            id: 'audio-main',
            name: 'Audio Main',
            type: 'audio',
            order: 1,
            isLocked: false,
            isMuted: false,
            volume: 100,
            clips: [],
          }]
    );
    return {
      plan: nextPlan,
      syncedClipCount,
      syncedTrackCount: tracks.length,
      dialogueClipCount,
      skippedMockClipCount,
      requiresRealAudioModel: syncedClipCount === 0 && skippedMockClipCount > 0,
    };
  }

  async generateSubtitleTrack(
    projectId: string,
    episodeId: string | null,
    input: { modelId?: string; customModel?: string } = {}
  ): Promise<TimelineSubtitleTrackGenerationResult | null> {
    const plan = this.deps.getTimelinePlan(projectId, episodeId);
    if (!plan) {
      return null;
    }
    const spans = this.resolveTimelineSpans(projectId, plan);
    if (spans.length === 0) {
      return null;
    }

    const modelName = this.deps.resolveTextModelName(input.modelId, input.customModel);
    const modelConfig = this.deps.pickModelConfig('text', modelName);
    const { tasksByStoryboard } = this.buildLatestDoneAudioTaskIndex(projectId);
    const dialogueClips = this.buildDialogueSubtitleClips(projectId, spans, tasksByStoryboard);
    const coveredStoryboardIds = new Set(dialogueClips.map((item) => item.storyboardId));
    const remainingSpans = spans.filter((span) => !coveredStoryboardIds.has(span.clip.storyboardId));
    let generatedByModel = new Map<string, string>();
    let usedConfiguredModel = false;
    let fallback = false;

    if (remainingSpans.length > 0 && modelConfig) {
      try {
        const prompt = this.buildSubtitlePrompt(remainingSpans);
        const result = await this.provider.generateText({
          prompt,
          projectId,
          model: modelConfig.model,
          modelConfig: this.deps.toProviderModelConfig(modelConfig),
        });
        generatedByModel = this.parseSubtitleResponse(result.text);
        usedConfiguredModel = generatedByModel.size > 0;
        fallback = generatedByModel.size !== remainingSpans.length;
      } catch {
        fallback = true;
      }
    } else if (remainingSpans.length > 0) {
      fallback = true;
    }

    const clips = [
      ...dialogueClips,
      ...remainingSpans.map((span) => ({
        id: `subtitle-${span.clip.storyboardId}`,
        storyboardId: span.clip.storyboardId,
        sourceUrl: generatedByModel.get(span.clip.storyboardId) ?? this.buildFallbackSubtitle(span.storyboard),
        durationSec: span.durationSec,
        startMs: span.startMs,
        endMs: span.endMs,
        muted: false,
        volume: 100,
      })),
    ]
      .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0)) satisfies TimelineClip[];

    const nextPlan = this.replaceTracksByType(plan, 'text', [{
      id: 'text-main',
      name: 'Text Overlay',
      type: 'text',
      order: 2,
      isLocked: false,
      isMuted: false,
      volume: 100,
      clips,
    }]);

    return {
      plan: nextPlan,
      generatedClipCount: clips.length,
      usedConfiguredModel,
      fallback,
      modelLabel: dialogueClips.length > 0 && !usedConfiguredModel ? '对白音轨' : modelConfig?.name ?? null,
    };
  }

  private replaceTracksByType(
    plan: TimelinePlan,
    trackType: 'audio' | 'text',
    replacementTracks: TimelineTrack[]
  ): TimelinePlan {
    const tracks = Array.isArray(plan.tracks) ? [...plan.tracks] : [];
    const existingById = new Map(tracks.filter((item) => item.type === trackType).map((item) => [item.id, item]));
    const others = tracks.filter((item) => item.type !== trackType);
    const nextTracks = replacementTracks.map((track) => {
      const existing = existingById.get(track.id);
      return {
        id: existing?.id || track.id,
        name: existing?.name || track.name,
        type: trackType,
        order: typeof existing?.order === 'number' ? existing.order : track.order,
        isLocked: existing?.isLocked ?? track.isLocked,
        isMuted: existing?.isMuted ?? track.isMuted,
        volume: typeof existing?.volume === 'number' ? existing.volume : track.volume,
        clips: track.clips,
      } satisfies TimelineTrack;
    });
    tracks.length = 0;
    tracks.push(...others, ...nextTracks);
    tracks.sort((a, b) => a.order - b.order);
    return (
      this.deps.saveTimelinePlan(plan.projectId, {
        id: plan.id,
        episodeId: plan.episodeId,
        title: plan.title,
        tracks,
        clips: this.pickVideoClips(plan),
      }) ?? plan
    );
  }

  private pickVideoClips(plan: TimelinePlan): TimelineClip[] {
    const tracks = Array.isArray(plan.tracks) ? [...plan.tracks] : [];
    const videoTrack = tracks.sort((a, b) => a.order - b.order).find((item) => item.type === 'video');
    if (videoTrack && Array.isArray(videoTrack.clips) && videoTrack.clips.length > 0) {
      return videoTrack.clips;
    }
    return Array.isArray(plan.clips) ? plan.clips : [];
  }

  private resolveTimelineSpans(projectId: string, plan: TimelinePlan): TimelineSpan[] {
    const clips = this.pickVideoClips(plan);
    const spans: TimelineSpan[] = [];
    let cursorMs = 0;
    for (const clip of clips) {
      const durationSec =
        typeof clip.durationSec === 'number' && Number.isFinite(clip.durationSec) && clip.durationSec > 0
          ? clip.durationSec
          : typeof clip.startMs === 'number' && typeof clip.endMs === 'number' && clip.endMs > clip.startMs
            ? (clip.endMs - clip.startMs) / 1000
            : 5;
      const startMs = typeof clip.startMs === 'number' && Number.isFinite(clip.startMs) ? Math.max(0, Math.floor(clip.startMs)) : cursorMs;
      const endMs =
        typeof clip.endMs === 'number' && Number.isFinite(clip.endMs) && clip.endMs > startMs
          ? Math.floor(clip.endMs)
          : startMs + Math.max(100, Math.floor(durationSec * 1000));
      spans.push({
        clip,
        storyboard: this.store.getStoryboard(projectId, clip.storyboardId),
        startMs,
        endMs,
        durationSec,
      });
      cursorMs = endMs;
    }
    return spans;
  }

  private buildLatestDoneAudioTaskIndex(projectId: string): {
    tasksByStoryboard: Map<string, AudioTask[]>;
    skippedMockClipCount: number;
  } {
    const map = new Map<string, Map<string, AudioTask>>();
    let skippedMockClipCount = 0;
    for (const task of this.store.listAudioTasks(projectId) ?? []) {
      if (task.status !== 'done' || !task.resultUrl) {
        continue;
      }
      if (this.isMockAudioUrl(task.resultUrl)) {
        skippedMockClipCount += 1;
        continue;
      }
      const storyboardMap = map.get(task.storyboardId) ?? new Map<string, AudioTask>();
      const signature = this.buildAudioTaskSignature(task);
      const existed = storyboardMap.get(signature);
      if (!existed || existed.updatedAt < task.updatedAt) {
        storyboardMap.set(signature, task);
      }
      map.set(task.storyboardId, storyboardMap);
    }
    const tasksByStoryboard = new Map<string, AudioTask[]>();
    for (const [storyboardId, items] of map.entries()) {
      tasksByStoryboard.set(
        storyboardId,
        [...items.values()].sort((a, b) => {
          const aIndex = typeof a.params.segmentIndex === 'number' ? a.params.segmentIndex : Number.MAX_SAFE_INTEGER;
          const bIndex = typeof b.params.segmentIndex === 'number' ? b.params.segmentIndex : Number.MAX_SAFE_INTEGER;
          if (aIndex !== bIndex) {
            return aIndex - bIndex;
          }
          return a.updatedAt.localeCompare(b.updatedAt);
        })
      );
    }
    return {
      tasksByStoryboard,
      skippedMockClipCount,
    };
  }

  private buildAudioTaskSignature(task: AudioTask): string {
    const kind = task.params.trackKind ?? 'narration';
    if (kind === 'dialogue') {
      return [
        kind,
        cleanValue(task.params.speaker || ''),
        typeof task.params.segmentIndex === 'number' ? String(task.params.segmentIndex) : '-1',
      ].join(':');
    }
    return [kind, task.storyboardId].join(':');
  }

  private buildAudioTracksFromTimelineSpans(
    projectId: string,
    spans: TimelineSpan[],
    tasksByStoryboard: Map<string, AudioTask[]>
  ): { tracks: TimelineTrack[]; syncedClipCount: number; dialogueClipCount: number } {
    const trackMap = new Map<string, TimelineTrack>();
    let syncedClipCount = 0;
    let dialogueClipCount = 0;

    for (const span of spans) {
      const tasks = tasksByStoryboard.get(span.clip.storyboardId) ?? [];
      const dialogueTasks = tasks.filter((task) => task.params.trackKind === 'dialogue');
      const effectiveTasks = dialogueTasks.length > 0 ? dialogueTasks : tasks;
      const placements = this.buildAudioPlacementsForSpan(projectId, span, effectiveTasks);
      for (const placement of placements) {
        const trackMeta = this.resolveAudioTrackMeta(placement.task);
        const currentTrack =
          trackMap.get(trackMeta.id) ??
          ({
            id: trackMeta.id,
            name: trackMeta.name,
            type: 'audio',
            order: trackMeta.order,
            isLocked: false,
            isMuted: false,
            volume: 100,
            clips: [],
          } satisfies TimelineTrack);
        currentTrack.clips.push({
          id: `audio-${placement.task.id}`,
          storyboardId: span.clip.storyboardId,
          sourceUrl: placement.sourceUrl,
          durationSec: placement.durationSec,
          startMs: placement.startMs,
          endMs: placement.endMs,
          speed: placement.speed > 1.001 ? Number(placement.speed.toFixed(3)) : undefined,
          volume: 100,
          muted: false,
        });
        trackMap.set(trackMeta.id, currentTrack);
        syncedClipCount += 1;
        if (placement.task.params.trackKind === 'dialogue') {
          dialogueClipCount += 1;
        }
      }
    }

    return {
      tracks: [...trackMap.values()].sort((a, b) => a.order - b.order),
      syncedClipCount,
      dialogueClipCount,
    };
  }

  private resolveAudioTrackMeta(task: AudioTask): { id: string; name: string; order: number } {
    const kind = task.params.trackKind ?? 'narration';
    if (kind === 'dialogue') {
      const speaker = cleanValue(task.params.speaker || task.params.voice || '对白');
      const key = speaker.replace(/[^\p{Script=Han}A-Za-z0-9_-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'dialogue';
      return {
        id: `audio-dialogue-${key}`,
        name: `对白 · ${speaker}`,
        order: 10 + this.hashTrackKey(key),
      };
    }
    if (kind === 'ambience') {
      return { id: 'audio-sfx-main', name: '环境音轨', order: 90 };
    }
    if (kind === 'music') {
      return { id: 'audio-bgm-main', name: '配乐轨', order: 100 };
    }
    return { id: 'audio-main', name: 'Audio Main', order: 1 };
  }

  private hashTrackKey(value: string): number {
    let sum = 0;
    for (const char of value) {
      sum += char.codePointAt(0) ?? 0;
    }
    return sum % 50;
  }

  private buildDialogueSubtitleClips(
    projectId: string,
    spans: TimelineSpan[],
    tasksByStoryboard: Map<string, AudioTask[]>
  ): TimelineClip[] {
    const clips: TimelineClip[] = [];
    for (const span of spans) {
      const tasks = (tasksByStoryboard.get(span.clip.storyboardId) ?? []).filter((task) => task.params.trackKind === 'dialogue');
      const placements = this.buildAudioPlacementsForSpan(projectId, span, tasks);
      for (const placement of placements) {
        const text = cleanValue(placement.task.params.sourceText || placement.task.prompt);
        if (!text) {
          continue;
        }
        const speaker = cleanValue(placement.task.params.speaker || '');
        clips.push({
          id: `subtitle-${placement.task.id}`,
          storyboardId: span.clip.storyboardId,
          sourceUrl: speaker ? `${speaker}：${text}` : text,
          durationSec: placement.durationSec,
          startMs: placement.startMs,
          endMs: placement.endMs,
          muted: false,
          volume: 100,
        });
      }
    }
    return clips;
  }

  private isMockAudioUrl(value: string | null | undefined): boolean {
    return String(value ?? '').startsWith('/mock/audio/');
  }

  private buildAudioPlacementsForSpan(projectId: string, span: TimelineSpan, tasks: AudioTask[]): AudioPlacement[] {
    if (tasks.length === 0) {
      return [];
    }
    const clipDurationMs = Math.max(200, span.endMs - span.startMs);
    const resolved = tasks
      .map((task) => {
        const timing = this.deps.resolveAudioTaskTiming(projectId, task.id);
        const sourceUrl = timing.sourceUrl ?? this.deps.resolveAudioTaskSourceUrl(projectId, task.id) ?? task.resultUrl;
        if (!sourceUrl) {
          return null;
        }
        const segmentStartMs =
          typeof task.params.segmentStartMs === 'number' && Number.isFinite(task.params.segmentStartMs)
            ? Math.max(0, Math.min(clipDurationMs, task.params.segmentStartMs))
            : 0;
        const plannedEndMs =
          typeof task.params.segmentEndMs === 'number' && Number.isFinite(task.params.segmentEndMs)
            ? Math.max(segmentStartMs + 200, Math.min(clipDurationMs, task.params.segmentEndMs))
            : clipDurationMs;
        const plannedDurationMs = Math.max(200, plannedEndMs - segmentStartMs);
        const actualDurationMs =
          typeof timing.durationSec === 'number' && Number.isFinite(timing.durationSec) && timing.durationSec > 0
            ? Math.max(200, Math.round(timing.durationSec * 1000))
            : plannedDurationMs;
        return {
          task,
          sourceUrl,
          actualDurationMs,
        };
      })
      .filter((item): item is { task: AudioTask; sourceUrl: string; actualDurationMs: number } => Boolean(item))
      .sort((a, b) => {
        const aIndex = typeof a.task.params.segmentIndex === 'number' ? a.task.params.segmentIndex : Number.MAX_SAFE_INTEGER;
        const bIndex = typeof b.task.params.segmentIndex === 'number' ? b.task.params.segmentIndex : Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) {
          return aIndex - bIndex;
        }
        return a.task.updatedAt.localeCompare(b.task.updatedAt);
      });

    if (resolved.length === 0) {
      return [];
    }

    const totalActualMs = resolved.reduce((sum, item) => sum + item.actualDurationMs, 0);
    const compressionRatio = totalActualMs > clipDurationMs ? totalActualMs / clipDurationMs : 1;
    let cursorMs = span.startMs;

    return resolved.map((item, index) => {
      const isLast = index === resolved.length - 1;
      const adjustedDurationMs = Math.max(200, Math.round(item.actualDurationMs / compressionRatio));
      const startMs = cursorMs;
      const endMs = isLast ? span.endMs : Math.min(span.endMs, startMs + adjustedDurationMs);
      cursorMs = endMs;
      return {
        task: item.task,
        sourceUrl: item.sourceUrl,
        startMs,
        endMs: Math.max(startMs + 200, endMs),
        durationSec: Number((Math.max(200, endMs - startMs) / 1000).toFixed(3)),
        speed: compressionRatio,
      } satisfies AudioPlacement;
    });
  }

  private buildSubtitlePrompt(spans: TimelineSpan[]): string {
    const shots = spans
      .map((span, index) => {
        const plan = span.storyboard?.plan;
        return [
          `${index + 1}. storyboardId=${span.clip.storyboardId}`,
          `标题=${cleanValue(plan?.shotTitle || span.storyboard?.title || '')}`,
          `场景=${cleanValue(plan?.scene || '')}`,
          `时间=${cleanValue(plan?.time || '')}`,
          `主体=${cleanValue(plan?.subject || '')}`,
          `动作=${cleanValue(plan?.action || span.storyboard?.prompt || '')}`,
          `时长=${Number(span.durationSec.toFixed(2))}s`,
        ].join('；');
      })
      .join('\n');
    return [
      '你是影视后期字幕编辑。',
      '请为每个镜头生成一句简短中文字幕，适合直接烧录到画面底部。',
      '要求：',
      '1. 只输出严格 JSON，不要解释，不要 Markdown 代码块。',
      '2. JSON 结构固定为 {"subtitles":[{"storyboardId":"...","text":"..."}]}。',
      '3. 每条字幕尽量控制在 8-22 个中文字符，简洁自然，不写技术描述。',
      '4. 不要出现“镜头、构图、光线、场景”等制作词。',
      '5. 如果画面更适合旁白感，请写成一句旁白；如果更适合对白感，请写成一句对白。',
      '镜头列表：',
      shots,
    ].join('\n');
  }

  private parseSubtitleResponse(raw: string): Map<string, string> {
    const candidates = this.extractJsonCandidates(raw);
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        if (!parsed || typeof parsed !== 'object' || !('subtitles' in parsed)) {
          continue;
        }
        const subtitles = (parsed as { subtitles?: unknown }).subtitles;
        if (!Array.isArray(subtitles)) {
          continue;
        }
        const map = new Map<string, string>();
        for (const item of subtitles) {
          if (!item || typeof item !== 'object') {
            continue;
          }
          const node = item as { storyboardId?: unknown; text?: unknown };
          if (typeof node.storyboardId !== 'string' || typeof node.text !== 'string') {
            continue;
          }
          const text = clampText(stripLeadingLabel(node.text), 22);
          if (!text) {
            continue;
          }
          map.set(node.storyboardId, text);
        }
        if (map.size > 0) {
          return map;
        }
      } catch {
        continue;
      }
    }
    return new Map();
  }

  private extractJsonCandidates(raw: string): string[] {
    const trimmed = cleanValue(raw).replace(/^```json/iu, '').replace(/^```/u, '').replace(/```$/u, '').trim();
    const candidates = new Set<string>();
    if (trimmed) {
      candidates.add(trimmed);
    }
    const objStart = raw.indexOf('{');
    const objEnd = raw.lastIndexOf('}');
    if (objStart >= 0 && objEnd > objStart) {
      candidates.add(raw.slice(objStart, objEnd + 1));
    }
    return [...candidates];
  }

  private buildFallbackSubtitle(storyboard: Storyboard | null): string {
    const plan = storyboard?.plan;
    const action = stripLeadingLabel(plan?.action || '');
    const subject = stripLeadingLabel(plan?.subject || storyboard?.title || '');
    if (action) {
      return clampText(action, 22);
    }
    if (subject) {
      return clampText(subject, 22);
    }
    return '画面继续推进';
  }
}
