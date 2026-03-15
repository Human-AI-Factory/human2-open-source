import { request } from '@/api/client';
import type {
  AudioExtract,
  AudioTask,
  FullChainRunResult,
  ProjectFullChainResult,
  VideoTask,
  VideoTaskBatchResult
} from '@/types/models';

export const createVideoTask = (
  projectId: string,
  payload: {
    storyboardId: string;
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
  }
): Promise<VideoTask> =>
  request(`/api/pipeline/projects/${projectId}/video-tasks`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createDramaVideoTask = (
  dramaId: string,
  payload: {
    storyboardId: string;
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
  }
): Promise<VideoTask> =>
  request(`/api/pipeline/dramas/${dramaId}/video-tasks`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const retryVideoTask = (projectId: string, taskId: string): Promise<VideoTask> =>
  request(`/api/pipeline/projects/${projectId}/video-tasks/${taskId}/retry`, {
    method: 'POST'
  });

export const retryDramaVideoTask = (dramaId: string, taskId: string): Promise<VideoTask> =>
  request(`/api/pipeline/dramas/${dramaId}/video-tasks/${taskId}/retry`, {
    method: 'POST'
  });

export const cancelVideoTask = (projectId: string, taskId: string): Promise<VideoTask> =>
  request(`/api/pipeline/projects/${projectId}/video-tasks/${taskId}/cancel`, {
    method: 'POST'
  });

export const cancelDramaVideoTask = (dramaId: string, taskId: string): Promise<VideoTask> =>
  request(`/api/pipeline/dramas/${dramaId}/video-tasks/${taskId}/cancel`, {
    method: 'POST'
  });

export const createVideoTasksBatch = (
  projectId: string,
  payload: {
    storyboardIds?: string[];
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
): Promise<VideoTaskBatchResult> =>
  request(`/api/pipeline/projects/${projectId}/video-tasks/batch`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createDramaVideoTasksBatch = (
  dramaId: string,
  payload: {
    storyboardIds?: string[];
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
): Promise<VideoTaskBatchResult> =>
  request(`/api/pipeline/dramas/${dramaId}/video-tasks/batch`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createEpisodeVideoTasksBatch = (
  projectId: string,
  episodeId: string,
  payload: {
    priority?: 'low' | 'medium' | 'high';
    modelId?: string;
    customModel?: string;
    mode?: 'text' | 'singleImage' | 'startEnd' | 'multiImage' | 'reference';
    duration?: number;
    resolution?: string;
    aspectRatio?: string;
    audio?: boolean;
    imageInputs?: string[];
    endFrame?: string;
    providerOptions?: Record<string, unknown>;
  } = {}
): Promise<VideoTaskBatchResult> =>
  request(`/api/pipeline/projects/${projectId}/episodes/${episodeId}/video-tasks/batch`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const runFullChainFromScript = (projectId: string, payload: { scriptId: string }): Promise<FullChainRunResult> =>
  request(`/api/pipeline/projects/${projectId}/full-chain/run`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const runDramaFullChainFromScript = (dramaId: string, payload: { scriptId: string }): Promise<FullChainRunResult> =>
  request(`/api/pipeline/dramas/${dramaId}/full-chain/run`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const runProjectFullChain = (
  projectId: string,
  payload: { chapterCount?: number } = {}
): Promise<ProjectFullChainResult> =>
  request(`/api/orchestration/projects/${projectId}/full-chain/run`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getAudioTasks = (projectId: string): Promise<AudioTask[]> => request(`/api/pipeline/projects/${projectId}/audio-tasks`);

export const getDramaAudioTasks = (dramaId: string): Promise<AudioTask[]> => request(`/api/pipeline/dramas/${dramaId}/audio-tasks`);

export const retryAudioTask = (projectId: string, taskId: string): Promise<AudioTask> =>
  request(`/api/pipeline/projects/${projectId}/audio-tasks/${taskId}/retry`, {
    method: 'POST'
  });

export const retryDramaAudioTask = (dramaId: string, taskId: string): Promise<AudioTask> =>
  request(`/api/pipeline/dramas/${dramaId}/audio-tasks/${taskId}/retry`, {
    method: 'POST'
  });

export const getAudioExtracts = (projectId: string): Promise<AudioExtract[]> =>
  request(`/api/pipeline/projects/${projectId}/audio-extracts`);

export const createAudioExtract = (
  projectId: string,
  payload: {
    videoTaskId?: string;
    sourceUrl?: string;
    format?: 'mp3' | 'wav' | 'aac' | 'flac' | 'ogg';
    sampleRate?: number;
    channels?: number;
    bitrateKbps?: number;
  }
): Promise<AudioExtract> =>
  request(`/api/pipeline/projects/${projectId}/audio-extracts`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createDramaAudioExtract = (
  dramaId: string,
  payload: {
    videoTaskId?: string;
    sourceUrl?: string;
    format?: 'mp3' | 'wav' | 'aac' | 'flac' | 'ogg';
    sampleRate?: number;
    channels?: number;
    bitrateKbps?: number;
  }
): Promise<AudioExtract> =>
  request(`/api/pipeline/dramas/${dramaId}/audio-extracts`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
