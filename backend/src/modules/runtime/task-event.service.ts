import type { VideoTaskEvent } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';

export class TaskEventService {
  constructor(private readonly store: SqliteStore) {}

  listVideoTaskEvents(taskId: string, limit = 50): VideoTaskEvent[] {
    return this.store.listVideoTaskEvents(taskId, limit);
  }

  exportVideoTaskEvents(
    taskId: string,
    input: {
      format: 'json' | 'csv';
      status?: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
      q?: string;
      createdFrom?: string;
      createdTo?: string;
      limit: number;
    }
  ): { filename: string; contentType: string; body: string } | null {
    const task = this.store.getVideoTaskById(taskId);
    if (!task) {
      return null;
    }
    const events = this.store.listVideoTaskEventsForExport(taskId, {
      status: input.status,
      q: input.q,
      createdFrom: input.createdFrom,
      createdTo: input.createdTo,
      limit: input.limit,
    });

    if (input.format === 'json') {
      return {
        filename: `video-task-events-${taskId}.json`,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(events, null, 2),
      };
    }

    const csvEscape = (raw: string): string => `"${raw.replaceAll('"', '""')}"`;
    const rows = events.map((item) =>
      [String(item.id), item.taskId, item.status, String(item.progress), item.createdAt, item.error ?? ''].map(csvEscape).join(',')
    );
    return {
      filename: `video-task-events-${taskId}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: ['"id","taskId","status","progress","createdAt","error"', ...rows].join('\n'),
    };
  }

  countVideoTaskEventsForExport(
    taskId: string,
    input: {
      status?: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
      q?: string;
      createdFrom?: string;
      createdTo?: string;
    }
  ): { count: number } | null {
    const task = this.store.getVideoTaskById(taskId);
    if (!task) {
      return null;
    }
    return {
      count: this.store.countVideoTaskEventsForExport(taskId, input),
    };
  }
}
