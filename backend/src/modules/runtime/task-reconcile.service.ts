import type { RuntimeTaskReconcileItem, RuntimeTaskReconcileSummary, VideoTask } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import { nowIso } from '../../utils/time.js';
import { TaskRuntimeService } from './task-runtime.service.js';

const ACTIVE_VIDEO_TASK_STATUSES = new Set<VideoTask['status']>(['queued', 'submitting', 'polling', 'running']);
const ACTIVE_AUDIO_TASK_STATUSES = new Set(['queued', 'running']);

const clampInt = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Math.floor(value)));

const parseDateMs = (value: string): number | null => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export class TaskReconcileService {
  constructor(
    private readonly store: SqliteStore,
    private readonly taskRuntimeService: TaskRuntimeService
  ) {}

  getRuntimeReconcileSummary(input: { limit?: number; staleAfterMinutes?: number } = {}): RuntimeTaskReconcileSummary {
    const limit = clampInt(input.limit ?? 200, 1, 2_000);
    const staleAfterMinutes = clampInt(input.staleAfterMinutes ?? 45, 5, 24 * 60);
    const staleBeforeMs = Date.now() - staleAfterMinutes * 60_000;
    const snapshot = this.taskRuntimeService.getVideoTaskRuntimeSnapshot();
    const items: RuntimeTaskReconcileItem[] = [];

    for (const project of this.store.listProjects()) {
      const storyboards = this.store.listStoryboards(project.id) ?? [];
      const storyboardIds = new Set(storyboards.map((item) => item.id));
      const videoTasks = this.store.listVideoTasks(project.id) ?? [];
      const audioTasks = this.store.listAudioTasks(project.id) ?? [];
      const videoMerges = this.store.listVideoMerges(project.id) ?? [];
      const duplicateStoryboardIds = this.findDuplicateActiveStoryboardIds(videoTasks);

      for (const task of videoTasks) {
        if (!storyboardIds.has(task.storyboardId)) {
          items.push(this.toItem('video', task.id, project.id, 'missing_storyboard', 'critical', task.status, task.updatedAt, 'video task storyboard missing'));
        }
        if (ACTIVE_VIDEO_TASK_STATUSES.has(task.status) && this.isStale(task.updatedAt, staleBeforeMs)) {
          items.push(
            this.toItem(
              'video',
              task.id,
              project.id,
              'stale_active',
              task.status === 'queued' ? 'warning' : 'critical',
              task.status,
              task.updatedAt,
              `video task stale for > ${staleAfterMinutes} minutes`
            )
          );
        }
        if (task.status === 'done' && !task.resultUrl) {
          items.push(this.toItem('video', task.id, project.id, 'missing_result_url', 'critical', task.status, task.updatedAt, 'video task missing result url'));
        }
        if (ACTIVE_VIDEO_TASK_STATUSES.has(task.status) && duplicateStoryboardIds.has(task.storyboardId)) {
          items.push(
            this.toItem(
              'video',
              task.id,
              project.id,
              'duplicate_active_storyboard_task',
              'warning',
              task.status,
              task.updatedAt,
              'multiple active video tasks detected for one storyboard'
            )
          );
        }
      }

      for (const task of audioTasks) {
        if (!storyboardIds.has(task.storyboardId)) {
          items.push(this.toItem('audio', task.id, project.id, 'missing_storyboard', 'critical', task.status, task.updatedAt, 'audio task storyboard missing'));
        }
        if (ACTIVE_AUDIO_TASK_STATUSES.has(task.status) && this.isStale(task.updatedAt, staleBeforeMs)) {
          items.push(
            this.toItem(
              'audio',
              task.id,
              project.id,
              'stale_active',
              task.status === 'queued' ? 'warning' : 'critical',
              task.status,
              task.updatedAt,
              `audio task stale for > ${staleAfterMinutes} minutes`
            )
          );
        }
        if (task.status === 'done' && !task.resultUrl) {
          items.push(this.toItem('audio', task.id, project.id, 'missing_result_url', 'critical', task.status, task.updatedAt, 'audio task missing result url'));
        }
      }

      for (const merge of videoMerges) {
        const hasMissingStoryboard = merge.clips.some((clip) => !storyboardIds.has(clip.storyboardId));
        const hasResolvedClip = merge.clips.some(
          (clip) =>
            Boolean(clip.sourceUrl) ||
            Boolean(
              clip.videoTaskId &&
                videoTasks.find((task) => task.id === clip.videoTaskId && task.status === 'done' && task.resultUrl)
            )
        );
        if (hasMissingStoryboard) {
          items.push(
            this.toItem('video_merge', merge.id, project.id, 'missing_storyboard', 'critical', merge.status, merge.updatedAt, 'video merge references missing storyboard')
          );
        }
        if (merge.status === 'done' && !merge.resultUrl) {
          items.push(this.toItem('video_merge', merge.id, project.id, 'missing_result_url', 'critical', merge.status, merge.updatedAt, 'video merge missing result url'));
        }
        if (merge.clips.length > 0 && !hasResolvedClip) {
          items.push(
            this.toItem(
              'video_merge',
              merge.id,
              project.id,
              'merge_without_resolved_clips',
              merge.status === 'failed' ? 'critical' : 'warning',
              merge.status,
              merge.updatedAt,
              'video merge has no resolved clip source'
            )
          );
        }
      }
    }

    const sortedItems = items
      .slice()
      .sort((left, right) => {
        if (left.severity !== right.severity) {
          return left.severity === 'critical' ? -1 : 1;
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      });

    const byIssue = new Map<RuntimeTaskReconcileItem['issue'], number>();
    const projectIssueMap = new Map<string, { projectId: string; issueCount: number; criticalCount: number }>();
    for (const item of sortedItems) {
      byIssue.set(item.issue, (byIssue.get(item.issue) ?? 0) + 1);
      const current = projectIssueMap.get(item.projectId) ?? { projectId: item.projectId, issueCount: 0, criticalCount: 0 };
      current.issueCount += 1;
      if (item.severity === 'critical') {
        current.criticalCount += 1;
      }
      projectIssueMap.set(item.projectId, current);
    }

    return {
      generatedAt: nowIso(),
      staleAfterMinutes,
      runtime: {
        heartbeatAt: snapshot.heartbeatAt,
        isPumpRunning: snapshot.isPumpRunning,
        queuedTotal: snapshot.queuedTotal,
        runningTotal: snapshot.runningTotal,
        activeWorkerCount: snapshot.activeWorkerCount
      },
      totals: {
        issues: sortedItems.length,
        critical: sortedItems.filter((item) => item.severity === 'critical').length,
        warning: sortedItems.filter((item) => item.severity === 'warning').length,
        video: sortedItems.filter((item) => item.taskType === 'video').length,
        audio: sortedItems.filter((item) => item.taskType === 'audio').length,
        videoMerge: sortedItems.filter((item) => item.taskType === 'video_merge').length
      },
      byIssue: [...byIssue.entries()].map(([issue, count]) => ({ issue, count })),
      projects: [...projectIssueMap.values()].sort((left, right) => right.issueCount - left.issueCount),
      items: sortedItems.slice(0, limit)
    };
  }

  private isStale(updatedAt: string, staleBeforeMs: number): boolean {
    const updatedAtMs = parseDateMs(updatedAt);
    return updatedAtMs !== null && updatedAtMs <= staleBeforeMs;
  }

  private findDuplicateActiveStoryboardIds(tasks: VideoTask[]): Set<string> {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (!ACTIVE_VIDEO_TASK_STATUSES.has(task.status)) {
        continue;
      }
      counts.set(task.storyboardId, (counts.get(task.storyboardId) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([storyboardId]) => storyboardId));
  }

  private toItem(
    taskType: RuntimeTaskReconcileItem['taskType'],
    taskId: string,
    projectId: string,
    issue: RuntimeTaskReconcileItem['issue'],
    severity: RuntimeTaskReconcileItem['severity'],
    status: string,
    updatedAt: string,
    detail: string
  ): RuntimeTaskReconcileItem {
    return {
      taskType,
      taskId,
      projectId,
      issue,
      severity,
      status,
      updatedAt,
      detail
    };
  }
}
