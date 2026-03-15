import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { TimelineClip } from '@/types/models';

export type OrchestratorCondition = 'all' | 'hasMedia' | 'missingMedia' | 'durationGt';
export type OrchestratorRollbackStrategy = 'none' | 'rollback';
export type OrchestratorNodeStatus = 'idle' | 'running' | 'success' | 'failed' | 'skipped' | 'rolled_back';
export type OrchestratorFailureAction = 'terminate' | 'jump';
export type OrchestratorActionType = 'transitionPreset' | 'keyframePreset' | 'durationScale' | 'audioVolumeMute' | 'replaceLatestMedia';

export type OrchestratorFlowNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  subtitle: string;
  status: OrchestratorNodeStatus;
  kind: 'start' | 'step' | 'success' | 'failure';
  dragging: boolean;
  retryCount: number;
  jumpCount: number;
};

export type OrchestratorFlowEdge = {
  id: string;
  path: string;
  type: 'success' | 'failure' | 'rollback' | 'jump';
  status: OrchestratorNodeStatus;
  label?: string;
  labelX?: number;
  labelY?: number;
};

export type OrchestratorStep = {
  id: string;
  type: OrchestratorActionType;
  condition: OrchestratorCondition;
  durationGtSec?: number;
  failAction: OrchestratorFailureAction;
  failJumpStepId?: string;
  label: string;
  detail: string;
  scaleFactor?: number;
  volume?: number;
  muted?: boolean;
};

type TransitionCurvePreset = {
  id: string;
  label: string;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  durationSec: number;
};

type KeyframePreset = {
  id: string;
  label: string;
  keyframe: NonNullable<TimelineClip['keyframe']>;
};

type UseTimelineBatchOrchestratorOptions = {
  clips: Ref<TimelineClip[]>;
  selectedClipIndices: Ref<number[]>;
  selectionRangeStartSec: Ref<number>;
  selectionRangeEndSec: Ref<number>;
  durationScaleFactor: Ref<number>;
  quickCommandFeedback: Ref<string>;
  latestDoneVideoTaskByStoryboardId: Ref<Record<string, { taskId: string; resultUrl: string }>>;
  selectedTransitionCurveId: Ref<string>;
  selectedKeyframePresetId: Ref<string>;
  transitionCurvePresets: TransitionCurvePreset[];
  keyframePresets: KeyframePreset[];
  storyboardTitleMap: ComputedRef<Map<string, string>>;
  videoClipSpans: ComputedRef<Array<{ startSec: number; endSec: number }>>;
  normalizeClipIndices: (input: number[]) => number[];
  checkpointTimelineEdit: (action: string, detail?: string) => void;
  scaleSelectedClipDurations: () => void;
  syncVideoClipTimeline: () => void;
  normalizeDuration: (value: number) => number;
  createStudioSnapshot: () => unknown;
  applyStudioSnapshot: (snapshot: unknown) => void;
};

const ORCHESTRATOR_START_NODE_ID = '__start';
const ORCHESTRATOR_SUCCESS_NODE_ID = '__success';
const ORCHESTRATOR_FAILURE_NODE_ID = '__failure';
const ORCHESTRATOR_NODE_WIDTH = 180;
const ORCHESTRATOR_NODE_HEIGHT = 56;
const ORCHESTRATOR_STEP_GAP_X = 210;

export const useTimelineBatchOrchestrator = (options: UseTimelineBatchOrchestratorOptions) => {
  const orchestratorDraftAction = ref<OrchestratorActionType>('transitionPreset');
  const orchestratorRollbackStrategy = ref<OrchestratorRollbackStrategy>('rollback');
  const orchestratorDraftScaleFactor = ref(1.1);
  const orchestratorDraftVolume = ref(100);
  const orchestratorDraftMuted = ref(false);
  const orchestratorSteps = ref<OrchestratorStep[]>([]);
  const orchestratorNodeStates = ref<Record<string, OrchestratorNodeStatus>>({});
  const orchestratorExecutionSummary = ref('未执行');
  const orchestratorNodeRunStats = ref<Record<string, { retries: number; jumps: number }>>({});
  const orchestratorNodeDebugInfo = ref<Record<string, { lastFailureReason: string; lastJumpTargetStepId: string; lastEventAt: string }>>({});
  const hoveredOrchestratorNodeId = ref('');
  const pinnedOrchestratorNodeId = ref('');
  const selectedOrchestratorStepId = ref('');
  const orchestratorDraggingStepId = ref('');
  const orchestratorDragPointerOffsetX = ref(0);
  const orchestratorDragXByStepId = ref<Record<string, number>>({});
  const batchTransitionDurationSec = ref(0.6);
  const batchPanelTransitionType = ref<'cut' | 'fade' | 'dissolve' | 'wipeleft' | 'wiperight'>('fade');
  const batchPanelTransitionDurationSec = ref(0.6);
  const batchPanelVolume = ref(100);
  const batchPanelMuted = ref(false);
  const batchPanelOnlyCurrentRange = ref(false);

  const getBatchPanelTargetIndices = (): number[] => {
    const selected = options.normalizeClipIndices(options.selectedClipIndices.value);
    if (!batchPanelOnlyCurrentRange.value) {
      return selected;
    }
    const start = Math.max(0, Math.min(options.selectionRangeStartSec.value, options.selectionRangeEndSec.value));
    const end = Math.max(options.selectionRangeStartSec.value, options.selectionRangeEndSec.value);
    if (end <= start) {
      return [];
    }
    return selected.filter((idx) => {
      const span = options.videoClipSpans.value[idx];
      return Boolean(span && span.endSec > start && span.startSec < end);
    });
  };

  const batchPanelPreviewItems = computed(() =>
    getBatchPanelTargetIndices().map((idx) => {
      const clip = options.clips.value[idx];
      const span = options.videoClipSpans.value[idx];
      return {
        index: idx,
        title: options.storyboardTitleMap.value.get(clip?.storyboardId || '') || clip?.storyboardId || `片段 #${idx + 1}`,
        span: span ? `${span.startSec.toFixed(2)}s -> ${span.endSec.toFixed(2)}s` : '-',
      };
    })
  );

  const applyBatchPanelTransition = (): void => {
    const indices = getBatchPanelTargetIndices();
    if (indices.length === 0) {
      options.quickCommandFeedback.value = '当前筛选/时间区间下没有可应用的片段';
      return;
    }
    options.checkpointTimelineEdit('batch-panel-transition', `${indices.length} clips`);
    for (const idx of indices) {
      const clip = options.clips.value[idx];
      if (!clip) {
        continue;
      }
      clip.transition = {
        type: batchPanelTransitionType.value,
        durationSec: Math.max(0, Math.min(5, Number(batchPanelTransitionDurationSec.value || 0))),
        easing: clip.transition?.easing || 'easeInOut',
        direction: clip.transition?.direction || 'left',
      };
    }
  };

  const applyBatchPanelAudio = (): void => {
    const indices = getBatchPanelTargetIndices();
    if (indices.length === 0) {
      options.quickCommandFeedback.value = '当前筛选/时间区间下没有可应用的片段';
      return;
    }
    options.checkpointTimelineEdit('batch-panel-audio', `${indices.length} clips`);
    for (const idx of indices) {
      const clip = options.clips.value[idx];
      if (!clip) {
        continue;
      }
      clip.volume = Math.max(0, Math.min(200, Number(batchPanelVolume.value || 0)));
      clip.muted = batchPanelMuted.value;
    }
  };

  const applyBatchPanelDurationScale = (): void => {
    const indices = getBatchPanelTargetIndices();
    if (indices.length === 0) {
      options.quickCommandFeedback.value = '当前筛选/时间区间下没有可应用的片段';
      return;
    }
    if (!batchPanelOnlyCurrentRange.value) {
      options.scaleSelectedClipDurations();
      return;
    }
    options.checkpointTimelineEdit('batch-panel-duration-scale', `${indices.length} clips`);
    const factor = Number(options.durationScaleFactor.value);
    const safeFactor = Number.isFinite(factor) ? Math.max(0.1, Math.min(3, factor)) : 1;
    for (const idx of indices) {
      const clip = options.clips.value[idx];
      if (!clip) {
        continue;
      }
      clip.durationSec = options.normalizeDuration(Number(clip.durationSec ?? 5) * safeFactor);
    }
    options.syncVideoClipTimeline();
  };

  const orchestratorTargetCount = computed(() => getBatchPanelTargetIndices().length);

  const setOrchestratorNodeStatus = (id: string, status: OrchestratorNodeStatus): void => {
    orchestratorNodeStates.value = {
      ...orchestratorNodeStates.value,
      [id]: status,
    };
  };

  const resetOrchestratorNodeStates = (): void => {
    const next: Record<string, OrchestratorNodeStatus> = {
      [ORCHESTRATOR_START_NODE_ID]: 'idle',
      [ORCHESTRATOR_SUCCESS_NODE_ID]: 'idle',
      [ORCHESTRATOR_FAILURE_NODE_ID]: 'idle',
    };
    for (const step of orchestratorSteps.value) {
      next[step.id] = 'idle';
    }
    orchestratorNodeStates.value = next;
    const stats: Record<string, { retries: number; jumps: number }> = {};
    const debugInfo: Record<string, { lastFailureReason: string; lastJumpTargetStepId: string; lastEventAt: string }> = {};
    for (const step of orchestratorSteps.value) {
      stats[step.id] = { retries: 0, jumps: 0 };
      debugInfo[step.id] = { lastFailureReason: '', lastJumpTargetStepId: '', lastEventAt: '' };
    }
    orchestratorNodeRunStats.value = stats;
    orchestratorNodeDebugInfo.value = debugInfo;
  };

  const stepConditionLabel = (step: OrchestratorStep): string => {
    if (step.condition === 'hasMedia') {
      return 'media=yes';
    }
    if (step.condition === 'missingMedia') {
      return 'media=no';
    }
    if (step.condition === 'durationGt') {
      return `dur>${Number(step.durationGtSec ?? 0).toFixed(1)}s`;
    }
    return 'all';
  };

  const buildOrchestratorStepDetail = (step: OrchestratorStep): string => {
    let detail = '';
    if (step.type === 'transitionPreset') {
      const preset = options.transitionCurvePresets.find((item) => item.id === options.selectedTransitionCurveId.value) || options.transitionCurvePresets[0];
      detail = `${preset.label} (${preset.easing}, ${preset.durationSec}s)`;
    } else if (step.type === 'keyframePreset') {
      const preset = options.keyframePresets.find((item) => item.id === options.selectedKeyframePresetId.value) || options.keyframePresets[0];
      detail = preset.label;
    } else if (step.type === 'durationScale') {
      const factor = Math.max(0.1, Math.min(3, Number(step.scaleFactor ?? 1)));
      step.scaleFactor = factor;
      detail = `factor=${factor.toFixed(2)}`;
    } else if (step.type === 'audioVolumeMute') {
      const volume = Math.max(0, Math.min(200, Number(step.volume ?? 100)));
      step.volume = volume;
      detail = `volume=${volume}, muted=${step.muted ? 'true' : 'false'}`;
    } else {
      detail = '按 storyboardId 替换为最近 done 媒体';
    }
    if (step.condition === 'hasMedia') {
      detail += ' · 条件: 已有媒体';
    } else if (step.condition === 'missingMedia') {
      detail += ' · 条件: 缺少媒体';
    } else if (step.condition === 'durationGt') {
      step.durationGtSec = Math.max(0.1, Number(step.durationGtSec ?? 0.1));
      detail += ` · 条件: 时长 > ${(step.durationGtSec || 0).toFixed(1)}s`;
    } else {
      detail += ' · 条件: 全部';
    }
    if (step.failAction === 'jump') {
      detail += ` · 失败: jump(${step.failJumpStepId ? step.failJumpStepId.slice(-4) : '未配置'})`;
    } else {
      detail += ' · 失败: terminate';
    }
    return detail;
  };

  const selectedOrchestratorStep = computed(() => orchestratorSteps.value.find((item) => item.id === selectedOrchestratorStepId.value) ?? null);
  const selectedOrchestratorStepIndex = computed(() =>
    selectedOrchestratorStep.value ? orchestratorSteps.value.findIndex((item) => item.id === selectedOrchestratorStep.value?.id) : -1
  );
  const orchestratorJumpTargets = computed(() =>
    orchestratorSteps.value
      .map((item, idx) => ({ id: item.id, idx, label: item.label }))
      .filter((item) => item.id !== selectedOrchestratorStepId.value)
  );

  const syncSelectedOrchestratorStepMeta = (): void => {
    const step = selectedOrchestratorStep.value;
    if (!step) {
      return;
    }
    if (step.condition !== 'durationGt') {
      step.durationGtSec = undefined;
    }
    if (step.failAction !== 'jump') {
      step.failJumpStepId = undefined;
    }
    step.detail = buildOrchestratorStepDetail(step);
  };

  const onOrchestratorNodeHover = (nodeId: string): void => {
    if (pinnedOrchestratorNodeId.value) {
      return;
    }
    hoveredOrchestratorNodeId.value = nodeId;
  };

  const formatDebugTimestamp = (iso: string): string => {
    if (!iso) {
      return '-';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return date.toLocaleString('zh-CN', { hour12: false });
  };

  const getOrchestratorNodeTooltipLines = (nodeId: string): string[] => {
    const info = orchestratorNodeDebugInfo.value[nodeId];
    if (!info || (!info.lastFailureReason && !info.lastJumpTargetStepId && !info.lastEventAt)) {
      return [];
    }
    const targetIdx = info.lastJumpTargetStepId ? orchestratorSteps.value.findIndex((item) => item.id === info.lastJumpTargetStepId) : -1;
    const jumpLabel = targetIdx >= 0 ? `#${targetIdx + 1}` : info.lastJumpTargetStepId ? `id:${info.lastJumpTargetStepId.slice(-6)}` : '无';
    return [`最近失败: ${info.lastFailureReason || '无'}`, `上次跳转: ${jumpLabel}`, `时间: ${formatDebugTimestamp(info.lastEventAt)}`];
  };

  const activeOrchestratorTooltipNodeId = computed(() => pinnedOrchestratorNodeId.value || hoveredOrchestratorNodeId.value);
  const activeOrchestratorTooltipNodeLabel = computed(() => {
    const nodeId = activeOrchestratorTooltipNodeId.value;
    if (!nodeId) {
      return '';
    }
    if (nodeId === ORCHESTRATOR_START_NODE_ID) {
      return '开始';
    }
    if (nodeId === ORCHESTRATOR_SUCCESS_NODE_ID) {
      return '完成';
    }
    if (nodeId === ORCHESTRATOR_FAILURE_NODE_ID) {
      return '失败';
    }
    const idx = orchestratorSteps.value.findIndex((item) => item.id === nodeId);
    const step = idx >= 0 ? orchestratorSteps.value[idx] : null;
    return step ? `#${idx + 1} ${step.label}` : nodeId.slice(-6);
  });

  const shouldShowOrchestratorNodeTooltip = (nodeId: string): boolean => {
    if (pinnedOrchestratorNodeId.value) {
      return pinnedOrchestratorNodeId.value === nodeId;
    }
    return hoveredOrchestratorNodeId.value === nodeId;
  };

  const clearPinnedOrchestratorNodeTooltip = (): void => {
    pinnedOrchestratorNodeId.value = '';
  };

  const copyOrchestratorNodeDebug = async (nodeId: string): Promise<void> => {
    const lines = getOrchestratorNodeTooltipLines(nodeId);
    if (lines.length === 0) {
      options.quickCommandFeedback.value = '当前节点无可复制的错误详情';
      return;
    }
    const text = [`节点: ${activeOrchestratorTooltipNodeLabel.value || nodeId}`, ...lines].join('\n');
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        options.quickCommandFeedback.value = '已复制错误详情';
        return;
      }
    } catch {
      // fall through
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      options.quickCommandFeedback.value = '已复制错误详情';
    } catch {
      options.quickCommandFeedback.value = '复制失败，请手动复制';
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const onOrchestratorTooltipCopy = (nodeId: string): void => {
    void copyOrchestratorNodeDebug(nodeId);
  };

  const toFlowNode = (id: string, kind: OrchestratorFlowNode['kind'], title: string, subtitle: string, x: number, y: number): OrchestratorFlowNode => ({
    id,
    kind,
    title,
    subtitle,
    x,
    y,
    width: ORCHESTRATOR_NODE_WIDTH,
    height: ORCHESTRATOR_NODE_HEIGHT,
    status: orchestratorNodeStates.value[id] ?? 'idle',
    dragging: orchestratorDraggingStepId.value === id,
    retryCount: orchestratorNodeRunStats.value[id]?.retries ?? 0,
    jumpCount: orchestratorNodeRunStats.value[id]?.jumps ?? 0,
  });

  const edgePath = (fromX: number, fromY: number, toX: number, toY: number): string => {
    const c1x = fromX + Math.max(32, (toX - fromX) * 0.35);
    const c2x = toX - Math.max(32, (toX - fromX) * 0.35);
    return `M ${fromX} ${fromY} C ${c1x} ${fromY}, ${c2x} ${toY}, ${toX} ${toY}`;
  };

  const orchestratorFlowNodes = computed<OrchestratorFlowNode[]>(() => {
    const nodes: OrchestratorFlowNode[] = [];
    const startX = 16;
    const rowY = 24;
    const failY = 124;
    nodes.push(toFlowNode(ORCHESTRATOR_START_NODE_ID, 'start', '开始', `目标 ${orchestratorTargetCount.value}`, startX, rowY));
    for (let idx = 0; idx < orchestratorSteps.value.length; idx += 1) {
      const step = orchestratorSteps.value[idx];
      const defaultX = startX + ORCHESTRATOR_STEP_GAP_X * (idx + 1);
      const dragX = orchestratorDragXByStepId.value[step.id];
      nodes.push(toFlowNode(step.id, 'step', `${idx + 1}. ${step.label}`, stepConditionLabel(step), Number.isFinite(dragX) ? dragX : defaultX, rowY));
    }
    const terminalX = startX + ORCHESTRATOR_STEP_GAP_X * (orchestratorSteps.value.length + 1);
    nodes.push(toFlowNode(ORCHESTRATOR_SUCCESS_NODE_ID, 'success', '完成', 'success', terminalX, rowY));
    nodes.push(toFlowNode(ORCHESTRATOR_FAILURE_NODE_ID, 'failure', '失败', 'error / rollback', terminalX, failY));
    return nodes;
  });

  const orchestratorFlowCanvasWidth = computed(() => ORCHESTRATOR_STEP_GAP_X * (orchestratorSteps.value.length + 2) + 36);
  const orchestratorFlowCanvasHeight = computed(() => 220);

  const orchestratorFlowEdges = computed<OrchestratorFlowEdge[]>(() => {
    const nodes = orchestratorFlowNodes.value;
    const map = new Map(nodes.map((node) => [node.id, node]));
    const edges: OrchestratorFlowEdge[] = [];
    const connect = (fromId: string, toId: string, type: OrchestratorFlowEdge['type'], label?: string): void => {
      const from = map.get(fromId);
      const to = map.get(toId);
      if (!from || !to) {
        return;
      }
      const fromX = from.x + from.width;
      const fromY = from.y + from.height / 2;
      const toX = to.x;
      const toY = to.y + to.height / 2;
      const status = type === 'success' ? (from.status === 'success' ? 'success' : from.status === 'running' ? 'running' : 'idle') : from.status;
      edges.push({
        id: `${fromId}->${toId}`,
        path: edgePath(fromX, fromY, toX, toY),
        type,
        status,
        label,
        labelX: (fromX + toX) / 2,
        labelY: (fromY + toY) / 2 - (type === 'jump' ? 8 : 0),
      });
    };
    const chain = [ORCHESTRATOR_START_NODE_ID, ...orchestratorSteps.value.map((step) => step.id), ORCHESTRATOR_SUCCESS_NODE_ID];
    for (let idx = 0; idx < chain.length - 1; idx += 1) {
      connect(chain[idx], chain[idx + 1], 'success');
    }
    for (const step of orchestratorSteps.value) {
      connect(step.id, ORCHESTRATOR_FAILURE_NODE_ID, 'failure');
      if (step.failAction === 'jump' && step.failJumpStepId) {
        const targetIdx = orchestratorSteps.value.findIndex((item) => item.id === step.failJumpStepId);
        if (targetIdx >= 0) {
          connect(step.id, step.failJumpStepId, 'jump', `to #${targetIdx + 1}`);
        }
      }
    }
    if (orchestratorRollbackStrategy.value === 'rollback') {
      connect(ORCHESTRATOR_FAILURE_NODE_ID, ORCHESTRATOR_START_NODE_ID, 'rollback');
    }
    return edges;
  });

  const getOrchestratorStepSlotIndexByX = (x: number): number => {
    const startX = 16;
    const raw = Math.round((x - startX) / ORCHESTRATOR_STEP_GAP_X) - 1;
    return Math.max(0, Math.min(orchestratorSteps.value.length - 1, raw));
  };

  const reorderOrchestratorStepByIndex = (fromIndex: number, toIndex: number): void => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= orchestratorSteps.value.length || toIndex >= orchestratorSteps.value.length) {
      return;
    }
    const next = orchestratorSteps.value.slice();
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) {
      return;
    }
    next.splice(toIndex, 0, moved);
    orchestratorSteps.value = next;
    options.checkpointTimelineEdit('orchestrator-reorder', `from ${fromIndex + 1} to ${toIndex + 1}`);
    orchestratorExecutionSummary.value = `步骤重排：#${fromIndex + 1} -> #${toIndex + 1}`;
  };

  const onOrchestratorNodeClick = (nodeId: string): void => {
    if (pinnedOrchestratorNodeId.value === nodeId) {
      pinnedOrchestratorNodeId.value = '';
    } else {
      pinnedOrchestratorNodeId.value = nodeId;
    }
    if (nodeId !== ORCHESTRATOR_START_NODE_ID && nodeId !== ORCHESTRATOR_SUCCESS_NODE_ID && nodeId !== ORCHESTRATOR_FAILURE_NODE_ID) {
      selectedOrchestratorStepId.value = nodeId;
    }
  };

  const onOrchestratorNodePointerMove = (event: PointerEvent): void => {
    if (!orchestratorDraggingStepId.value) {
      return;
    }
    const nextX = Math.max(16, event.clientX - orchestratorDragPointerOffsetX.value);
    orchestratorDragXByStepId.value = {
      ...orchestratorDragXByStepId.value,
      [orchestratorDraggingStepId.value]: nextX,
    };
  };

  const onOrchestratorNodePointerUp = (): void => {
    const draggingId = orchestratorDraggingStepId.value;
    if (!draggingId) {
      return;
    }
    const fromIndex = orchestratorSteps.value.findIndex((item) => item.id === draggingId);
    const dropX = orchestratorDragXByStepId.value[draggingId];
    if (fromIndex >= 0 && Number.isFinite(dropX)) {
      const toIndex = getOrchestratorStepSlotIndexByX(dropX);
      reorderOrchestratorStepByIndex(fromIndex, toIndex);
    }
    orchestratorDraggingStepId.value = '';
    orchestratorDragPointerOffsetX.value = 0;
    orchestratorDragXByStepId.value = {};
    window.removeEventListener('pointermove', onOrchestratorNodePointerMove);
    window.removeEventListener('pointerup', onOrchestratorNodePointerUp);
  };

  const onOrchestratorNodePointerDown = (node: OrchestratorFlowNode, event: PointerEvent): void => {
    if (node.kind !== 'step') {
      return;
    }
    event.preventDefault();
    selectedOrchestratorStepId.value = node.id;
    orchestratorDraggingStepId.value = node.id;
    orchestratorDragPointerOffsetX.value = event.clientX - node.x;
    orchestratorDragXByStepId.value = { ...orchestratorDragXByStepId.value, [node.id]: node.x };
    window.addEventListener('pointermove', onOrchestratorNodePointerMove);
    window.addEventListener('pointerup', onOrchestratorNodePointerUp);
  };

  watch(
    () => orchestratorSteps.value.map((step) => step.id).join('|'),
    () => {
      resetOrchestratorNodeStates();
      orchestratorExecutionSummary.value = orchestratorSteps.value.length > 0 ? '待执行' : '暂无步骤';
      hoveredOrchestratorNodeId.value = '';
      if (pinnedOrchestratorNodeId.value && !orchestratorSteps.value.some((step) => step.id === pinnedOrchestratorNodeId.value)) {
        if (
          pinnedOrchestratorNodeId.value !== ORCHESTRATOR_START_NODE_ID &&
          pinnedOrchestratorNodeId.value !== ORCHESTRATOR_SUCCESS_NODE_ID &&
          pinnedOrchestratorNodeId.value !== ORCHESTRATOR_FAILURE_NODE_ID
        ) {
          pinnedOrchestratorNodeId.value = '';
        }
      }
      if (!selectedOrchestratorStepId.value || !orchestratorSteps.value.some((step) => step.id === selectedOrchestratorStepId.value)) {
        selectedOrchestratorStepId.value = orchestratorSteps.value[0]?.id || '';
      }
    },
    { immediate: true }
  );

  const addOrchestratorStep = (): void => {
    const type = orchestratorDraftAction.value;
    let label = '';
    const step: OrchestratorStep = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      condition: 'all',
      failAction: 'terminate',
      label: '',
      detail: '',
    };
    if (type === 'transitionPreset') {
      label = '转场预设';
    } else if (type === 'keyframePreset') {
      label = '关键帧预设';
    } else if (type === 'durationScale') {
      const factor = Math.max(0.1, Math.min(3, Number(orchestratorDraftScaleFactor.value || 1)));
      step.scaleFactor = factor;
      label = '时长缩放';
    } else if (type === 'audioVolumeMute') {
      const volume = Math.max(0, Math.min(200, Number(orchestratorDraftVolume.value || 0)));
      step.volume = volume;
      step.muted = orchestratorDraftMuted.value;
      label = '音频参数';
    } else {
      label = '替换最新媒体';
    }
    step.label = label;
    step.detail = buildOrchestratorStepDetail(step);
    orchestratorSteps.value = [...orchestratorSteps.value, step].slice(0, 20);
    selectedOrchestratorStepId.value = step.id;
  };

  const removeOrchestratorStep = (id: string): void => {
    orchestratorSteps.value = orchestratorSteps.value.filter((item) => item.id !== id);
    if (selectedOrchestratorStepId.value === id) {
      selectedOrchestratorStepId.value = orchestratorSteps.value[0]?.id || '';
    }
  };

  const clearOrchestrator = (): void => {
    orchestratorSteps.value = [];
    selectedOrchestratorStepId.value = '';
  };

  const resolveOrchestratorStepTargets = (step: OrchestratorStep, baseIndices: number[]): number[] =>
    baseIndices.filter((idx) => {
      const clip = options.clips.value[idx];
      if (!clip) {
        return false;
      }
      if (step.condition === 'all') {
        return true;
      }
      if (step.condition === 'hasMedia') {
        return Boolean(clip.sourceUrl || options.latestDoneVideoTaskByStoryboardId.value[clip.storyboardId]?.resultUrl);
      }
      if (step.condition === 'missingMedia') {
        return !clip.sourceUrl && !options.latestDoneVideoTaskByStoryboardId.value[clip.storyboardId]?.resultUrl;
      }
      const duration = Number(clip.durationSec ?? 0);
      return duration > Number(step.durationGtSec ?? 0);
    });

  const runOrchestrator = (): void => {
    const baseIndices = getBatchPanelTargetIndices();
    if (baseIndices.length === 0 || orchestratorSteps.value.length === 0) {
      options.quickCommandFeedback.value = '无可执行编排步骤或无目标片段';
      orchestratorExecutionSummary.value = '未执行（无步骤或无目标）';
      return;
    }
    const beforeRunSnapshot = options.createStudioSnapshot();
    resetOrchestratorNodeStates();
    setOrchestratorNodeStatus(ORCHESTRATOR_START_NODE_ID, 'running');
    orchestratorExecutionSummary.value = '执行中';
    options.checkpointTimelineEdit('run-orchestrator', `${orchestratorSteps.value.length} steps on ${baseIndices.length} clips`);
    const appliedStepIds: string[] = [];
    let currentStepId = '';
    const jumpCounters = new Map<string, number>();
    const attemptCounters = new Map<string, number>();
    let guardCount = 0;
    try {
      let stepIndex = 0;
      while (stepIndex < orchestratorSteps.value.length) {
        guardCount += 1;
        if (guardCount > 100) {
          throw new Error('编排终止：检测到异常循环跳转');
        }
        const step = orchestratorSteps.value[stepIndex];
        currentStepId = step.id;
        const attempts = (attemptCounters.get(step.id) ?? 0) + 1;
        attemptCounters.set(step.id, attempts);
        orchestratorNodeRunStats.value = {
          ...orchestratorNodeRunStats.value,
          [step.id]: {
            retries: Math.max(0, attempts - 1),
            jumps: orchestratorNodeRunStats.value[step.id]?.jumps ?? 0,
          },
        };
        setOrchestratorNodeStatus(step.id, 'running');
        try {
          const indices = resolveOrchestratorStepTargets(step, baseIndices);
          if (indices.length === 0) {
            setOrchestratorNodeStatus(step.id, 'skipped');
            stepIndex += 1;
            continue;
          }
          if (step.type === 'transitionPreset') {
            const preset = options.transitionCurvePresets.find((item) => item.id === options.selectedTransitionCurveId.value) || options.transitionCurvePresets[0];
            for (const idx of indices) {
              const clip = options.clips.value[idx];
              if (!clip) {
                continue;
              }
              clip.transition = {
                type: clip.transition?.type || 'fade',
                durationSec: preset.durationSec,
                easing: preset.easing,
                direction: clip.transition?.direction || 'left',
              };
            }
            setOrchestratorNodeStatus(step.id, 'success');
            appliedStepIds.push(step.id);
            stepIndex += 1;
            continue;
          }
          if (step.type === 'keyframePreset') {
            const preset = options.keyframePresets.find((item) => item.id === options.selectedKeyframePresetId.value) || options.keyframePresets[0];
            for (const idx of indices) {
              const clip = options.clips.value[idx];
              if (!clip) {
                continue;
              }
              clip.keyframe = { ...preset.keyframe };
            }
            setOrchestratorNodeStatus(step.id, 'success');
            appliedStepIds.push(step.id);
            stepIndex += 1;
            continue;
          }
          if (step.type === 'durationScale') {
            const factor = Math.max(0.1, Math.min(3, Number(step.scaleFactor ?? 1)));
            for (const idx of indices) {
              const clip = options.clips.value[idx];
              if (!clip) {
                continue;
              }
              clip.durationSec = options.normalizeDuration(Number(clip.durationSec ?? 5) * factor);
            }
            setOrchestratorNodeStatus(step.id, 'success');
            appliedStepIds.push(step.id);
            stepIndex += 1;
            continue;
          }
          if (step.type === 'audioVolumeMute') {
            const volume = Math.max(0, Math.min(200, Number(step.volume ?? 100)));
            for (const idx of indices) {
              const clip = options.clips.value[idx];
              if (!clip) {
                continue;
              }
              clip.volume = volume;
              clip.muted = Boolean(step.muted);
            }
            setOrchestratorNodeStatus(step.id, 'success');
            appliedStepIds.push(step.id);
            stepIndex += 1;
            continue;
          }
          if (step.type === 'replaceLatestMedia') {
            let updatedCount = 0;
            for (const idx of indices) {
              const clip = options.clips.value[idx];
              if (!clip) {
                continue;
              }
              const latest = options.latestDoneVideoTaskByStoryboardId.value[clip.storyboardId];
              if (!latest?.resultUrl) {
                continue;
              }
              clip.videoTaskId = latest.taskId;
              clip.sourceUrl = latest.resultUrl;
              updatedCount += 1;
            }
            if (updatedCount === 0) {
              throw new Error('步骤失败：replaceLatestMedia 未找到可替换媒体');
            }
            setOrchestratorNodeStatus(step.id, 'success');
            appliedStepIds.push(step.id);
          }
          stepIndex += 1;
        } catch (stepError) {
          const errorMessage = stepError instanceof Error ? stepError.message : String(stepError ?? 'unknown error');
          const eventAt = new Date().toISOString();
          setOrchestratorNodeStatus(step.id, 'failed');
          orchestratorNodeDebugInfo.value = {
            ...orchestratorNodeDebugInfo.value,
            [step.id]: {
              lastFailureReason: errorMessage,
              lastJumpTargetStepId: orchestratorNodeDebugInfo.value[step.id]?.lastJumpTargetStepId ?? '',
              lastEventAt: eventAt,
            },
          };
          if (step.failAction === 'jump' && step.failJumpStepId) {
            const jumpTarget = orchestratorSteps.value.findIndex((item) => item.id === step.failJumpStepId);
            const currentJumpCount = jumpCounters.get(step.id) ?? 0;
            if (jumpTarget >= 0 && currentJumpCount < 3) {
              jumpCounters.set(step.id, currentJumpCount + 1);
              orchestratorNodeRunStats.value = {
                ...orchestratorNodeRunStats.value,
                [step.id]: {
                  retries: orchestratorNodeRunStats.value[step.id]?.retries ?? 0,
                  jumps: currentJumpCount + 1,
                },
              };
              orchestratorNodeDebugInfo.value = {
                ...orchestratorNodeDebugInfo.value,
                [step.id]: {
                  lastFailureReason: errorMessage,
                  lastJumpTargetStepId: step.failJumpStepId,
                  lastEventAt: eventAt,
                },
              };
              setOrchestratorNodeStatus(ORCHESTRATOR_FAILURE_NODE_ID, 'running');
              orchestratorExecutionSummary.value = `步骤失败跳转：#${stepIndex + 1} -> #${jumpTarget + 1}（${currentJumpCount + 1}/3）`;
              stepIndex = jumpTarget;
              continue;
            }
          }
          throw stepError;
        }
      }
      setOrchestratorNodeStatus(ORCHESTRATOR_START_NODE_ID, 'success');
      setOrchestratorNodeStatus(ORCHESTRATOR_SUCCESS_NODE_ID, 'success');
      setOrchestratorNodeStatus(ORCHESTRATOR_FAILURE_NODE_ID, 'idle');
      options.syncVideoClipTimeline();
      options.quickCommandFeedback.value = `编排执行完成：${orchestratorSteps.value.length} 步 / ${baseIndices.length} 片段`;
      orchestratorExecutionSummary.value = `完成：${orchestratorSteps.value.length} 步`;
    } catch (runError) {
      if (currentStepId) {
        setOrchestratorNodeStatus(currentStepId, 'failed');
      }
      setOrchestratorNodeStatus(ORCHESTRATOR_FAILURE_NODE_ID, 'failed');
      if (orchestratorRollbackStrategy.value === 'rollback') {
        options.applyStudioSnapshot(beforeRunSnapshot);
        for (const stepId of appliedStepIds) {
          setOrchestratorNodeStatus(stepId, 'rolled_back');
        }
        setOrchestratorNodeStatus(ORCHESTRATOR_START_NODE_ID, 'rolled_back');
        setOrchestratorNodeStatus(ORCHESTRATOR_SUCCESS_NODE_ID, 'idle');
        options.quickCommandFeedback.value = `编排失败并已回滚：${runError instanceof Error ? runError.message : 'unknown error'}`;
        orchestratorExecutionSummary.value = '失败并已回滚';
        return;
      }
      setOrchestratorNodeStatus(ORCHESTRATOR_START_NODE_ID, 'success');
      options.quickCommandFeedback.value = `编排失败（未回滚）：${runError instanceof Error ? runError.message : 'unknown error'}`;
      orchestratorExecutionSummary.value = '失败（保留已执行）';
    }
  };

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onOrchestratorNodePointerMove);
    window.removeEventListener('pointerup', onOrchestratorNodePointerUp);
  });

  return {
    addOrchestratorStep,
    applyBatchPanelAudio,
    applyBatchPanelDurationScale,
    applyBatchPanelTransition,
    batchPanelMuted,
    batchPanelOnlyCurrentRange,
    batchPanelPreviewItems,
    batchPanelTransitionDurationSec,
    batchPanelTransitionType,
    batchPanelVolume,
    batchTransitionDurationSec,
    clearOrchestrator,
    clearPinnedOrchestratorNodeTooltip,
    copyOrchestratorNodeDebug,
    getBatchPanelTargetIndices,
    getOrchestratorNodeTooltipLines,
    onOrchestratorNodeClick,
    onOrchestratorNodeHover,
    onOrchestratorNodePointerDown,
    onOrchestratorTooltipCopy,
    orchestratorDraftAction,
    orchestratorDraftMuted,
    orchestratorDraftScaleFactor,
    orchestratorDraftVolume,
    orchestratorExecutionSummary,
    orchestratorFlowCanvasHeight,
    orchestratorFlowCanvasWidth,
    orchestratorFlowEdges,
    orchestratorFlowNodes,
    orchestratorJumpTargets,
    orchestratorRollbackStrategy,
    orchestratorSteps,
    orchestratorTargetCount,
    removeOrchestratorStep,
    runOrchestrator,
    selectedOrchestratorStep,
    selectedOrchestratorStepId,
    selectedOrchestratorStepIndex,
    shouldShowOrchestratorNodeTooltip,
    syncSelectedOrchestratorStepMeta,
    activeOrchestratorTooltipNodeId,
    activeOrchestratorTooltipNodeLabel,
  };
};
