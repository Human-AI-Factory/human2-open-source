import { ref, type Ref } from 'vue';
import {
  createDramaTimelineAudioTasksBatch,
  createTimelineAudioTasksBatch,
  generateDramaTimelineSubtitleTrack,
  generateTimelineSubtitleTrack,
  syncDramaTimelineAudioTrack,
  syncTimelineAudioTrack,
} from '@/api/timeline-editor';
import type { TimelineClip, TimelinePlan, TimelineTrack } from '@/types/models';

type UseTimelinePostProductionOpsOptions = {
  projectId: Ref<string>;
  dramaId: Ref<string>;
  hasDramaScopedApi: Ref<boolean>;
  selectedEpisodeId: Ref<string>;
  timelineId: Ref<string>;
  clips: Ref<TimelineClip[]>;
  loading: Ref<boolean>;
  error: Ref<string>;
  saveTimeline: () => Promise<TimelinePlan | null>;
  normalizeClips: (input: TimelineClip[]) => TimelineClip[];
  pickPlanClips: (plan: { clips: TimelineClip[]; tracks?: Array<{ type: string; clips?: TimelineClip[] }> }) => TimelineClip[];
  applyAuxTracks: (plan: { tracks?: TimelineTrack[] }) => void;
  ensureSelectedClipIndex: () => void;
  pushCommandHistory: (action: string, detail?: string, command?: string) => void;
};

const toMessage = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

export const useTimelinePostProductionOps = (options: UseTimelinePostProductionOpsOptions) => {
  const postproductionMessage = ref('');

  const applyReturnedPlan = (plan: TimelinePlan): void => {
    options.timelineId.value = plan.id;
    options.clips.value = options.normalizeClips(options.pickPlanClips(plan));
    options.applyAuxTracks(plan);
    options.ensureSelectedClipIndex();
  };

  const ensureTimelinePersisted = async (): Promise<boolean> => {
    const plan = await options.saveTimeline();
    return Boolean(plan);
  };

  const syncCompletedAudioToTimeline = async (): Promise<void> => {
    if (!options.projectId.value) {
      return;
    }
    try {
      options.loading.value = true;
      if (!(await ensureTimelinePersisted())) {
        return;
      }
      const payload = {
        episodeId: options.selectedEpisodeId.value || null,
      };
      const result = options.hasDramaScopedApi.value
        ? await syncDramaTimelineAudioTrack(options.dramaId.value, payload)
        : await syncTimelineAudioTrack(options.projectId.value, payload);
      applyReturnedPlan(result.plan);
      postproductionMessage.value = result.requiresRealAudioModel
        ? `未挂入音频：已跳过 ${result.skippedMockClipCount} 条 mock 音频，请先配置真实 audio 模型并重跑音频任务`
        : `已挂入 ${result.syncedClipCount} 条已完成音频片段，生成 ${result.syncedTrackCount} 条音轨（对白 ${result.dialogueClipCount} 条）${
            result.skippedMockClipCount > 0 ? `，跳过 ${result.skippedMockClipCount} 条 mock 音频` : ''
          }`;
      options.pushCommandHistory('sync-audio-track', postproductionMessage.value);
      options.error.value = '';
    } catch (err) {
      options.error.value = toMessage(err, '挂入已完成音频失败');
    } finally {
      options.loading.value = false;
    }
  };

  const createTimelineAudioTasks = async (): Promise<void> => {
    if (!options.projectId.value) {
      return;
    }
    try {
      options.loading.value = true;
      if (!(await ensureTimelinePersisted())) {
        return;
      }
      const payload = {
        episodeId: options.selectedEpisodeId.value || null,
        priority: 'medium' as const,
      };
      const result = options.hasDramaScopedApi.value
        ? await createDramaTimelineAudioTasksBatch(options.dramaId.value, payload)
        : await createTimelineAudioTasksBatch(options.projectId.value, payload);
      postproductionMessage.value = `已创建 ${result.createdTaskCount} 条对白音频任务，覆盖 ${result.createdStoryboardIds.length} 个分镜，角色 ${result.speakerCount} 个${
        result.usedConfiguredTextModel ? `，对白规划模型：${result.modelLabel || '已配置文本模型'}` : result.fallback ? '，当前为回退对白规划' : ''
      }；跳过 ${result.skippedStoryboardIds.length} 个已有对白任务的分镜`;
      options.pushCommandHistory('create-audio-tasks', postproductionMessage.value);
      options.error.value = '';
    } catch (err) {
      options.error.value = toMessage(err, '批量生成音频任务失败');
    } finally {
      options.loading.value = false;
    }
  };

  const generateSubtitleTrackForTimeline = async (): Promise<void> => {
    if (!options.projectId.value) {
      return;
    }
    try {
      options.loading.value = true;
      if (!(await ensureTimelinePersisted())) {
        return;
      }
      const payload = {
        episodeId: options.selectedEpisodeId.value || null,
      };
      const result = options.hasDramaScopedApi.value
        ? await generateDramaTimelineSubtitleTrack(options.dramaId.value, payload)
        : await generateTimelineSubtitleTrack(options.projectId.value, payload);
      applyReturnedPlan(result.plan);
      postproductionMessage.value = result.fallback
        ? `已生成 ${result.generatedClipCount} 条字幕轨，当前为回退文案`
        : `已生成 ${result.generatedClipCount} 条字幕轨，模型：${result.modelLabel || '已配置文本模型'}`;
      options.pushCommandHistory('generate-subtitles', postproductionMessage.value);
      options.error.value = '';
    } catch (err) {
      options.error.value = toMessage(err, '生成字幕轨失败');
    } finally {
      options.loading.value = false;
    }
  };

  return {
    createTimelineAudioTasks,
    generateSubtitleTrackForTimeline,
    postproductionMessage,
    syncCompletedAudioToTimeline,
  };
};
