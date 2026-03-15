import { request } from '@/api/client';

type PrecheckResult = Promise<{
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

export const precheckEpisodesAssetsBatch = (
  projectId: string,
  payload: { episodeIds?: string[] } = {}
): PrecheckResult =>
  request(`/api/pipeline/projects/${projectId}/episodes/batch/assets/precheck`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const precheckDramaEpisodesAssetsBatch = (
  dramaId: string,
  payload: { episodeIds?: string[] } = {}
): PrecheckResult =>
  request(`/api/pipeline/dramas/${dramaId}/episodes/batch/assets/precheck`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const precheckEpisodesVideoTasksBatch = (
  projectId: string,
  payload: { episodeIds?: string[] } = {}
): PrecheckResult =>
  request(`/api/pipeline/projects/${projectId}/episodes/batch/video-tasks/precheck`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const precheckDramaEpisodesVideoTasksBatch = (
  dramaId: string,
  payload: { episodeIds?: string[] } = {}
): PrecheckResult =>
  request(`/api/pipeline/dramas/${dramaId}/episodes/batch/video-tasks/precheck`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
