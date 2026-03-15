import type {
  PageResult,
  Project,
  Storyboard,
  VideoTask,
  VideoTaskEvent,
  VideoTaskListItem,
  VideoTaskMetrics,
} from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';

export type VideoTaskDetail = {
  task: VideoTask;
  project: Pick<Project, 'id' | 'name' | 'description'> | null;
  storyboard: Pick<Storyboard, 'id' | 'title' | 'prompt' | 'imageUrl' | 'status'> | null;
  events: VideoTaskEvent[];
};

export class TaskQueryService {
  constructor(private readonly store: SqliteStore) {}

  listVideoTasks(input: {
    q?: string;
    providerTaskId?: string;
    providerErrorCode?: string;
    status?: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
    createdFrom?: string;
    createdTo?: string;
    sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status';
    order?: 'asc' | 'desc';
    page: number;
    pageSize: number;
  }): PageResult<VideoTaskListItem> {
    return this.store.listAllVideoTasks(input);
  }

  getVideoTaskMetrics(): VideoTaskMetrics {
    return this.store.getVideoTaskMetrics();
  }

  getVideoTaskDetail(taskId: string, eventLimit = 50): VideoTaskDetail | null {
    const task = this.store.getVideoTaskById(taskId);
    if (!task) {
      return null;
    }
    const project = this.store.getProjectById(task.projectId);
    const storyboard = this.store.getStoryboard(task.projectId, task.storyboardId);
    const events = this.store.listVideoTaskEvents(taskId, eventLimit);
    return {
      task,
      project: project
        ? {
            id: project.id,
            name: project.name,
            description: project.description,
          }
        : null,
      storyboard: storyboard
        ? {
            id: storyboard.id,
            title: storyboard.title,
            prompt: storyboard.prompt,
            imageUrl: storyboard.imageUrl,
            status: storyboard.status,
          }
        : null,
      events,
    };
  }
}
