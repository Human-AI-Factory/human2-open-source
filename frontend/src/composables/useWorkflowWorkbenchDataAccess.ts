import type { Ref } from 'vue';
import type { Router } from 'vue-router';
import {
  appendDramaWorkflowOpLog,
  appendProjectWorkflowOpLog,
  getDramaWorkflowTransitionUndoStack,
  getProjectWorkflowOpLogs,
  getWorkflowTransitionUndoStack,
  getDramaWorkflowOpLogs
} from '@/api/workflow-ops';
import {
  getDramaWorkflowEpisodes,
  getProjectWorkflowEpisodes
} from '@/api/project-workflow';
import type { WorkflowEpisodeListItem, WorkflowOpLogEntry, WorkflowTransitionUndoEntry } from '@/types/models';
import { buildDramaScopedPath, buildDramaScopedQuery } from '@/utils/route-context';

type UseWorkflowWorkbenchDataAccessOptions = {
  router: Router;
  hasDramaScopedApi: Ref<boolean>;
  dramaId: Ref<string>;
  projectId: Ref<string>;
  workflowStatusFilter: Ref<'' | 'draft' | 'in_review' | 'approved' | 'rejected'>;
  workflowQuery: Ref<string>;
  workflowPage: Ref<number>;
  workflowPageSize: number;
  workflowItems: Ref<WorkflowEpisodeListItem[]>;
  workflowTotal: Ref<number>;
  selectedEpisodeIds: Ref<string[]>;
  workflowOpLogs: Ref<WorkflowOpLogEntry[]>;
  undoStack: Ref<WorkflowTransitionUndoEntry[]>;
};

export const useWorkflowWorkbenchDataAccess = (options: UseWorkflowWorkbenchDataAccessOptions) => {
  const buildPath = (projectPath: string, dramaPath: string): string =>
    buildDramaScopedPath({ dramaId: options.dramaId.value, projectPath, dramaPath });

  const buildQuery = (extra?: Record<string, string | undefined>): Record<string, string> =>
    buildDramaScopedQuery(options.dramaId.value, extra);

  const goProject = (): void => {
    void options.router.push({
      path: buildPath(`/projects/${options.projectId.value}`, `/dramas/${options.dramaId.value}`),
      query: buildQuery()
    });
  };

  const goFramePromptWorkbench = (): void => {
    void options.router.push({
      path: buildPath(`/projects/${options.projectId.value}/frame-prompts`, `/dramas/${options.dramaId.value}/frame-prompts`),
      query: buildQuery()
    });
  };

  const loadWorkflowBoard = async (): Promise<void> => {
    const query = {
      status: options.workflowStatusFilter.value || undefined,
      q: options.workflowQuery.value.trim() || undefined,
      page: options.workflowPage.value,
      pageSize: options.workflowPageSize
    };
    const page = options.hasDramaScopedApi.value
      ? await getDramaWorkflowEpisodes(options.dramaId.value, query)
      : await getProjectWorkflowEpisodes(options.projectId.value, query);
    options.workflowItems.value = page.items;
    options.workflowTotal.value = page.total;
    const visibleIds = new Set(page.items.map((item: WorkflowEpisodeListItem) => item.episode.id));
    options.selectedEpisodeIds.value = options.selectedEpisodeIds.value.filter((id) => visibleIds.has(id));
  };

  const loadUndoStack = async (): Promise<void> => {
    options.undoStack.value = options.hasDramaScopedApi.value
      ? await getDramaWorkflowTransitionUndoStack(options.dramaId.value)
      : await getWorkflowTransitionUndoStack(options.projectId.value);
  };

  const pushWorkflowOpLog = async (input: { action: string; estimated: string; actual: string; note?: string }): Promise<void> => {
    const payload = {
      action: input.action,
      estimated: input.estimated,
      actual: input.actual,
      note: input.note,
      time: new Date().toISOString()
    };
    const created = options.hasDramaScopedApi.value
      ? await appendDramaWorkflowOpLog(options.dramaId.value, payload)
      : await appendProjectWorkflowOpLog(options.projectId.value, payload);
    options.workflowOpLogs.value = [created, ...options.workflowOpLogs.value].slice(0, 200);
  };

  const loadWorkflowOpLogs = async (): Promise<void> => {
    options.workflowOpLogs.value = options.hasDramaScopedApi.value
      ? await getDramaWorkflowOpLogs(options.dramaId.value)
      : await getProjectWorkflowOpLogs(options.projectId.value);
  };

  return {
    buildPath,
    buildQuery,
    goFramePromptWorkbench,
    goProject,
    loadUndoStack,
    loadWorkflowBoard,
    loadWorkflowOpLogs,
    pushWorkflowOpLog
  };
};
