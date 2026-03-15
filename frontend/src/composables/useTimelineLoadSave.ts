import type { Ref } from 'vue';
import {
  createDramaVideoMergeFromTimeline,
  createVideoMergeFromTimeline,
  getDramaStoryboards,
  getDramaTimelinePlan,
  getDramaVideoTasks,
  getProject,
  getStoryboards,
  getTimelinePlan,
  getVideoTasks,
  saveDramaTimelinePlan,
  saveTimelinePlan
} from '@/api/timeline-editor';
import { getEpisodeDomains, getEpisodeDomainsByDrama } from '@/api/domain-context';
import type { EpisodeDomain, Project, Storyboard, TimelineClip, TimelinePlan, TimelineTrack, VideoTask } from '@/types/models';
import { resolveProjectIdFromRouteContext } from '@/utils/route-context';

type UseTimelineLoadSaveOptions = {
  projectId: Ref<string>;
  routeProjectId: Ref<string>;
  routeDramaId: Ref<string>;
  dramaId: Ref<string>;
  hasDramaScopedApi: Ref<boolean>;
  project: Ref<Project | null>;
  storyboards: Ref<Storyboard[]>;
  latestDoneVideoTaskByStoryboardId: Ref<Record<string, { taskId: string; resultUrl: string }>>;
  episodes: Ref<EpisodeDomain[]>;
  selectedEpisodeId: Ref<string>;
  timelineId: Ref<string>;
  timelineTitle: Ref<string>;
  clips: Ref<TimelineClip[]>;
  loading: Ref<boolean>;
  error: Ref<string>;
  timelinePlayheadSec: Ref<number>;
  undoStack: Ref<unknown[]>;
  redoStack: Ref<unknown[]>;
  commandHistory: Ref<unknown[]>;
  normalizeClips: (input: TimelineClip[]) => TimelineClip[];
  pickPlanClips: (plan: { clips: TimelineClip[]; tracks?: Array<{ type: string; clips?: TimelineClip[] }> }) => TimelineClip[];
  applyAuxTracks: (plan: { tracks?: TimelineTrack[] }) => void;
  ensureSelectedClipIndex: () => void;
  applyRouteEpisodePreset: () => void;
  applyRouteStoryboardPreset: () => void;
  buildPersistedTracks: () => TimelineTrack[];
  pushCommandHistory: (action: string, detail?: string, command?: string) => void;
};

const toMessage = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

const buildLatestDoneVideoTaskIndex = (videoTasks: VideoTask[]): Record<string, { taskId: string; resultUrl: string }> =>
  videoTasks
    .filter((item) => item.status === 'done' && Boolean(item.resultUrl))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .reduce<Record<string, { taskId: string; resultUrl: string }>>((acc, item) => {
      if (acc[item.storyboardId] || !item.resultUrl) {
        return acc;
      }
      acc[item.storyboardId] = {
        taskId: item.id,
        resultUrl: item.resultUrl
      };
      return acc;
    }, {});

const buildFallbackClips = (videoTasks: VideoTask[]): TimelineClip[] =>
  videoTasks
    .filter((item) => item.status === 'done' && item.resultUrl)
    .map((item, idx) => ({
      storyboardId: item.storyboardId,
      videoTaskId: item.id,
      sourceUrl: item.resultUrl || undefined,
      durationSec: item.params.duration ?? 5,
      transition: {
        type: idx === 0 ? 'cut' : 'fade',
        durationSec: idx === 0 ? 0.05 : 0.6,
        easing: 'easeInOut',
        direction: 'left'
      }
    })) as TimelineClip[];

export const useTimelineLoadSave = (options: UseTimelineLoadSaveOptions) => {
  const loadTimeline = async (): Promise<void> => {
    if (!options.projectId.value) return;
    try {
      options.loading.value = true;
      const query = {
        episodeId: options.selectedEpisodeId.value || undefined
      };
      const plan = options.hasDramaScopedApi.value
        ? await getDramaTimelinePlan(options.dramaId.value, query)
        : await getTimelinePlan(options.projectId.value, query);
      options.timelineId.value = plan.id;
      options.timelineTitle.value = plan.title;
      options.clips.value = options.normalizeClips(options.pickPlanClips(plan));
      options.applyAuxTracks(plan);
      options.ensureSelectedClipIndex();
      options.timelinePlayheadSec.value = 0;
      options.error.value = '';
    } catch (err) {
      options.error.value = toMessage(err, '加载时间线失败');
    } finally {
      options.loading.value = false;
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
    try {
      options.loading.value = true;
      const [projectData, storyboardList, episodeList, videoTasks] = await Promise.all([
        getProject(options.projectId.value),
        options.hasDramaScopedApi.value ? getDramaStoryboards(options.dramaId.value) : getStoryboards(options.projectId.value),
        options.hasDramaScopedApi.value
          ? getEpisodeDomainsByDrama(options.dramaId.value).catch(() => [])
          : getEpisodeDomains(options.projectId.value).catch(() => []),
        options.hasDramaScopedApi.value ? getDramaVideoTasks(options.dramaId.value) : getVideoTasks(options.projectId.value)
      ]);
      options.project.value = projectData;
      options.storyboards.value = storyboardList;
      options.episodes.value = episodeList;
      options.latestDoneVideoTaskByStoryboardId.value = buildLatestDoneVideoTaskIndex(videoTasks);
      options.applyRouteEpisodePreset();
      await loadTimeline();
      if (options.clips.value.length === 0) {
        options.clips.value = buildFallbackClips(videoTasks);
      }
      options.ensureSelectedClipIndex();
      options.applyRouteStoryboardPreset();
      options.undoStack.value = [];
      options.redoStack.value = [];
      options.commandHistory.value = [];
      options.error.value = '';
    } catch (err) {
      options.error.value = toMessage(err, '加载失败');
    } finally {
      options.loading.value = false;
    }
  };

  const saveTimeline = async (): Promise<TimelinePlan | null> => {
    if (!options.projectId.value || options.clips.value.length === 0) {
      return null;
    }
    try {
      options.loading.value = true;
      const payload: {
        id?: string;
        episodeId?: string | null;
        title?: string;
        tracks?: TimelinePlan['tracks'];
        clips?: TimelinePlan['clips'];
      } = {
        id: options.timelineId.value || undefined,
        episodeId: options.selectedEpisodeId.value || null,
        title: options.timelineTitle.value.trim() || undefined,
        tracks: [...options.buildPersistedTracks()],
        clips: options.normalizeClips(options.clips.value)
      };
      const plan = options.hasDramaScopedApi.value
        ? await saveDramaTimelinePlan(options.dramaId.value, payload)
        : await saveTimelinePlan(options.projectId.value, payload);
      options.timelineId.value = plan.id;
      options.timelineTitle.value = plan.title;
      options.clips.value = options.normalizeClips(options.pickPlanClips(plan));
      options.applyAuxTracks(plan);
      options.ensureSelectedClipIndex();
      options.pushCommandHistory('save-timeline', '保存时间线成功');
      options.error.value = '';
      return plan;
    } catch (err) {
      options.error.value = toMessage(err, '保存失败');
      return null;
    } finally {
      options.loading.value = false;
    }
  };

  const createMergeByTimeline = async (): Promise<void> => {
    if (!options.projectId.value) return;
    try {
      options.loading.value = true;
      const saved = await saveTimeline();
      if (!saved) {
        return;
      }
      const payload = {
        episodeId: options.selectedEpisodeId.value || null,
        title: options.timelineTitle.value.trim() || undefined
      };
      if (options.hasDramaScopedApi.value) {
        await createDramaVideoMergeFromTimeline(options.dramaId.value, payload);
      } else {
        await createVideoMergeFromTimeline(options.projectId.value, payload);
      }
      options.pushCommandHistory('create-merge', '已发起按时间线合成');
      options.error.value = '';
    } catch (err) {
      options.error.value = toMessage(err, '创建合成任务失败');
    } finally {
      options.loading.value = false;
    }
  };

  return {
    createMergeByTimeline,
    loadAll,
    loadTimeline,
    saveTimeline
  };
};
