import { v4 as uuid } from 'uuid';
import { SqliteStore } from '../../db/sqlite.js';
import { PageResult, Project, ProjectWorkflowSummary, Task, TaskPriority, TaskStatus } from '../../core/types.js';
import { nowIso } from '../../utils/time.js';

export class ProjectsService {
  constructor(private readonly store: SqliteStore) {}

  listProjects(input: {
    q?: string;
    page: number;
    pageSize: number;
    sortBy?: 'createdAt' | 'updatedAt' | 'name';
    order?: 'asc' | 'desc';
  }): PageResult<Project> {
    return this.store.listProjectsPaged(input);
  }

  getProject(projectId: string): Project | null {
    return this.store.getProjectById(projectId);
  }

  listTasks(
    projectId: string,
    input: {
      q?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      page: number;
      pageSize: number;
      sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'status' | 'priority' | 'dueAt';
      order?: 'asc' | 'desc';
    }
  ): PageResult<Task> | null {
    return this.store.listProjectTasks(projectId, input);
  }

  createProject(input: { name: string; description?: string }): Project {
    const timestamp = nowIso();
    const project: Project = {
      id: uuid(),
      name: input.name,
      description: input.description ?? '',
      createdAt: timestamp,
      updatedAt: timestamp,
      tasks: []
    };

    this.store.createProject({
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    });

    return project;
  }

  updateProject(projectId: string, input: { name?: string; description?: string }): Project | null {
    const ok = this.store.updateProject(projectId, input);
    if (!ok) {
      return null;
    }

    return this.store.getProjectById(projectId);
  }

  deleteProject(projectId: string): boolean {
    return this.store.deleteProject(projectId);
  }

  createTask(projectId: string, input: { title: string; priority?: TaskPriority; dueAt?: string | null }): Task | null {
    const timestamp = nowIso();
    const task: Task = {
      id: uuid(),
      title: input.title,
      status: 'todo',
      priority: input.priority ?? 'medium',
      dueAt: input.dueAt ?? null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const ok = this.store.createTask({
      id: task.id,
      projectId,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    });

    if (!ok) {
      return null;
    }

    return task;
  }

  updateTask(
    projectId: string,
    taskId: string,
    input: { title?: string; status?: TaskStatus; priority?: TaskPriority; dueAt?: string | null }
  ): Task | null {
    const ok = this.store.updateTask(projectId, taskId, input);
    if (!ok) {
      return null;
    }

    const project = this.store.getProjectById(projectId);
    return project?.tasks.find((task) => task.id === taskId) ?? null;
  }

  deleteTask(projectId: string, taskId: string): boolean {
    return this.store.deleteTask(projectId, taskId);
  }

  getSummary(): { projectCount: number; taskCount: number; doneCount: number; doingCount: number } {
    return this.store.getSummary();
  }

  getProjectWorkflow(projectId: string): ProjectWorkflowSummary | null {
    const project = this.store.getProjectById(projectId);
    if (!project) {
      return null;
    }
    const novel = this.store.getNovel(projectId);
    const outlines = this.store.listOutlines(projectId) ?? [];
    const scripts = this.store.listScripts(projectId) ?? [];
    const storyboards = this.store.listStoryboards(projectId) ?? [];
    const assets = this.store.listAssets(projectId) ?? [];
    const videoTasks = this.store.listVideoTasks(projectId) ?? [];
    const audioTasks = this.store.listAudioTasks(projectId) ?? [];
    const videoMerges = this.store.listVideoMerges(projectId) ?? [];

    const counts: ProjectWorkflowSummary['counts'] = {
      novel: novel ? 1 : 0,
      outline: outlines.length,
      script: scripts.length,
      storyboard: storyboards.length,
      asset: assets.length,
      videoTask: videoTasks.length,
      videoTaskDone: videoTasks.filter((item) => item.status === 'done').length,
      audioTask: audioTasks.length,
      audioTaskDone: audioTasks.filter((item) => item.status === 'done').length,
      videoMerge: videoMerges.length,
      videoMergeDone: videoMerges.filter((item) => item.status === 'done').length
    };

    const hasNovel = counts.novel > 0;
    const hasOutline = counts.outline > 0;
    const hasScript = counts.script > 0;
    const hasStoryboard = counts.storyboard > 0;
    const enoughAssets = counts.storyboard > 0 && counts.asset >= counts.storyboard;
    const enoughVideoTasks = counts.storyboard > 0 && counts.videoTaskDone >= counts.storyboard;
    const hasMergedResult = counts.videoMergeDone > 0;

    let current: ProjectWorkflowSummary['stage']['current'] = 'writing';
    let nextAction: ProjectWorkflowSummary['stage']['nextAction'] = 'create_novel';
    if (!hasNovel) {
      current = 'writing';
      nextAction = 'create_novel';
    } else if (!hasOutline) {
      current = 'writing';
      nextAction = 'generate_outline';
    } else if (!hasScript) {
      current = 'writing';
      nextAction = 'generate_script';
    } else if (!hasStoryboard) {
      current = 'storyboard';
      nextAction = 'generate_storyboard';
    } else if (!enoughAssets) {
      current = 'asset';
      nextAction = 'generate_asset';
    } else if (!enoughVideoTasks) {
      current = 'video';
      nextAction = 'create_video_task';
    } else if (!hasMergedResult) {
      current = 'merge';
      nextAction = 'create_video_merge';
    } else {
      current = 'done';
      nextAction = 'optimize_result';
    }

    const stagesDone = [hasNovel && hasOutline && hasScript, hasStoryboard, enoughAssets, enoughVideoTasks, hasMergedResult].filter(Boolean).length;
    const progressPercent = Math.min(100, Math.round((stagesDone / 5) * 100));

    return {
      projectId,
      counts,
      stage: {
        current,
        nextAction,
        progressPercent
      }
    };
  }

  listProjectWorkflows(projectIds: string[]): ProjectWorkflowSummary[] {
    const dedupIds = [...new Set(projectIds.map((item) => item.trim()).filter((item) => item.length > 0))];
    return dedupIds.map((item) => this.getProjectWorkflow(item)).filter((item): item is ProjectWorkflowSummary => item !== null);
  }
}
