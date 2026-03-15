import { request } from '@/api/client';
import type { Novel, Outline, OutlineGenerationResult, ScriptDoc, ScriptGenerationResult } from '@/types/models';

export const getNovel = (projectId: string): Promise<Novel> => request(`/api/studio/projects/${projectId}/novel`);

export const getDramaNovel = (dramaId: string): Promise<Novel> => request(`/api/studio/dramas/${dramaId}/novel`);

export const saveNovel = (projectId: string, payload: { title: string; content: string }): Promise<Novel> =>
  request(`/api/studio/projects/${projectId}/novel`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const saveDramaNovel = (dramaId: string, payload: { title: string; content: string }): Promise<Novel> =>
  request(`/api/studio/dramas/${dramaId}/novel`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const generateNovel = (
  projectId: string,
  payload: { title?: string; idea: string; targetLength?: number; modelId?: string; customModel?: string }
): Promise<Novel> =>
  request(`/api/studio/projects/${projectId}/novel/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateDramaNovel = (
  dramaId: string,
  payload: { title?: string; idea: string; targetLength?: number; modelId?: string; customModel?: string }
): Promise<Novel> =>
  request(`/api/studio/dramas/${dramaId}/novel/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getOutlines = (projectId: string): Promise<Outline[]> => request(`/api/studio/projects/${projectId}/outlines`);

export const getDramaOutlines = (dramaId: string): Promise<Outline[]> => request(`/api/studio/dramas/${dramaId}/outlines`);

export const generateOutlines = (
  projectId: string,
  payload: { chapterCount?: number; modelId?: string; customModel?: string }
): Promise<OutlineGenerationResult> =>
  request(`/api/studio/projects/${projectId}/outlines/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateDramaOutlines = (
  dramaId: string,
  payload: { chapterCount?: number; modelId?: string; customModel?: string }
): Promise<OutlineGenerationResult> =>
  request(`/api/studio/dramas/${dramaId}/outlines/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateScript = (
  projectId: string,
  payload: { outlineId: string; modelId?: string; customModel?: string }
): Promise<ScriptGenerationResult> =>
  request(`/api/studio/projects/${projectId}/scripts/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateDramaScript = (
  dramaId: string,
  payload: { outlineId: string; modelId?: string; customModel?: string }
): Promise<ScriptGenerationResult> =>
  request(`/api/studio/dramas/${dramaId}/scripts/generate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getScripts = (projectId: string): Promise<ScriptDoc[]> =>
  request(`/api/studio/projects/${projectId}/scripts`);

export const getDramaScripts = (dramaId: string): Promise<ScriptDoc[]> =>
  request(`/api/studio/dramas/${dramaId}/scripts`);
