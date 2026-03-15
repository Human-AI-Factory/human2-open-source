import { request } from '@/api/client';
import { buildQuery } from '@/api/utils';
import type { EpisodeWorkflowStatus, PageResult, ProjectWorkflowSummary, WorkflowEpisodeListItem } from '@/types/models';

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
