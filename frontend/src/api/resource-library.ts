import { request, requestText } from '@/api/client';
import { buildQuery } from '@/api/utils';
import type {
  Asset,
  PageResult,
  ResourceLibraryApplyAuditEntry,
  ResourceLibraryBatchImportResult,
  ResourceLibraryConflictGroup,
  ResourceLibraryConflictPreview,
  ResourceLibraryConflictResolveResult,
  ResourceLibraryDeduplicateResult,
  ResourceLibraryDeduplicateUndoDetail,
  ResourceLibraryDeduplicateUndoEntry,
  ResourceLibraryDeduplicateUndoResult,
  ResourceLibraryDuplicateGroup,
  ResourceLibraryDuplicatePreview,
  ResourceLibraryExportJson,
  ResourceLibraryImportJsonResult,
  ResourceLibraryItem,
  ResourceLibraryMergeAuditEntry,
  ResourceLibraryResolveByKeepResult,
  ResourceLibraryResolveDuplicateResult
} from '@/types/models';

export const getResourceLibrary = (input: {
  q?: string;
  type?: 'character' | 'scene' | 'prop';
  page?: number;
  pageSize?: number;
} = {}): Promise<PageResult<ResourceLibraryItem>> =>
  request(`/api/library/resources?${buildQuery(input)}`);

export const createAssetsByEpisodeFromResource = (
  resourceId: string,
  payload: {
    projectId: string;
    episodeId: string;
    mode?: 'missing_only' | 'all';
    name?: string;
    prompt?: string;
    imageUrl?: string | null;
  }
): Promise<{
  created: Asset[];
  skippedStoryboardIds: string[];
  totalStoryboards: number;
}> =>
  request(`/api/library/resources/${resourceId}/create-assets-by-episode`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const previewCreateAssetsByEpisodeFromResource = (
  resourceId: string,
  payload: {
    projectId: string;
    episodeId: string;
    mode?: 'missing_only' | 'all';
    name?: string;
  }
): Promise<{
  totalStoryboards: number;
  creatableStoryboardIds: string[];
  conflictStoryboardIds: string[];
  creatableStoryboards: Array<{ id: string; title: string }>;
  conflictStoryboards: Array<{ id: string; title: string }>;
  mode: 'missing_only' | 'all';
}> =>
  request(`/api/library/resources/${resourceId}/create-assets-by-episode/preview`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getResourceLibraryApplyAudits = (input: {
  projectId: string;
  limit?: number;
}): Promise<ResourceLibraryApplyAuditEntry[]> =>
  request(`/api/library/resources/apply-audits?${buildQuery(input)}`);

export const getResourceLibraryConflicts = (input: {
  kind?: 'fingerprint' | 'source' | 'name';
  type?: 'character' | 'scene' | 'prop';
  q?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<PageResult<ResourceLibraryConflictGroup>> =>
  request(`/api/library/resources/conflicts?${buildQuery(input)}`);

export const previewResourceLibraryConflictGroup = (input: {
  conflictKind: 'fingerprint' | 'source' | 'name';
  conflictKey: string;
  strategy?: 'keep_latest' | 'keep_most_used';
}): Promise<ResourceLibraryConflictPreview> =>
  request(`/api/library/resources/conflicts/preview?${buildQuery(input)}`);

export const resolveResourceLibraryConflictGroup = (payload: {
  conflictKind: 'fingerprint' | 'source' | 'name';
  conflictKey: string;
  strategy?: 'keep_latest' | 'keep_most_used' | 'manual_keep';
  keepId?: string;
}): Promise<ResourceLibraryConflictResolveResult> =>
  request('/api/library/resources/conflicts/resolve', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getResourceLibraryMergeAudits = (input: {
  limit?: number;
  strategy?: 'keep_latest' | 'keep_most_used' | 'manual_keep';
  conflictKind?: 'fingerprint' | 'source' | 'name';
  startAt?: string;
  endAt?: string;
  keepId?: string;
  removedId?: string;
  q?: string;
} = {}): Promise<ResourceLibraryMergeAuditEntry[]> =>
  request(`/api/library/resources/merge-audits?${buildQuery(input)}`);

export const exportResourceLibraryMergeAuditsCsv = (input: {
  strategy?: 'keep_latest' | 'keep_most_used' | 'manual_keep';
  conflictKind?: 'fingerprint' | 'source' | 'name';
  startAt?: string;
  endAt?: string;
  keepId?: string;
  removedId?: string;
  q?: string;
} = {}): Promise<string> =>
  requestText(`/api/library/resources/merge-audits/export.csv?${buildQuery(input)}`);

export const importResourceFromAsset = (payload: {
  projectId: string;
  assetId: string;
  tags?: string[];
}): Promise<ResourceLibraryItem> =>
  request('/api/library/resources/import-from-asset', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const importResourcesFromProjectAssets = (payload: {
  projectId: string;
  storyboardId?: string;
  type?: 'character' | 'scene' | 'prop';
  limit?: number;
  tags?: string[];
}): Promise<ResourceLibraryBatchImportResult> =>
  request('/api/library/resources/import-from-project-assets', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const createAssetFromResource = (
  resourceId: string,
  payload: {
    projectId: string;
    storyboardId: string;
    name?: string;
    prompt?: string;
    imageUrl?: string | null;
  }
): Promise<Asset> =>
  request(`/api/library/resources/${resourceId}/create-asset`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const exportResourceLibraryJson = (input: {
  q?: string;
  type?: 'character' | 'scene' | 'prop';
} = {}): Promise<ResourceLibraryExportJson> =>
  request(`/api/library/resources/export-json?${buildQuery(input)}`);

export const importResourceLibraryJson = (payload: {
  items: Array<{
    type: 'character' | 'scene' | 'prop';
    name: string;
    prompt: string;
    imageUrl?: string | null;
    tags?: string[];
  }>;
  strategy?: 'skip_existing' | 'always_create';
}): Promise<ResourceLibraryImportJsonResult> =>
  request('/api/library/resources/import-json', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getResourceLibraryDuplicates = (): Promise<ResourceLibraryDuplicateGroup[]> =>
  request('/api/library/resources/duplicates');

export const deduplicateResourceLibrary = (payload: {
  strategy?: 'keep_latest' | 'keep_most_used';
} = {}): Promise<ResourceLibraryDeduplicateResult> =>
  request('/api/library/resources/deduplicate', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const resolveResourceLibraryDuplicateGroup = (payload: {
  fingerprint: string;
  strategy?: 'keep_latest' | 'keep_most_used';
}): Promise<ResourceLibraryResolveDuplicateResult> =>
  request('/api/library/resources/duplicates/resolve', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const previewResourceLibraryDuplicateGroup = (input: {
  fingerprint: string;
  strategy?: 'keep_latest' | 'keep_most_used';
}): Promise<ResourceLibraryDuplicatePreview> =>
  request(`/api/library/resources/duplicates/preview?${buildQuery(input)}`);

export const resolveResourceLibraryDuplicateGroupByKeep = (payload: {
  fingerprint: string;
  keepId: string;
}): Promise<ResourceLibraryResolveByKeepResult> =>
  request('/api/library/resources/duplicates/resolve-by-keep', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const undoResourceLibraryDeduplicate = (): Promise<ResourceLibraryDeduplicateUndoResult> =>
  request('/api/library/resources/deduplicate/undo', {
    method: 'POST'
  });

export const getResourceLibraryDeduplicateUndoStack = (): Promise<ResourceLibraryDeduplicateUndoEntry[]> =>
  request('/api/library/resources/deduplicate/undo-stack');

export const getResourceLibraryDeduplicateUndoDetail = (entryId: string): Promise<ResourceLibraryDeduplicateUndoDetail> =>
  request(`/api/library/resources/deduplicate/undo-stack/${entryId}`);

export const deleteResourceLibraryDeduplicateUndoEntry = (entryId: string): Promise<void> =>
  request(`/api/library/resources/deduplicate/undo-stack/${entryId}`, {
    method: 'DELETE'
  });

export const clearResourceLibraryDeduplicateUndoStack = (): Promise<{ cleared: number }> =>
  request('/api/library/resources/deduplicate/undo-stack', {
    method: 'DELETE'
  });

export const undoResourceLibraryDeduplicateById = (entryId: string): Promise<ResourceLibraryDeduplicateUndoResult> =>
  request('/api/library/resources/deduplicate/undo-by-id', {
    method: 'POST',
    body: JSON.stringify({ entryId })
  });

export const markResourceUsed = (resourceId: string): Promise<ResourceLibraryItem> =>
  request(`/api/library/resources/${resourceId}/use`, {
    method: 'POST'
  });
