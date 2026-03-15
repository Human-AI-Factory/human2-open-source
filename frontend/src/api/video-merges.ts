import { request } from '@/api/client';
import { API_BASE_URL } from '@/config/env';
import type { VideoMerge, VideoTransitionConfig } from '@/types/models';

type VideoMergePayload = {
  title?: string;
  clips: Array<{
    storyboardId: string;
    videoTaskId?: string;
    sourceUrl?: string;
    durationSec?: number;
    transition?: VideoTransitionConfig;
    keyframe?: {
      startScale?: number;
      endScale?: number;
      startX?: number;
      startY?: number;
      endX?: number;
      endY?: number;
      rotationDeg?: number;
    };
  }>;
  params?: {
    keepAudio?: boolean;
    fps?: number;
    crf?: number;
    preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';
  };
};

export const getVideoMerge = (projectId: string, mergeId: string): Promise<VideoMerge> =>
  request(`/api/pipeline/projects/${projectId}/video-merges/${mergeId}`);

export const getDramaVideoMerge = (dramaId: string, mergeId: string): Promise<VideoMerge> =>
  request(`/api/pipeline/dramas/${dramaId}/video-merges/${mergeId}`);

export const getVideoMergeFileUrl = (projectId: string, mergeId: string): string =>
  `${API_BASE_URL}/api/pipeline/projects/${projectId}/video-merges/${mergeId}/file`;

export const getDramaVideoMergeFileUrl = (dramaId: string, mergeId: string): string =>
  `${API_BASE_URL}/api/pipeline/dramas/${dramaId}/video-merges/${mergeId}/file`;

export const createVideoMerge = (projectId: string, payload: VideoMergePayload): Promise<VideoMerge> =>
  request(`/api/pipeline/projects/${projectId}/video-merges`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createDramaVideoMerge = (dramaId: string, payload: VideoMergePayload): Promise<VideoMerge> =>
  request(`/api/pipeline/dramas/${dramaId}/video-merges`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const retryVideoMerge = (projectId: string, mergeId: string): Promise<VideoMerge> =>
  request(`/api/pipeline/projects/${projectId}/video-merges/${mergeId}/retry`, {
    method: 'POST'
  });

export const retryDramaVideoMerge = (dramaId: string, mergeId: string): Promise<VideoMerge> =>
  request(`/api/pipeline/dramas/${dramaId}/video-merges/${mergeId}/retry`, {
    method: 'POST'
  });
