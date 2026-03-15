import { request } from '@/api/client';
import { buildQuery } from '@/api/utils';
import type {
  DramaDomain,
  EpisodeAssetRelation,
  EpisodeDomain,
  EpisodeImportFromScriptsResult,
  EpisodeDomainEntityRelation,
  EpisodeWorkflowAudit,
  EpisodeWorkflowState,
  EpisodeWorkflowStatus,
  PageResult,
  ProjectWorkflowSummary,
  Storyboard,
  StoryboardDomainEntityRelation,
  WorkflowEpisodeListItem
} from '@/types/models';

export const getDramaDomain = (projectId: string): Promise<DramaDomain> => request(`/api/domain/projects/${projectId}/drama`);

export const getDramas = (): Promise<DramaDomain[]> => request('/api/domain/dramas');

export const getDramaById = (dramaId: string): Promise<DramaDomain> => request(`/api/domain/dramas/${dramaId}`);

export const updateDramaStyle = (dramaId: string, style: string): Promise<DramaDomain> =>
  request(`/api/domain/dramas/${dramaId}/style`, {
    method: 'PATCH',
    body: JSON.stringify({ style })
  });

export const upsertDramaDomain = (projectId: string, payload: { name: string; description?: string }): Promise<DramaDomain> =>
  request(`/api/domain/projects/${projectId}/drama`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const ensureDramaDomainByProject = async (
  projectId: string,
  payload: { name?: string; description?: string } = {}
): Promise<DramaDomain | null> => {
  const existed = await getDramaDomain(projectId).catch(() => null);
  if (existed?.id) {
    return existed;
  }
  const name = payload.name?.trim() || 'Untitled Drama';
  return upsertDramaDomain(projectId, {
    name,
    description: payload.description
  }).catch(() => null);
};

export const getEpisodeDomains = (projectId: string): Promise<EpisodeDomain[]> => request(`/api/domain/projects/${projectId}/episodes`);

export const getEpisodeDomainsByDrama = (dramaId: string): Promise<EpisodeDomain[]> => request(`/api/domain/dramas/${dramaId}/episodes`);

export const createEpisodeDomain = (
  projectId: string,
  payload: { dramaId: string; title: string; orderIndex?: number }
): Promise<EpisodeDomain> =>
  request(`/api/domain/projects/${projectId}/episodes`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createEpisodeDomainByDrama = (
  dramaId: string,
  payload: { title: string; orderIndex?: number }
): Promise<EpisodeDomain> =>
  request(`/api/domain/dramas/${dramaId}/episodes`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const importEpisodesFromScriptsByDrama = (dramaId: string): Promise<EpisodeImportFromScriptsResult> =>
  request(`/api/domain/dramas/${dramaId}/episodes/import-from-scripts`, {
    method: 'POST',
    body: JSON.stringify({})
  });

export const updateEpisodeDomain = (
  projectId: string,
  episodeId: string,
  payload: { title?: string; orderIndex?: number; status?: 'draft' | 'ready' | 'published' }
): Promise<EpisodeDomain> =>
  request(`/api/domain/projects/${projectId}/episodes/${episodeId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const updateEpisodeDomainByDrama = (
  dramaId: string,
  episodeId: string,
  payload: { title?: string; orderIndex?: number; status?: 'draft' | 'ready' | 'published' }
): Promise<EpisodeDomain> =>
  request(`/api/domain/dramas/${dramaId}/episodes/${episodeId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const deleteEpisodeDomain = (projectId: string, episodeId: string): Promise<void> =>
  request(`/api/domain/projects/${projectId}/episodes/${episodeId}`, {
    method: 'DELETE'
  });

export const assignStoryboardEpisode = (
  projectId: string,
  storyboardId: string,
  payload: { episodeId: string | null }
): Promise<Storyboard> =>
  request(`/api/domain/projects/${projectId}/storyboards/${storyboardId}/episode`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const getEpisodeStoryboards = (projectId: string, episodeId: string): Promise<Storyboard[]> =>
  request(`/api/domain/projects/${projectId}/episodes/${episodeId}/storyboards`);

export const getEpisodeAssetRelations = (projectId: string, episodeId: string): Promise<EpisodeAssetRelation[]> =>
  request(`/api/domain/projects/${projectId}/episodes/${episodeId}/asset-relations`);

export const replaceEpisodeAssetRelations = (
  projectId: string,
  episodeId: string,
  payload: {
    sceneAssetIds?: string[];
    characterAssetIds?: string[];
    propAssetIds?: string[];
  }
): Promise<EpisodeAssetRelation[]> =>
  request(`/api/domain/projects/${projectId}/episodes/${episodeId}/asset-relations`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const getEpisodeDomainEntityRelations = (projectId: string, episodeId: string): Promise<EpisodeDomainEntityRelation[]> =>
  request(`/api/domain/projects/${projectId}/episodes/${episodeId}/domain-entity-relations`);

export const replaceEpisodeDomainEntityRelations = (
  projectId: string,
  episodeId: string,
  payload: {
    sceneEntityIds?: string[];
    characterEntityIds?: string[];
    propEntityIds?: string[];
  }
): Promise<EpisodeDomainEntityRelation[]> =>
  request(`/api/domain/projects/${projectId}/episodes/${episodeId}/domain-entity-relations`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const getStoryboardDomainEntityRelations = (
  projectId: string,
  storyboardId: string
): Promise<StoryboardDomainEntityRelation[]> =>
  request(`/api/domain/projects/${projectId}/storyboards/${storyboardId}/domain-entity-relations`);

export const replaceStoryboardDomainEntityRelations = (
  projectId: string,
  storyboardId: string,
  payload: {
    sceneEntityId?: string | null;
    characterEntityIds?: string[];
    propEntityIds?: string[];
  }
): Promise<StoryboardDomainEntityRelation[]> =>
  request(`/api/domain/projects/${projectId}/storyboards/${storyboardId}/domain-entity-relations`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

export const getEpisodeWorkflowState = (projectId: string, episodeId: string): Promise<EpisodeWorkflowState> =>
  request(`/api/domain/projects/${projectId}/episodes/${episodeId}/workflow`);

export const transitionEpisodeWorkflow = (
  projectId: string,
  episodeId: string,
  payload: { toStatus: EpisodeWorkflowStatus; actor?: string; comment?: string }
): Promise<EpisodeWorkflowState> =>
  request(`/api/domain/projects/${projectId}/episodes/${episodeId}/workflow/transition`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getEpisodeWorkflowAudits = (
  projectId: string,
  episodeId: string,
  input: { limit?: number } = {}
): Promise<EpisodeWorkflowAudit[]> =>
  request(`/api/domain/projects/${projectId}/episodes/${episodeId}/workflow/audits?${buildQuery(input)}`);

export const getProjectWorkflowEpisodes = (
  projectId: string,
  input: {
    status?: EpisodeWorkflowStatus;
    q?: string;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<PageResult<WorkflowEpisodeListItem>> =>
  request(`/api/domain/projects/${projectId}/workflow/episodes?${buildQuery(input)}`);

export const getDramaWorkflowEpisodes = (
  dramaId: string,
  input: {
    status?: EpisodeWorkflowStatus;
    q?: string;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<PageResult<WorkflowEpisodeListItem>> =>
  request(`/api/domain/dramas/${dramaId}/workflow/episodes?${buildQuery(input)}`);

export const getDramaWorkflowSummary = (dramaId: string): Promise<ProjectWorkflowSummary> =>
  request(`/api/domain/dramas/${dramaId}/workflow/summary`);

export const getProjectWorkflowAudits = (
  projectId: string,
  input: {
    episodeId?: string;
    actor?: string;
    toStatus?: EpisodeWorkflowStatus;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<PageResult<EpisodeWorkflowAudit>> =>
  request(`/api/domain/projects/${projectId}/workflow/audits?${buildQuery(input)}`);

export const getDramaWorkflowAudits = (
  dramaId: string,
  input: {
    episodeId?: string;
    actor?: string;
    toStatus?: EpisodeWorkflowStatus;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<PageResult<EpisodeWorkflowAudit>> =>
  request(`/api/domain/dramas/${dramaId}/workflow/audits?${buildQuery(input)}`);
