import { request } from '@/api/client';
import type {
  AudioTask,
  EpisodeWorkflowStatus,
  Storyboard,
  WorkflowEpisodeOverrideBatchResult,
  WorkflowEpisodeTransitionBatchResult,
  WorkflowOpLogEntry,
  WorkflowTransitionUndoEntry
} from '@/types/models';

type EpisodeBatchPrecheckResult = Promise<{
  episodes: Array<{
    episodeId: string;
    totalStoryboards: number;
    creatableStoryboardIds: string[];
    conflictStoryboardIds: string[];
    conflictReason: 'asset_exists' | 'video_task_exists';
  }>;
  summary: {
    totalEpisodes: number;
    totalStoryboards: number;
    totalCreatable: number;
    totalConflicts: number;
  };
}>;

type EpisodeBatchBuildResult = Promise<{
  episodes: Array<{
    episodeId: string;
    createdStoryboardIds: string[];
    skippedStoryboardIds: string[];
    failedStoryboardIds?: string[];
    createdCount: number;
    skippedCount: number;
    failedCount?: number;
    failures?: Array<{
      storyboardId: string;
      storyboardTitle: string;
      message: string;
    }>;
  }>;
  totalEpisodes: number;
}>;

type StoryboardGeneratePayload = {
  scriptId: string;
  modelId?: string;
  customModel?: string;
  resolution?: string;
  aspectRatio?: string;
  providerOptions?: Record<string, unknown>;
};

type StoryboardRenderPayload = {
  scriptId?: string;
  storyboardIds?: string[];
  modelId?: string;
  customModel?: string;
  resolution?: string;
  aspectRatio?: string;
  providerOptions?: Record<string, unknown>;
};

export const generateStoryboards = (
  projectId: string,
  payload: StoryboardGeneratePayload
): Promise<Storyboard[]> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const planStoryboards = (
  projectId: string,
  payload: Pick<StoryboardGeneratePayload, 'scriptId'>
): Promise<Storyboard[]> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/plan`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const renderStoryboardImages = (
  projectId: string,
  payload: StoryboardRenderPayload
): Promise<Storyboard[]> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/render`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateDramaStoryboards = (
  dramaId: string,
  payload: StoryboardGeneratePayload
): Promise<Storyboard[]> =>
  request(`/api/pipeline/dramas/${dramaId}/storyboards/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const planDramaStoryboards = (
  dramaId: string,
  payload: Pick<StoryboardGeneratePayload, 'scriptId'>
): Promise<Storyboard[]> =>
  request(`/api/pipeline/dramas/${dramaId}/storyboards/plan`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const renderDramaStoryboardImages = (
  dramaId: string,
  payload: StoryboardRenderPayload
): Promise<Storyboard[]> =>
  request(`/api/pipeline/dramas/${dramaId}/storyboards/render`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateEpisodesAssetsBatch = (
  projectId: string,
  payload: {
    episodeIds?: string[];
    modelId?: string;
    customModel?: string;
    resolution?: string;
    aspectRatio?: string;
    providerOptions?: Record<string, unknown>;
    /** Asset scope to generate: 'base' = project assets only, 'shot' = storyboard assets only */
    scope?: 'base' | 'shot';
  } = {}
): EpisodeBatchBuildResult =>
  request(`/api/pipeline/projects/${projectId}/episodes/batch/assets/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateDramaEpisodesAssetsBatch = (
  dramaId: string,
  payload: {
    episodeIds?: string[];
    modelId?: string;
    customModel?: string;
    resolution?: string;
    aspectRatio?: string;
    providerOptions?: Record<string, unknown>;
    /** Asset scope to generate: 'base' = project assets only, 'shot' = storyboard assets only */
    scope?: 'base' | 'shot';
  } = {}
): EpisodeBatchBuildResult =>
  request(`/api/pipeline/dramas/${dramaId}/episodes/batch/assets/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const precheckEpisodesAssetsBatch = (
  projectId: string,
  payload: { episodeIds?: string[] } = {}
): EpisodeBatchPrecheckResult =>
  request(`/api/pipeline/projects/${projectId}/episodes/batch/assets/precheck`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const precheckDramaEpisodesAssetsBatch = (
  dramaId: string,
  payload: { episodeIds?: string[] } = {}
): EpisodeBatchPrecheckResult =>
  request(`/api/pipeline/dramas/${dramaId}/episodes/batch/assets/precheck`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createEpisodesVideoTasksBatch = (
  projectId: string,
  payload: {
    episodeIds?: string[];
    priority?: 'low' | 'medium' | 'high';
    modelId?: string;
    customModel?: string;
    mode?: 'text' | 'singleImage' | 'startEnd' | 'multiImage' | 'reference';
    duration?: number;
    resolution?: string;
    aspectRatio?: string;
    audio?: boolean;
    imageInputs?: string[];
    imageWithRoles?: Array<{ url: string; role: 'first_frame' | 'last_frame' | 'reference' }>;
    endFrame?: string;
    providerOptions?: Record<string, unknown>;
  } = {}
): EpisodeBatchBuildResult =>
  request(`/api/pipeline/projects/${projectId}/episodes/batch/video-tasks`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createDramaEpisodesVideoTasksBatch = (
  dramaId: string,
  payload: {
    episodeIds?: string[];
    priority?: 'low' | 'medium' | 'high';
    modelId?: string;
    customModel?: string;
    mode?: 'text' | 'singleImage' | 'startEnd' | 'multiImage' | 'reference';
    duration?: number;
    resolution?: string;
    aspectRatio?: string;
    audio?: boolean;
    imageInputs?: string[];
    imageWithRoles?: Array<{ url: string; role: 'first_frame' | 'last_frame' | 'reference' }>;
    endFrame?: string;
    providerOptions?: Record<string, unknown>;
  } = {}
): EpisodeBatchBuildResult =>
  request(`/api/pipeline/dramas/${dramaId}/episodes/batch/video-tasks`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const precheckEpisodesVideoTasksBatch = (
  projectId: string,
  payload: { episodeIds?: string[] } = {}
): EpisodeBatchPrecheckResult =>
  request(`/api/pipeline/projects/${projectId}/episodes/batch/video-tasks/precheck`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const precheckDramaEpisodesVideoTasksBatch = (
  dramaId: string,
  payload: { episodeIds?: string[] } = {}
): EpisodeBatchPrecheckResult =>
  request(`/api/pipeline/dramas/${dramaId}/episodes/batch/video-tasks/precheck`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createAudioTask = (
  projectId: string,
  payload: {
    storyboardId: string;
    priority?: 'low' | 'medium' | 'high';
    modelId?: string;
    customModel?: string;
    voice?: string;
    speed?: number;
    emotion?: string;
    format?: 'mp3' | 'wav' | 'aac' | 'flac' | 'ogg';
    providerOptions?: Record<string, unknown>;
  }
): Promise<AudioTask> =>
  request(`/api/pipeline/projects/${projectId}/audio-tasks`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createDramaAudioTask = (
  dramaId: string,
  payload: {
    storyboardId: string;
    priority?: 'low' | 'medium' | 'high';
    modelId?: string;
    customModel?: string;
    voice?: string;
    speed?: number;
    emotion?: string;
    format?: 'mp3' | 'wav' | 'aac' | 'flac' | 'ogg';
    providerOptions?: Record<string, unknown>;
  }
): Promise<AudioTask> =>
  request(`/api/pipeline/dramas/${dramaId}/audio-tasks`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const transitionProjectWorkflowEpisodesBatch = (
  projectId: string,
  payload: {
    episodeIds: string[];
    toStatus: EpisodeWorkflowStatus;
    actor?: string;
    comment?: string;
  }
): Promise<WorkflowEpisodeTransitionBatchResult> =>
  request(`/api/domain/projects/${projectId}/workflow/episodes/transition-batch`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const transitionDramaWorkflowEpisodesBatch = (
  dramaId: string,
  payload: {
    episodeIds: string[];
    toStatus: EpisodeWorkflowStatus;
    actor?: string;
    comment?: string;
  }
): Promise<WorkflowEpisodeTransitionBatchResult> =>
  request(`/api/domain/dramas/${dramaId}/workflow/episodes/transition-batch`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const overrideProjectWorkflowEpisodesBatch = (
  projectId: string,
  payload: {
    episodeIds: string[];
    toStatus: EpisodeWorkflowStatus;
    actor?: string;
    comment?: string;
  }
): Promise<WorkflowEpisodeOverrideBatchResult> =>
  request(`/api/domain/projects/${projectId}/workflow/episodes/override-batch`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const overrideDramaWorkflowEpisodesBatch = (
  dramaId: string,
  payload: {
    episodeIds: string[];
    toStatus: EpisodeWorkflowStatus;
    actor?: string;
    comment?: string;
  }
): Promise<WorkflowEpisodeOverrideBatchResult> =>
  request(`/api/domain/dramas/${dramaId}/workflow/episodes/override-batch`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getWorkflowTransitionUndoStack = (projectId: string): Promise<WorkflowTransitionUndoEntry[]> =>
  request(`/api/domain/projects/${projectId}/workflow/episodes/transition-batch/undo-stack`);

export const getDramaWorkflowTransitionUndoStack = (dramaId: string): Promise<WorkflowTransitionUndoEntry[]> =>
  request(`/api/domain/dramas/${dramaId}/workflow/episodes/transition-batch/undo-stack`);

export const undoWorkflowTransitionBatch = (
  projectId: string,
  payload: { entryId?: string; actor?: string; comment?: string } = {}
): Promise<{ entryId: string; restored: number; failedEpisodeIds: string[]; expired: boolean }> =>
  request(`/api/domain/projects/${projectId}/workflow/episodes/transition-batch/undo`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const undoDramaWorkflowTransitionBatch = (
  dramaId: string,
  payload: { entryId?: string; actor?: string; comment?: string } = {}
): Promise<{ entryId: string; restored: number; failedEpisodeIds: string[]; expired: boolean }> =>
  request(`/api/domain/dramas/${dramaId}/workflow/episodes/transition-batch/undo`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getProjectWorkflowOpLogs = (projectId: string): Promise<WorkflowOpLogEntry[]> =>
  request(`/api/domain/projects/${projectId}/workflow/op-logs`);

export const getDramaWorkflowOpLogs = (dramaId: string): Promise<WorkflowOpLogEntry[]> =>
  request(`/api/domain/dramas/${dramaId}/workflow/op-logs`);

export const appendProjectWorkflowOpLog = (
  projectId: string,
  payload: {
    action: string;
    estimated: string;
    actual: string;
    note?: string;
    time?: string;
  }
): Promise<WorkflowOpLogEntry> =>
  request(`/api/domain/projects/${projectId}/workflow/op-logs`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const appendDramaWorkflowOpLog = (
  dramaId: string,
  payload: {
    action: string;
    estimated: string;
    actual: string;
    note?: string;
    time?: string;
  }
): Promise<WorkflowOpLogEntry> =>
  request(`/api/domain/dramas/${dramaId}/workflow/op-logs`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const clearProjectWorkflowOpLogs = (projectId: string): Promise<{ cleared: number }> =>
  request(`/api/domain/projects/${projectId}/workflow/op-logs`, {
    method: 'DELETE'
  });

export const clearDramaWorkflowOpLogs = (dramaId: string): Promise<{ cleared: number }> =>
  request(`/api/domain/dramas/${dramaId}/workflow/op-logs`, {
    method: 'DELETE'
  });
