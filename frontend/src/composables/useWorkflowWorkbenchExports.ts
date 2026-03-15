import type { Ref } from 'vue';

type WorkflowOpLogExportItem = {
  id: string;
  action: string;
  estimated: string;
  actual: string;
  note?: string;
  time: string;
};

type WorkflowPrecheckSummary = {
  episodes: number;
  assetCreatable: number;
  assetConflicts: number;
  videoCreatable: number;
  videoConflicts: number;
  highRisk: number;
};

type WorkflowPrecheckConflictStats = {
  asset: number;
  video: number;
  total: number;
  episodes: number;
  highRisk: number;
  max: number;
  assetPct: number;
  videoPct: number;
  highRiskPct: number;
};

type WorkflowPrecheckRow = {
  episodeId: string;
  orderIndex: number;
  title: string;
  storyboardCount: number;
  assetCreatableCount: number;
  assetConflictCount: number;
  videoCreatableCount: number;
  videoConflictCount: number;
  assetConflictTitles: string[];
  videoConflictTitles: string[];
  riskLevel: 'low' | 'medium' | 'high';
};

type UseWorkflowWorkbenchExportsOptions = {
  storageKey?: string;
  projectId: Ref<string>;
  workflowOpActionFilter: Ref<string>;
  workflowOpTimeFrom: Ref<string>;
  workflowOpTimeTo: Ref<string>;
  filteredWorkflowOpLogs: Ref<WorkflowOpLogExportItem[]>;
  precheckRiskFilter: Ref<'all' | 'high' | 'medium' | 'low' | 'conflict_only'>;
  precheckSortBy: Ref<'episode_order' | 'risk_desc' | 'asset_conflict_desc' | 'video_conflict_desc'>;
  episodeBatchIds: Ref<string[]>;
  batchPrecheckSummary: Ref<WorkflowPrecheckSummary>;
  precheckConflictStats: Ref<WorkflowPrecheckConflictStats>;
  batchPrecheckRows: Ref<WorkflowPrecheckRow[]>;
};

const DEFAULT_STORAGE_KEY = 'human2.workflow.opLogs.filters.v1';

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const escapeCsv = (value: string | number): string => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

export const useWorkflowWorkbenchExports = (options: UseWorkflowWorkbenchExportsOptions) => {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;

  const formatWorkflowOpLogTime = (value: string): string => {
    const ts = Date.parse(value);
    if (Number.isNaN(ts)) {
      return value;
    }
    return new Date(ts).toLocaleString();
  };

  const exportWorkflowOpLogs = (): void => {
    const payload = {
      exportedAt: new Date().toISOString(),
      projectId: options.projectId.value,
      filters: {
        action: options.workflowOpActionFilter.value || null,
        timeFrom: options.workflowOpTimeFrom.value || null,
        timeTo: options.workflowOpTimeTo.value || null
      },
      count: options.filteredWorkflowOpLogs.value.length,
      items: options.filteredWorkflowOpLogs.value
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `workflow-op-logs-${Date.now()}.json`);
  };

  const exportBatchPrecheckReport = (): void => {
    const payload = {
      exportedAt: new Date().toISOString(),
      projectId: options.projectId.value,
      filters: {
        risk: options.precheckRiskFilter.value,
        sortBy: options.precheckSortBy.value,
        selectedEpisodeIds: options.episodeBatchIds.value
      },
      summary: options.batchPrecheckSummary.value,
      conflictStats: options.precheckConflictStats.value,
      rows: options.batchPrecheckRows.value
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `workflow-batch-precheck-${Date.now()}.json`);
  };

  const exportBatchPrecheckCsv = (): void => {
    const headers = [
      'episodeOrder',
      'episodeTitle',
      'riskLevel',
      'storyboardCount',
      'assetCreatableCount',
      'assetConflictCount',
      'videoCreatableCount',
      'videoConflictCount',
      'assetConflictTitles',
      'videoConflictTitles'
    ];
    const rows = options.batchPrecheckRows.value.map((row) =>
      [
        row.orderIndex,
        row.title,
        row.riskLevel,
        row.storyboardCount,
        row.assetCreatableCount,
        row.assetConflictCount,
        row.videoCreatableCount,
        row.videoConflictCount,
        row.assetConflictTitles.join('|'),
        row.videoConflictTitles.join('|')
      ]
        .map((cell) => escapeCsv(cell))
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `workflow-batch-precheck-${Date.now()}.csv`);
  };

  const restoreWorkflowOpLogFilters = (): void => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return;
      }
      const row = parsed as Record<string, unknown>;
      options.workflowOpActionFilter.value = typeof row.action === 'string' ? row.action : '';
      options.workflowOpTimeFrom.value = typeof row.timeFrom === 'string' ? row.timeFrom : '';
      options.workflowOpTimeTo.value = typeof row.timeTo === 'string' ? row.timeTo : '';
    } catch {
      // ignore invalid local data
    }
  };

  const persistWorkflowOpLogFilters = (): void => {
    const payload = {
      action: options.workflowOpActionFilter.value,
      timeFrom: options.workflowOpTimeFrom.value,
      timeTo: options.workflowOpTimeTo.value
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
  };

  return {
    exportBatchPrecheckCsv,
    exportBatchPrecheckReport,
    exportWorkflowOpLogs,
    formatWorkflowOpLogTime,
    persistWorkflowOpLogFilters,
    restoreWorkflowOpLogFilters
  };
};
