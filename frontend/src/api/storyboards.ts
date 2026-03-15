import { request } from '@/api/client';
import type { Scene, Storyboard, StoryboardAssetRelation } from '@/types/models';

export const getScenes = (projectId: string): Promise<Scene[]> => request(`/api/pipeline/projects/${projectId}/scenes`);

export const createScene = (
  projectId: string,
  payload: { name: string; description?: string; prompt?: string }
): Promise<Scene> =>
  request(`/api/pipeline/projects/${projectId}/scenes`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateScene = (
  projectId: string,
  sceneId: string,
  payload: { name?: string; description?: string; prompt?: string }
): Promise<Scene> =>
  request(`/api/pipeline/projects/${projectId}/scenes/${sceneId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const deleteScene = (projectId: string, sceneId: string): Promise<void> =>
  request(`/api/pipeline/projects/${projectId}/scenes/${sceneId}`, {
    method: 'DELETE'
  });

export const rewriteStoryboardPrompt = (
  projectId: string,
  storyboardId: string,
  payload: { instruction: string; modelId?: string; customModel?: string }
): Promise<Storyboard> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/${storyboardId}/rewrite`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const rewriteDramaStoryboardPrompt = (
  dramaId: string,
  storyboardId: string,
  payload: { instruction: string; modelId?: string; customModel?: string }
): Promise<Storyboard> =>
  request(`/api/pipeline/dramas/${dramaId}/storyboards/${storyboardId}/rewrite`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateStoryboardVideoPrompt = (
  projectId: string,
  storyboardId: string,
  payload: { style?: string; modelId?: string; customModel?: string } = {}
): Promise<{ prompt: string }> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/${storyboardId}/video-prompt`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateDramaStoryboardVideoPrompt = (
  dramaId: string,
  storyboardId: string,
  payload: { style?: string; modelId?: string; customModel?: string } = {}
): Promise<{ prompt: string }> =>
  request(`/api/pipeline/dramas/${dramaId}/storyboards/${storyboardId}/video-prompt`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateStoryboard = (
  projectId: string,
  storyboardId: string,
  payload: { title?: string; prompt?: string; imageUrl?: string | null; sceneId?: string | null }
): Promise<Storyboard> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/${storyboardId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const updateDramaStoryboard = (
  dramaId: string,
  storyboardId: string,
  payload: { title?: string; prompt?: string; imageUrl?: string | null; sceneId?: string | null }
): Promise<Storyboard> =>
  request(`/api/pipeline/dramas/${dramaId}/storyboards/${storyboardId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const getStoryboardAssetRelations = (projectId: string, storyboardId: string): Promise<StoryboardAssetRelation[]> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/${storyboardId}/relations`);

export const replaceStoryboardAssetRelations = (
  projectId: string,
  storyboardId: string,
  payload: {
    sceneAssetId?: string | null;
    characterAssetIds?: string[];
    propAssetIds?: string[];
  }
): Promise<StoryboardAssetRelation[]> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/${storyboardId}/relations`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const replaceDramaStoryboardAssetRelations = (
  dramaId: string,
  storyboardId: string,
  payload: {
    sceneAssetId?: string | null;
    characterAssetIds?: string[];
    propAssetIds?: string[];
  }
): Promise<StoryboardAssetRelation[]> =>
  request(`/api/pipeline/dramas/${dramaId}/storyboards/${storyboardId}/relations`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const generateStoryboardShotImage = (
  projectId: string,
  storyboardId: string,
  payload: {
    modelId?: string;
    customModel?: string;
    resolution?: string;
    aspectRatio?: string;
    instruction?: string;
    providerOptions?: Record<string, unknown>;
  } = {}
): Promise<Storyboard> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/${storyboardId}/shot-image`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateDramaStoryboardShotImage = (
  dramaId: string,
  storyboardId: string,
  payload: {
    modelId?: string;
    customModel?: string;
    resolution?: string;
    aspectRatio?: string;
    instruction?: string;
    providerOptions?: Record<string, unknown>;
  } = {}
): Promise<Storyboard> =>
  request(`/api/pipeline/dramas/${dramaId}/storyboards/${storyboardId}/shot-image`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const batchSuperResStoryboards = (
  projectId: string,
  payload: {
    storyboardIds?: string[];
    scale?: number;
    modelId?: string;
    customModel?: string;
    resolution?: string;
    aspectRatio?: string;
  } = {}
): Promise<{ updated: Storyboard[]; skippedIds: string[]; notFoundIds: string[] }> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/batch-super-res`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const batchDramaSuperResStoryboards = (
  dramaId: string,
  payload: {
    storyboardIds?: string[];
    scale?: number;
    modelId?: string;
    customModel?: string;
    resolution?: string;
    aspectRatio?: string;
  } = {}
): Promise<{ updated: Storyboard[]; skippedIds: string[]; notFoundIds: string[] }> =>
  request(`/api/pipeline/dramas/${dramaId}/storyboards/batch-super-res`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const uploadStoryboardImage = (
  projectId: string,
  storyboardId: string,
  payload: { imageUrl: string }
): Promise<Storyboard> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/${storyboardId}/upload-image`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const uploadDramaStoryboardImage = (
  dramaId: string,
  storyboardId: string,
  payload: { imageUrl: string }
): Promise<Storyboard> =>
  request(`/api/pipeline/dramas/${dramaId}/storyboards/${storyboardId}/upload-image`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
