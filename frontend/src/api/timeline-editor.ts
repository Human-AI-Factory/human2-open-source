import { request } from '@/api/client';
import { buildQuery } from '@/api/utils';
import type {
  Project,
  Storyboard,
  TimelineAudioTaskBatchResult,
  TeamWorkspaceLayoutTemplate,
  TimelineAudioTrackSyncResult,
  TimelinePlan,
  TimelineSubtitleTrackGenerationResult,
  VideoMerge,
  VideoTask,
} from '@/types/models';

export const getProject = (id: string): Promise<Project> => request(`/api/projects/${id}`);

export const getStoryboards = (projectId: string): Promise<Storyboard[]> => request(`/api/pipeline/projects/${projectId}/storyboards`);

export const getDramaStoryboards = (dramaId: string): Promise<Storyboard[]> => request(`/api/pipeline/dramas/${dramaId}/storyboards`);

export const getVideoTasks = (projectId: string): Promise<VideoTask[]> => request(`/api/pipeline/projects/${projectId}/video-tasks`);

export const getDramaVideoTasks = (dramaId: string): Promise<VideoTask[]> => request(`/api/pipeline/dramas/${dramaId}/video-tasks`);

export const getTimelinePlan = (projectId: string, input: { episodeId?: string } = {}): Promise<TimelinePlan> =>
  request(`/api/pipeline/projects/${projectId}/timeline?${buildQuery(input)}`);

export const getDramaTimelinePlan = (dramaId: string, input: { episodeId?: string } = {}): Promise<TimelinePlan> =>
  request(`/api/pipeline/dramas/${dramaId}/timeline?${buildQuery(input)}`);

export const saveTimelinePlan = (
  projectId: string,
  payload: { id?: string; episodeId?: string | null; title?: string; tracks?: TimelinePlan['tracks']; clips?: TimelinePlan['clips'] }
): Promise<TimelinePlan> =>
  request(`/api/pipeline/projects/${projectId}/timeline`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const saveDramaTimelinePlan = (
  dramaId: string,
  payload: { id?: string; episodeId?: string | null; title?: string; tracks?: TimelinePlan['tracks']; clips?: TimelinePlan['clips'] }
): Promise<TimelinePlan> =>
  request(`/api/pipeline/dramas/${dramaId}/timeline`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const createVideoMergeFromTimeline = (
  projectId: string,
  payload: { episodeId?: string | null; title?: string } = {}
): Promise<VideoMerge> =>
  request(`/api/pipeline/projects/${projectId}/timeline/video-merge`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createDramaVideoMergeFromTimeline = (
  dramaId: string,
  payload: { episodeId?: string | null; title?: string } = {}
): Promise<VideoMerge> =>
  request(`/api/pipeline/dramas/${dramaId}/timeline/video-merge`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createTimelineAudioTasksBatch = (
  projectId: string,
  payload: {
    episodeId?: string | null;
    priority?: 'low' | 'medium' | 'high';
    modelId?: string;
    customModel?: string;
    voice?: string;
    speed?: number;
    emotion?: string;
    format?: string;
    providerOptions?: Record<string, unknown>;
  } = {}
): Promise<TimelineAudioTaskBatchResult> =>
  request(`/api/pipeline/projects/${projectId}/timeline/audio-tasks/batch`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createDramaTimelineAudioTasksBatch = (
  dramaId: string,
  payload: {
    episodeId?: string | null;
    priority?: 'low' | 'medium' | 'high';
    modelId?: string;
    customModel?: string;
    voice?: string;
    speed?: number;
    emotion?: string;
    format?: string;
    providerOptions?: Record<string, unknown>;
  } = {}
): Promise<TimelineAudioTaskBatchResult> =>
  request(`/api/pipeline/dramas/${dramaId}/timeline/audio-tasks/batch`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const syncTimelineAudioTrack = (
  projectId: string,
  payload: { episodeId?: string | null } = {}
): Promise<TimelineAudioTrackSyncResult> =>
  request(`/api/pipeline/projects/${projectId}/timeline/audio-track/sync`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const syncDramaTimelineAudioTrack = (
  dramaId: string,
  payload: { episodeId?: string | null } = {}
): Promise<TimelineAudioTrackSyncResult> =>
  request(`/api/pipeline/dramas/${dramaId}/timeline/audio-track/sync`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateTimelineSubtitleTrack = (
  projectId: string,
  payload: { episodeId?: string | null; modelId?: string; customModel?: string } = {}
): Promise<TimelineSubtitleTrackGenerationResult> =>
  request(`/api/pipeline/projects/${projectId}/timeline/subtitles/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateDramaTimelineSubtitleTrack = (
  dramaId: string,
  payload: { episodeId?: string | null; modelId?: string; customModel?: string } = {}
): Promise<TimelineSubtitleTrackGenerationResult> =>
  request(`/api/pipeline/dramas/${dramaId}/timeline/subtitles/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getTeamWorkspaceLayoutTemplates = (contextScope: string): Promise<TeamWorkspaceLayoutTemplate[]> =>
  request(`/api/settings/workspace-layout/team-templates?${buildQuery({ contextScope })}`);

export const saveTeamWorkspaceLayoutTemplate = (
  contextScope: string,
  name: string,
  uiPrefs: Record<string, unknown>
): Promise<TeamWorkspaceLayoutTemplate[]> =>
  request(`/api/settings/workspace-layout/team-templates/${encodeURIComponent(name)}?${buildQuery({ contextScope })}`, {
    method: 'PUT',
    body: JSON.stringify({ uiPrefs })
  });

export const deleteTeamWorkspaceLayoutTemplate = (contextScope: string, name: string): Promise<TeamWorkspaceLayoutTemplate[]> =>
  request(`/api/settings/workspace-layout/team-templates/${encodeURIComponent(name)}?${buildQuery({ contextScope })}`, {
    method: 'DELETE'
  });
