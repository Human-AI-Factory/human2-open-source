import { request } from '@/api/client';
import type { Asset } from '@/types/models';

export const getAssets = (projectId: string): Promise<Asset[]> => request(`/api/pipeline/projects/${projectId}/assets`);

export const getDramaAssets = (dramaId: string): Promise<Asset[]> => request(`/api/pipeline/dramas/${dramaId}/assets`);

export const getEpisodeAssets = (projectId: string, episodeId: string): Promise<Asset[]> =>
  request(`/api/pipeline/projects/${projectId}/episodes/${episodeId}/assets`);

export const getEpisodeDomainEntities = (
  projectId: string,
  episodeId: string
): Promise<{
  characters: Array<{ id: string; name: string; prompt: string; imageUrl?: string | null }>;
  scenes: Array<{ id: string; name: string; prompt: string; imageUrl?: string | null }>;
  props: Array<{ id: string; name: string; prompt: string; imageUrl?: string | null }>;
}> => request(`/api/pipeline/projects/${projectId}/episodes/${episodeId}/domain-entities`);

export const generateAssets = (
  projectId: string,
  payload: {
    storyboardId: string;
    modelId?: string;
    customModel?: string;
    resolution?: string;
    aspectRatio?: string;
    providerOptions?: Record<string, unknown>;
  }
): Promise<Asset[]> =>
  request(`/api/pipeline/projects/${projectId}/assets/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateDramaAssets = (
  dramaId: string,
  payload: {
    storyboardId: string;
    modelId?: string;
    customModel?: string;
    resolution?: string;
    aspectRatio?: string;
    providerOptions?: Record<string, unknown>;
  }
): Promise<Asset[]> =>
  request(`/api/pipeline/dramas/${dramaId}/assets/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createAsset = (
  projectId: string,
  payload: {
    storyboardId: string;
    name: string;
    type: 'character' | 'scene' | 'prop';
    prompt: string;
    imageUrl?: string | null;
    voiceProfile?: Asset['voiceProfile'];
  }
): Promise<Asset> =>
  request(`/api/pipeline/projects/${projectId}/assets`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createDramaAsset = (
  dramaId: string,
  payload: {
    storyboardId: string;
    name: string;
    type: 'character' | 'scene' | 'prop';
    prompt: string;
    imageUrl?: string | null;
    voiceProfile?: Asset['voiceProfile'];
  }
): Promise<Asset> =>
  request(`/api/pipeline/dramas/${dramaId}/assets`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateAsset = (
  projectId: string,
  assetId: string,
  payload: {
    name?: string;
    type?: 'character' | 'scene' | 'prop';
    prompt?: string;
    imageUrl?: string | null;
    voiceProfile?: Asset['voiceProfile'];
  }
): Promise<Asset> =>
  request(`/api/pipeline/projects/${projectId}/assets/${assetId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const updateDramaAsset = (
  dramaId: string,
  assetId: string,
  payload: {
    name?: string;
    type?: 'character' | 'scene' | 'prop';
    prompt?: string;
    imageUrl?: string | null;
    voiceProfile?: Asset['voiceProfile'];
  }
): Promise<Asset> =>
  request(`/api/pipeline/dramas/${dramaId}/assets/${assetId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const deleteAsset = (projectId: string, assetId: string): Promise<void> =>
  request(`/api/pipeline/projects/${projectId}/assets/${assetId}`, {
    method: 'DELETE'
  });

export const deleteDramaAsset = (dramaId: string, assetId: string): Promise<void> =>
  request(`/api/pipeline/dramas/${dramaId}/assets/${assetId}`, {
    method: 'DELETE'
  });

export const polishAssetPrompt = (
  projectId: string,
  assetId: string,
  payload: { instruction?: string; modelId?: string; customModel?: string } = {}
): Promise<Asset> =>
  request(`/api/pipeline/projects/${projectId}/assets/${assetId}/polish-prompt`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const polishDramaAssetPrompt = (
  dramaId: string,
  assetId: string,
  payload: { instruction?: string; modelId?: string; customModel?: string } = {}
): Promise<Asset> =>
  request(`/api/pipeline/dramas/${dramaId}/assets/${assetId}/polish-prompt`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const redrawAssetImage = (
  projectId: string,
  assetId: string,
  payload: {
    instruction?: string;
    modelId?: string;
    customModel?: string;
    resolution?: string;
    aspectRatio?: string;
    providerOptions?: Record<string, unknown>;
  } = {}
): Promise<Asset> =>
  request(`/api/pipeline/projects/${projectId}/assets/${assetId}/redraw-image`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const redrawDramaAssetImage = (
  dramaId: string,
  assetId: string,
  payload: {
    instruction?: string;
    modelId?: string;
    customModel?: string;
    resolution?: string;
    aspectRatio?: string;
    providerOptions?: Record<string, unknown>;
  } = {}
): Promise<Asset> =>
  request(`/api/pipeline/dramas/${dramaId}/assets/${assetId}/redraw-image`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateEpisodeAssetsBatch = (
  projectId: string,
  episodeId: string,
  payload: {
    modelId?: string;
    customModel?: string;
    resolution?: string;
    aspectRatio?: string;
    providerOptions?: Record<string, unknown>;
  } = {}
): Promise<{ assets: Asset[]; createdStoryboardIds: string[]; skippedStoryboardIds: string[] }> =>
  request(`/api/pipeline/projects/${projectId}/episodes/${episodeId}/assets/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
