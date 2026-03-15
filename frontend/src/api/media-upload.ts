import { requestForm } from '@/api/client';
import type { Asset, Storyboard } from '@/types/models';

type UploadImagePayload = {
  file: File;
  purpose: 'storyboard' | 'asset';
  storyboardId: string;
  assetId?: string;
  assetType?: 'character' | 'scene' | 'prop';
  assetName?: string;
  prompt?: string;
};

const toImageForm = (payload: UploadImagePayload): FormData => {
  const form = new FormData();
  form.append('file', payload.file);
  form.append('purpose', payload.purpose);
  form.append('storyboardId', payload.storyboardId);
  if (payload.assetId) form.append('assetId', payload.assetId);
  if (payload.assetType) form.append('assetType', payload.assetType);
  if (payload.assetName) form.append('assetName', payload.assetName);
  if (payload.prompt) form.append('prompt', payload.prompt);
  return form;
};

export const uploadProjectImage = (
  projectId: string,
  payload: UploadImagePayload
): Promise<{ fileUrl: string; storyboard?: Storyboard; asset?: Asset }> =>
  requestForm(`/api/pipeline/projects/${projectId}/uploads/image`, toImageForm(payload), { method: 'POST' });

export const uploadDramaImage = (
  dramaId: string,
  payload: UploadImagePayload
): Promise<{ fileUrl: string; storyboard?: Storyboard; asset?: Asset }> =>
  requestForm(`/api/pipeline/dramas/${dramaId}/uploads/image`, toImageForm(payload), { method: 'POST' });

const uploadProjectObjectImage = (
  projectId: string,
  objectType: 'character' | 'scene' | 'prop',
  objectId: string,
  file: File
): Promise<{ fileUrl: string; asset: Asset }> => {
  const form = new FormData();
  form.append('file', file);
  return requestForm(`/api/pipeline/projects/${projectId}/uploads/${objectType}s/${objectId}/image`, form, { method: 'POST' });
};

const uploadDramaObjectImage = (
  dramaId: string,
  objectType: 'character' | 'scene' | 'prop',
  objectId: string,
  file: File
): Promise<{ fileUrl: string; asset: Asset }> => {
  const form = new FormData();
  form.append('file', file);
  return requestForm(`/api/pipeline/dramas/${dramaId}/uploads/${objectType}s/${objectId}/image`, form, { method: 'POST' });
};

export const uploadProjectCharacterImage = (projectId: string, characterId: string, file: File): Promise<{ fileUrl: string; asset: Asset }> =>
  uploadProjectObjectImage(projectId, 'character', characterId, file);

export const uploadProjectSceneImage = (projectId: string, sceneId: string, file: File): Promise<{ fileUrl: string; asset: Asset }> =>
  uploadProjectObjectImage(projectId, 'scene', sceneId, file);

export const uploadProjectPropImage = (projectId: string, propId: string, file: File): Promise<{ fileUrl: string; asset: Asset }> =>
  uploadProjectObjectImage(projectId, 'prop', propId, file);

export const uploadDramaCharacterImage = (dramaId: string, characterId: string, file: File): Promise<{ fileUrl: string; asset: Asset }> =>
  uploadDramaObjectImage(dramaId, 'character', characterId, file);

export const uploadDramaSceneImage = (dramaId: string, sceneId: string, file: File): Promise<{ fileUrl: string; asset: Asset }> =>
  uploadDramaObjectImage(dramaId, 'scene', sceneId, file);

export const uploadDramaPropImage = (dramaId: string, propId: string, file: File): Promise<{ fileUrl: string; asset: Asset }> =>
  uploadDramaObjectImage(dramaId, 'prop', propId, file);
