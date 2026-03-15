import { v4 as uuid } from 'uuid';
import { Asset, PageResult } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import { nowIso } from '../../utils/time.js';

const RESOURCE_LIBRARY_KEY = 'resource_library_items';
const RESOURCE_LIBRARY_MAX = 5000;
const RESOURCE_LIBRARY_DEDUP_UNDO_KEY = 'resource_library_dedup_undo';
const RESOURCE_LIBRARY_MERGE_AUDIT_KEY = 'resource_library_merge_audits_v1';
const DEDUP_UNDO_WINDOW_MS = 10 * 60 * 1000;
const DEDUP_UNDO_STACK_MAX = 20;
const RESOURCE_LIBRARY_APPLY_AUDIT_KEY_PREFIX = 'resource_library_apply_audit_v1:';
const RESOURCE_LIBRARY_APPLY_AUDIT_MAX = 500;
const RESOURCE_LIBRARY_MERGE_AUDIT_MAX = 500;

export type ResourceLibraryItem = {
  id: string;
  type: 'character' | 'scene' | 'prop';
  name: string;
  prompt: string;
  imageUrl: string | null;
  tags: string[];
  sourceProjectId: string | null;
  sourceAssetId: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResourceLibraryDuplicateGroup = {
  fingerprint: string;
  type: 'character' | 'scene' | 'prop';
  name: string;
  prompt: string;
  count: number;
  ids: string[];
};

export type ResourceLibraryConflictGroup = {
  conflictKey: string;
  conflictKind: 'fingerprint' | 'source' | 'name';
  type: 'character' | 'scene' | 'prop';
  name: string;
  prompt: string;
  count: number;
  ids: string[];
  sourceProjectId: string | null;
  sourceAssetId: string | null;
};

export type ResourceLibraryDuplicateCandidate = {
  id: string;
  usageCount: number;
  updatedAt: string;
  lastUsedAt: string | null;
  sourceProjectId: string | null;
  sourceAssetId: string | null;
  sourceStoryboardId: string | null;
  sourceStoryboardTitle: string | null;
};

type ResourceLibraryDedupUndoSnapshot = {
  id: string;
  createdAt: string;
  removedItems: ResourceLibraryItem[];
};

export type ResourceLibraryDedupUndoEntrySummary = {
  id: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  removedCount: number;
};

export type ResourceLibraryDedupUndoRemovedItem = {
  id: string;
  type: 'character' | 'scene' | 'prop';
  name: string;
  prompt: string;
  usageCount: number;
  updatedAt: string;
};

export type ResourceLibraryDedupUndoEntryDetail = {
  id: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  removedCount: number;
  removedItems: ResourceLibraryDedupUndoRemovedItem[];
};

export type ResourceLibraryApplyAuditEntry = {
  id: string;
  createdAt: string;
  projectId: string;
  episodeId: string;
  resourceId: string;
  mode: 'missing_only' | 'all';
  createdCount: number;
  skippedCount: number;
  totalStoryboards: number;
};

export type ResourceLibraryMergeAuditEntry = {
  id: string;
  createdAt: string;
  strategy: 'keep_latest' | 'keep_most_used' | 'manual_keep';
  conflictKind: 'fingerprint' | 'source' | 'name';
  conflictKey: string;
  keepId: string;
  removedIds: string[];
};

export class LibraryService {
  constructor(private readonly store: SqliteStore) {}

  listResourcesPaged(input: {
    q?: string;
    type?: 'character' | 'scene' | 'prop';
    page: number;
    pageSize: number;
  }): PageResult<ResourceLibraryItem> {
    const q = input.q?.trim().toLowerCase();
    const all = this.readItems();
    const filtered = all.filter((item) => {
      if (input.type && item.type !== input.type) {
        return false;
      }
      if (q) {
        const tags = item.tags.join(' ');
        const haystack = `${item.name} ${item.prompt} ${tags}`.toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }
      return true;
    });
    const page = Math.max(1, Math.floor(input.page));
    const pageSize = Math.max(1, Math.min(100, Math.floor(input.pageSize)));
    const offset = (page - 1) * pageSize;
    return {
      items: filtered.slice(offset, offset + pageSize),
      total: filtered.length,
      page,
      pageSize
    };
  }

  createResource(input: {
    type: 'character' | 'scene' | 'prop';
    name: string;
    prompt: string;
    imageUrl?: string | null;
    tags?: string[];
    sourceProjectId?: string | null;
    sourceAssetId?: string | null;
  }): ResourceLibraryItem {
    const now = nowIso();
    const item: ResourceLibraryItem = {
      id: uuid(),
      type: input.type,
      name: input.name.trim(),
      prompt: input.prompt.trim(),
      imageUrl: input.imageUrl ?? null,
      tags: this.normalizeTags(input.tags),
      sourceProjectId: input.sourceProjectId ?? null,
      sourceAssetId: input.sourceAssetId ?? null,
      usageCount: 0,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now
    };
    const all = this.readItems();
    all.unshift(item);
    this.writeItems(all);
    return item;
  }

  updateResource(
    id: string,
    input: { name?: string; prompt?: string; imageUrl?: string | null; tags?: string[] }
  ): ResourceLibraryItem | null {
    const all = this.readItems();
    const idx = all.findIndex((item) => item.id === id);
    if (idx < 0) {
      return null;
    }
    const current = all[idx];
    const next: ResourceLibraryItem = {
      ...current,
      name: input.name?.trim() || current.name,
      prompt: input.prompt?.trim() || current.prompt,
      imageUrl: input.imageUrl === undefined ? current.imageUrl : input.imageUrl,
      tags: input.tags ? this.normalizeTags(input.tags) : current.tags,
      updatedAt: nowIso()
    };
    all[idx] = next;
    this.writeItems(all);
    return next;
  }

  deleteResource(id: string): boolean {
    const all = this.readItems();
    const filtered = all.filter((item) => item.id !== id);
    if (filtered.length === all.length) {
      return false;
    }
    this.writeItems(filtered);
    return true;
  }

  importFromProjectAsset(projectId: string, assetId: string, tags?: string[]): ResourceLibraryItem | null {
    const asset = this.store.getAsset(projectId, assetId);
    if (!asset) {
      return null;
    }
    return this.createResource({
      type: asset.type,
      name: asset.name,
      prompt: asset.prompt,
      imageUrl: asset.imageUrl,
      tags,
      sourceProjectId: projectId,
      sourceAssetId: asset.id
    });
  }

  importFromProjectAssetsBatch(input: {
    projectId: string;
    storyboardId?: string;
    type?: 'character' | 'scene' | 'prop';
    limit?: number;
    tags?: string[];
  }): {
    created: ResourceLibraryItem[];
    skippedAssetIds: string[];
    projectAssetCount: number;
  } {
    const assets = this.store.listAssets(input.projectId) ?? [];
    const filtered = assets
      .filter((item) => {
        if (input.storyboardId && item.storyboardId !== input.storyboardId) {
          return false;
        }
        if (input.type && item.type !== input.type) {
          return false;
        }
        return true;
      })
      .slice(0, Math.max(1, Math.min(500, Math.floor(input.limit ?? 100))));
    const all = this.readItems();
    const existingSourceKeys = new Set(
      all
        .filter((item) => item.sourceProjectId && item.sourceAssetId)
        .map((item) => `${item.sourceProjectId}:${item.sourceAssetId}`)
    );
    const created: ResourceLibraryItem[] = [];
    const skippedAssetIds: string[] = [];
    for (const asset of filtered) {
      const key = `${asset.projectId}:${asset.id}`;
      if (existingSourceKeys.has(key)) {
        skippedAssetIds.push(asset.id);
        continue;
      }
      const item = this.createResource({
        type: asset.type,
        name: asset.name,
        prompt: asset.prompt,
        imageUrl: asset.imageUrl,
        tags: input.tags,
        sourceProjectId: asset.projectId,
        sourceAssetId: asset.id
      });
      existingSourceKeys.add(key);
      created.push(item);
    }
    return {
      created,
      skippedAssetIds,
      projectAssetCount: assets.length
    };
  }

  createProjectAssetFromResource(
    resourceId: string,
    input: {
      projectId: string;
      storyboardId: string;
      name?: string;
      prompt?: string;
      imageUrl?: string | null;
    }
  ): Asset | null {
    const all = this.readItems();
    const picked = all.find((item) => item.id === resourceId);
    if (!picked) {
      return null;
    }
    const created = this.store.createAsset({
      id: uuid(),
      projectId: input.projectId,
      storyboardId: input.storyboardId,
      name: input.name?.trim() || picked.name,
      type: picked.type,
      prompt: input.prompt?.trim() || picked.prompt,
      imageUrl: input.imageUrl === undefined ? picked.imageUrl : input.imageUrl
    });
    if (!created) {
      return null;
    }
    this.markResourceUsed(resourceId);
    return created;
  }

  createProjectAssetsByEpisodeFromResource(
    resourceId: string,
    input: {
      projectId: string;
      episodeId: string;
      mode?: 'missing_only' | 'all';
      name?: string;
      prompt?: string;
      imageUrl?: string | null;
    }
  ): {
    created: Asset[];
    skippedStoryboardIds: string[];
    totalStoryboards: number;
  } | null {
    const picked = this.readItems().find((item) => item.id === resourceId);
    if (!picked) {
      return null;
    }
    const storyboards = this.store.listStoryboardsByEpisode(input.projectId, input.episodeId);
    if (!storyboards) {
      return null;
    }
    const mode = input.mode ?? 'missing_only';
    const allAssets = this.store.listAssets(input.projectId) ?? [];
    const created: Asset[] = [];
    const skippedStoryboardIds: string[] = [];

    for (const storyboard of storyboards) {
      const hasSameTypeAndName = allAssets.some(
        (asset) =>
          asset.storyboardId === storyboard.id &&
          asset.type === picked.type &&
          asset.name.trim().toLowerCase() === (input.name?.trim().toLowerCase() || picked.name.trim().toLowerCase())
      );
      if (mode === 'missing_only' && hasSameTypeAndName) {
        skippedStoryboardIds.push(storyboard.id);
        continue;
      }
      const createdAsset = this.store.createAsset({
        id: uuid(),
        projectId: input.projectId,
        storyboardId: storyboard.id,
        name: input.name?.trim() || picked.name,
        type: picked.type,
        prompt: input.prompt?.trim() || picked.prompt,
        imageUrl: input.imageUrl === undefined ? picked.imageUrl : input.imageUrl
      });
      if (!createdAsset) {
        skippedStoryboardIds.push(storyboard.id);
        continue;
      }
      created.push(createdAsset);
      allAssets.push(createdAsset);
    }

    this.markResourceUsed(resourceId);
    const output = {
      created,
      skippedStoryboardIds,
      totalStoryboards: storyboards.length
    };
    this.appendApplyAudit(input.projectId, {
      episodeId: input.episodeId,
      resourceId,
      mode,
      createdCount: created.length,
      skippedCount: skippedStoryboardIds.length,
      totalStoryboards: storyboards.length
    });
    return output;
  }

  previewCreateProjectAssetsByEpisodeFromResource(
    resourceId: string,
    input: {
      projectId: string;
      episodeId: string;
      mode?: 'missing_only' | 'all';
      name?: string;
    }
  ): {
    totalStoryboards: number;
    creatableStoryboardIds: string[];
    conflictStoryboardIds: string[];
    creatableStoryboards: Array<{ id: string; title: string }>;
    conflictStoryboards: Array<{ id: string; title: string }>;
    mode: 'missing_only' | 'all';
  } | null {
    const picked = this.readItems().find((item) => item.id === resourceId);
    if (!picked) {
      return null;
    }
    const storyboards = this.store.listStoryboardsByEpisode(input.projectId, input.episodeId);
    if (!storyboards) {
      return null;
    }
    const mode = input.mode ?? 'missing_only';
    const allAssets = this.store.listAssets(input.projectId) ?? [];
    const targetName = input.name?.trim() || picked.name;
    const creatableStoryboardIds: string[] = [];
    const conflictStoryboardIds: string[] = [];
    const creatableStoryboards: Array<{ id: string; title: string }> = [];
    const conflictStoryboards: Array<{ id: string; title: string }> = [];
    for (const storyboard of storyboards) {
      const exists = allAssets.some(
        (asset) =>
          asset.storyboardId === storyboard.id &&
          asset.type === picked.type &&
          asset.name.trim().toLowerCase() === targetName.trim().toLowerCase()
      );
      if (mode === 'missing_only' && exists) {
        conflictStoryboardIds.push(storyboard.id);
        conflictStoryboards.push({ id: storyboard.id, title: storyboard.title });
        continue;
      }
      creatableStoryboardIds.push(storyboard.id);
      creatableStoryboards.push({ id: storyboard.id, title: storyboard.title });
    }
    return {
      totalStoryboards: storyboards.length,
      creatableStoryboardIds,
      conflictStoryboardIds,
      creatableStoryboards,
      conflictStoryboards,
      mode
    };
  }

  listApplyAudits(projectId: string, limit = 100): ResourceLibraryApplyAuditEntry[] | null {
    if (!this.store.listEpisodes(projectId)) {
      return null;
    }
    return this.readApplyAudits(projectId).slice(0, Math.max(1, Math.min(500, Math.floor(limit))));
  }

  markResourceUsed(id: string): ResourceLibraryItem | null {
    const all = this.readItems();
    const idx = all.findIndex((item) => item.id === id);
    if (idx < 0) {
      return null;
    }
    const next: ResourceLibraryItem = {
      ...all[idx],
      usageCount: all[idx].usageCount + 1,
      lastUsedAt: nowIso(),
      updatedAt: nowIso()
    };
    all[idx] = next;
    this.writeItems(all);
    return next;
  }

  exportResources(input: { q?: string; type?: 'character' | 'scene' | 'prop' }): ResourceLibraryItem[] {
    return this.listResourcesPaged({
      q: input.q,
      type: input.type,
      page: 1,
      pageSize: RESOURCE_LIBRARY_MAX
    }).items;
  }

  importResourcesJson(input: {
    items: Array<{
      type: 'character' | 'scene' | 'prop';
      name: string;
      prompt: string;
      imageUrl?: string | null;
      tags?: string[];
    }>;
    strategy?: 'skip_existing' | 'always_create';
  }): {
    created: ResourceLibraryItem[];
    skipped: number;
  } {
    const strategy = input.strategy ?? 'skip_existing';
    const all = this.readItems();
    const existedFingerprints = new Set(all.map((item) => this.fingerprint(item.type, item.name, item.prompt)));
    const created: ResourceLibraryItem[] = [];
    let skipped = 0;
    for (const item of input.items) {
      const normalizedName = item.name.trim();
      const normalizedPrompt = item.prompt.trim();
      if (!normalizedName || !normalizedPrompt) {
        skipped += 1;
        continue;
      }
      const fingerprint = this.fingerprint(item.type, normalizedName, normalizedPrompt);
      if (strategy === 'skip_existing' && existedFingerprints.has(fingerprint)) {
        skipped += 1;
        continue;
      }
      const inserted = this.createResource({
        type: item.type,
        name: normalizedName,
        prompt: normalizedPrompt,
        imageUrl: item.imageUrl,
        tags: item.tags
      });
      existedFingerprints.add(fingerprint);
      created.push(inserted);
    }
    return { created, skipped };
  }

  listDuplicateGroups(): ResourceLibraryDuplicateGroup[] {
    const all = this.readItems();
    const bucket = new Map<string, ResourceLibraryItem[]>();
    for (const item of all) {
      const key = this.fingerprint(item.type, item.name, item.prompt);
      const list = bucket.get(key) ?? [];
      list.push(item);
      bucket.set(key, list);
    }
    return [...bucket.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([fingerprint, items]) => ({
        fingerprint,
        type: items[0].type,
        name: items[0].name,
        prompt: items[0].prompt,
        count: items.length,
        ids: items.map((item) => item.id)
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  deduplicateResources(input: { strategy?: 'keep_latest' | 'keep_most_used' } = {}): {
    strategy: 'keep_latest' | 'keep_most_used';
    groups: number;
    removed: number;
    removedIds: string[];
  } {
    const strategy = input.strategy ?? 'keep_latest';
    const all = this.readItems();
    const bucket = new Map<string, ResourceLibraryItem[]>();
    for (const item of all) {
      const key = this.fingerprint(item.type, item.name, item.prompt);
      const list = bucket.get(key) ?? [];
      list.push(item);
      bucket.set(key, list);
    }
    const keepIds = new Set<string>();
    const removedIds: string[] = [];
    let groups = 0;
    for (const items of bucket.values()) {
      if (items.length === 1) {
        keepIds.add(items[0].id);
        continue;
      }
      groups += 1;
      const sorted = [...items].sort((a, b) => {
        if (strategy === 'keep_most_used') {
          return b.usageCount - a.usageCount || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        }
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      });
      keepIds.add(sorted[0].id);
      for (let i = 1; i < sorted.length; i += 1) {
        removedIds.push(sorted[i].id);
      }
    }
    const next = all.filter((item) => keepIds.has(item.id));
    this.writeItems(next);
    this.writeDedupUndoSnapshot(all.filter((item) => removedIds.includes(item.id)));
    if (removedIds.length > 0) {
      this.appendMergeAudit({
        strategy,
        conflictKind: 'fingerprint',
        conflictKey: 'batch',
        keepId: '',
        removedIds
      });
    }
    return {
      strategy,
      groups,
      removed: removedIds.length,
      removedIds
    };
  }

  resolveDuplicateGroup(input: {
    fingerprint: string;
    strategy?: 'keep_latest' | 'keep_most_used';
  }): {
    strategy: 'keep_latest' | 'keep_most_used';
    fingerprint: string;
    removed: number;
    removedIds: string[];
  } | null {
    const strategy = input.strategy ?? 'keep_latest';
    const all = this.readItems();
    const group = all.filter((item) => this.fingerprint(item.type, item.name, item.prompt) === input.fingerprint);
    if (group.length <= 1) {
      return null;
    }
    const sorted = [...group].sort((a, b) => {
      if (strategy === 'keep_most_used') {
        return b.usageCount - a.usageCount || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      }
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
    const keepId = sorted[0].id;
    const removedIds = sorted.slice(1).map((item) => item.id);
    this.writeItems(all.filter((item) => item.id === keepId || !removedIds.includes(item.id)));
    this.writeDedupUndoSnapshot(all.filter((item) => removedIds.includes(item.id)));
    this.appendMergeAudit({
      strategy,
      conflictKind: 'fingerprint',
      conflictKey: input.fingerprint,
      keepId,
      removedIds
    });
    return {
      strategy,
      fingerprint: input.fingerprint,
      removed: removedIds.length,
      removedIds
    };
  }

  previewDuplicateGroup(input: {
    fingerprint: string;
    strategy?: 'keep_latest' | 'keep_most_used';
  }): {
    strategy: 'keep_latest' | 'keep_most_used';
    fingerprint: string;
    keepId: string;
    removeIds: string[];
    candidates: ResourceLibraryDuplicateCandidate[];
  } | null {
    const strategy = input.strategy ?? 'keep_latest';
    const all = this.readItems();
    const group = all.filter((item) => this.fingerprint(item.type, item.name, item.prompt) === input.fingerprint);
    if (group.length <= 1) {
      return null;
    }
    const sorted = [...group].sort((a, b) => {
      if (strategy === 'keep_most_used') {
        return b.usageCount - a.usageCount || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      }
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
    return {
      strategy,
      fingerprint: input.fingerprint,
      keepId: sorted[0].id,
      removeIds: sorted.slice(1).map((item) => item.id),
      candidates: sorted.map((item) => ({
        id: item.id,
        usageCount: item.usageCount,
        updatedAt: item.updatedAt,
        lastUsedAt: item.lastUsedAt,
        sourceProjectId: item.sourceProjectId,
        sourceAssetId: item.sourceAssetId,
        ...this.resolveSourceStoryboardInfo(item)
      }))
    };
  }

  resolveDuplicateGroupByKeepId(input: { fingerprint: string; keepId: string }): {
    fingerprint: string;
    keepId: string;
    removed: number;
    removedIds: string[];
  } | null {
    const all = this.readItems();
    const group = all.filter((item) => this.fingerprint(item.type, item.name, item.prompt) === input.fingerprint);
    if (group.length <= 1 || !group.some((item) => item.id === input.keepId)) {
      return null;
    }
    const removedIds = group.filter((item) => item.id !== input.keepId).map((item) => item.id);
    this.writeItems(all.filter((item) => item.id === input.keepId || !removedIds.includes(item.id)));
    this.writeDedupUndoSnapshot(all.filter((item) => removedIds.includes(item.id)));
    this.appendMergeAudit({
      strategy: 'manual_keep',
      conflictKind: 'fingerprint',
      conflictKey: input.fingerprint,
      keepId: input.keepId,
      removedIds
    });
    return {
      fingerprint: input.fingerprint,
      keepId: input.keepId,
      removed: removedIds.length,
      removedIds
    };
  }

  undoLastDeduplicate(): {
    restored: number;
    expired: boolean;
    entryId: string | null;
  } {
    const snapshot = this.readDedupUndoStack()[0] ?? null;
    if (!snapshot || snapshot.removedItems.length === 0) {
      return { restored: 0, expired: false, entryId: null };
    }
    return this.undoFromSnapshot(snapshot);
  }

  undoDeduplicateByEntryId(entryId: string): {
    restored: number;
    expired: boolean;
    entryId: string | null;
  } | null {
    const snapshot = this.readDedupUndoStack().find((item) => item.id === entryId);
    if (!snapshot) {
      return null;
    }
    return this.undoFromSnapshot(snapshot);
  }

  listConflictGroups(input?: {
    kind?: 'fingerprint' | 'source' | 'name';
    type?: 'character' | 'scene' | 'prop';
    q?: string;
    page?: number;
    pageSize?: number;
  }): PageResult<ResourceLibraryConflictGroup> {
    const all = this.readItems();
    const q = input?.q?.trim().toLowerCase();
    const groups: ResourceLibraryConflictGroup[] = [];
    const buildGroups = (kind: 'fingerprint' | 'source' | 'name', keyFn: (item: ResourceLibraryItem) => string | null): void => {
      const bucket = new Map<string, ResourceLibraryItem[]>();
      for (const item of all) {
        if (input?.type && item.type !== input.type) {
          continue;
        }
        const key = keyFn(item);
        if (!key) continue;
        const list = bucket.get(key) ?? [];
        list.push(item);
        bucket.set(key, list);
      }
      for (const [key, items] of bucket.entries()) {
        if (items.length <= 1) continue;
        const first = items[0];
        const haystack = `${first.name} ${first.prompt}`.toLowerCase();
        if (q && !haystack.includes(q)) continue;
        groups.push({
          conflictKey: key,
          conflictKind: kind,
          type: first.type,
          name: first.name,
          prompt: first.prompt,
          count: items.length,
          ids: items.map((item) => item.id),
          sourceProjectId: first.sourceProjectId,
          sourceAssetId: first.sourceAssetId
        });
      }
    };
    if (!input?.kind || input.kind === 'fingerprint') {
      buildGroups('fingerprint', (item) => this.fingerprint(item.type, item.name, item.prompt));
    }
    if (!input?.kind || input.kind === 'source') {
      buildGroups('source', (item) => (item.sourceProjectId && item.sourceAssetId ? `${item.type}::${item.sourceProjectId}::${item.sourceAssetId}` : null));
    }
    if (!input?.kind || input.kind === 'name') {
      buildGroups('name', (item) => `${item.type}::${item.name.trim().toLowerCase()}`);
    }
    const sorted = groups.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const page = Math.max(1, Math.floor(input?.page ?? 1));
    const pageSize = Math.max(1, Math.min(200, Math.floor(input?.pageSize ?? 20)));
    const offset = (page - 1) * pageSize;
    return {
      items: sorted.slice(offset, offset + pageSize),
      total: sorted.length,
      page,
      pageSize
    };
  }

  previewConflictGroup(input: {
    conflictKind: 'fingerprint' | 'source' | 'name';
    conflictKey: string;
    strategy?: 'keep_latest' | 'keep_most_used';
  }): {
    strategy: 'keep_latest' | 'keep_most_used';
    conflictKind: 'fingerprint' | 'source' | 'name';
    conflictKey: string;
    keepId: string;
    removeIds: string[];
    candidates: ResourceLibraryDuplicateCandidate[];
  } | null {
    const strategy = input.strategy ?? 'keep_latest';
    const group = this.pickConflictGroupItems(input.conflictKind, input.conflictKey);
    if (group.length <= 1) {
      return null;
    }
    const sorted = [...group].sort((a, b) => {
      if (strategy === 'keep_most_used') {
        return b.usageCount - a.usageCount || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      }
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
    return {
      strategy,
      conflictKind: input.conflictKind,
      conflictKey: input.conflictKey,
      keepId: sorted[0].id,
      removeIds: sorted.slice(1).map((item) => item.id),
      candidates: sorted.map((item) => ({
        id: item.id,
        usageCount: item.usageCount,
        updatedAt: item.updatedAt,
        lastUsedAt: item.lastUsedAt,
        sourceProjectId: item.sourceProjectId,
        sourceAssetId: item.sourceAssetId,
        ...this.resolveSourceStoryboardInfo(item)
      }))
    };
  }

  resolveConflictGroup(input: {
    conflictKind: 'fingerprint' | 'source' | 'name';
    conflictKey: string;
    strategy?: 'keep_latest' | 'keep_most_used' | 'manual_keep';
    keepId?: string;
  }): {
    strategy: 'keep_latest' | 'keep_most_used' | 'manual_keep';
    conflictKind: 'fingerprint' | 'source' | 'name';
    conflictKey: string;
    keepId: string;
    removed: number;
    removedIds: string[];
  } | null {
    const strategy = input.strategy ?? 'keep_latest';
    const all = this.readItems();
    const group = this.pickConflictGroupItems(input.conflictKind, input.conflictKey, all);
    if (group.length <= 1) {
      return null;
    }
    let keepId = '';
    if (strategy === 'manual_keep') {
      if (!input.keepId || !group.some((item) => item.id === input.keepId)) {
        return null;
      }
      keepId = input.keepId;
    } else {
      const sorted = [...group].sort((a, b) => {
        if (strategy === 'keep_most_used') {
          return b.usageCount - a.usageCount || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        }
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      });
      keepId = sorted[0].id;
    }
    const removedIds = group.filter((item) => item.id !== keepId).map((item) => item.id);
    this.writeItems(all.filter((item) => item.id === keepId || !removedIds.includes(item.id)));
    this.writeDedupUndoSnapshot(all.filter((item) => removedIds.includes(item.id)));
    this.appendMergeAudit({
      strategy,
      conflictKind: input.conflictKind,
      conflictKey: input.conflictKey,
      keepId,
      removedIds
    });
    return {
      strategy,
      conflictKind: input.conflictKind,
      conflictKey: input.conflictKey,
      keepId,
      removed: removedIds.length,
      removedIds
    };
  }

  listMergeAudits(input?: {
    limit?: number;
    strategy?: 'keep_latest' | 'keep_most_used' | 'manual_keep';
    conflictKind?: 'fingerprint' | 'source' | 'name';
    startAt?: string;
    endAt?: string;
    keepId?: string;
    removedId?: string;
    q?: string;
  }): ResourceLibraryMergeAuditEntry[] {
    const limit = Math.max(1, Math.min(1000, Math.floor(input?.limit ?? 200)));
    const startAtMs = input?.startAt ? Date.parse(input.startAt) : NaN;
    const endAtMs = input?.endAt ? Date.parse(input.endAt) : NaN;
    const q = input?.q?.trim().toLowerCase();
    return this.readMergeAudits()
      .filter((item) => {
        if (input?.strategy && item.strategy !== input.strategy) return false;
        if (input?.conflictKind && item.conflictKind !== input.conflictKind) return false;
        if (input?.keepId?.trim() && item.keepId !== input.keepId.trim()) return false;
        if (input?.removedId?.trim() && !item.removedIds.includes(input.removedId.trim())) return false;
        const createdAtMs = Date.parse(item.createdAt);
        if (Number.isFinite(startAtMs) && createdAtMs < startAtMs) return false;
        if (Number.isFinite(endAtMs) && createdAtMs > endAtMs) return false;
        if (q) {
          const haystack = `${item.conflictKey} ${item.keepId} ${item.removedIds.join(' ')}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .slice(0, limit);
  }

  exportMergeAuditsCsv(input?: {
    strategy?: 'keep_latest' | 'keep_most_used' | 'manual_keep';
    conflictKind?: 'fingerprint' | 'source' | 'name';
    startAt?: string;
    endAt?: string;
    keepId?: string;
    removedId?: string;
    q?: string;
  }): string {
    const items = this.listMergeAudits({
      ...input,
      limit: 5000
    });
    const escapeCsv = (value: unknown): string => {
      const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
      if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };
    const header = ['id', 'createdAt', 'strategy', 'conflictKind', 'conflictKey', 'keepId', 'removedCount', 'removedIds'];
    const rows = items.map((item) =>
      [
        item.id,
        item.createdAt,
        item.strategy,
        item.conflictKind,
        item.conflictKey,
        item.keepId,
        item.removedIds.length,
        JSON.stringify(item.removedIds)
      ]
        .map((cell) => escapeCsv(cell))
        .join(',')
    );
    return [header.join(','), ...rows].join('\n');
  }

  listDedupUndoStack(): ResourceLibraryDedupUndoEntrySummary[] {
    return this.readDedupUndoStack().map((item) => {
      const { expiresAt, expired } = this.calculateUndoEntryExpiry(item.createdAt);
      return {
        id: item.id,
        createdAt: item.createdAt,
        expiresAt,
        expired,
        removedCount: item.removedItems.length
      };
    });
  }

  getDedupUndoEntryDetail(entryId: string): ResourceLibraryDedupUndoEntryDetail | null {
    const snapshot = this.readDedupUndoStack().find((item) => item.id === entryId);
    if (!snapshot) {
      return null;
    }
    const { expiresAt, expired } = this.calculateUndoEntryExpiry(snapshot.createdAt);
    return {
      id: snapshot.id,
      createdAt: snapshot.createdAt,
      expiresAt,
      expired,
      removedCount: snapshot.removedItems.length,
      removedItems: snapshot.removedItems.map((item) => ({
        id: item.id,
        type: item.type,
        name: item.name,
        prompt: item.prompt,
        usageCount: item.usageCount,
        updatedAt: item.updatedAt
      }))
    };
  }

  deleteDedupUndoEntry(entryId: string): boolean {
    const stack = this.readDedupUndoStack();
    const next = stack.filter((item) => item.id !== entryId);
    if (next.length === stack.length) {
      return false;
    }
    this.store.setSystemSetting(RESOURCE_LIBRARY_DEDUP_UNDO_KEY, JSON.stringify(next));
    return true;
  }

  clearDedupUndoStack(): number {
    const stack = this.readDedupUndoStack();
    this.store.setSystemSetting(RESOURCE_LIBRARY_DEDUP_UNDO_KEY, JSON.stringify([]));
    return stack.length;
  }

  private readItems(): ResourceLibraryItem[] {
    const raw = this.store.getSystemSetting(RESOURCE_LIBRARY_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => this.normalizeItem(item))
        .filter((item): item is ResourceLibraryItem => item !== null)
        .slice(0, RESOURCE_LIBRARY_MAX)
        .sort((a, b) => {
          const aUsed = a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0;
          const bUsed = b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0;
          return bUsed - aUsed || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        });
    } catch {
      return [];
    }
  }

  private writeItems(input: ResourceLibraryItem[]): void {
    const next = [...input]
      .slice(0, RESOURCE_LIBRARY_MAX)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    this.store.setSystemSetting(RESOURCE_LIBRARY_KEY, JSON.stringify(next));
  }

  private normalizeItem(input: unknown): ResourceLibraryItem | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }
    const node = input as Record<string, unknown>;
    const type = node.type;
    if (type !== 'character' && type !== 'scene' && type !== 'prop') {
      return null;
    }
    const name = typeof node.name === 'string' ? node.name.trim() : '';
    const prompt = typeof node.prompt === 'string' ? node.prompt.trim() : '';
    if (!name || !prompt) {
      return null;
    }
    const now = nowIso();
    return {
      id: typeof node.id === 'string' && node.id ? node.id : uuid(),
      type,
      name,
      prompt,
      imageUrl: typeof node.imageUrl === 'string' ? node.imageUrl : null,
      tags: Array.isArray(node.tags) ? node.tags.filter((item): item is string => typeof item === 'string').slice(0, 12) : [],
      sourceProjectId: typeof node.sourceProjectId === 'string' ? node.sourceProjectId : null,
      sourceAssetId: typeof node.sourceAssetId === 'string' ? node.sourceAssetId : null,
      usageCount: typeof node.usageCount === 'number' && Number.isFinite(node.usageCount) ? Math.max(0, Math.floor(node.usageCount)) : 0,
      lastUsedAt: typeof node.lastUsedAt === 'string' ? node.lastUsedAt : null,
      createdAt: typeof node.createdAt === 'string' ? node.createdAt : now,
      updatedAt: typeof node.updatedAt === 'string' ? node.updatedAt : now
    };
  }

  private normalizeTags(input?: string[]): string[] {
    if (!Array.isArray(input)) {
      return [];
    }
    return [...new Set(input.map((item) => item.trim()).filter((item) => item.length > 0))].slice(0, 12);
  }

  private fingerprint(type: 'character' | 'scene' | 'prop', name: string, prompt: string): string {
    return `${type}::${name.trim().toLowerCase()}::${prompt.trim().toLowerCase()}`;
  }

  private pickConflictGroupItems(
    conflictKind: 'fingerprint' | 'source' | 'name',
    conflictKey: string,
    allInput?: ResourceLibraryItem[]
  ): ResourceLibraryItem[] {
    const all = allInput ?? this.readItems();
    if (conflictKind === 'fingerprint') {
      return all.filter((item) => this.fingerprint(item.type, item.name, item.prompt) === conflictKey);
    }
    if (conflictKind === 'source') {
      return all.filter((item) => item.sourceProjectId && item.sourceAssetId && `${item.type}::${item.sourceProjectId}::${item.sourceAssetId}` === conflictKey);
    }
    return all.filter((item) => `${item.type}::${item.name.trim().toLowerCase()}` === conflictKey);
  }

  private readDedupUndoStack(): ResourceLibraryDedupUndoSnapshot[] {
    const raw = this.store.getSystemSetting(RESOURCE_LIBRARY_DEDUP_UNDO_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => this.normalizeDedupUndoEntry(entry))
          .filter((entry): entry is ResourceLibraryDedupUndoSnapshot => entry !== null)
          .slice(0, DEDUP_UNDO_STACK_MAX);
      }
      const legacyOne = this.normalizeDedupUndoEntry(parsed);
      if (!legacyOne) {
        return [];
      }
      return [legacyOne];
    } catch {
      return [];
    }
  }

  private writeDedupUndoSnapshot(removedItems: ResourceLibraryItem[]): void {
    const item: ResourceLibraryDedupUndoSnapshot = {
      id: uuid(),
      createdAt: nowIso(),
      removedItems
    };
    const stack = this.readDedupUndoStack();
    const payload = [item, ...stack].slice(0, DEDUP_UNDO_STACK_MAX);
    this.store.setSystemSetting(RESOURCE_LIBRARY_DEDUP_UNDO_KEY, JSON.stringify(payload));
  }

  private removeDedupUndoEntry(entryId: string): void {
    const next = this.readDedupUndoStack().filter((item) => item.id !== entryId);
    this.store.setSystemSetting(RESOURCE_LIBRARY_DEDUP_UNDO_KEY, JSON.stringify(next));
  }

  private normalizeDedupUndoEntry(input: unknown): ResourceLibraryDedupUndoSnapshot | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }
    const node = input as Record<string, unknown>;
    const createdAt = typeof node.createdAt === 'string' ? node.createdAt : '';
    const removedItemsRaw = Array.isArray(node.removedItems) ? node.removedItems : [];
    const removedItems = removedItemsRaw
      .map((item) => this.normalizeItem(item))
      .filter((item): item is ResourceLibraryItem => item !== null);
    if (!createdAt) {
      return null;
    }
    return {
      id: typeof node.id === 'string' && node.id ? node.id : uuid(),
      createdAt,
      removedItems
    };
  }

  private undoFromSnapshot(snapshot: ResourceLibraryDedupUndoSnapshot): {
    restored: number;
    expired: boolean;
    entryId: string | null;
  } {
    const { expired } = this.calculateUndoEntryExpiry(snapshot.createdAt);
    if (expired) {
      this.removeDedupUndoEntry(snapshot.id);
      return { restored: 0, expired: true, entryId: snapshot.id };
    }
    const all = this.readItems();
    const existingIds = new Set(all.map((item) => item.id));
    const toRestore = snapshot.removedItems.filter((item) => !existingIds.has(item.id));
    if (toRestore.length === 0) {
      this.removeDedupUndoEntry(snapshot.id);
      return { restored: 0, expired: false, entryId: snapshot.id };
    }
    this.writeItems([...all, ...toRestore]);
    this.removeDedupUndoEntry(snapshot.id);
    return {
      restored: toRestore.length,
      expired: false,
      entryId: snapshot.id
    };
  }

  private calculateUndoEntryExpiry(createdAt: string): { expiresAt: string; expired: boolean } {
    const nowMs = Date.now();
    const createdAtMs = Date.parse(createdAt);
    const expiresAtMs = Number.isFinite(createdAtMs) ? createdAtMs + DEDUP_UNDO_WINDOW_MS : nowMs;
    return {
      expiresAt: new Date(expiresAtMs).toISOString(),
      expired: expiresAtMs <= nowMs
    };
  }

  private getApplyAuditKey(projectId: string): string {
    return `${RESOURCE_LIBRARY_APPLY_AUDIT_KEY_PREFIX}${projectId}`;
  }

  private readApplyAudits(projectId: string): ResourceLibraryApplyAuditEntry[] {
    const raw = this.store.getSystemSetting(this.getApplyAuditKey(projectId));
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => this.normalizeApplyAuditEntry(item))
        .filter((item): item is ResourceLibraryApplyAuditEntry => item !== null)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } catch {
      return [];
    }
  }

  private appendApplyAudit(
    projectId: string,
    input: {
      episodeId: string;
      resourceId: string;
      mode: 'missing_only' | 'all';
      createdCount: number;
      skippedCount: number;
      totalStoryboards: number;
    }
  ): void {
    const item: ResourceLibraryApplyAuditEntry = {
      id: uuid(),
      createdAt: nowIso(),
      projectId,
      episodeId: input.episodeId,
      resourceId: input.resourceId,
      mode: input.mode,
      createdCount: Math.max(0, Math.floor(input.createdCount)),
      skippedCount: Math.max(0, Math.floor(input.skippedCount)),
      totalStoryboards: Math.max(0, Math.floor(input.totalStoryboards))
    };
    const next = [item, ...this.readApplyAudits(projectId)].slice(0, RESOURCE_LIBRARY_APPLY_AUDIT_MAX);
    this.store.setSystemSetting(this.getApplyAuditKey(projectId), JSON.stringify(next));
  }

  private readMergeAudits(): ResourceLibraryMergeAuditEntry[] {
    const raw = this.store.getSystemSetting(RESOURCE_LIBRARY_MERGE_AUDIT_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => this.normalizeMergeAuditEntry(item))
        .filter((item): item is ResourceLibraryMergeAuditEntry => item !== null)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } catch {
      return [];
    }
  }

  private appendMergeAudit(input: {
    strategy: 'keep_latest' | 'keep_most_used' | 'manual_keep';
    conflictKind: 'fingerprint' | 'source' | 'name';
    conflictKey: string;
    keepId: string;
    removedIds: string[];
  }): void {
    const item: ResourceLibraryMergeAuditEntry = {
      id: uuid(),
      createdAt: nowIso(),
      strategy: input.strategy,
      conflictKind: input.conflictKind,
      conflictKey: input.conflictKey,
      keepId: input.keepId,
      removedIds: [...new Set(input.removedIds)]
    };
    const next = [item, ...this.readMergeAudits()].slice(0, RESOURCE_LIBRARY_MERGE_AUDIT_MAX);
    this.store.setSystemSetting(RESOURCE_LIBRARY_MERGE_AUDIT_KEY, JSON.stringify(next));
  }

  private normalizeMergeAuditEntry(input: unknown): ResourceLibraryMergeAuditEntry | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const row = input as Record<string, unknown>;
    const strategy = row.strategy;
    const conflictKind = row.conflictKind;
    if (
      typeof row.id !== 'string' ||
      typeof row.createdAt !== 'string' ||
      (strategy !== 'keep_latest' && strategy !== 'keep_most_used' && strategy !== 'manual_keep') ||
      (conflictKind !== 'fingerprint' && conflictKind !== 'source' && conflictKind !== 'name') ||
      typeof row.conflictKey !== 'string' ||
      typeof row.keepId !== 'string' ||
      !Array.isArray(row.removedIds)
  ) {
      return null;
    }
    const removedIds = row.removedIds.filter((item): item is string => typeof item === 'string');
    return {
      id: row.id,
      createdAt: row.createdAt,
      strategy,
      conflictKind,
      conflictKey: row.conflictKey,
      keepId: row.keepId,
      removedIds
    };
  }

  private resolveSourceStoryboardInfo(item: ResourceLibraryItem): {
    sourceStoryboardId: string | null;
    sourceStoryboardTitle: string | null;
  } {
    if (!item.sourceProjectId || !item.sourceAssetId) {
      return {
        sourceStoryboardId: null,
        sourceStoryboardTitle: null
      };
    }
    const sourceAsset = this.store.getAsset(item.sourceProjectId, item.sourceAssetId);
    if (!sourceAsset) {
      return {
        sourceStoryboardId: null,
        sourceStoryboardTitle: null
      };
    }
    const storyboard = this.store.getStoryboard(item.sourceProjectId, sourceAsset.storyboardId);
    return {
      sourceStoryboardId: sourceAsset.storyboardId,
      sourceStoryboardTitle: storyboard?.title ?? null
    };
  }

  private normalizeApplyAuditEntry(input: unknown): ResourceLibraryApplyAuditEntry | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }
    const row = input as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      typeof row.createdAt !== 'string' ||
      typeof row.projectId !== 'string' ||
      typeof row.episodeId !== 'string' ||
      typeof row.resourceId !== 'string' ||
      (row.mode !== 'missing_only' && row.mode !== 'all')
    ) {
      return null;
    }
    return {
      id: row.id,
      createdAt: row.createdAt,
      projectId: row.projectId,
      episodeId: row.episodeId,
      resourceId: row.resourceId,
      mode: row.mode,
      createdCount: typeof row.createdCount === 'number' ? Math.max(0, Math.floor(row.createdCount)) : 0,
      skippedCount: typeof row.skippedCount === 'number' ? Math.max(0, Math.floor(row.skippedCount)) : 0,
      totalStoryboards: typeof row.totalStoryboards === 'number' ? Math.max(0, Math.floor(row.totalStoryboards)) : 0
    };
  }
}
