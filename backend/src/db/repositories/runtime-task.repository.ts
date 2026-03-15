import type {
  AudioTask,
  PageResult,
  VideoMerge,
  VideoMergeClip,
  VideoTask,
  VideoTaskEvent,
  VideoTaskListItem,
  VideoTaskMetrics,
} from '../../core/types.js';
import {
  mapAudioTask,
  mapVideoMerge,
  mapVideoTask,
  mapVideoTaskEvent,
  mapVideoTaskListItem,
} from '../sqlite/row-mappers.js';
import type {
  AudioTaskRow,
  SortOrder,
  VideoMergeRow,
  VideoTaskEventRow,
  VideoTaskListRow,
  VideoTaskRow,
} from '../sqlite/row-types.js';
import { BaseRepository } from './base.repository.js';

type VideoTaskStatus = 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
type AudioTaskStatus = 'queued' | 'running' | 'done' | 'failed';
type VideoMergeStatus = 'queued' | 'processing' | 'done' | 'failed';

export class RuntimeTaskRepository extends BaseRepository {
  listVideoTasks(projectId: string): VideoTask[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }

    const rows = this.db
      .prepare(
        "SELECT id, project_id, storyboard_id, prompt, model_name, params, priority, status, progress, result_url, error, provider_task_id, attempt, next_retry_at, provider_error_code, created_at, updated_at FROM video_tasks WHERE project_id = ? ORDER BY CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC, created_at DESC"
      )
      .all(projectId) as VideoTaskRow[];
    return rows.map((row) => mapVideoTask(row));
  }

  listAllVideoTasks(input: {
    q?: string;
    providerTaskId?: string;
    providerErrorCode?: string;
    status?: VideoTaskStatus;
    createdFrom?: string;
    createdTo?: string;
    sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status';
    order?: SortOrder;
    page: number;
    pageSize: number;
  }): PageResult<VideoTaskListItem> {
    const keyword = input.q?.trim();
    const providerTaskId = input.providerTaskId?.trim();
    const providerErrorCode = input.providerErrorCode?.trim();
    const offset = (input.page - 1) * input.pageSize;
    const sortColumn = this.mapVideoTaskSortBy(input.sortBy);
    const sortOrder = this.mapOrder(input.order);
    const whereParts: string[] = [];
    const params: string[] = [];

    if (keyword) {
      whereParts.push('(p.name LIKE ? OR sb.title LIKE ? OR vt.prompt LIKE ? OR vt.id LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (providerTaskId) {
      whereParts.push('vt.provider_task_id LIKE ?');
      params.push(`%${providerTaskId}%`);
    }
    if (providerErrorCode) {
      whereParts.push('vt.provider_error_code = ?');
      params.push(providerErrorCode);
    }
    if (input.status) {
      whereParts.push('vt.status = ?');
      params.push(input.status);
    }
    if (input.createdFrom) {
      whereParts.push('vt.created_at >= ?');
      params.push(input.createdFrom);
    }
    if (input.createdTo) {
      whereParts.push('vt.created_at <= ?');
      params.push(input.createdTo);
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const totalRow = this.db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM video_tasks vt
        JOIN projects p ON p.id = vt.project_id
        JOIN storyboards sb ON sb.id = vt.storyboard_id
        ${whereClause}
      `
      )
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `
        SELECT
          vt.id, vt.project_id, vt.storyboard_id, vt.prompt, vt.model_name, vt.params, vt.priority, vt.status, vt.progress, vt.result_url, vt.error, vt.provider_task_id, vt.attempt, vt.next_retry_at, vt.provider_error_code, vt.created_at, vt.updated_at,
          p.name AS project_name,
          sb.title AS storyboard_title
        FROM video_tasks vt
        JOIN projects p ON p.id = vt.project_id
        JOIN storyboards sb ON sb.id = vt.storyboard_id
        ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}, vt.created_at DESC
        LIMIT ? OFFSET ?
      `
      )
      .all(...params, input.pageSize, offset) as VideoTaskListRow[];

    return {
      items: rows.map((item) => mapVideoTaskListItem(item)),
      total: totalRow.count,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  getVideoTaskById(taskId: string): VideoTask | null {
    const row = this.db
      .prepare(
        'SELECT id, project_id, storyboard_id, prompt, model_name, params, priority, status, progress, result_url, error, provider_task_id, attempt, next_retry_at, provider_error_code, created_at, updated_at FROM video_tasks WHERE id = ? LIMIT 1'
      )
      .get(taskId) as VideoTaskRow | undefined;
    return row ? mapVideoTask(row) : null;
  }

  listVideoTaskEvents(taskId: string, limit = 50): VideoTaskEvent[] {
    const rows = this.db
      .prepare('SELECT id, task_id, status, progress, error, created_at FROM video_task_events WHERE task_id = ? ORDER BY id DESC LIMIT ?')
      .all(taskId, Math.max(1, Math.min(limit, 200))) as VideoTaskEventRow[];
    return rows.map((item) => mapVideoTaskEvent(item));
  }

  listVideoTaskEventsForExport(
    taskId: string,
    input: {
      status?: VideoTaskStatus;
      q?: string;
      createdFrom?: string;
      createdTo?: string;
      limit: number;
    }
  ): VideoTaskEvent[] {
    const { whereClause, params } = this.buildVideoTaskEventsExportWhere(taskId, input);
    const rows = this.db
      .prepare(`SELECT id, task_id, status, progress, error, created_at FROM video_task_events ${whereClause} ORDER BY id DESC LIMIT ?`)
      .all(...params, Math.max(1, Math.min(input.limit, 10_000))) as VideoTaskEventRow[];
    return rows.map((item) => mapVideoTaskEvent(item));
  }

  countVideoTaskEventsForExport(
    taskId: string,
    input: {
      status?: VideoTaskStatus;
      q?: string;
      createdFrom?: string;
      createdTo?: string;
    }
  ): number {
    const { whereClause, params } = this.buildVideoTaskEventsExportWhere(taskId, input);
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM video_task_events ${whereClause}`).get(...params) as { count: number };
    return row.count;
  }

  listQueuedVideoTaskProjectIds(): string[] {
    const rows = this.db.prepare("SELECT DISTINCT project_id FROM video_tasks WHERE status = 'queued'").all() as Array<{ project_id: string }>;
    return rows.map((item) => item.project_id);
  }

  getVideoTaskMetrics(): VideoTaskMetrics {
    const totalRow = this.db
      .prepare(
        `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
          SUM(CASE WHEN status IN ('submitting', 'polling', 'running') THEN 1 ELSE 0 END) AS running,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
          SUM(CASE WHEN status IN ('failed', 'cancelled') THEN 1 ELSE 0 END) AS failed
        FROM video_tasks
      `
      )
      .get() as { total: number; queued: number | null; running: number | null; done: number | null; failed: number | null };

    const eventRows = this.db
      .prepare(
        `
        SELECT task_id, status, created_at
        FROM video_task_events
        ORDER BY id ASC
      `
      )
      .all() as Array<{ task_id: string; status: VideoTaskStatus; created_at: string }>;

    const statusMap = new Map<string, { queuedAt?: number; runningAt?: number; terminalAt?: number }>();

    for (const row of eventRows) {
      const item = statusMap.get(row.task_id) ?? {};
      const time = Date.parse(row.created_at);
      if (!Number.isFinite(time)) {
        continue;
      }
      if (row.status === 'queued' && item.queuedAt === undefined) {
        item.queuedAt = time;
      }
      if ((row.status === 'submitting' || row.status === 'polling' || row.status === 'running') && item.runningAt === undefined) {
        item.runningAt = time;
      }
      if ((row.status === 'done' || row.status === 'failed' || row.status === 'cancelled') && item.terminalAt === undefined) {
        item.terminalAt = time;
      }
      statusMap.set(row.task_id, item);
    }

    let queueWaitSum = 0;
    let queueWaitCount = 0;
    let runDurationSum = 0;
    let runDurationCount = 0;
    for (const item of statusMap.values()) {
      if (item.queuedAt !== undefined && item.runningAt !== undefined && item.runningAt >= item.queuedAt) {
        queueWaitSum += item.runningAt - item.queuedAt;
        queueWaitCount += 1;
      }
      if (item.runningAt !== undefined && item.terminalAt !== undefined && item.terminalAt >= item.runningAt) {
        runDurationSum += item.terminalAt - item.runningAt;
        runDurationCount += 1;
      }
    }

    const doneCount = totalRow.done ?? 0;
    const failedCount = totalRow.failed ?? 0;
    const terminalCount = doneCount + failedCount;

    return {
      total: totalRow.total,
      queued: totalRow.queued ?? 0,
      running: totalRow.running ?? 0,
      done: doneCount,
      failed: failedCount,
      failureRate: terminalCount === 0 ? 0 : Number((failedCount / terminalCount).toFixed(4)),
      avgQueueWaitMs: queueWaitCount === 0 ? 0 : Math.round(queueWaitSum / queueWaitCount),
      avgRunDurationMs: runDurationCount === 0 ? 0 : Math.round(runDurationSum / runDurationCount),
    };
  }

  getVideoTaskQueueWaitPercentiles(limitTasks = 1000): { p50Ms: number; p95Ms: number; sampleSize: number } {
    const taskRows = this.db
      .prepare('SELECT id FROM video_tasks ORDER BY created_at DESC LIMIT ?')
      .all(Math.max(1, Math.min(10_000, Math.trunc(limitTasks)))) as Array<{ id: string }>;
    if (taskRows.length === 0) {
      return { p50Ms: 0, p95Ms: 0, sampleSize: 0 };
    }
    const idSet = new Set(taskRows.map((item) => item.id));
    const eventRows = this.db
      .prepare(
        `
        SELECT task_id, status, created_at
        FROM video_task_events
        ORDER BY id ASC
      `
      )
      .all() as Array<{ task_id: string; status: VideoTaskStatus; created_at: string }>;
    const statusMap = new Map<string, { queuedAt?: number; runningAt?: number }>();
    for (const row of eventRows) {
      if (!idSet.has(row.task_id)) {
        continue;
      }
      const time = Date.parse(row.created_at);
      if (!Number.isFinite(time)) {
        continue;
      }
      const item = statusMap.get(row.task_id) ?? {};
      if (row.status === 'queued' && item.queuedAt === undefined) {
        item.queuedAt = time;
      }
      if ((row.status === 'submitting' || row.status === 'polling' || row.status === 'running') && item.runningAt === undefined) {
        item.runningAt = time;
      }
      statusMap.set(row.task_id, item);
    }
    const waits = [...statusMap.values()]
      .filter((item) => item.queuedAt !== undefined && item.runningAt !== undefined && item.runningAt >= item.queuedAt)
      .map((item) => item.runningAt! - item.queuedAt!)
      .sort((a, b) => a - b);
    if (waits.length === 0) {
      return { p50Ms: 0, p95Ms: 0, sampleSize: 0 };
    }
    const pick = (quantile: number): number => {
      const index = Math.max(0, Math.min(waits.length - 1, Math.floor((waits.length - 1) * quantile)));
      return waits[index] ?? 0;
    };
    return {
      p50Ms: pick(0.5),
      p95Ms: pick(0.95),
      sampleSize: waits.length,
    };
  }

  countVideoTasksCreatedBetween(projectId: string, createdFrom: string, createdTo: string): number {
    if (!projectId.trim()) {
      return 0;
    }
    const row = this.db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM video_tasks
        WHERE project_id = ?
          AND created_at >= ?
          AND created_at < ?
      `
      )
      .get(projectId, createdFrom, createdTo) as { count: number };
    return row.count;
  }

  getNextQueuedVideoTask(projectId: string): VideoTask | null {
    const row = this.db
      .prepare(
        "SELECT id, project_id, storyboard_id, prompt, model_name, params, priority, status, progress, result_url, error, provider_task_id, attempt, next_retry_at, provider_error_code, created_at, updated_at FROM video_tasks WHERE project_id = ? AND status = 'queued' ORDER BY CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC, created_at ASC LIMIT 1"
      )
      .get(projectId) as VideoTaskRow | undefined;
    return row ? mapVideoTask(row) : null;
  }

  countRunningVideoTasks(projectId: string): number {
    if (!this.projectExists(projectId)) {
      return 0;
    }

    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM video_tasks WHERE project_id = ? AND status IN ('submitting', 'polling', 'running')")
      .get(projectId) as { count: number };
    return row.count;
  }

  listVideoTaskRuntimeProjectStats(): Array<{ projectId: string; queued: number; running: number; active: number }> {
    const rows = this.db
      .prepare(
        `
        SELECT
          project_id,
          SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
          SUM(CASE WHEN status IN ('submitting', 'polling', 'running') THEN 1 ELSE 0 END) AS running
        FROM video_tasks
        WHERE status IN ('queued', 'submitting', 'polling', 'running')
        GROUP BY project_id
        ORDER BY (SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) + SUM(CASE WHEN status IN ('submitting', 'polling', 'running') THEN 1 ELSE 0 END)) DESC,
                 project_id ASC
      `
      )
      .all() as Array<{ project_id: string; queued: number | null; running: number | null }>;
    return rows.map((item) => {
      const queued = item.queued ?? 0;
      const running = item.running ?? 0;
      return {
        projectId: item.project_id,
        queued,
        running,
        active: queued + running,
      };
    });
  }

  createVideoTask(input: {
    id: string;
    projectId: string;
    storyboardId: string;
    prompt: string;
    modelName: string | null;
    params: Record<string, unknown>;
    priority: 'low' | 'medium' | 'high';
  }): VideoTask | null {
    if (!this.projectExists(input.projectId) || !this.storyboardExists(input.projectId, input.storyboardId)) {
      return null;
    }

    const timestamp = this.timestamp();
    this.db
      .prepare(
        'INSERT INTO video_tasks (id, project_id, storyboard_id, prompt, model_name, params, priority, status, progress, result_url, error, provider_task_id, attempt, next_retry_at, provider_error_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        input.id,
        input.projectId,
        input.storyboardId,
        input.prompt,
        input.modelName,
        JSON.stringify(input.params ?? {}),
        input.priority,
        'queued',
        0,
        null,
        null,
        null,
        0,
        null,
        null,
        timestamp,
        timestamp
      );
    this.appendTaskEvent(input.id, 'queued', 0, null);

    const row = this.db
      .prepare(
        'SELECT id, project_id, storyboard_id, prompt, model_name, params, priority, status, progress, result_url, error, provider_task_id, attempt, next_retry_at, provider_error_code, created_at, updated_at FROM video_tasks WHERE id = ? LIMIT 1'
      )
      .get(input.id) as VideoTaskRow | undefined;
    return row ? mapVideoTask(row) : null;
  }

  getVideoTask(projectId: string, taskId: string): VideoTask | null {
    const row = this.db
      .prepare(
        'SELECT id, project_id, storyboard_id, prompt, model_name, params, priority, status, progress, result_url, error, provider_task_id, attempt, next_retry_at, provider_error_code, created_at, updated_at FROM video_tasks WHERE id = ? AND project_id = ? LIMIT 1'
      )
      .get(taskId, projectId) as VideoTaskRow | undefined;
    return row ? mapVideoTask(row) : null;
  }

  updateVideoTask(
    projectId: string,
    taskId: string,
    input: {
      status: VideoTaskStatus;
      progress: number;
      resultUrl?: string | null;
      firstFrameUrl?: string | null;
      lastFrameUrl?: string | null;
      error?: string | null;
      providerTaskId?: string | null;
      attempt?: number;
      nextRetryAt?: string | null;
      providerErrorCode?: string | null;
    }
  ): VideoTask | null {
    const exists = this.getVideoTask(projectId, taskId);
    if (!exists) {
      return null;
    }
    const timestamp = this.timestamp();
    const firstFrameUrl = input.firstFrameUrl === undefined ? exists.firstFrameUrl : input.firstFrameUrl;
    const lastFrameUrl = input.lastFrameUrl === undefined ? exists.lastFrameUrl : input.lastFrameUrl;
    this.db
      .prepare(
        'UPDATE video_tasks SET status = ?, progress = ?, result_url = ?, first_frame_url = ?, last_frame_url = ?, error = ?, provider_task_id = ?, attempt = ?, next_retry_at = ?, provider_error_code = ?, updated_at = ? WHERE id = ? AND project_id = ?'
      )
      .run(
        input.status,
        input.progress,
        input.resultUrl ?? null,
        firstFrameUrl,
        lastFrameUrl,
        input.error ?? null,
        input.providerTaskId === undefined ? exists.providerTaskId : input.providerTaskId,
        input.attempt === undefined ? exists.attempt : input.attempt,
        input.nextRetryAt === undefined ? exists.nextRetryAt : input.nextRetryAt,
        input.providerErrorCode === undefined ? exists.providerErrorCode : input.providerErrorCode,
        timestamp,
        taskId,
        projectId
      );
    this.appendTaskEvent(taskId, input.status, input.progress, input.error ?? null);
    return this.getVideoTask(projectId, taskId);
  }

  listAudioTasks(projectId: string): AudioTask[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }

    const rows = this.db
      .prepare(
        "SELECT id, project_id, storyboard_id, prompt, model_name, params, priority, status, progress, result_url, error, created_at, updated_at FROM audio_tasks WHERE project_id = ? ORDER BY CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC, created_at DESC"
      )
      .all(projectId) as AudioTaskRow[];
    return rows.map((row) => mapAudioTask(row));
  }

  createAudioTask(input: {
    id: string;
    projectId: string;
    storyboardId: string;
    prompt: string;
    modelName: string | null;
    params: Record<string, unknown>;
    priority: 'low' | 'medium' | 'high';
  }): AudioTask | null {
    if (!this.projectExists(input.projectId) || !this.storyboardExists(input.projectId, input.storyboardId)) {
      return null;
    }

    const timestamp = this.timestamp();
    this.db
      .prepare(
        'INSERT INTO audio_tasks (id, project_id, storyboard_id, prompt, model_name, params, priority, status, progress, result_url, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        input.id,
        input.projectId,
        input.storyboardId,
        input.prompt,
        input.modelName,
        JSON.stringify(input.params ?? {}),
        input.priority,
        'queued',
        0,
        null,
        null,
        timestamp,
        timestamp
      );

    return this.getAudioTask(input.projectId, input.id);
  }

  getAudioTask(projectId: string, taskId: string): AudioTask | null {
    const row = this.db
      .prepare(
        'SELECT id, project_id, storyboard_id, prompt, model_name, params, priority, status, progress, result_url, error, created_at, updated_at FROM audio_tasks WHERE id = ? AND project_id = ? LIMIT 1'
      )
      .get(taskId, projectId) as AudioTaskRow | undefined;
    return row ? mapAudioTask(row) : null;
  }

  updateAudioTask(
    projectId: string,
    taskId: string,
    input: { status: AudioTaskStatus; progress: number; resultUrl?: string | null; error?: string | null }
  ): AudioTask | null {
    const exists = this.getAudioTask(projectId, taskId);
    if (!exists) {
      return null;
    }
    const timestamp = this.timestamp();
    this.db
      .prepare('UPDATE audio_tasks SET status = ?, progress = ?, result_url = ?, error = ?, updated_at = ? WHERE id = ? AND project_id = ?')
      .run(input.status, input.progress, input.resultUrl ?? null, input.error ?? null, timestamp, taskId, projectId);
    return this.getAudioTask(projectId, taskId);
  }

  listVideoMerges(projectId: string): VideoMerge[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }
    const rows = this.db
      .prepare(
        'SELECT id, project_id, title, status, clips, params, result_url, output_path, error_code, error, created_at, updated_at, completed_at FROM video_merges WHERE project_id = ? ORDER BY created_at DESC'
      )
      .all(projectId) as VideoMergeRow[];
    return rows.map((row) => mapVideoMerge(row));
  }

  createVideoMerge(input: {
    id: string;
    projectId: string;
    title: string;
    status: VideoMergeStatus;
    clips: Array<{
      storyboardId: string;
      videoTaskId?: string;
      sourceUrl?: string;
      durationSec?: number;
      transition?: VideoMergeClip['transition'];
      keyframe?: VideoMergeClip['keyframe'];
    }>;
    params?: VideoMerge['params'];
  }): VideoMerge | null {
    if (!this.projectExists(input.projectId)) {
      return null;
    }
    const timestamp = this.timestamp();
    this.db
      .prepare(
        'INSERT INTO video_merges (id, project_id, title, status, clips, params, result_url, output_path, error_code, error, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        input.id,
        input.projectId,
        input.title,
        input.status,
        JSON.stringify(input.clips ?? []),
        JSON.stringify(input.params ?? {}),
        null,
        null,
        null,
        null,
        timestamp,
        timestamp,
        null
      );
    return this.getVideoMerge(input.projectId, input.id);
  }

  getVideoMerge(projectId: string, mergeId: string): VideoMerge | null {
    const row = this.db
      .prepare(
        'SELECT id, project_id, title, status, clips, params, result_url, output_path, error_code, error, created_at, updated_at, completed_at FROM video_merges WHERE id = ? AND project_id = ? LIMIT 1'
      )
      .get(mergeId, projectId) as VideoMergeRow | undefined;
    return row ? mapVideoMerge(row) : null;
  }

  updateVideoMerge(
    projectId: string,
    mergeId: string,
    input: {
      status: VideoMergeStatus;
      resultUrl?: string | null;
      outputPath?: string | null;
      errorCode?: string | null;
      error?: string | null;
      completedAt?: string | null;
    }
  ): VideoMerge | null {
    const current = this.getVideoMerge(projectId, mergeId);
    if (!current) {
      return null;
    }
    this.db
      .prepare('UPDATE video_merges SET status = ?, result_url = ?, output_path = ?, error_code = ?, error = ?, updated_at = ?, completed_at = ? WHERE id = ? AND project_id = ?')
      .run(
        input.status,
        input.resultUrl === undefined ? current.resultUrl : input.resultUrl,
        input.outputPath === undefined ? current.outputPath : input.outputPath,
        input.errorCode === undefined ? current.errorCode : input.errorCode,
        input.error === undefined ? current.error : input.error,
        this.timestamp(),
        input.completedAt === undefined ? current.completedAt : input.completedAt,
        mergeId,
        projectId
      );
    return this.getVideoMerge(projectId, mergeId);
  }

  private mapVideoTaskSortBy(sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status'): string {
    switch (sortBy) {
      case 'updatedAt':
        return 'vt.updated_at';
      case 'priority':
        return "CASE vt.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END";
      case 'status':
        return 'vt.status';
      case 'createdAt':
      default:
        return 'vt.created_at';
    }
  }

  private appendTaskEvent(taskId: string, status: VideoTaskStatus, progress: number, error: string | null): void {
    this.db
      .prepare('INSERT INTO video_task_events (task_id, status, progress, error, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(taskId, status, progress, error, this.timestamp());
  }

  private buildVideoTaskEventsExportWhere(
    taskId: string,
    input: {
      status?: VideoTaskStatus;
      q?: string;
      createdFrom?: string;
      createdTo?: string;
    }
  ): { whereClause: string; params: Array<string | number> } {
    const whereParts = ['task_id = ?'];
    const params: Array<string | number> = [taskId];
    if (input.status) {
      whereParts.push('status = ?');
      params.push(input.status);
    }
    if (input.q?.trim()) {
      whereParts.push('error LIKE ?');
      params.push(`%${input.q.trim()}%`);
    }
    if (input.createdFrom) {
      whereParts.push('created_at >= ?');
      params.push(input.createdFrom);
    }
    if (input.createdTo) {
      whereParts.push('created_at <= ?');
      params.push(input.createdTo);
    }
    return {
      whereClause: `WHERE ${whereParts.join(' AND ')}`,
      params,
    };
  }

  private storyboardExists(projectId: string, storyboardId: string): boolean {
    return Boolean(this.db.prepare('SELECT id FROM storyboards WHERE id = ? AND project_id = ? LIMIT 1').get(storyboardId, projectId));
  }
}
