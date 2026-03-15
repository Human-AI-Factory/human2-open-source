import { DomainEntityAudit, DomainEntityAuditStats } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';

export class DomainAuditService {
  constructor(private readonly store: SqliteStore) {}

  listDomainEntityAudits(
    projectId: string,
    input: {
      actor?: string;
      action?: string;
      targetType?: 'domain_entity' | 'episode_relation' | 'storyboard_relation' | 'apply';
      startAt?: string;
      endAt?: string;
      page: number;
      pageSize: number;
    }
  ): { items: DomainEntityAudit[]; total: number; page: number; pageSize: number } | null {
    return this.store.listDomainEntityAudits(projectId, input);
  }

  exportDomainEntityAuditsCsv(
    projectId: string,
    input: {
      actor?: string;
      action?: string;
      targetType?: 'domain_entity' | 'episode_relation' | 'storyboard_relation' | 'apply';
      startAt?: string;
      endAt?: string;
    }
  ): string | null {
    const page = this.store.listDomainEntityAudits(projectId, {
      ...input,
      page: 1,
      pageSize: 5000
    });
    if (!page) {
      return null;
    }
    const escapeCsv = (value: unknown): string => {
      const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };
    const header = ['id', 'projectId', 'actor', 'action', 'targetType', 'targetId', 'createdAt', 'details'];
    const rows = page.items.map((item) =>
      [
        item.id,
        item.projectId,
        item.actor,
        item.action,
        item.targetType,
        item.targetId,
        item.createdAt,
        JSON.stringify(item.details)
      ]
        .map((cell) => escapeCsv(cell))
        .join(',')
    );
    return [header.join(','), ...rows].join('\n');
  }

  getDomainEntityAuditStats(
    projectId: string,
    input: { actor?: string; startAt?: string; endAt?: string }
  ): DomainEntityAuditStats | null {
    return this.store.getDomainEntityAuditStats(projectId, input);
  }
}
