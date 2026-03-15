<template>
  <TimelineTransitionPreviewPanel :items="transitionPreview" />
  <div v-if="timelineTracksPreviewWithPct.length > 0 && timelineTotalDurationSec > 0" class="timeline-visual" :class="{ immersive: studioImmersiveMode }">
    <TimelineVisualControlsPanel
      :timeline-total-duration-sec="timelineTotalDurationSec"
      :timeline-playing="timelinePlaying"
      :timeline-zoom-percent="timelineZoomPercent"
      :timeline-playhead-sec="timelinePlayheadSec"
      :timeline-loop-enabled="timelineLoopEnabled"
      :snap-enabled="snapEnabled"
      :snap-step-sec="snapStepSec"
      :selection-range-start-sec="selectionRangeStartSec"
      :selection-range-end-sec="selectionRangeEndSec"
      :duration-scale-factor="durationScaleFactor"
      :batch-transition-duration-sec="batchTransitionDurationSec"
      :selected-clip-count="selectedClipCount"
      :has-selected-clip="hasSelectedClip"
      :restored-tip="restoredTip"
      :set-timeline-zoom-percent="setTimelineZoomPercent"
      :set-timeline-playhead-sec="setTimelinePlayheadSec"
      :set-timeline-loop-enabled="setTimelineLoopEnabled"
      :set-snap-enabled="setSnapEnabled"
      :set-snap-step-sec="setSnapStepSec"
      :set-selection-range-start-sec="setSelectionRangeStartSec"
      :set-selection-range-end-sec="setSelectionRangeEndSec"
      :set-duration-scale-factor="setDurationScaleFactor"
      :set-batch-transition-duration-sec="setBatchTransitionDurationSec"
      :toggle-timeline-playback="toggleTimelinePlayback"
      :seek-timeline-start="seekTimelineStart"
      :step-playhead="stepPlayhead"
      :select-clips-by-range="selectClipsByRange"
      :clear-clip-range-selection="clearClipRangeSelection"
      :apply-keyframe-preset-to-selection="applyKeyframePresetToSelection"
      :apply-transition-preset-to-selection="applyTransitionPresetToSelection"
      :scale-selected-clip-durations="scaleSelectedClipDurations"
      :quick-scale-selected-clip-durations="quickScaleSelectedClipDurations"
      :apply-batch-transition-duration="applyBatchTransitionDuration"
      :copy-current-clip-params-to-selection="copyCurrentClipParamsToSelection"
      :reset-selected-clip-keyframes="resetSelectedClipKeyframes"
      :duplicate-selected-clips="duplicateSelectedClips"
      :remove-selected-clips="removeSelectedClips" />
    <TimelineBatchOrchestratorPanels
      :selected-clip-count="selectedClipCount"
      :selection-range-start-sec="selectionRangeStartSec"
      :selection-range-end-sec="selectionRangeEndSec"
      :batch-panel-preview-items="batchPanelPreviewItems"
      :apply-batch-panel-transition="applyBatchPanelTransition"
      :apply-batch-panel-audio="applyBatchPanelAudio"
      :apply-batch-panel-duration-scale="applyBatchPanelDurationScale"
      :apply-keyframe-preset-to-selection="applyKeyframePresetToSelection"
      :orchestrator-target-count="orchestratorTargetCount"
      :orchestrator-execution-summary="orchestratorExecutionSummary"
      :active-orchestrator-tooltip-node-id="activeOrchestratorTooltipNodeId"
      :active-orchestrator-tooltip-node-label="activeOrchestratorTooltipNodeLabel"
      :orchestrator-flow-canvas-width="orchestratorFlowCanvasWidth"
      :orchestrator-flow-canvas-height="orchestratorFlowCanvasHeight"
      :orchestrator-flow-edges="orchestratorFlowEdges"
      :orchestrator-flow-nodes="orchestratorFlowNodes"
      :selected-orchestrator-step-id="selectedOrchestratorStepId"
      :selected-orchestrator-step="selectedOrchestratorStep"
      :selected-orchestrator-step-index="selectedOrchestratorStepIndex"
      :orchestrator-jump-targets="orchestratorJumpTargets"
      :orchestrator-steps="orchestratorSteps"
      :add-orchestrator-step="addOrchestratorStep"
      :run-orchestrator="runOrchestrator"
      :clear-orchestrator="clearOrchestrator"
      :copy-orchestrator-node-debug="copyOrchestratorNodeDebug"
      :clear-pinned-orchestrator-node-tooltip="clearPinnedOrchestratorNodeTooltip"
      :on-orchestrator-node-pointer-down="onOrchestratorNodePointerDown"
      :on-orchestrator-node-click="onOrchestratorNodeClick"
      :on-orchestrator-node-hover="onOrchestratorNodeHover"
      :on-orchestrator-tooltip-copy="onOrchestratorTooltipCopy"
      :get-orchestrator-node-tooltip-lines="getOrchestratorNodeTooltipLines"
      :should-show-orchestrator-node-tooltip="shouldShowOrchestratorNodeTooltip"
      :sync-selected-orchestrator-step-meta="syncSelectedOrchestratorStepMeta"
      :remove-orchestrator-step="removeOrchestratorStep"
      v-model:batch-panel-transition-type="batchPanelTransitionTypeModel"
      v-model:batch-panel-transition-duration-sec="batchPanelTransitionDurationSecModel"
      v-model:batch-panel-volume="batchPanelVolumeModel"
      v-model:batch-panel-muted="batchPanelMutedModel"
      v-model:batch-panel-only-current-range="batchPanelOnlyCurrentRangeModel"
      v-model:orchestrator-draft-action="orchestratorDraftActionModel"
      v-model:orchestrator-draft-scale-factor="orchestratorDraftScaleFactorModel"
      v-model:orchestrator-draft-volume="orchestratorDraftVolumeModel"
      v-model:orchestrator-draft-muted="orchestratorDraftMutedModel"
      v-model:orchestrator-rollback-strategy="orchestratorRollbackStrategyModel" />
    <TimelineResizeCurvePanel
      :resize-curve-preview="resizeCurvePreview"
      :resize-curve-duration-delta-sec="resizeCurveDurationDeltaSec"
      :resize-curve-start-slope-delta="resizeCurveStartSlopeDelta"
      :resize-curve-end-slope-delta="resizeCurveEndSlopeDelta"
      :resize-curve-old-path="resizeCurveOldPath"
      :resize-curve-new-path="resizeCurveNewPath"
      :resize-curve-snapshots="resizeCurveSnapshots"
      :clear-resize-curve-snapshots="clearResizeCurveSnapshots" />
    <TimelineTrackCanvasPanel
      :timeline-zoom-percent="timelineZoomPercent"
      :timeline-ticks="timelineTicks"
      :timeline-total-duration-sec="timelineTotalDurationSec"
      :timeline-playhead-pct="timelinePlayheadPct"
      :timeline-tracks-preview-with-pct="timelineTracksPreviewWithPct"
      :external-file-drag-active="externalFileDragActive"
      :timeline-bar-drag-source-index="timelineBarDragSourceIndex"
      :timeline-bar-drag-target-index="timelineBarDragTargetIndex"
      :selected-clip-indices="selectedClipIndices"
      :selection-box="selectionBox"
      :dock-drop-indicator="dockDropIndicator"
      :on-timeline-canvas-wheel="onTimelineCanvasWheel"
      :on-timeline-ruler-pointer-down="onTimelineRulerPointerDown"
      :on-timeline-lane-dock-drag-over="onTimelineLaneDockDragOver"
      :on-timeline-lane-dock-drop="onTimelineLaneDockDrop"
      :on-timeline-lane-dock-drag-leave="onTimelineLaneDockDragLeave"
      :on-video-lane-pointer-down="onVideoLanePointerDown"
      :on-timeline-bar-drag-start="onTimelineBarDragStart"
      :on-timeline-bar-drag-over="onTimelineBarDragOver"
      :on-timeline-bar-drop="onTimelineBarDrop"
      :on-timeline-bar-drag-end="onTimelineBarDragEnd"
      :select-clip-from-timeline-bar="selectClipFromTimelineBar"
      :start-video-resize="startVideoResize" />
    <TimelineHistoryPanel
      :undo-count="undoCount"
      :redo-count="redoCount"
      :command-history="commandHistory"
      :undo-timeline-edit="undoTimelineEdit"
      :redo-timeline-edit="redoTimelineEdit"
      :replay-history-command="replayHistoryCommand" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  OrchestratorActionType,
  OrchestratorFlowEdge,
  OrchestratorFlowNode,
  OrchestratorRollbackStrategy,
  OrchestratorStep,
} from '@/composables/useTimelineBatchOrchestrator';
import type { TimelineCommandHistoryItem } from '@/composables/useTimelineHistory';
import type { ResizeCurvePreview } from '@/composables/useTimelineLanePointerOps';
import type { ResizeCurveSnapshot } from '@/composables/useTimelineResizeCurvePreview';
import TimelineBatchOrchestratorPanels from '@/features/timeline-editor/components/TimelineBatchOrchestratorPanels.vue';
import TimelineHistoryPanel from '@/features/timeline-editor/components/TimelineHistoryPanel.vue';
import TimelineResizeCurvePanel from '@/features/timeline-editor/components/TimelineResizeCurvePanel.vue';
import TimelineTrackCanvasPanel from '@/features/timeline-editor/components/TimelineTrackCanvasPanel.vue';
import TimelineTransitionPreviewPanel from '@/features/timeline-editor/components/TimelineTransitionPreviewPanel.vue';
import TimelineVisualControlsPanel from '@/features/timeline-editor/components/TimelineVisualControlsPanel.vue';

type AsyncAction = () => void | Promise<void>;
type TransitionPreviewItem = {
  fromTitle: string;
  toTitle: string;
  transitionType: string;
  durationSec: number;
  offsetSec: number;
  filter: string;
};
type TimelineLaneItem = {
  key: string;
  label: string;
  leftPct: number;
  widthPct: number;
  startSec: number;
  endSec: number;
  clipIndex: number;
};
type TimelineLane = {
  trackId: string;
  title: string;
  durationSec: number;
  items: readonly TimelineLaneItem[];
};
type SelectionBox = {
  active: boolean;
  leftPx: number;
  widthPx: number;
};
type DockDropIndicator = {
  active: boolean;
  leftPx: number;
};
type BatchTransitionType = 'cut' | 'fade' | 'dissolve' | 'wipeleft' | 'wiperight';
type BatchPanelPreviewItem = {
  index: number;
  title: string;
  span: string;
};
type OrchestratorJumpTarget = {
  id: string;
  idx: number;
  label: string;
};

const props = defineProps<{
  transitionPreview: readonly TransitionPreviewItem[];
  studioImmersiveMode: boolean;
  timelineTracksPreviewWithPct: readonly TimelineLane[];
  timelineTotalDurationSec: number;
  timelinePlaying: boolean;
  timelineZoomPercent: number;
  timelinePlayheadSec: number;
  timelinePlayheadPct: number;
  timelineLoopEnabled: boolean;
  snapEnabled: boolean;
  snapStepSec: number;
  selectionRangeStartSec: number;
  selectionRangeEndSec: number;
  durationScaleFactor: number;
  batchTransitionDurationSec: number;
  selectedClipCount: number;
  hasSelectedClip: boolean;
  restoredTip: string;
  timelineTicks: readonly number[];
  externalFileDragActive: boolean;
  timelineBarDragSourceIndex: number | null;
  timelineBarDragTargetIndex: number | null;
  selectedClipIndices: readonly number[];
  selectionBox: SelectionBox;
  dockDropIndicator: DockDropIndicator;
  undoCount: number;
  redoCount: number;
  commandHistory: TimelineCommandHistoryItem[];
  resizeCurvePreview: ResizeCurvePreview | null;
  resizeCurveDurationDeltaSec: number;
  resizeCurveStartSlopeDelta: number;
  resizeCurveEndSlopeDelta: number;
  resizeCurveOldPath: string;
  resizeCurveNewPath: string;
  resizeCurveSnapshots: ResizeCurveSnapshot[];
  batchPanelTransitionType: BatchTransitionType;
  batchPanelTransitionDurationSec: number;
  batchPanelVolume: number;
  batchPanelMuted: boolean;
  batchPanelOnlyCurrentRange: boolean;
  batchPanelPreviewItems: BatchPanelPreviewItem[];
  orchestratorTargetCount: number;
  orchestratorDraftAction: OrchestratorActionType;
  orchestratorDraftScaleFactor: number;
  orchestratorDraftVolume: number;
  orchestratorDraftMuted: boolean;
  orchestratorRollbackStrategy: OrchestratorRollbackStrategy;
  orchestratorExecutionSummary: string;
  activeOrchestratorTooltipNodeId: string;
  activeOrchestratorTooltipNodeLabel: string;
  orchestratorFlowCanvasWidth: number;
  orchestratorFlowCanvasHeight: number;
  orchestratorFlowEdges: OrchestratorFlowEdge[];
  orchestratorFlowNodes: OrchestratorFlowNode[];
  selectedOrchestratorStepId: string;
  selectedOrchestratorStep: OrchestratorStep | null;
  selectedOrchestratorStepIndex: number;
  orchestratorJumpTargets: OrchestratorJumpTarget[];
  orchestratorSteps: OrchestratorStep[];
  setTimelineZoomPercent: (value: number) => void | Promise<void>;
  setTimelinePlayheadSec: (value: number) => void | Promise<void>;
  setTimelineLoopEnabled: (value: boolean) => void | Promise<void>;
  setSnapEnabled: (value: boolean) => void | Promise<void>;
  setSnapStepSec: (value: number) => void | Promise<void>;
  setSelectionRangeStartSec: (value: number) => void | Promise<void>;
  setSelectionRangeEndSec: (value: number) => void | Promise<void>;
  setDurationScaleFactor: (value: number) => void | Promise<void>;
  setBatchTransitionDurationSec: (value: number) => void | Promise<void>;
  setBatchPanelTransitionType: (value: BatchTransitionType) => void | Promise<void>;
  setBatchPanelTransitionDurationSec: (value: number) => void | Promise<void>;
  setBatchPanelVolume: (value: number) => void | Promise<void>;
  setBatchPanelMuted: (value: boolean) => void | Promise<void>;
  setBatchPanelOnlyCurrentRange: (value: boolean) => void | Promise<void>;
  setOrchestratorDraftAction: (value: OrchestratorActionType) => void | Promise<void>;
  setOrchestratorDraftScaleFactor: (value: number) => void | Promise<void>;
  setOrchestratorDraftVolume: (value: number) => void | Promise<void>;
  setOrchestratorDraftMuted: (value: boolean) => void | Promise<void>;
  setOrchestratorRollbackStrategy: (value: OrchestratorRollbackStrategy) => void | Promise<void>;
  toggleTimelinePlayback: AsyncAction;
  seekTimelineStart: AsyncAction;
  stepPlayhead: (direction: -1 | 1) => void | Promise<void>;
  selectClipsByRange: AsyncAction;
  clearClipRangeSelection: AsyncAction;
  applyKeyframePresetToSelection: AsyncAction;
  applyTransitionPresetToSelection: AsyncAction;
  scaleSelectedClipDurations: AsyncAction;
  quickScaleSelectedClipDurations: (factor: number) => void | Promise<void>;
  applyBatchTransitionDuration: AsyncAction;
  copyCurrentClipParamsToSelection: AsyncAction;
  resetSelectedClipKeyframes: AsyncAction;
  duplicateSelectedClips: AsyncAction;
  removeSelectedClips: AsyncAction;
  applyBatchPanelTransition: AsyncAction;
  applyBatchPanelAudio: AsyncAction;
  applyBatchPanelDurationScale: AsyncAction;
  addOrchestratorStep: AsyncAction;
  runOrchestrator: AsyncAction;
  clearOrchestrator: AsyncAction;
  copyOrchestratorNodeDebug: (nodeId: string) => void | Promise<void>;
  clearPinnedOrchestratorNodeTooltip: AsyncAction;
  onOrchestratorNodePointerDown: (node: OrchestratorFlowNode, event: PointerEvent) => void | Promise<void>;
  onOrchestratorNodeClick: (nodeId: string) => void | Promise<void>;
  onOrchestratorNodeHover: (nodeId: string) => void | Promise<void>;
  onOrchestratorTooltipCopy: (nodeId: string) => void | Promise<void>;
  getOrchestratorNodeTooltipLines: (nodeId: string) => string[];
  shouldShowOrchestratorNodeTooltip: (nodeId: string) => boolean;
  syncSelectedOrchestratorStepMeta: AsyncAction;
  removeOrchestratorStep: (stepId: string) => void | Promise<void>;
  clearResizeCurveSnapshots: AsyncAction;
  onTimelineCanvasWheel: (event: WheelEvent) => void | Promise<void>;
  onTimelineRulerPointerDown: (event: PointerEvent) => void | Promise<void>;
  onTimelineLaneDockDragOver: (event: DragEvent) => void | Promise<void>;
  onTimelineLaneDockDrop: (event: DragEvent) => void | Promise<void>;
  onTimelineLaneDockDragLeave: (event: DragEvent) => void | Promise<void>;
  onVideoLanePointerDown: (event: PointerEvent) => void | Promise<void>;
  onTimelineBarDragStart: (clipIndex: number, event: DragEvent) => void | Promise<void>;
  onTimelineBarDragOver: (clipIndex: number, event: DragEvent) => void | Promise<void>;
  onTimelineBarDrop: (clipIndex: number, event: DragEvent) => void | Promise<void>;
  onTimelineBarDragEnd: () => void | Promise<void>;
  selectClipFromTimelineBar: (clipIndex: number) => void | Promise<void>;
  startVideoResize: (clipIndex: number, edge: 'start' | 'end', laneDurationSec: number, event: PointerEvent) => void | Promise<void>;
  undoTimelineEdit: AsyncAction;
  redoTimelineEdit: AsyncAction;
  replayHistoryCommand: (id: string) => void | Promise<void>;
}>();

const batchPanelTransitionTypeModel = computed({
  get: () => props.batchPanelTransitionType,
  set: (value: BatchTransitionType) => props.setBatchPanelTransitionType(value),
});
const batchPanelTransitionDurationSecModel = computed({
  get: () => props.batchPanelTransitionDurationSec,
  set: (value: number) => props.setBatchPanelTransitionDurationSec(value),
});
const batchPanelVolumeModel = computed({
  get: () => props.batchPanelVolume,
  set: (value: number) => props.setBatchPanelVolume(value),
});
const batchPanelMutedModel = computed({
  get: () => props.batchPanelMuted,
  set: (value: boolean) => props.setBatchPanelMuted(value),
});
const batchPanelOnlyCurrentRangeModel = computed({
  get: () => props.batchPanelOnlyCurrentRange,
  set: (value: boolean) => props.setBatchPanelOnlyCurrentRange(value),
});
const orchestratorDraftActionModel = computed({
  get: () => props.orchestratorDraftAction,
  set: (value: OrchestratorActionType) => props.setOrchestratorDraftAction(value),
});
const orchestratorDraftScaleFactorModel = computed({
  get: () => props.orchestratorDraftScaleFactor,
  set: (value: number) => props.setOrchestratorDraftScaleFactor(value),
});
const orchestratorDraftVolumeModel = computed({
  get: () => props.orchestratorDraftVolume,
  set: (value: number) => props.setOrchestratorDraftVolume(value),
});
const orchestratorDraftMutedModel = computed({
  get: () => props.orchestratorDraftMuted,
  set: (value: boolean) => props.setOrchestratorDraftMuted(value),
});
const orchestratorRollbackStrategyModel = computed({
  get: () => props.orchestratorRollbackStrategy,
  set: (value: OrchestratorRollbackStrategy) => props.setOrchestratorRollbackStrategy(value),
});
</script>

<style scoped>
.timeline-visual {
  border: 1px solid #d7deea;
  border-radius: 10px;
  background: #f9fbff;
  padding: 10px;
  margin-bottom: 12px;
}

.timeline-visual.immersive {
  background: #f4f8ff;
  border-color: #c8d7f4;
}
</style>
