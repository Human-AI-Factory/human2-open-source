import { v4 as uuid } from 'uuid';
import {
  DramaDomain,
  EpisodeDomain,
  EpisodeImportFromScriptsResult,
  EpisodeWorkflowAudit,
  EpisodeWorkflowState,
  EpisodeWorkflowStatus,
  ProjectWorkflowSummary,
  Script,
  Storyboard,
} from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import { buildDomainModelView, canAssignStoryboardEpisode, DomainModelView } from './domain-model.js';

const WORKFLOW_TRANSITION_UNDO_STACK_KEY = 'workflow_transition_undo_stack_v1';
const WORKFLOW_TRANSITION_UNDO_WINDOW_MS = 10 * 60 * 1000;
const WORKFLOW_TRANSITION_UNDO_STACK_MAX = 20;
const WORKFLOW_OP_LOGS_KEY_PREFIX = 'workflow_op_logs_v1:';
const WORKFLOW_OP_LOGS_MAX = 200;

type WorkflowTransitionUndoEntry = {
  id: string;
  projectId: string;
  actor: string;
  comment: string;
  createdAt: string;
  expiresAt: string;
  toStatus: EpisodeWorkflowStatus;
  items: Array<{
    episodeId: string;
    fromStatus: EpisodeWorkflowStatus;
    toStatus: EpisodeWorkflowStatus;
  }>;
};

type WorkflowOpLogEntry = {
  id: string;
  time: string;
  action: string;
  estimated: string;
  actual: string;
  note?: string;
};

export class DramaWorkflowService {
  constructor(private readonly store: SqliteStore) {}

  getDrama(projectId: string): DramaDomain | null {
    return this.store.getDramaByProject(projectId);
  }

  getDramaById(dramaId: string): DramaDomain | null {
    return this.store.getDramaById(dramaId);
  }

  getProjectWorkflowSummary(projectId: string): ProjectWorkflowSummary | null {
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
      videoMergeDone: videoMerges.filter((item) => item.status === 'done').length,
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
        progressPercent,
      },
    };
  }

  getDramaWorkflowSummary(dramaId: string): ProjectWorkflowSummary | null {
    const drama = this.store.getDramaById(dramaId);
    if (!drama) {
      return null;
    }
    return this.getProjectWorkflowSummary(drama.projectId);
  }

  listDramas(): DramaDomain[] {
    return this.store.listDramas();
  }

  upsertDrama(projectId: string, input: { name: string; description?: string }): DramaDomain | null {
    return this.store.upsertDrama({
      id: uuid(),
      projectId,
      name: input.name.trim(),
      description: input.description?.trim() || '',
    });
  }

  listEpisodes(projectId: string): EpisodeDomain[] | null {
    return this.store.listEpisodes(projectId);
  }

  listEpisodesByDrama(dramaId: string): EpisodeDomain[] | null {
    return this.store.listEpisodesByDrama(dramaId);
  }

  getDomainModel(projectId: string): DomainModelView | null {
    const episodes = this.store.listEpisodes(projectId);
    const scripts = this.store.listScripts(projectId);
    const storyboards = this.store.listStoryboards(projectId);
    if (!episodes || !scripts || !storyboards) {
      return null;
    }
    return buildDomainModelView({
      projectId,
      drama: this.store.getDramaByProject(projectId),
      episodes,
      scripts,
      storyboards,
      episodeAssetRelations: episodes.flatMap((episode) => this.store.listEpisodeAssetRelations(projectId, episode.id) ?? []),
    });
  }

  createEpisode(projectId: string, input: { dramaId: string; title: string; orderIndex?: number }): EpisodeDomain | null {
    const episodes = this.store.listEpisodes(projectId);
    if (!episodes) {
      return null;
    }
    const orderIndex =
      typeof input.orderIndex === 'number' && Number.isFinite(input.orderIndex) ? Math.max(1, Math.floor(input.orderIndex)) : episodes.length + 1;
    return this.store.createEpisode({
      id: uuid(),
      projectId,
      dramaId: input.dramaId,
      title: input.title.trim(),
      orderIndex,
      status: 'draft',
    });
  }

  createEpisodeByDrama(dramaId: string, input: { title: string; orderIndex?: number }): EpisodeDomain | null {
    const drama = this.store.getDramaById(dramaId);
    if (!drama) {
      return null;
    }
    return this.createEpisode(drama.projectId, {
      dramaId,
      title: input.title,
      orderIndex: input.orderIndex,
    });
  }

  updateEpisode(
    projectId: string,
    episodeId: string,
    input: { title?: string; orderIndex?: number; status?: 'draft' | 'ready' | 'published' }
  ): EpisodeDomain | null {
    return this.store.updateEpisode(projectId, episodeId, input);
  }

  updateEpisodeByDrama(
    dramaId: string,
    episodeId: string,
    input: { title?: string; orderIndex?: number; status?: 'draft' | 'ready' | 'published' }
  ): EpisodeDomain | null {
    const drama = this.store.getDramaById(dramaId);
    if (!drama) {
      return null;
    }
    return this.updateEpisode(drama.projectId, episodeId, input);
  }

  importEpisodesFromScriptsByDrama(dramaId: string): EpisodeImportFromScriptsResult | null {
    const drama = this.store.getDramaById(dramaId);
    if (!drama) {
      return null;
    }
    const episodes = this.store.listEpisodes(drama.projectId);
    const scripts = this.store.listScripts(drama.projectId);
    if (!episodes || !scripts) {
      return null;
    }

    const outlines = this.store.listOutlines(drama.projectId) ?? [];
    const outlineOrderById = new Map(outlines.map((item) => [item.id, item.orderIndex]));
    const existingTitles = new Set(episodes.map((item) => item.title.trim()).filter(Boolean));
    const pendingScripts = scripts
      .filter((item) => !item.episodeId)
      .slice()
      .sort((left, right) => {
        const leftOrder = outlineOrderById.get(left.outlineId) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = outlineOrderById.get(right.outlineId) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        const leftTs = Date.parse(left.createdAt);
        const rightTs = Date.parse(right.createdAt);
        if (!Number.isNaN(leftTs) && !Number.isNaN(rightTs) && leftTs !== rightTs) {
          return leftTs - rightTs;
        }
        return left.title.localeCompare(right.title, 'zh-Hans-CN');
      });

    const createdEpisodes: EpisodeDomain[] = [];
    const boundScripts: Script[] = [];
    const skippedScriptIds: string[] = [];
    let nextOrderIndex = episodes.reduce((max, item) => Math.max(max, item.orderIndex), 0) + 1;

    for (const script of pendingScripts) {
      const title = this.buildEpisodeTitleFromScript(script, nextOrderIndex, existingTitles);
      const episode = this.createEpisode(drama.projectId, {
        dramaId: drama.id,
        title,
        orderIndex: nextOrderIndex
      });
      if (!episode) {
        skippedScriptIds.push(script.id);
        continue;
      }
      nextOrderIndex = episode.orderIndex + 1;
      existingTitles.add(episode.title.trim());
      createdEpisodes.push(episode);

      const updatedScript = this.store.updateScriptEpisode(drama.projectId, script.id, episode.id);
      if (!updatedScript) {
        skippedScriptIds.push(script.id);
        continue;
      }
      boundScripts.push(updatedScript);
    }

    return {
      createdEpisodes,
      boundScripts,
      skippedScriptIds
    };
  }

  deleteEpisode(projectId: string, episodeId: string): boolean {
    return this.store.deleteEpisode(projectId, episodeId);
  }

  assignStoryboardToEpisode(projectId: string, storyboardId: string, episodeId: string | null): Storyboard | null {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    const episodes = this.store.listEpisodes(projectId);
    const scripts = this.store.listScripts(projectId);
    if (!storyboard || !episodes || !scripts) {
      return null;
    }
    if (!canAssignStoryboardEpisode({ storyboard, targetEpisodeId: episodeId, episodes, scripts })) {
      return null;
    }
    const updated = this.store.updateStoryboard(projectId, storyboardId, { episodeId });
    if (!updated) {
      return null;
    }
    const script = scripts.find((item) => item.id === storyboard.scriptId);
    if (script && !script.episodeId && episodeId) {
      this.store.updateScriptEpisode(projectId, script.id, episodeId);
    }
    return updated;
  }

  listEpisodeStoryboards(projectId: string, episodeId: string): Storyboard[] | null {
    return this.store.listStoryboardsByEpisode(projectId, episodeId);
  }

  private buildEpisodeTitleFromScript(script: Script, orderIndex: number, existingTitles: Set<string>): string {
    const stripped = script.title.replace(/\s*-\s*脚本\s*$/u, '').trim();
    const fallback = stripped || `第 ${orderIndex} 集`;
    if (!existingTitles.has(fallback)) {
      return fallback;
    }
    let attempt = 2;
    while (existingTitles.has(`${fallback}（${attempt}）`)) {
      attempt += 1;
    }
    return `${fallback}（${attempt}）`;
  }

  getEpisodeWorkflowState(projectId: string, episodeId: string): EpisodeWorkflowState | null {
    return this.store.getEpisodeWorkflowState(projectId, episodeId);
  }

  transitionEpisodeWorkflow(
    projectId: string,
    episodeId: string,
    input: { toStatus: EpisodeWorkflowStatus; actor: string; comment?: string }
  ): { state: EpisodeWorkflowState | null; reason: 'not_found' | 'invalid_transition' | null } {
    const episode = this.store.getEpisodeById(projectId, episodeId);
    if (!episode) {
      return { state: null, reason: 'not_found' };
    }
    const state = this.store.transitionEpisodeWorkflow(projectId, episodeId, input);
    if (!state) {
      return { state: null, reason: 'invalid_transition' };
    }
    return { state, reason: null };
  }

  listEpisodeWorkflowAudits(projectId: string, episodeId: string, limit?: number): EpisodeWorkflowAudit[] | null {
    return this.store.listEpisodeWorkflowAudits(projectId, episodeId, limit);
  }

  listProjectWorkflowEpisodes(
    projectId: string,
    input: {
      status?: EpisodeWorkflowStatus;
      q?: string;
      page: number;
      pageSize: number;
    }
  ): {
    items: Array<{
      episode: EpisodeDomain;
      workflow: EpisodeWorkflowState;
      storyboardCount: number;
      lastAuditAt: string | null;
    }>;
    total: number;
    page: number;
    pageSize: number;
  } | null {
    const episodes = this.store.listEpisodes(projectId);
    if (!episodes) {
      return null;
    }
    const q = input.q?.trim().toLowerCase();
    const rows = episodes
      .map((episode) => {
        const workflow = this.store.getEpisodeWorkflowState(projectId, episode.id);
        const audits = this.store.listEpisodeWorkflowAudits(projectId, episode.id, 1) ?? [];
        const storyboards = this.store.listStoryboardsByEpisode(projectId, episode.id) ?? [];
        return {
          episode,
          workflow:
            workflow ?? {
              projectId,
              episodeId: episode.id,
              status: 'draft',
              updatedAt: episode.updatedAt,
            },
          storyboardCount: storyboards.length,
          lastAuditAt: audits[0]?.createdAt ?? null,
        };
      })
      .filter((item) => {
        if (input.status && item.workflow.status !== input.status) {
          return false;
        }
        if (q) {
          const content = `${item.episode.title} ${item.episode.id}`.toLowerCase();
          if (!content.includes(q)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => a.episode.orderIndex - b.episode.orderIndex || Date.parse(a.episode.createdAt) - Date.parse(b.episode.createdAt));

    const page = Math.max(1, Math.floor(input.page));
    const pageSize = Math.max(1, Math.min(200, Math.floor(input.pageSize)));
    const offset = (page - 1) * pageSize;
    return {
      items: rows.slice(offset, offset + pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  }

  transitionProjectWorkflowEpisodesBatch(
    projectId: string,
    input: { episodeIds: string[]; toStatus: EpisodeWorkflowStatus; actor: string; comment?: string }
  ): {
    updated: EpisodeWorkflowState[];
    invalidTransitionIds: string[];
    notFoundIds: string[];
    undoEntryId: string | null;
  } | null {
    const episodes = this.store.listEpisodes(projectId);
    if (!episodes) {
      return null;
    }
    const episodeIdSet = new Set(episodes.map((item) => item.id));
    const updated: EpisodeWorkflowState[] = [];
    const invalidTransitionIds: string[] = [];
    const notFoundIds: string[] = [];
    const changedItems: WorkflowTransitionUndoEntry['items'] = [];

    for (const episodeId of input.episodeIds) {
      if (!episodeIdSet.has(episodeId)) {
        notFoundIds.push(episodeId);
        continue;
      }
      const before = this.store.getEpisodeWorkflowState(projectId, episodeId);
      const next = this.store.transitionEpisodeWorkflow(projectId, episodeId, {
        toStatus: input.toStatus,
        actor: input.actor,
        comment: input.comment,
      });
      if (!next) {
        invalidTransitionIds.push(episodeId);
        continue;
      }
      updated.push(next);
      if (before && before.status !== next.status) {
        changedItems.push({
          episodeId,
          fromStatus: before.status,
          toStatus: next.status,
        });
      }
    }
    const undoEntryId = changedItems.length > 0 ? this.pushWorkflowTransitionUndoEntry(projectId, input, changedItems) : null;
    return { updated, invalidTransitionIds, notFoundIds, undoEntryId };
  }

  overrideProjectWorkflowEpisodesBatch(
    projectId: string,
    input: { episodeIds: string[]; toStatus: EpisodeWorkflowStatus; actor: string; comment?: string }
  ): {
    updated: EpisodeWorkflowState[];
    unchangedIds: string[];
    notFoundIds: string[];
    undoEntryId: string | null;
  } | null {
    const episodes = this.store.listEpisodes(projectId);
    if (!episodes) {
      return null;
    }
    const episodeIdSet = new Set(episodes.map((item) => item.id));
    const updated: EpisodeWorkflowState[] = [];
    const unchangedIds: string[] = [];
    const notFoundIds: string[] = [];
    const changedItems: WorkflowTransitionUndoEntry['items'] = [];

    for (const episodeId of input.episodeIds) {
      if (!episodeIdSet.has(episodeId)) {
        notFoundIds.push(episodeId);
        continue;
      }
      const before = this.store.getEpisodeWorkflowState(projectId, episodeId);
      const next = this.store.setEpisodeWorkflowState(projectId, episodeId, {
        toStatus: input.toStatus,
        actor: input.actor,
        comment: input.comment,
      });
      if (!next) {
        notFoundIds.push(episodeId);
        continue;
      }
      if (before && before.status === next.status) {
        unchangedIds.push(episodeId);
        continue;
      }
      updated.push(next);
      if (before) {
        changedItems.push({
          episodeId,
          fromStatus: before.status,
          toStatus: next.status,
        });
      }
    }
    const undoEntryId = changedItems.length > 0 ? this.pushWorkflowTransitionUndoEntry(projectId, input, changedItems) : null;
    return { updated, unchangedIds, notFoundIds, undoEntryId };
  }

  listProjectWorkflowAudits(
    projectId: string,
    input: {
      episodeId?: string;
      actor?: string;
      toStatus?: EpisodeWorkflowStatus;
      page: number;
      pageSize: number;
    }
  ):
    | {
        items: EpisodeWorkflowAudit[];
        total: number;
        page: number;
        pageSize: number;
      }
    | null {
    const episodes = this.store.listEpisodes(projectId);
    if (!episodes) {
      return null;
    }
    const qActor = input.actor?.trim().toLowerCase();
    const episodeIds = input.episodeId ? [input.episodeId] : episodes.map((item) => item.id);
    const all = episodeIds.flatMap((episodeId) => this.store.listEpisodeWorkflowAudits(projectId, episodeId, 500) ?? []);
    const filtered = all
      .filter((item) => {
        if (input.toStatus && item.toStatus !== input.toStatus) {
          return false;
        }
        if (qActor && !item.actor.toLowerCase().includes(qActor)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id);
    const page = Math.max(1, Math.floor(input.page));
    const pageSize = Math.max(1, Math.min(200, Math.floor(input.pageSize)));
    const offset = (page - 1) * pageSize;
    return {
      items: filtered.slice(offset, offset + pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  listWorkflowTransitionUndoStack(projectId: string): Array<{
    id: string;
    actor: string;
    comment: string;
    createdAt: string;
    expiresAt: string;
    expired: boolean;
    toStatus: EpisodeWorkflowStatus;
    affectedEpisodes: number;
  }> | null {
    if (!this.store.listEpisodes(projectId)) {
      return null;
    }
    return this.readWorkflowTransitionUndoStack()
      .filter((item) => item.projectId === projectId)
      .map((item) => ({
        id: item.id,
        actor: item.actor,
        comment: item.comment,
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
        expired: Date.parse(item.expiresAt) <= Date.now(),
        toStatus: item.toStatus,
        affectedEpisodes: item.items.length,
      }));
  }

  undoWorkflowTransitionBatch(
    projectId: string,
    input: { entryId?: string; actor: string; comment?: string }
  ): { entryId: string; restored: number; failedEpisodeIds: string[]; expired: boolean } | null {
    if (!this.store.listEpisodes(projectId)) {
      return null;
    }
    const stack = this.readWorkflowTransitionUndoStack().filter((item) => item.projectId === projectId);
    const target = input.entryId ? stack.find((item) => item.id === input.entryId) : stack[0];
    if (!target) {
      return null;
    }
    if (Date.parse(target.expiresAt) <= Date.now()) {
      this.removeWorkflowTransitionUndoEntry(target.id);
      return {
        entryId: target.id,
        restored: 0,
        failedEpisodeIds: target.items.map((item) => item.episodeId),
        expired: true,
      };
    }
    const failedEpisodeIds: string[] = [];
    let restored = 0;
    for (const item of target.items) {
      const result = this.store.setEpisodeWorkflowState(projectId, item.episodeId, {
        toStatus: item.fromStatus,
        actor: input.actor.trim() || 'operator',
        comment: (input.comment ?? '').trim() || `undo ${target.id}`,
      });
      if (!result) {
        failedEpisodeIds.push(item.episodeId);
        continue;
      }
      restored += 1;
    }
    this.removeWorkflowTransitionUndoEntry(target.id);
    return {
      entryId: target.id,
      restored,
      failedEpisodeIds,
      expired: false,
    };
  }

  listWorkflowOpLogs(projectId: string): WorkflowOpLogEntry[] | null {
    if (!this.store.listEpisodes(projectId)) {
      return null;
    }
    return this.readWorkflowOpLogs(projectId);
  }

  appendWorkflowOpLog(
    projectId: string,
    input: {
      action: string;
      estimated: string;
      actual: string;
      note?: string;
      time?: string;
    }
  ): WorkflowOpLogEntry | null {
    if (!this.store.listEpisodes(projectId)) {
      return null;
    }
    const item: WorkflowOpLogEntry = {
      id: uuid(),
      time: input.time && input.time.trim() ? input.time.trim() : new Date().toISOString(),
      action: input.action.trim(),
      estimated: input.estimated.trim(),
      actual: input.actual.trim(),
      note: input.note?.trim() || undefined,
    };
    const next = [item, ...this.readWorkflowOpLogs(projectId)].slice(0, WORKFLOW_OP_LOGS_MAX);
    this.store.setSystemSetting(this.getWorkflowOpLogsKey(projectId), JSON.stringify(next));
    return item;
  }

  clearWorkflowOpLogs(projectId: string): number | null {
    const current = this.listWorkflowOpLogs(projectId);
    if (!current) {
      return null;
    }
    this.store.setSystemSetting(this.getWorkflowOpLogsKey(projectId), JSON.stringify([]));
    return current.length;
  }

  private pushWorkflowTransitionUndoEntry(
    projectId: string,
    input: { actor: string; comment?: string; toStatus: EpisodeWorkflowStatus },
    items: WorkflowTransitionUndoEntry['items']
  ): string {
    const createdAt = new Date().toISOString();
    const entry: WorkflowTransitionUndoEntry = {
      id: uuid(),
      projectId,
      actor: input.actor.trim() || 'operator',
      comment: (input.comment ?? '').trim(),
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + WORKFLOW_TRANSITION_UNDO_WINDOW_MS).toISOString(),
      toStatus: input.toStatus,
      items,
    };
    const next = [entry, ...this.readWorkflowTransitionUndoStack()].slice(0, WORKFLOW_TRANSITION_UNDO_STACK_MAX);
    this.store.setSystemSetting(WORKFLOW_TRANSITION_UNDO_STACK_KEY, JSON.stringify(next));
    return entry.id;
  }

  private removeWorkflowTransitionUndoEntry(entryId: string): void {
    const next = this.readWorkflowTransitionUndoStack().filter((item) => item.id !== entryId);
    this.store.setSystemSetting(WORKFLOW_TRANSITION_UNDO_STACK_KEY, JSON.stringify(next));
  }

  private readWorkflowTransitionUndoStack(): WorkflowTransitionUndoEntry[] {
    const raw = this.store.getSystemSetting(WORKFLOW_TRANSITION_UNDO_STACK_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => this.normalizeWorkflowTransitionUndoEntry(item))
        .filter((item): item is WorkflowTransitionUndoEntry => item !== null)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } catch {
      return [];
    }
  }

  private getWorkflowOpLogsKey(projectId: string): string {
    return `${WORKFLOW_OP_LOGS_KEY_PREFIX}${projectId}`;
  }

  private readWorkflowOpLogs(projectId: string): WorkflowOpLogEntry[] {
    const raw = this.store.getSystemSetting(this.getWorkflowOpLogsKey(projectId));
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => this.normalizeWorkflowOpLogEntry(item))
        .filter((item): item is WorkflowOpLogEntry => item !== null)
        .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
    } catch {
      return [];
    }
  }

  private normalizeWorkflowOpLogEntry(input: unknown): WorkflowOpLogEntry | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }
    const row = input as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      typeof row.time !== 'string' ||
      typeof row.action !== 'string' ||
      typeof row.estimated !== 'string' ||
      typeof row.actual !== 'string'
    ) {
      return null;
    }
    return {
      id: row.id,
      time: row.time,
      action: row.action,
      estimated: row.estimated,
      actual: row.actual,
      note: typeof row.note === 'string' ? row.note : undefined,
    };
  }

  private normalizeWorkflowTransitionUndoEntry(input: unknown): WorkflowTransitionUndoEntry | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }
    const node = input as Record<string, unknown>;
    if (
      typeof node.id !== 'string' ||
      typeof node.projectId !== 'string' ||
      typeof node.actor !== 'string' ||
      typeof node.createdAt !== 'string' ||
      typeof node.expiresAt !== 'string'
    ) {
      return null;
    }
    const toStatus = node.toStatus;
    if (toStatus !== 'draft' && toStatus !== 'in_review' && toStatus !== 'approved' && toStatus !== 'rejected') {
      return null;
    }
    const items = Array.isArray(node.items)
      ? node.items
          .map((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
              return null;
            }
            const row = item as Record<string, unknown>;
            const fromStatus = row.fromStatus;
            const itemToStatus = row.toStatus;
            if (
              typeof row.episodeId !== 'string' ||
              (fromStatus !== 'draft' && fromStatus !== 'in_review' && fromStatus !== 'approved' && fromStatus !== 'rejected') ||
              (itemToStatus !== 'draft' && itemToStatus !== 'in_review' && itemToStatus !== 'approved' && itemToStatus !== 'rejected')
            ) {
              return null;
            }
            return {
              episodeId: row.episodeId,
              fromStatus,
              toStatus: itemToStatus,
            };
          })
          .filter((item): item is WorkflowTransitionUndoEntry['items'][number] => item !== null)
      : [];
    if (items.length === 0) {
      return null;
    }
    return {
      id: node.id,
      projectId: node.projectId,
      actor: node.actor,
      comment: typeof node.comment === 'string' ? node.comment : '',
      createdAt: node.createdAt,
      expiresAt: node.expiresAt,
      toStatus,
      items,
    };
  }
}
