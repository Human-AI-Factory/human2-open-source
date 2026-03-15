import { computed, type Ref } from 'vue';
import type {
  Asset,
  EpisodeDomain,
  EpisodeWorkflowStatus,
  ModelConfig,
  Storyboard,
  WorkflowEpisodeListItem,
  WorkflowOpLogEntry
} from '@/types/models';

type WorkflowTransitionDraft = {
  episodeIds: string[];
  toStatus: 'draft' | 'in_review' | 'approved' | 'rejected';
  actor: string;
  comment: string;
  confirmed: boolean;
};

type WorkflowConfirmDraft = {
  episodeIds: string[];
  actor: string;
  comment: string;
  confirmed: boolean;
};

type WorkflowPrecheckEntry = {
  creatableStoryboardIds: string[];
  conflictStoryboardIds: string[];
};

type FramePrecheckRow = {
  episodeId: string;
  orderIndex: number;
  title: string;
  status: EpisodeWorkflowStatus;
  storyboardCount: number;
  eligible: boolean;
  reason: 'no_storyboards' | 'approved' | null;
};

type WorkflowPrecheckRiskFilter = 'all' | 'high' | 'medium' | 'low' | 'conflict_only';
type WorkflowPrecheckSortBy = 'episode_order' | 'risk_desc' | 'asset_conflict_desc' | 'video_conflict_desc';

type UseWorkflowWorkbenchDerivedStateOptions = {
  workflowTotal: Ref<number>;
  workflowPageSize: number;
  workflowOpLogs: Ref<WorkflowOpLogEntry[]>;
  workflowOpActionFilter: Ref<string>;
  workflowOpTimeFrom: Ref<string>;
  workflowOpTimeTo: Ref<string>;
  workflowItems: Ref<WorkflowEpisodeListItem[]>;
  selectedEpisodeIds: Ref<string[]>;
  batchTransitionDraft: Ref<WorkflowTransitionDraft | null>;
  episodes: Ref<EpisodeDomain[]>;
  episodeBatchIds: Ref<string[]>;
  framePrecheckRows: Ref<FramePrecheckRow[]>;
  framePrecheckViewMode: Ref<'all' | 'eligible' | 'skipped'>;
  repairNoStoryboardDraft: Ref<WorkflowConfirmDraft | null>;
  rebuildStructuredStoryboardDraft: Ref<WorkflowConfirmDraft | null>;
  approvedRollbackDraft: Ref<WorkflowConfirmDraft | null>;
  audioModels: Ref<ModelConfig[]>;
  audioModelId: Ref<string>;
  storyboards: Ref<Storyboard[]>;
  assets: Ref<Asset[]>;
  assetPrecheckByEpisode: Ref<Record<string, WorkflowPrecheckEntry>>;
  videoPrecheckByEpisode: Ref<Record<string, WorkflowPrecheckEntry>>;
  precheckRiskFilter: Ref<WorkflowPrecheckRiskFilter>;
  precheckSortBy: Ref<WorkflowPrecheckSortBy>;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const readNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
};

export const useWorkflowWorkbenchDerivedState = (options: UseWorkflowWorkbenchDerivedStateOptions) => {
  const workflowTotalPages = computed(() => Math.max(1, Math.ceil(options.workflowTotal.value / options.workflowPageSize)));

  const workflowOpActionOptions = computed(() => {
    const names = new Set(options.workflowOpLogs.value.map((item) => item.action));
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
  });

  const filteredWorkflowOpLogs = computed(() => {
    const fromTs = options.workflowOpTimeFrom.value ? Date.parse(options.workflowOpTimeFrom.value) : Number.NEGATIVE_INFINITY;
    const toTs = options.workflowOpTimeTo.value ? Date.parse(options.workflowOpTimeTo.value) : Number.POSITIVE_INFINITY;
    return options.workflowOpLogs.value.filter((item) => {
      if (options.workflowOpActionFilter.value && item.action !== options.workflowOpActionFilter.value) {
        return false;
      }
      const ts = Date.parse(item.time);
      if (Number.isNaN(ts)) {
        return true;
      }
      return ts >= fromTs && ts <= toTs;
    });
  });

  const isAllSelected = computed(
    () =>
      options.workflowItems.value.length > 0 &&
      options.workflowItems.value.every((item) => options.selectedEpisodeIds.value.includes(item.episode.id))
  );

  const batchTransitionSummary = computed(() => {
    if (!options.batchTransitionDraft.value) {
      return '';
    }
    const previewIds = options.batchTransitionDraft.value.episodeIds.slice(0, 5).join(', ');
    return `将把 ${options.batchTransitionDraft.value.episodeIds.length} 个分集流转到 ${options.batchTransitionDraft.value.toStatus}。示例集ID：${previewIds}${options.batchTransitionDraft.value.episodeIds.length > 5 ? ' ...' : ''}`;
  });

  const batchTransitionRiskLevel = computed<'low' | 'medium' | 'high'>(() => {
    const draft = options.batchTransitionDraft.value;
    if (!draft) {
      return 'medium';
    }
    if (draft.toStatus === 'approved' || draft.toStatus === 'draft') {
      return 'high';
    }
    if (draft.episodeIds.length >= 20) {
      return 'high';
    }
    if (draft.episodeIds.length >= 8) {
      return 'medium';
    }
    return 'low';
  });

  const batchTransitionImpactItems = computed(() => {
    const draft = options.batchTransitionDraft.value;
    if (!draft) {
      return [] as string[];
    }
    return [`预计影响分集：${draft.episodeIds.length}`, `目标状态：${draft.toStatus}`, '将写入 workflow 审计日志，可在 Undo Window 中回滚'];
  });

  const isAllEpisodesBatchSelected = computed(
    () => options.episodes.value.length > 0 && options.episodes.value.every((item) => options.episodeBatchIds.value.includes(item.id))
  );

  const episodeTitleMap = computed(() => new Map(options.episodes.value.map((item) => [item.id, item.title])));

  const repairNoStoryboardSummary = computed(() => {
    if (!options.repairNoStoryboardDraft.value) {
      return '';
    }
    const previewIds = options.repairNoStoryboardDraft.value.episodeIds.slice(0, 5).join(', ');
    return `将按剧本为 ${options.repairNoStoryboardDraft.value.episodeIds.length} 个分集补充分镜。示例集ID：${previewIds}${options.repairNoStoryboardDraft.value.episodeIds.length > 5 ? ' ...' : ''}`;
  });

  const repairNoStoryboardImpactItems = computed(() => {
    const draft = options.repairNoStoryboardDraft.value;
    if (!draft) {
      return [] as string[];
    }
    return [`预计处理分集：${draft.episodeIds.length}`, '每集将对关联剧本触发分镜生成（数量由剧本内容决定）', '完成后将刷新预检查结果'];
  });

  const rebuildStructuredStoryboardSummary = computed(() => {
    if (!options.rebuildStructuredStoryboardDraft.value) {
      return '';
    }
    const previewIds = options.rebuildStructuredStoryboardDraft.value.episodeIds.slice(0, 5).join(', ');
    return `将按剧本重建 ${options.rebuildStructuredStoryboardDraft.value.episodeIds.length} 个已有分镜的分集，并用新的结构化分镜覆盖旧结果。示例集ID：${previewIds}${options.rebuildStructuredStoryboardDraft.value.episodeIds.length > 5 ? ' ...' : ''}`;
  });

  const rebuildStructuredStoryboardImpactItems = computed(() => {
    const draft = options.rebuildStructuredStoryboardDraft.value;
    if (!draft) {
      return [] as string[];
    }
    return [
      `预计重建分集：${draft.episodeIds.length}`,
      '每集将按关联剧本重新生成结构化分镜，并替换旧分镜记录',
      '若旧分镜已挂资产或视频任务，后续需要按新分镜重新检查下游产物'
    ];
  });

  const approvedRollbackSummary = computed(() => {
    if (!options.approvedRollbackDraft.value) {
      return '';
    }
    const previewIds = options.approvedRollbackDraft.value.episodeIds.slice(0, 5).join(', ');
    return `将回退 ${options.approvedRollbackDraft.value.episodeIds.length} 个 approved 分集到 in_review。示例集ID：${previewIds}${options.approvedRollbackDraft.value.episodeIds.length > 5 ? ' ...' : ''}`;
  });

  const approvedRollbackImpactItems = computed(() => {
    const draft = options.approvedRollbackDraft.value;
    if (!draft) {
      return [] as string[];
    }
    return [`预计回退分集：${draft.episodeIds.length}`, '状态变更：approved -> in_review', '将写入审计日志并进入 Undo Window'];
  });

  const filteredFramePrecheckRows = computed(() => {
    if (options.framePrecheckViewMode.value === 'eligible') {
      return options.framePrecheckRows.value.filter((item) => item.eligible);
    }
    if (options.framePrecheckViewMode.value === 'skipped') {
      return options.framePrecheckRows.value.filter((item) => !item.eligible);
    }
    return options.framePrecheckRows.value;
  });

  const noStoryboardEpisodeIds = computed(() =>
    options.framePrecheckRows.value.filter((item) => item.reason === 'no_storyboards').map((item) => item.episodeId)
  );

  const structuredStoryboardEpisodeIds = computed(() =>
    options.framePrecheckRows.value.filter((item) => item.storyboardCount > 0).map((item) => item.episodeId)
  );

  const approvedSkippedEpisodeIds = computed(() =>
    options.framePrecheckRows.value.filter((item) => item.reason === 'approved').map((item) => item.episodeId)
  );

  const selectedAudioModel = computed(() => options.audioModels.value.find((item) => item.id === options.audioModelId.value) ?? null);

  const audioCapabilityRoot = computed<Record<string, unknown>>(() => {
    const model = selectedAudioModel.value;
    if (!model) {
      return {};
    }
    const direct = asRecord(model.capabilities);
    const nested = direct ? asRecord(direct.audio) : null;
    return nested ?? direct ?? {};
  });

  const audioVoiceOptions = computed(() => readStringArray(audioCapabilityRoot.value.voices));
  const audioSpeedOptions = computed(() => readNumberArray(audioCapabilityRoot.value.speeds));
  const audioEmotionOptions = computed(() => readStringArray(audioCapabilityRoot.value.emotions));
  const audioFormatOptions = computed(() => readStringArray(audioCapabilityRoot.value.formats));
  const audioProviderOptionRuleRoot = computed<Record<string, unknown>>(() => asRecord(audioCapabilityRoot.value.providerOptions) ?? {});
  const audioProviderOptionKeys = computed(() => Object.keys(audioProviderOptionRuleRoot.value));

  const storyboardTitleMap = computed(() => new Map(options.storyboards.value.map((item) => [item.id, item.title])));

  const storyboardCountByEpisode = computed(() => {
    const map = new Map<string, number>();
    for (const item of options.storyboards.value) {
      if (!item.episodeId) {
        continue;
      }
      map.set(item.episodeId, (map.get(item.episodeId) ?? 0) + 1);
    }
    return map;
  });

  const resolveStoryboardTitles = (ids: string[]): string[] => ids.map((id) => storyboardTitleMap.value.get(id) || id);

  const batchPrecheckRows = computed(() => {
    const selected = new Set(options.episodeBatchIds.value);
    const source = selected.size > 0 ? options.episodes.value.filter((ep) => selected.has(ep.id)) : options.episodes.value;
    const rows = source.map((ep) => {
      const asset = options.assetPrecheckByEpisode.value[ep.id] || { creatableStoryboardIds: [], conflictStoryboardIds: [] };
      const video = options.videoPrecheckByEpisode.value[ep.id] || { creatableStoryboardIds: [], conflictStoryboardIds: [] };
      const storyboardCount = storyboardCountByEpisode.value.get(ep.id) ?? 0;
      const conflictCount = asset.conflictStoryboardIds.length + video.conflictStoryboardIds.length;
      const riskScore = conflictCount * 2 + (storyboardCount === 0 ? 3 : 0);
      const riskLevel: 'low' | 'medium' | 'high' = riskScore >= 6 ? 'high' : riskScore >= 2 ? 'medium' : 'low';
      return {
        episodeId: ep.id,
        orderIndex: ep.orderIndex,
        title: ep.title,
        storyboardCount,
        assetCreatableCount: asset.creatableStoryboardIds.length,
        assetConflictCount: asset.conflictStoryboardIds.length,
        videoCreatableCount: video.creatableStoryboardIds.length,
        videoConflictCount: video.conflictStoryboardIds.length,
        assetConflictTitles: resolveStoryboardTitles(asset.conflictStoryboardIds),
        videoConflictTitles: resolveStoryboardTitles(video.conflictStoryboardIds),
        riskLevel
      };
    });
    const filtered = rows.filter((row) => {
      if (options.precheckRiskFilter.value === 'all') {
        return true;
      }
      if (options.precheckRiskFilter.value === 'conflict_only') {
        return row.assetConflictCount + row.videoConflictCount > 0;
      }
      return row.riskLevel === options.precheckRiskFilter.value;
    });
    return filtered.sort((a, b) => {
      if (options.precheckSortBy.value === 'episode_order') {
        return a.orderIndex - b.orderIndex;
      }
      if (options.precheckSortBy.value === 'asset_conflict_desc') {
        return b.assetConflictCount - a.assetConflictCount || a.orderIndex - b.orderIndex;
      }
      if (options.precheckSortBy.value === 'video_conflict_desc') {
        return b.videoConflictCount - a.videoConflictCount || a.orderIndex - b.orderIndex;
      }
      const riskRank = { high: 3, medium: 2, low: 1 };
      return riskRank[b.riskLevel] - riskRank[a.riskLevel] || a.orderIndex - b.orderIndex;
    });
  });

  const batchPrecheckSummary = computed(() => {
    const rows = batchPrecheckRows.value;
    return rows.reduce(
      (acc, row) => {
        acc.episodes += 1;
        acc.assetCreatable += row.assetCreatableCount;
        acc.assetConflicts += row.assetConflictCount;
        acc.videoCreatable += row.videoCreatableCount;
        acc.videoConflicts += row.videoConflictCount;
        acc.highRisk += row.riskLevel === 'high' ? 1 : 0;
        return acc;
      },
      { episodes: 0, assetCreatable: 0, assetConflicts: 0, videoCreatable: 0, videoConflicts: 0, highRisk: 0 }
    );
  });

  const precheckConflictStats = computed(() => {
    const asset = batchPrecheckSummary.value.assetConflicts;
    const video = batchPrecheckSummary.value.videoConflicts;
    const total = Math.max(1, asset + video);
    const episodes = batchPrecheckSummary.value.episodes;
    const highRisk = batchPrecheckSummary.value.highRisk;
    return {
      asset,
      video,
      total,
      episodes,
      highRisk,
      max: Math.max(asset, video, highRisk),
      assetPct: Number(((asset / total) * 100).toFixed(1)),
      videoPct: Number(((video / total) * 100).toFixed(1)),
      highRiskPct: Number(((highRisk / Math.max(1, episodes)) * 100).toFixed(1))
    };
  });

  const precheckConflictByStoryboard = computed(() => {
    const counter = new Map<string, { title: string; assetConflicts: number; videoConflicts: number; total: number }>();
    for (const row of batchPrecheckRows.value) {
      for (const title of row.assetConflictTitles) {
        const current = counter.get(title) || { title, assetConflicts: 0, videoConflicts: 0, total: 0 };
        current.assetConflicts += 1;
        current.total += 1;
        counter.set(title, current);
      }
      for (const title of row.videoConflictTitles) {
        const current = counter.get(title) || { title, assetConflicts: 0, videoConflicts: 0, total: 0 };
        current.videoConflicts += 1;
        current.total += 1;
        counter.set(title, current);
      }
    }
    return Array.from(counter.values())
      .sort((a, b) => b.total - a.total || a.title.localeCompare(b.title))
      .slice(0, 12);
  });

  const precheckConflictByResourceType = computed(() => {
    const conflictStoryboardIds = new Set<string>();
    const storyboardIdByTitle = new Map(options.storyboards.value.map((item) => [item.title, item.id]));
    for (const row of batchPrecheckRows.value) {
      for (const title of [...row.assetConflictTitles, ...row.videoConflictTitles]) {
        const sid = storyboardIdByTitle.get(title);
        if (sid) {
          conflictStoryboardIds.add(sid);
        }
      }
    }
    const counts: Record<'character' | 'scene' | 'prop', number> = {
      character: 0,
      scene: 0,
      prop: 0
    };
    for (const item of options.assets.value) {
      if (conflictStoryboardIds.has(item.storyboardId)) {
        counts[item.type] += 1;
      }
    }
    const total = counts.character + counts.scene + counts.prop;
    return {
      total,
      rows: (Object.keys(counts) as Array<'character' | 'scene' | 'prop'>).map((type) => ({
        type,
        count: counts[type],
        pct: Number(((counts[type] / Math.max(1, total)) * 100).toFixed(1))
      }))
    };
  });

  return {
    approvedRollbackImpactItems,
    approvedRollbackSummary,
    audioFormatOptions,
    audioEmotionOptions,
    audioProviderOptionKeys,
    audioProviderOptionRuleRoot,
    audioSpeedOptions,
    audioVoiceOptions,
    batchPrecheckRows,
    batchPrecheckSummary,
    batchTransitionImpactItems,
    batchTransitionRiskLevel,
    batchTransitionSummary,
    episodeTitleMap,
    filteredFramePrecheckRows,
    filteredWorkflowOpLogs,
    isAllEpisodesBatchSelected,
    isAllSelected,
    noStoryboardEpisodeIds,
    rebuildStructuredStoryboardImpactItems,
    rebuildStructuredStoryboardSummary,
    precheckConflictByResourceType,
    precheckConflictByStoryboard,
    precheckConflictStats,
    repairNoStoryboardImpactItems,
    repairNoStoryboardSummary,
    selectedAudioModel,
    approvedSkippedEpisodeIds,
    structuredStoryboardEpisodeIds,
    workflowOpActionOptions,
    workflowTotalPages
  };
};
