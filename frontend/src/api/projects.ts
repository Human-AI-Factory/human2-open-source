import { request } from '@/api/client';
import { buildQuery } from '@/api/utils';
import type { PageResult, Project, ProjectWorkflowSummary, Summary, Task, TaskPriority, TaskStatus } from '@/types/models';

export const getProjects = (input: {
  q?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'name';
  order?: 'asc' | 'desc';
}): Promise<PageResult<Project>> =>
  request(`/api/projects?${buildQuery(input)}`);

export const getProjectWorkflow = (id: string): Promise<ProjectWorkflowSummary> => request(`/api/projects/${id}/workflow`);

export const getProjectWorkflows = (projectIds: string[]): Promise<ProjectWorkflowSummary[]> =>
  request(`/api/projects/workflow/list?${buildQuery({ projectIds: projectIds.join(',') })}`);

export const createProject = (payload: { name: string; description?: string }): Promise<Project> =>
  request('/api/projects', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateProject = (id: string, payload: { name?: string; description?: string }): Promise<Project> =>
  request(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const deleteProject = (id: string): Promise<void> =>
  request(`/api/projects/${id}`, {
    method: 'DELETE'
  });

export const getProjectTasks = (
  projectId: string,
  input: {
    q?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    page?: number;
    pageSize?: number;
    sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'status' | 'priority' | 'dueAt';
    order?: 'asc' | 'desc';
  }
): Promise<PageResult<Task>> => request(`/api/projects/${projectId}/tasks?${buildQuery(input)}`);

export const createTask = (
  projectId: string,
  payload: { title: string; priority?: TaskPriority; dueAt?: string | null }
): Promise<Task> =>
  request(`/api/projects/${projectId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const updateTask = (
  projectId: string,
  taskId: string,
  payload: { title?: string; status?: TaskStatus; priority?: TaskPriority; dueAt?: string | null }
): Promise<Task> =>
  request(`/api/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });

export const deleteTask = (projectId: string, taskId: string): Promise<void> =>
  request(`/api/projects/${projectId}/tasks/${taskId}`, {
    method: 'DELETE'
  });

export const getSummary = (): Promise<Summary> => request('/api/dashboard/summary');
