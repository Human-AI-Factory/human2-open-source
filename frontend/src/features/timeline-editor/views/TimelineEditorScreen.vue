<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="timeline-workbench-shell">
      <template #rail>
        <TimelineControlPanels
      :project="project"
      :error="error"
      :studio-dense-mode="studioDenseMode"
      :studio-immersive-mode="studioImmersiveMode"
      :show-hotkey-help="showHotkeyHelp"
      :episodes="episodes"
      :loading="loading"
      :desktop-ingest-status="desktopIngestStatus"
      :quick-command-feedback="quickCommandFeedback"
      :saved-macros="savedMacros"
      :global-macros="globalMacros"
      :selected-clip-summary="selectedClipSummary"
      :local-draft-meta="localDraftMeta"
      :workspace-quick-slots="workspaceQuickSlots"
      :latest-team-template-audit="latestTeamTemplateAudit"
      :highlighted-template-id="highlightedTemplateId"
      :layout-templates="layoutTemplates"
      :last-auto-save-at="lastAutoSaveAt"
      :set-quick-command-input-ref="setQuickCommandInputRef"
      :set-macro-import-input-ref="setMacroImportInputRef"
      :set-workspace-import-input-ref="setWorkspaceImportInputRef"
      :go-project="goProject"
      :load-all="loadAll"
      :toggle-studio-dense-mode="toggleStudioDenseMode"
      :toggle-studio-immersive-mode="toggleStudioImmersiveMode"
      :toggle-hotkey-help="toggleHotkeyHelp"
      :load-timeline="loadTimeline"
      :save-timeline="saveTimeline"
      :create-timeline-audio-tasks="createTimelineAudioTasks"
      :sync-completed-audio-to-timeline="syncCompletedAudioToTimeline"
      :generate-subtitle-track-for-timeline="generateSubtitleTrackForTimeline"
      :create-merge-by-timeline="createMergeByTimeline"
      :postproduction-message="postproductionMessage"
      :go-frame-prompt-workbench="goFramePromptWorkbench"
      :go-storyboard-workbench="goStoryboardWorkbench"
      :go-asset-workbench="goAssetWorkbench"
      :run-quick-command="runQuickCommand"
      :save-macro-command="saveMacroCommand"
      :export-macro-commands="exportMacroCommands"
      :trigger-macro-import="triggerMacroImport"
      :run-selected-macro="runSelectedMacro"
      :load-selected-macro-to-draft="loadSelectedMacroToDraft"
      :rename-selected-macro="renameSelectedMacro"
      :overwrite-selected-macro-commands="overwriteSelectedMacroCommands"
      :delete-selected-macro="deleteSelectedMacro"
      :save-selected-macro-to-global="saveSelectedMacroToGlobal"
      :handle-macro-import-file-change="handleMacroImportFileChange"
      :run-selected-global-macro="runSelectedGlobalMacro"
      :import-selected-global-macro-to-local="importSelectedGlobalMacroToLocal"
      :rename-selected-global-macro="renameSelectedGlobalMacro"
      :delete-selected-global-macro="deleteSelectedGlobalMacro"
      :apply-workspace-preset="applyWorkspacePreset"
      :save-workspace-draft-to-local="saveWorkspaceDraftToLocal"
      :restore-workspace-draft-from-local="restoreWorkspaceDraftFromLocal"
      :clear-workspace-draft="clearWorkspaceDraft"
      :export-workspace-draft="exportWorkspaceDraft"
      :trigger-workspace-import="triggerWorkspaceImport"
      :handle-workspace-import-file-change="handleWorkspaceImportFileChange"
      :save-current-layout-template="saveCurrentLayoutTemplate"
      :save-workspace-quick-slot="saveWorkspaceQuickSlot"
      :restore-workspace-quick-slot="restoreWorkspaceQuickSlot"
      :delete-workspace-quick-slot="deleteWorkspaceQuickSlot"
      :focus-template-card="focusTemplateCard"
      :apply-layout-template="applyLayoutTemplate"
      :rename-layout-template="renameLayoutTemplate"
      :delete-layout-template="deleteLayoutTemplate"
      :fork-team-template-to-personal="forkTeamTemplateToPersonal"
      v-model:selected-episode-id="selectedEpisodeId"
      v-model:timeline-title="timelineTitle"
      v-model:quick-command="quickCommand"
      v-model:macro-name="macroName"
      v-model:macro-command-text="macroCommandText"
      v-model:selected-macro-id="selectedMacroId"
      v-model:global-macro-name-draft="globalMacroNameDraft"
      v-model:selected-global-macro-id="selectedGlobalMacroId"
      v-model:timeline-sync-enabled="timelineSyncEnabled"
      v-model:workspace-preset-id="workspacePresetId"
      v-model:auto-save-enabled="autoSaveEnabled"
      v-model:dock-layout-mode="dockLayoutMode"
      v-model:clip-panel-layout-mode="clipPanelLayoutMode"
      v-model:layout-template-name="layoutTemplateName"
      v-model:layout-template-scope="layoutTemplateScope"
      v-model:selected-workspace-quick-slot-id="selectedWorkspaceQuickSlotId" />

        <section class="panel" v-if="postproductionMessage || desktopIngestStatus || quickCommandFeedback">
          <h3>运行反馈</h3>
          <p class="muted" v-if="postproductionMessage">{{ postproductionMessage }}</p>
          <p class="muted" v-if="desktopIngestStatus">桌面桥接：{{ desktopIngestStatus }}</p>
          <p class="muted" v-if="quickCommandFeedback">命令反馈：{{ quickCommandFeedback }}</p>
        </section>
      </template>

      <section class="panel">
      <h3>剪辑轨道</h3>
      <p class="muted">支持同轨拖拽排序与音频/文本跨轨拖拽；右侧集中编辑关键帧与转场参数。</p>
      <TimelineAuxTracksPanel
        v-if="!studioImmersiveMode"
        :audio-track="audioTrack"
        :text-track="textTrack"
        :storyboards="storyboards"
        :aux-drag-source="auxDragSource"
        :audio-clip-spans="audioClipSpans"
        :text-clip-spans="textClipSpans"
        :format-clip-span="formatClipSpan"
        :add-audio-clip="addAudioClip"
        :add-text-clip="addTextClip"
        :move-aux-clip="moveAuxClip"
        :on-aux-clip-drag-start="onAuxClipDragStart"
        :on-aux-clip-drag-over="onAuxClipDragOver"
        :on-aux-clip-drop="onAuxClipDrop"
        :on-aux-clip-drag-end="onAuxClipDragEnd"
        :on-aux-clip-drop-to-end="onAuxClipDropToEnd"
        :remove-audio-clip="removeAudioClip"
        :remove-text-clip="removeTextClip" />
      <div
        class="timeline-editor-layout"
        :class="{ dense: studioDenseMode, immersive: studioImmersiveMode }"
        :style="timelineEditorLayoutStyle"
        v-if="clips.length > 0">
        <TimelineStudioDockPanel
          :dock-class-list="dockClassList"
          :dock-floating-style="dockFloatingStyle"
          :dock-pinned="dockPinned"
          :dock-locked="dockLocked"
          :studio-dock-collapsed="studioDockCollapsed"
          :dock-layout-mode="dockLayoutMode"
          :active-dock-panel="activeDockPanel"
          :dock-search="dockSearch"
          :filtered-storyboard-dock-items="filteredStoryboardDockItems"
          :filtered-media-dock-items="filteredMediaDockItems"
          :filtered-keyframe-dock-presets="filteredKeyframeDockPresets"
          :filtered-transition-dock-presets="filteredTransitionDockPresets"
          :has-selected-clip="Boolean(selectedClip)"
          :selected-clip-count="selectedClipIndices.length"
          :activate-dock-panel="activateDockPanel"
          :toggle-dock-pinned="toggleDockPinned"
          :toggle-dock-locked="toggleDockLocked"
          :toggle-studio-dock-collapsed="toggleStudioDockCollapsed"
          :set-active-dock-panel="setActiveDockPanel"
          :set-dock-search="setDockSearch"
          :start-dock-float-drag="startDockFloatDrag"
          :start-dock-resize="startDockResize"
          :on-dock-shot-drag-start="onDockShotDragStart"
          :on-dock-shot-drag-end="onDockShotDragEnd"
          :add-clip-from-storyboard="addClipFromStoryboard"
          :apply-media-to-selected-clips-batch="applyMediaToSelectedClipsBatch"
          :auto-bind-media-for-timeline-clips="autoBindMediaForTimelineClips"
          :apply-media-to-selected-clip="applyMediaToSelectedClip"
          :append-media-as-clip="appendMediaAsClip"
          :apply-dock-keyframe-preset="applyDockKeyframePreset"
          :apply-dock-transition-preset="applyDockTransitionPreset" />
        <TimelineClipListPanel
          :clips="clips"
          :selected-clip-index="selectedClipIndex"
          :selected-clip-indices="selectedClipIndices"
          :drag-source-index="dragSourceIndex"
          :drag-target-index="dragTargetIndex"
          :studio-dense-mode="studioDenseMode"
          :storyboard-title-map="storyboardTitleMap"
          :video-clip-spans="videoClipSpans"
          :timeline-list-style="timelineListStyle"
          :set-timeline-list-ref="setTimelineListRef"
          :format-clip-span="formatClipSpan"
          :select-clip="selectClip"
          :on-clip-drag-start="onClipDragStart"
          :on-clip-drag-over="onClipDragOver"
          :on-clip-drop="onClipDrop"
          :on-clip-drag-end="onClipDragEnd"
          :move-clip="moveClip"
          :remove-clip="removeClip"
          :on-clip-drop-to-end="onClipDropToEnd" />

        <TimelineClipEditorPanel
          v-if="selectedClip"
          :selected-clip="selectedClip"
          :audio-track="audioTrack"
          :storyboard-title-map="storyboardTitleMap"
          :selected-clip-span="selectedClipSpan"
          :timeline-playhead-sec="timelinePlayheadSec"
          :clip-panel-class-list="clipPanelClassList"
          :clip-panel-floating-style="clipPanelFloatingStyle"
          :clip-panel-layout-mode="clipPanelLayoutMode"
          :clip-panel-pinned="clipPanelPinned"
          :clip-panel-locked="clipPanelLocked"
          :active-panel-tab="activePanelTab"
          :selected-keyframe-preset-id="selectedKeyframePresetId"
          :selected-transition-curve-id="selectedTransitionCurveId"
          :keyframe-presets="keyframePresets"
          :transition-curve-presets="transitionCurvePresets"
          :keyframe-curve-label="keyframeCurveLabel"
          :keyframe-start-position="keyframeStartPosition"
          :keyframe-end-position="keyframeEndPosition"
          :keyframe-preview-progress="keyframePreviewProgress"
          :curve-strength-percent="curveStrengthPercent"
          :keyframe-preview-playing="keyframePreviewPlaying"
          :keyframe-curve-path-d="keyframeCurvePathD"
          :keyframe-sample-points="keyframeSamplePoints"
          :keyframe-start-canvas="keyframeStartCanvas"
          :keyframe-end-canvas="keyframeEndCanvas"
          :bezier-control1="bezierControl1"
          :bezier-control2="bezierControl2"
          :keyframe-progress-canvas="keyframeProgressCanvas"
          :crop-aspect-lock="cropAspectLock"
          :crop-box-style="cropBoxStyle"
          :format-clip-span="formatClipSpan"
          :activate-clip-panel="activateClipPanel"
          :toggle-clip-panel-pinned="toggleClipPanelPinned"
          :toggle-clip-panel-locked="toggleClipPanelLocked"
          :set-active-panel-tab="setActivePanelTab"
          :set-selected-keyframe-preset-id="setSelectedKeyframePresetId"
          :set-selected-transition-curve-id="setSelectedTransitionCurveId"
          :set-keyframe-preview-progress="setKeyframePreviewProgress"
          :set-curve-strength-percent="setCurveStrengthPercent"
          :set-crop-aspect-lock="setCropAspectLock"
          :set-keyframe-canvas-ref="setKeyframeCanvasRef"
          :set-crop-canvas-ref="setCropCanvasRef"
          :start-clip-panel-float-drag="startClipPanelFloatDrag"
          :focus-selected-clip-playhead="focusSelectedClipPlayhead"
          :replace-selected-clip-source-with-latest-task="replaceSelectedClipSourceWithLatestTask"
          :sync-video-clip-timeline="syncVideoClipTimeline"
          :apply-selected-keyframe-preset="applySelectedKeyframePreset"
          :apply-selected-transition-curve-preset="applySelectedTransitionCurvePreset"
          :toggle-keyframe-preview-play="toggleKeyframePreviewPlay"
          :reset-bezier-controls-by-preset="resetBezierControlsByPreset"
          :on-keyframe-canvas-pointer-down="onKeyframeCanvasPointerDown"
          :keyframe-point-style="keyframePointStyle"
          :start-keyframe-point-drag="startKeyframePointDrag"
          :reset-selected-clip-keyframe="resetSelectedClipKeyframe"
          :reset-selected-clip-transition="resetSelectedClipTransition"
          :is-effect-enabled="isEffectEnabled"
          :get-numeric-effect-config="getNumericEffectConfig"
          :set-effect-enabled="setEffectEnabled"
          :set-numeric-effect-config="setNumericEffectConfig"
          :reset-crop-to-full-frame="resetCropToFullFrame"
          :start-crop-drag="startCropDrag" />
      </div>
      <TimelineWorkbenchPanel
        :transition-preview="transitionPreview"
        :studio-immersive-mode="studioImmersiveMode"
        :timeline-tracks-preview-with-pct="timelineTracksPreviewWithPct"
        :timeline-total-duration-sec="timelineTotalDurationSec"
        :timeline-playing="timelinePlaying"
        :timeline-zoom-percent="timelineZoomPercent"
        :timeline-playhead-sec="timelinePlayheadSec"
        :timeline-playhead-pct="timelinePlayheadPct"
        :timeline-loop-enabled="timelineLoopEnabled"
        :snap-enabled="snapEnabled"
        :snap-step-sec="snapStepSec"
        :selection-range-start-sec="selectionRangeStartSec"
        :selection-range-end-sec="selectionRangeEndSec"
        :duration-scale-factor="durationScaleFactor"
        :batch-transition-duration-sec="batchTransitionDurationSec"
        :selected-clip-count="selectedClipIndices.length"
        :has-selected-clip="Boolean(selectedClip)"
        :restored-tip="batchToolRestoredTip"
        :timeline-ticks="timelineTicks"
        :external-file-drag-active="externalFileDragActive"
        :timeline-bar-drag-source-index="timelineBarDragSourceIndex"
        :timeline-bar-drag-target-index="timelineBarDragTargetIndex"
        :selected-clip-indices="selectedClipIndices"
        :selection-box="selectionBox"
        :dock-drop-indicator="dockDropIndicator"
        :undo-count="undoStack.length"
        :redo-count="redoStack.length"
        :command-history="commandHistory"
        :resize-curve-preview="resizeCurvePreview"
        :resize-curve-duration-delta-sec="resizeCurveDurationDeltaSec"
        :resize-curve-start-slope-delta="resizeCurveStartSlopeDelta"
        :resize-curve-end-slope-delta="resizeCurveEndSlopeDelta"
        :resize-curve-old-path="resizeCurveOldPath"
        :resize-curve-new-path="resizeCurveNewPath"
        :resize-curve-snapshots="resizeCurveSnapshots"
        :batch-panel-transition-type="batchPanelTransitionType"
        :batch-panel-transition-duration-sec="batchPanelTransitionDurationSec"
        :batch-panel-volume="batchPanelVolume"
        :batch-panel-muted="batchPanelMuted"
        :batch-panel-only-current-range="batchPanelOnlyCurrentRange"
        :batch-panel-preview-items="batchPanelPreviewItems"
        :orchestrator-target-count="orchestratorTargetCount"
        :orchestrator-draft-action="orchestratorDraftAction"
        :orchestrator-draft-scale-factor="orchestratorDraftScaleFactor"
        :orchestrator-draft-volume="orchestratorDraftVolume"
        :orchestrator-draft-muted="orchestratorDraftMuted"
        :orchestrator-rollback-strategy="orchestratorRollbackStrategy"
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
        :set-timeline-zoom-percent="setTimelineZoomPercent"
        :set-timeline-playhead-sec="setTimelinePlayheadSec"
        :set-timeline-loop-enabled="setTimelineLoopEnabled"
        :set-snap-enabled="setSnapEnabled"
        :set-snap-step-sec="setSnapStepSec"
        :set-selection-range-start-sec="setSelectionRangeStartSec"
        :set-selection-range-end-sec="setSelectionRangeEndSec"
        :set-duration-scale-factor="setDurationScaleFactor"
        :set-batch-transition-duration-sec="setBatchTransitionDurationSec"
        :set-batch-panel-transition-type="setBatchPanelTransitionType"
        :set-batch-panel-transition-duration-sec="setBatchPanelTransitionDurationSec"
        :set-batch-panel-volume="setBatchPanelVolume"
        :set-batch-panel-muted="setBatchPanelMuted"
        :set-batch-panel-only-current-range="setBatchPanelOnlyCurrentRange"
        :set-orchestrator-draft-action="setOrchestratorDraftAction"
        :set-orchestrator-draft-scale-factor="setOrchestratorDraftScaleFactor"
        :set-orchestrator-draft-volume="setOrchestratorDraftVolume"
        :set-orchestrator-draft-muted="setOrchestratorDraftMuted"
        :set-orchestrator-rollback-strategy="setOrchestratorRollbackStrategy"
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
        :remove-selected-clips="removeSelectedClips"
        :apply-batch-panel-transition="applyBatchPanelTransition"
        :apply-batch-panel-audio="applyBatchPanelAudio"
        :apply-batch-panel-duration-scale="applyBatchPanelDurationScale"
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
        :clear-resize-curve-snapshots="clearResizeCurveSnapshots"
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
        :start-video-resize="startVideoResize"
        :undo-timeline-edit="undoTimelineEdit"
        :redo-timeline-edit="redoTimelineEdit"
        :replay-history-command="replayHistoryCommand" />
      <p v-if="clips.length === 0" class="muted">暂无片段。请先在项目页生成分镜视频任务并完成。</p>
      </section>

      <template #inspector>
        <section class="panel timeline-summary-panel">
          <h3>Timeline Inspector</h3>
          <p class="muted">分集：{{ selectedEpisodeId || '未选择' }}</p>
          <p class="muted">时间线：{{ timelineTitle || '未命名时间线' }}</p>
          <p class="muted">片段：{{ clips.length }} · 音轨：{{ visibleAudioTracks.length }} · 字幕轨：{{ textTrack.clips.length }}</p>
          <p class="muted">总时长：{{ timelineTotalDurationSec.toFixed(2) }}s · Playhead：{{ timelinePlayheadSec.toFixed(2) }}s</p>
          <p class="muted">缩放：{{ timelineZoomPercent }}% · Snap：{{ snapEnabled ? `开 / ${snapStepSec}s` : '关' }}</p>
        </section>

        <section class="panel" v-if="selectedClipSummary">
          <h3>选中片段</h3>
          <p class="muted">{{ selectedClipSummary }}</p>
          <p class="muted" v-if="selectedClipSpan">位置：{{ formatClipSpan(selectedClipSpan) }}</p>
        </section>

        <section class="panel" v-if="transitionPreview.length > 0">
          <div class="inline-between">
            <h3>转场预览</h3>
            <span class="muted">{{ transitionPreview.length }} 段</span>
          </div>
          <div class="list compact-list">
            <article class="card" v-for="item in transitionPreview.slice(0, 6)" :key="`${item.fromTitle}-${item.toTitle}-${item.offsetSec}`">
              <strong>{{ item.fromTitle }}</strong>
              <p class="muted">→ {{ item.toTitle }}</p>
              <p class="muted">{{ item.transitionType }} / {{ item.durationSec.toFixed(2) }}s / offset {{ item.offsetSec.toFixed(2) }}s</p>
            </article>
          </div>
        </section>

        <TimelineHotkeyPanel v-if="showHotkeyHelp" :toggle-hotkey-help="toggleHotkeyHelp" />
      </template>
    </DesktopWorkbenchShell>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import AppShell from '@/components/AppShell.vue';
import DesktopWorkbenchShell from '@/components/DesktopWorkbenchShell.vue';
import { clearToken } from '@/api/client';
import TimelineAuxTracksPanel from '@/features/timeline-editor/components/TimelineAuxTracksPanel.vue';
import TimelineClipEditorPanel from '@/features/timeline-editor/components/TimelineClipEditorPanel.vue';
import TimelineClipListPanel from '@/features/timeline-editor/components/TimelineClipListPanel.vue';
import TimelineControlPanels from '@/features/timeline-editor/components/TimelineControlPanels.vue';
import TimelineHotkeyPanel from '@/features/timeline-editor/components/TimelineHotkeyPanel.vue';
import TimelineStudioDockPanel from '@/features/timeline-editor/components/TimelineStudioDockPanel.vue';
import TimelineWorkbenchPanel from '@/features/timeline-editor/components/TimelineWorkbenchPanel.vue';
import { useTimelineAuxTrackOps } from '@/composables/useTimelineAuxTrackOps';
import { useTimelineClipDockOps } from '@/composables/useTimelineClipDockOps';
import { useTimelineClipEffects } from '@/composables/useTimelineClipEffects';
import { useDesktopLocalMedia } from '@/composables/useDesktopLocalMedia';
import { useTimelineBatchOrchestrator } from '@/composables/useTimelineBatchOrchestrator';
import { useTimelineClipMotionEditor } from '@/composables/useTimelineClipMotionEditor';
import { useTimelineDesktopBridge } from '@/composables/useTimelineDesktopBridge';
import { useTimelineDerivedState } from '@/composables/useTimelineDerivedState';
import { useTimelineFloatingPanels } from '@/composables/useTimelineFloatingPanels';
import { useTimelineHistory, type TimelineCommandHistoryItem, type TimelineStudioSnapshot } from '@/composables/useTimelineHistory';
import { useTimelineHotkeys } from '@/composables/useTimelineHotkeys';
import { useTimelineLayoutTemplates } from '@/composables/useTimelineLayoutTemplates';
import { useTimelineLanePointerOps } from '@/composables/useTimelineLanePointerOps';
import { useTimelineLoadSave } from '@/composables/useTimelineLoadSave';
import { useTimelineLocalClipOps } from '@/composables/useTimelineLocalClipOps';
import { useTimelineMacros } from '@/composables/useTimelineMacros';
import { useTimelinePlaybackControls } from '@/composables/useTimelinePlaybackControls';
import { useTimelinePostProductionOps } from '@/composables/useTimelinePostProductionOps';
import { useTimelineQuickCommands } from '@/composables/useTimelineQuickCommands';
import { useTimelineResizeCurvePreview } from '@/composables/useTimelineResizeCurvePreview';
import { useTimelineRouteScope } from '@/composables/useTimelineRouteScope';
import { useTimelineSelectionBatchOps } from '@/composables/useTimelineSelectionBatchOps';
import { useTimelineScreenShell } from '@/composables/useTimelineScreenShell';
import { useTimelineStudioLayout } from '@/composables/useTimelineStudioLayout';
import { useTimelineSync } from '@/composables/useTimelineSync';
import { useTimelineWorkspaceStorage } from '@/composables/useTimelineWorkspaceStorage';
import { toSingleQuery } from '@/composables/useRouteRestoreContext';
import { EpisodeDomain, Project, Storyboard, TimelineClip, TimelineTrack } from '@/types/models';
 
const projectId = ref('');
const desktopLocalMedia = useDesktopLocalMedia();

const project = ref<Project | null>(null);
const storyboards = ref<Storyboard[]>([]);
const latestDoneVideoTaskByStoryboardId = ref<Record<string, { taskId: string; resultUrl: string }>>({});
const episodes = ref<EpisodeDomain[]>([]);
const selectedEpisodeId = ref('');
const timelineId = ref('');
const timelineTitle = ref('');
const clips = ref<TimelineClip[]>([]);
const audioTrack = ref<TimelineTrack>({
  id: 'audio-main',
  name: 'Audio Main',
  type: 'audio',
  order: 1,
  isLocked: false,
  isMuted: false,
  volume: 100,
  clips: []
});
const audioTracks = ref<TimelineTrack[]>([{ ...audioTrack.value }]);
const textTrack = ref<TimelineTrack>({
  id: 'text-main',
  name: 'Text Overlay',
  type: 'text',
  order: 2,
  isLocked: false,
  isMuted: false,
  volume: 100,
  clips: []
});
const visibleAudioTracks = computed(() => [audioTrack.value, ...audioTracks.value.slice(1)]);
const loading = ref(false);
const error = ref('');
const showHotkeyHelp = ref(false);
const quickCommand = ref('');
const quickCommandFeedback = ref('');
const quickCommandInputRef = ref<HTMLInputElement | null>(null);
const timelineListRef = ref<HTMLDivElement | null>(null);
const transientObjectUrls = ref<string[]>([]);
const desktopIngestStatus = ref('');
const selectedClipIndex = ref(0);
const selectedClipIndices = ref<number[]>([]);
const timelineZoomPercent = ref(100);
const timelinePlayheadSec = ref(0);
const timelinePlaying = ref(false);
const timelineLoopEnabled = ref(true);
const batchToolRestoredTip = ref('');
const snapEnabled = ref(true);
const snapStepSec = ref(0.25);
const selectionRangeStartSec = ref(0);
const selectionRangeEndSec = ref(10);
const durationScaleFactor = ref(1);
const MIN_CLIP_DURATION_SEC = 0.1;
const MIN_DOCK_WIDTH_PX = 220;
const MAX_DOCK_WIDTH_PX = 420;
const MIN_CLIP_PANEL_WIDTH_PX = 320;
const MAX_CLIP_PANEL_WIDTH_PX = 520;
type TimelineUiPrefs = {
  studioImmersiveMode: boolean;
  studioDenseMode: boolean;
  studioDockCollapsed: boolean;
  dockWidthPx: number;
  clipPanelWidthPx: number;
  dockLayoutMode: 'left' | 'right' | 'float';
  clipPanelLayoutMode: 'left' | 'right' | 'float';
  dockFloatX: number;
  dockFloatY: number;
  clipPanelFloatX: number;
  clipPanelFloatY: number;
  dockPinned: boolean;
  clipPanelPinned: boolean;
  dockLocked: boolean;
  clipPanelLocked: boolean;
  activeDockPanel: 'shots' | 'media' | 'actions';
  activePanelTab: 'shot' | 'transition' | 'effects' | 'audio';
  timelineZoomPercent: number;
  workspacePresetId: 'custom' | 'focus' | 'review' | 'cinema';
};
type TimelineWorkspaceDraft = {
  version: number;
  savedAt: string;
  scope: string;
  selectedEpisodeId: string;
  timelineTitle: string;
  clips: TimelineClip[];
  audioTrack: TimelineTrack;
  textTrack: TimelineTrack;
  selectedClipIndex: number;
  selectedClipIndices: number[];
  uiPrefs: TimelineUiPrefs;
  savedMacros: Array<{ name: string; commands: string[] }>;
};
const undoStack = ref<TimelineStudioSnapshot[]>([]);
const redoStack = ref<TimelineStudioSnapshot[]>([]);
const commandHistory = ref<TimelineCommandHistoryItem[]>([]);
type EditableClip = TimelineClip & {
  transition: NonNullable<TimelineClip['transition']>;
  keyframe: NonNullable<TimelineClip['keyframe']>;
};

type KeyframePreset = {
  id: string;
  label: string;
  keyframe: NonNullable<TimelineClip['keyframe']>;
};

type TransitionCurvePreset = {
  id: string;
  label: string;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  durationSec: number;
};

const keyframePresets: KeyframePreset[] = [
  {
    id: 'static',
    label: 'Static（无镜头运动）',
    keyframe: { startScale: 1, endScale: 1, startX: 0, startY: 0, endX: 0, endY: 0, rotationDeg: 0 }
  },
  {
    id: 'slow_push_in',
    label: 'Slow Push In（缓慢推进）',
    keyframe: { startScale: 1, endScale: 1.12, startX: 0, startY: 0, endX: 0, endY: 0, rotationDeg: 0 }
  },
  {
    id: 'reveal_pan_right',
    label: 'Reveal Pan Right（横移揭示）',
    keyframe: { startScale: 1.03, endScale: 1.03, startX: -18, startY: 0, endX: 18, endY: 0, rotationDeg: 0 }
  },
  {
    id: 'drift_up_left',
    label: 'Drift Up Left（漂移）',
    keyframe: { startScale: 1, endScale: 1.08, startX: 10, startY: 8, endX: -8, endY: -10, rotationDeg: 0 }
  },
  {
    id: 'dramatic_tilt',
    label: 'Dramatic Tilt（轻旋转）',
    keyframe: { startScale: 1.04, endScale: 1.16, startX: 0, startY: 0, endX: 5, endY: -5, rotationDeg: 4 }
  }
];
const selectedKeyframePresetId = ref<string>(keyframePresets[1].id);

const transitionCurvePresets: TransitionCurvePreset[] = [
  { id: 'linear_fast', label: 'Linear Fast', easing: 'linear', durationSec: 0.35 },
  { id: 'ease_in', label: 'Ease In', easing: 'easeIn', durationSec: 0.55 },
  { id: 'ease_out', label: 'Ease Out', easing: 'easeOut', durationSec: 0.55 },
  { id: 'ease_in_out', label: 'Ease In Out', easing: 'easeInOut', durationSec: 0.65 }
];
const selectedTransitionCurveId = ref<string>(transitionCurvePresets[3].id);

const storyboardTitleMap = computed(() => new Map(storyboards.value.map((item) => [item.id, item.title])));
const {
  activeDockPanel,
  activePanelTab,
  clipPanelClassList,
  clipPanelFloatingStyle,
  clipPanelFloatPosition,
  clipPanelLayoutMode,
  clipPanelLocked,
  clipPanelPinned,
  clipPanelSnapAnimating,
  clipPanelWidthPx,
  clipPanelZIndex,
  dockClassList,
  dockFloatingStyle,
  dockFloatPosition,
  dockLayoutMode,
  dockLocked,
  dockPinned,
  dockSearch,
  dockSnapAnimating,
  dockWidthPx,
  dockZIndex,
  filteredKeyframeDockPresets,
  filteredMediaDockItems,
  filteredStoryboardDockItems,
  filteredTransitionDockPresets,
  normalizedClipPanelWidthPx,
  normalizedDockWidthPx,
  studioDenseMode,
  studioDockCollapsed,
  studioImmersiveMode,
  timelineEditorLayoutStyle,
  timelineListStyle,
  workspacePresetId
} = useTimelineStudioLayout({
  storyboards,
  latestDoneVideoTaskByStoryboardId,
  storyboardTitleMap,
  keyframePresets,
  transitionCurvePresets,
  clampNumber: (value, min, max) => clampNumber(value, min, max),
  minDockWidthPx: MIN_DOCK_WIDTH_PX,
  maxDockWidthPx: MAX_DOCK_WIDTH_PX,
  minClipPanelWidthPx: MIN_CLIP_PANEL_WIDTH_PX,
  maxClipPanelWidthPx: MAX_CLIP_PANEL_WIDTH_PX
});
const {
  audioClipSpans,
  formatClipSpan,
  selectedClipSpan,
  textClipSpans,
  timelinePlayheadPct,
  timelineTicks,
  timelineTotalDurationSec,
  timelineTracksPreview,
  timelineTracksPreviewWithPct,
  transitionPreview,
  videoClipSpans
} = useTimelineDerivedState({
  storyboardTitleMap,
  clips,
  audioTracks: visibleAudioTracks,
  textTrack,
  selectedClipIndex,
  timelinePlayheadSec
});

const normalizeClipIndices = (input: number[]): number[] => {
  const unique = Array.from(new Set(input.filter((value) => value >= 0 && value < clips.value.length)));
  return unique.sort((a, b) => a - b);
};

const selectedClip = computed<EditableClip | null>(() => {
  const item = clips.value[selectedClipIndex.value];
  if (!item) {
    return null;
  }
  if (!item.transition) {
    item.transition = { type: 'cut', durationSec: 0.05, easing: 'linear', direction: 'left' };
  }
  if (!item.keyframe) {
    item.keyframe = { startScale: 1, endScale: 1, startX: 0, startY: 0, endX: 0, endY: 0, rotationDeg: 0 };
  }
  return item as EditableClip;
});

const { getNumericEffectConfig, isEffectEnabled, setEffectEnabled, setNumericEffectConfig } = useTimelineClipEffects({
  selectedClip,
  clampNumber: (value, min, max) => clampNumber(value, min, max)
});

const {
  applyCanvasPositionToKeyframe,
  applyCropDrag,
  applySelectedKeyframePreset,
  applySelectedTransitionCurvePreset,
  bezierControl1,
  bezierControl2,
  cropAspectLock,
  cropBoxStyle,
  cropCanvasRef,
  cropDragState,
  curveStrengthPercent,
  keyframeCanvasRef,
  keyframeCurveLabel,
  keyframeCurvePathD,
  keyframeEndCanvas,
  keyframeEndPosition,
  keyframePointDragState,
  keyframePointStyle,
  keyframePreviewPlaying,
  keyframePreviewProgress,
  keyframeProgressCanvas,
  keyframeSamplePoints,
  keyframeStartCanvas,
  keyframeStartPosition,
  onKeyframeCanvasPointerDown,
  resetBezierControlsByPreset,
  resetCropToFullFrame,
  resetSelectedClipKeyframe,
  resetSelectedClipTransition,
  startCropDrag,
  startKeyframePointDrag,
  stopKeyframePreview,
  toggleKeyframePreviewPlay
} = useTimelineClipMotionEditor({
  selectedClip,
  selectedClipIndex,
  selectedKeyframePresetId,
  selectedTransitionCurveId,
  keyframePresets,
  transitionCurvePresets,
  checkpointTimelineEdit: (action, detail) => checkpointTimelineEdit(action, detail),
  clampNumber: (value, min, max) => clampNumber(value, min, max),
  isEffectEnabled: (type) => isEffectEnabled(type),
  getNumericEffectConfig: (type, key, fallback) => getNumericEffectConfig(type, key, fallback),
  setNumericEffectConfig: (type, key, rawValue, min, max, precision) =>
    setNumericEffectConfig(type, key, rawValue, min, max, precision)
});
const {
  applyBatchTransitionDuration,
  applyKeyframePresetToSelection,
  applyTransitionPresetToSelection,
  batchTransitionDurationSec,
  clearClipRangeSelection,
  copyCurrentClipParamsToSelection,
  quickScaleSelectedClipDurations,
  resetSelectedClipKeyframes,
  scaleSelectedClipDurations,
  selectClipsByRange
} = useTimelineSelectionBatchOps({
  clips,
  selectedClip,
  selectedClipIndex,
  selectedClipIndices,
  selectionRangeStartSec,
  selectionRangeEndSec,
  durationScaleFactor,
  videoClipSpans,
  keyframePresets,
  transitionCurvePresets,
  selectedKeyframePresetId,
  selectedTransitionCurveId,
  normalizeClipIndices: (input) => normalizeClipIndices(input),
  syncVideoClipTimeline: () => syncVideoClipTimeline(),
  normalizeDuration: (value) => normalizeDuration(value)
});
const {
  handleGlobalPointerUp,
  handleVideoResizeMove,
  onVideoLanePointerDown,
  resizeCurvePreview,
  selectionBox,
  startVideoResize,
  stopSelectionBox,
  stopVideoResize
} = useTimelineLanePointerOps({
  clips,
  selectedClipIndex,
  selectedClipIndices,
  videoClipSpans,
  timelineTotalDurationSec,
  timelinePlayheadSec,
  timelineListRef,
  keyframePointDragState,
  cropDragState,
  handleFloatingPointerMove: (event) => handleFloatingPointerMove(event),
  handleFloatingPointerUp: (containerRect) => handleFloatingPointerUp(containerRect),
  applyCanvasPositionToKeyframe: (clientX, clientY) => applyCanvasPositionToKeyframe(clientX, clientY),
  applyCropDrag: (clientX, clientY) => applyCropDrag(clientX, clientY),
  syncVideoClipTimeline: () => syncVideoClipTimeline(),
  normalizeDuration: (value) => normalizeDuration(value),
  normalizeClipIndices: (input) => normalizeClipIndices(input),
  clampNumber: (value, min, max) => clampNumber(value, min, max),
  minClipDurationSec: MIN_CLIP_DURATION_SEC,
  appendResizeCurveSnapshot: (preview) => appendResizeCurveSnapshot(preview)
});
const {
  appendResizeCurveSnapshot,
  clearResizeCurveSnapshots,
  resizeCurveDurationDeltaSec,
  resizeCurveEndSlopeDelta,
  resizeCurveNewPath,
  resizeCurveOldPath,
  resizeCurveSnapshots,
  resizeCurveStartSlopeDelta
} = useTimelineResizeCurvePreview({
  resizeCurvePreview,
  minClipDurationSec: MIN_CLIP_DURATION_SEC
});

const {
  applyRouteEpisodePreset,
  applyRouteStoryboardPreset,
  buildPath,
  buildScopedQuery: buildQuery,
  dramaId,
  goAssetWorkbench,
  goFramePromptWorkbench,
  goProject,
  goStoryboardWorkbench,
  hasDramaScopedApi,
  route,
  routeDramaId,
  routeProjectId,
  router
} = useTimelineRouteScope({
  projectId,
  selectedEpisodeId,
  episodes,
  clips,
  selectedClip,
  selectedClipIndex,
  selectedClipIndices,
  batchToolRestoredTip,
  focusSelectedClipPlayhead: () => focusSelectedClipPlayhead()
});

const selectedClipSummary = computed(() => {
  if (!selectedClip.value) {
    return '未选中片段';
  }
  const clip = selectedClip.value;
  const span = selectedClipSpan.value;
  const title = storyboardTitleMap.value.get(clip.storyboardId) || clip.storyboardId;
  return `#${selectedClipIndex.value + 1} ${title} · ${(clip.durationSec || 0).toFixed(2)}s · ${formatClipSpan(span)}`;
});
const workspaceScopeToken = computed(() => {
  const query = toSingleQuery(route.query);
  const dramaScope = routeDramaId.value || query.dramaId || '';
  if (dramaScope) {
    return `drama:${dramaScope}`;
  }
  return `project:${routeProjectId.value || projectId.value || 'global'}`;
});
const workspaceDraftStorageKey = computed(() => `human2.timeline.workspace-draft.${workspaceScopeToken.value}`);
const workspaceUiPrefsStorageKey = computed(() => `human2.timeline.ui-prefs.${workspaceScopeToken.value}`);
const workspaceLayoutTemplatesStorageKey = 'human2.timeline.layout-templates.v1';
const globalMacroStorageKey = 'human2.timeline.global-macros.v1';
const workspaceQuickSlotsStorageKey = computed(() => `human2.timeline.quick-slots.${workspaceScopeToken.value}`);
const clipCount = computed(() => clips.value.length);

const logout = () => {
  clearToken();
  void router.replace('/login');
};

const setQuickCommandInputRef = (element: unknown) => {
  quickCommandInputRef.value = element as HTMLInputElement | null;
};
const setTimelineListRef = (element: unknown) => {
  timelineListRef.value = element as HTMLDivElement | null;
};
const setKeyframeCanvasRef = (element: unknown) => {
  keyframeCanvasRef.value = element as HTMLDivElement | null;
};
const setCropCanvasRef = (element: unknown) => {
  cropCanvasRef.value = element as HTMLDivElement | null;
};

const normalizeTimelineDurations = (input: TimelineClip[]): TimelineClip[] => {
  let cursorMs = 0;
  return input.map((item) => {
    const fallbackDurationSec = Number.isFinite(Number(item.durationSec)) ? Math.max(0.1, Number(item.durationSec)) : 5;
    const fallbackStartMs = cursorMs;
    const startMs =
      typeof item.startMs === 'number' && Number.isFinite(item.startMs) ? Math.max(0, Math.floor(item.startMs)) : fallbackStartMs;
    const endMs =
      typeof item.endMs === 'number' && Number.isFinite(item.endMs) && item.endMs > startMs
        ? Math.floor(item.endMs)
        : Math.floor(startMs + fallbackDurationSec * 1000);
    const durationSec = Math.max(0.1, (endMs - startMs) / 1000);
    cursorMs = endMs;
    return {
      ...item,
      durationSec,
      startMs,
      endMs
    };
  });
};

const normalizeClips = (input: TimelineClip[]): TimelineClip[] =>
  normalizeTimelineDurations(input).map((item) => ({
    id: item.id,
    storyboardId: item.storyboardId,
    videoTaskId: item.videoTaskId,
    sourceUrl: item.sourceUrl,
    durationSec: item.durationSec ?? 5,
    startMs: item.startMs,
    endMs: item.endMs,
    trimStartMs: item.trimStartMs,
    trimEndMs: item.trimEndMs,
    speed: item.speed,
    volume: item.volume,
    muted: item.muted,
    fadeInMs: item.fadeInMs,
    fadeOutMs: item.fadeOutMs,
    transition: {
      type: item.transition?.type ?? 'cut',
      durationSec: item.transition?.durationSec ?? (item.transition?.type === 'cut' ? 0.05 : 0.6),
      easing: item.transition?.easing ?? 'linear',
      direction: item.transition?.direction ?? 'left'
    },
    keyframe: {
      startScale: item.keyframe?.startScale ?? 1,
      endScale: item.keyframe?.endScale ?? 1,
      startX: item.keyframe?.startX ?? 0,
      startY: item.keyframe?.startY ?? 0,
      endX: item.keyframe?.endX ?? 0,
      endY: item.keyframe?.endY ?? 0,
      rotationDeg: item.keyframe?.rotationDeg ?? 0
    },
    effects: item.effects
  }));

const normalizeAuxClips = (input: TimelineClip[]): TimelineClip[] =>
  normalizeTimelineDurations(input).map((item) => ({
    id: item.id,
    storyboardId: item.storyboardId,
    sourceUrl: item.sourceUrl,
    durationSec: item.durationSec ?? 5,
    startMs: item.startMs,
    endMs: item.endMs,
    trimStartMs: item.trimStartMs,
    trimEndMs: item.trimEndMs,
    speed: item.speed,
    volume: item.volume,
    muted: item.muted,
    fadeInMs: item.fadeInMs,
    fadeOutMs: item.fadeOutMs,
    effects: item.effects
  }));

const {
  addAudioClip,
  addTextClip,
  auxDragSource,
  moveAuxClip,
  onAuxClipDragEnd,
  onAuxClipDragOver,
  onAuxClipDragStart,
  onAuxClipDrop,
  onAuxClipDropToEnd,
  removeAudioClip,
  removeTextClip
} = useTimelineAuxTrackOps({
  storyboards,
  audioTrack,
  textTrack,
  normalizeTimelineDurations: (input) => normalizeTimelineDurations(input)
});
const {
  cloneClip,
  cloneTrack,
  createStudioSnapshot,
  pushCommandHistory,
  checkpointTimelineEdit,
  applyStudioSnapshot,
  undoTimelineEdit,
  redoTimelineEdit
} = useTimelineHistory({
  clips,
  audioTrack,
  textTrack,
  selectedClipIndex,
  selectedClipIndices,
  timelineTitle,
  undoStack,
  redoStack,
  commandHistory,
  normalizeClipIndices: (input) => normalizeClipIndices(input),
  ensureSelectedClipIndex: () => ensureSelectedClipIndex(),
  syncVideoClipTimeline: () => syncVideoClipTimeline()
});

const {
  deleteSelectedGlobalMacro,
  deleteSelectedMacro,
  exportMacroCommands,
  globalMacroNameDraft,
  globalMacros,
  handleMacroImportFileChange,
  importSelectedGlobalMacroToLocal,
  loadGlobalMacros,
  loadSelectedMacroToDraft,
  macroCommandText,
  macroImportInputRef,
  macroName,
  overwriteSelectedMacroCommands,
  renameSelectedGlobalMacro,
  renameSelectedMacro,
  runSelectedGlobalMacro,
  runSelectedMacro,
  saveMacroCommand,
  saveSelectedMacroToGlobal,
  savedMacros,
  selectedGlobalMacroId,
  selectedMacroId,
  triggerMacroImport
} = useTimelineMacros({
  globalMacroStorageKey,
  quickCommandFeedback,
  pushCommandHistory,
  executeQuickCommand: (command, options) => executeQuickCommand(command, options)
});
const setMacroImportInputRef = (element: unknown) => {
  macroImportInputRef.value = element as HTMLInputElement | null;
};

const {
  applyUiPrefs,
  applyWorkspaceDraft,
  applyWorkspacePreset,
  autoSaveEnabled,
  buildCurrentUiPrefs,
  clearWorkspaceDraft,
  deleteWorkspaceQuickSlot,
  exportWorkspaceDraft,
  handleWorkspaceImportFileChange,
  lastAutoSaveAt,
  loadWorkspaceQuickSlots,
  localDraftMeta,
  persistUiPrefs,
  refreshLocalDraftMeta,
  restoreUiPrefs,
  restoreWorkspaceDraftFromLocal,
  restoreWorkspaceQuickSlot,
  saveWorkspaceDraftToLocal,
  saveWorkspaceQuickSlot,
  selectedWorkspaceQuickSlotId,
  startWorkspaceAutoSave,
  stopWorkspaceAutoSave,
  triggerWorkspaceImport,
  workspaceImportInputRef,
  workspaceQuickSlots
} = useTimelineWorkspaceStorage({
  workspaceScopeToken,
  workspaceDraftStorageKey,
  workspaceUiPrefsStorageKey,
  workspaceQuickSlotsStorageKey,
  projectId,
  routeProjectId,
  selectedEpisodeId,
  timelineTitle,
  clips,
  audioTrack,
  textTrack,
  selectedClipIndex,
  selectedClipIndices,
  studioImmersiveMode,
  studioDenseMode,
  studioDockCollapsed,
  dockWidthPx,
  clipPanelWidthPx,
  dockLayoutMode,
  clipPanelLayoutMode,
  dockFloatPosition,
  clipPanelFloatPosition,
  dockPinned,
  clipPanelPinned,
  dockLocked,
  clipPanelLocked,
  activeDockPanel,
  activePanelTab,
  timelineZoomPercent,
  workspacePresetId,
  savedMacros,
  selectedMacroId,
  quickCommandFeedback,
  cloneClip,
  cloneTrack,
  normalizeClips,
  normalizeClipIndices,
  ensureSelectedClipIndex: () => ensureSelectedClipIndex(),
  syncVideoClipTimeline: () => syncVideoClipTimeline(),
  pushCommandHistory,
  clampNumber: (value, min, max) => clampNumber(value, min, max),
  minDockWidthPx: MIN_DOCK_WIDTH_PX,
  maxDockWidthPx: MAX_DOCK_WIDTH_PX,
  minClipPanelWidthPx: MIN_CLIP_PANEL_WIDTH_PX,
  maxClipPanelWidthPx: MAX_CLIP_PANEL_WIDTH_PX
});
const setWorkspaceImportInputRef = (element: unknown) => {
  workspaceImportInputRef.value = element as HTMLInputElement | null;
};
const {
  activateFloatingPanel,
  disposeFloatingPanels,
  handleFloatingPointerMove,
  handleFloatingPointerUp,
  startClipPanelFloatDrag,
  startDockFloatDrag,
  startDockResize
} = useTimelineFloatingPanels({
  clampNumber: (value, min, max) => clampNumber(value, min, max),
  minDockWidthPx: MIN_DOCK_WIDTH_PX,
  maxDockWidthPx: MAX_DOCK_WIDTH_PX,
  dockLayoutMode,
  clipPanelLayoutMode,
  dockPinned,
  clipPanelPinned,
  dockLocked,
  clipPanelLocked,
  dockZIndex,
  clipPanelZIndex,
  dockFloatPosition,
  clipPanelFloatPosition,
  studioDockCollapsed,
  normalizedDockWidthPx,
  normalizedClipPanelWidthPx,
  dockSnapAnimating,
  clipPanelSnapAnimating,
  dockWidthPx
});
const activateDockPanel = (): void => {
  activateFloatingPanel('dock');
};
const toggleDockPinned = (): void => {
  dockPinned.value = !dockPinned.value;
};
const toggleDockLocked = (): void => {
  dockLocked.value = !dockLocked.value;
};
const toggleStudioDockCollapsed = (): void => {
  studioDockCollapsed.value = !studioDockCollapsed.value;
};
const setActiveDockPanel = (panel: 'shots' | 'media' | 'actions'): void => {
  activeDockPanel.value = panel;
};
const setDockSearch = (value: string): void => {
  dockSearch.value = value;
};
const activateClipPanel = (): void => {
  activateFloatingPanel('clip');
};
const toggleClipPanelPinned = (): void => {
  clipPanelPinned.value = !clipPanelPinned.value;
};
const toggleClipPanelLocked = (): void => {
  clipPanelLocked.value = !clipPanelLocked.value;
};
const setActivePanelTab = (panel: 'shot' | 'transition' | 'effects' | 'audio'): void => {
  activePanelTab.value = panel;
};
const setSelectedKeyframePresetId = (value: string): void => {
  selectedKeyframePresetId.value = value;
};
const setSelectedTransitionCurveId = (value: string): void => {
  selectedTransitionCurveId.value = value;
};
const setKeyframePreviewProgress = (value: number): void => {
  keyframePreviewProgress.value = value;
};
const setCurveStrengthPercent = (value: number): void => {
  curveStrengthPercent.value = value;
};
const setCropAspectLock = (value: 'free' | '16:9' | '9:16' | '1:1'): void => {
  cropAspectLock.value = value;
};
const setTimelineZoomPercent = (value: number): void => {
  timelineZoomPercent.value = clampNumber(value, 60, 300);
};
const setTimelinePlayheadSec = (value: number): void => {
  timelinePlayheadSec.value = normalizePlayhead(value);
};
const setTimelineLoopEnabled = (value: boolean): void => {
  timelineLoopEnabled.value = value;
};
const setSnapEnabled = (value: boolean): void => {
  snapEnabled.value = value;
};
const setSnapStepSec = (value: number): void => {
  snapStepSec.value = clampNumber(value, 0.01, 1);
};
const setSelectionRangeStartSec = (value: number): void => {
  selectionRangeStartSec.value = Math.max(0, value);
};
const setSelectionRangeEndSec = (value: number): void => {
  selectionRangeEndSec.value = Math.max(0, value);
};
const setDurationScaleFactor = (value: number): void => {
  durationScaleFactor.value = clampNumber(value, 0.1, 3);
};
const setBatchTransitionDurationSec = (value: number): void => {
  batchTransitionDurationSec.value = clampNumber(value, 0, 5);
};
const setBatchPanelTransitionType = (value: typeof batchPanelTransitionType.value): void => {
  batchPanelTransitionType.value = value;
};
const setBatchPanelTransitionDurationSec = (value: typeof batchPanelTransitionDurationSec.value): void => {
  batchPanelTransitionDurationSec.value = value;
};
const setBatchPanelVolume = (value: typeof batchPanelVolume.value): void => {
  batchPanelVolume.value = value;
};
const setBatchPanelMuted = (value: typeof batchPanelMuted.value): void => {
  batchPanelMuted.value = value;
};
const setBatchPanelOnlyCurrentRange = (value: typeof batchPanelOnlyCurrentRange.value): void => {
  batchPanelOnlyCurrentRange.value = value;
};
const setOrchestratorDraftAction = (value: typeof orchestratorDraftAction.value): void => {
  orchestratorDraftAction.value = value;
};
const setOrchestratorDraftScaleFactor = (value: typeof orchestratorDraftScaleFactor.value): void => {
  orchestratorDraftScaleFactor.value = value;
};
const setOrchestratorDraftVolume = (value: typeof orchestratorDraftVolume.value): void => {
  orchestratorDraftVolume.value = value;
};
const setOrchestratorDraftMuted = (value: typeof orchestratorDraftMuted.value): void => {
  orchestratorDraftMuted.value = value;
};
const setOrchestratorRollbackStrategy = (value: typeof orchestratorRollbackStrategy.value): void => {
  orchestratorRollbackStrategy.value = value;
};

const {
  applyLayoutTemplate,
  deleteLayoutTemplate,
  focusTemplateCard,
  forkTeamTemplateToPersonal,
  highlightedTemplateId,
  latestTeamTemplateAudit,
  layoutTemplateName,
  layoutTemplateScope,
  layoutTemplates,
  loadPersonalLayoutTemplates,
  loadTeamLayoutTemplates,
  renameLayoutTemplate,
  saveCurrentLayoutTemplate
} = useTimelineLayoutTemplates({
  workspaceScopeToken,
  workspaceLayoutTemplatesStorageKey,
  buildCurrentUiPrefs,
  applyUiPrefs,
  persistUiPrefs,
  quickCommandFeedback
});
const { timelineSyncEnabled } = useTimelineSync({
  workspaceScopeToken,
  selectedClipIndex,
  timelinePlayheadSec,
  timelineZoomPercent,
  timelineTotalDurationSec,
  workspacePresetId,
  clipCount,
  selectClip: (idx) => selectClip(idx),
  applyWorkspacePreset: () => applyWorkspacePreset(),
  clampNumber: (value, min, max) => clampNumber(value, min, max)
});
useTimelineHotkeys({
  quickCommandFeedback,
  workspacePresetId,
  focusQuickCommandInput: () => focusQuickCommandInput(),
  saveTimeline: () => saveTimeline(),
  applyWorkspacePreset: () => applyWorkspacePreset(),
  undoTimelineEdit: () => undoTimelineEdit(),
  redoTimelineEdit: () => redoTimelineEdit(),
  toggleHotkeyHelp: () => toggleHotkeyHelp(),
  toggleStudioImmersiveMode: () => toggleStudioImmersiveMode(),
  stepSelectedClip: (delta) => stepSelectedClip(delta),
  toggleTimelinePlayback: () => toggleTimelinePlayback(),
  stepPlayhead: (direction) => stepPlayhead(direction),
  removeSelectedClips: () => removeSelectedClips(),
  duplicateSelectedClips: () => duplicateSelectedClips(),
  nudgeSelectedClipDuration: (direction) => nudgeSelectedClipDuration(direction),
  isTypingElement: (target) => isTypingElement(target)
});
useTimelineDesktopBridge<TimelineWorkspaceDraft>({
  quickCommandFeedback,
  focusQuickCommandInput: () => focusQuickCommandInput(),
  saveTimeline: () => saveTimeline(),
  createMergeByTimeline: () => createMergeByTimeline(),
  toggleTimelinePlayback: () => toggleTimelinePlayback(),
  applyWorkspaceDraft: (draft) => applyWorkspaceDraft(draft),
  isWorkspaceDraft: (input): input is TimelineWorkspaceDraft =>
    Boolean(input && typeof input === 'object' && Array.isArray((input as TimelineWorkspaceDraft).clips))
});
const { executeQuickCommand, replayHistoryCommand, runQuickCommand } = useTimelineQuickCommands({
  quickCommand,
  quickCommandFeedback,
  commandHistory,
  timelinePlaying,
  saveTimeline: () => saveTimeline(),
  createMergeByTimeline: () => createMergeByTimeline(),
  toggleTimelinePlayback: () => toggleTimelinePlayback(),
  duplicateSelectedClips: () => duplicateSelectedClips(),
  removeSelectedClips: () => removeSelectedClips(),
  focusSelectedClipPlayhead: () => focusSelectedClipPlayhead(),
  stepSelectedClip: (delta) => stepSelectedClip(delta),
  resetSelectedClipKeyframe: () => resetSelectedClipKeyframe(),
  resetSelectedClipTransition: () => resetSelectedClipTransition(),
  undoTimelineEdit: () => undoTimelineEdit(),
  redoTimelineEdit: () => redoTimelineEdit(),
  pushCommandHistory
});

const {
  activeOrchestratorTooltipNodeId,
  activeOrchestratorTooltipNodeLabel,
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
  syncSelectedOrchestratorStepMeta
} = useTimelineBatchOrchestrator({
  clips,
  selectedClipIndices,
  selectionRangeStartSec,
  selectionRangeEndSec,
  durationScaleFactor,
  quickCommandFeedback,
  latestDoneVideoTaskByStoryboardId,
  selectedTransitionCurveId,
  selectedKeyframePresetId,
  transitionCurvePresets,
  keyframePresets,
  storyboardTitleMap,
  videoClipSpans,
  normalizeClipIndices,
  checkpointTimelineEdit,
  scaleSelectedClipDurations: () => scaleSelectedClipDurations(),
  syncVideoClipTimeline: () => syncVideoClipTimeline(),
  normalizeDuration: (value) => normalizeDuration(value),
  createStudioSnapshot,
  applyStudioSnapshot: (snapshot) => applyStudioSnapshot(snapshot as TimelineStudioSnapshot)
});

const syncVideoClipTimeline = (): void => {
  clips.value = normalizeTimelineDurations([...clips.value]);
};

const ensureSelectedClipIndex = (): void => {
  if (clips.value.length === 0) {
    selectedClipIndex.value = 0;
    selectedClipIndices.value = [];
    return;
  }
  if (selectedClipIndex.value < 0) {
    selectedClipIndex.value = 0;
    return;
  }
  if (selectedClipIndex.value >= clips.value.length) {
    selectedClipIndex.value = clips.value.length - 1;
  }
  selectedClipIndices.value = normalizeClipIndices(selectedClipIndices.value);
};

const pickPlanClips = (plan: { clips: TimelineClip[]; tracks?: Array<{ type: string; clips?: TimelineClip[] }> }): TimelineClip[] => {
  if (Array.isArray(plan.tracks) && plan.tracks.length > 0) {
    const videoTrack = plan.tracks
      .slice()
      .sort((a, b) => ((a as { order?: number }).order ?? 0) - ((b as { order?: number }).order ?? 0))
      .find((item) => item.type === 'video');
    if (videoTrack && Array.isArray(videoTrack.clips) && videoTrack.clips.length > 0) {
      return videoTrack.clips;
    }
  }
  return plan.clips;
};

const applyAuxTracks = (plan: { tracks?: TimelineTrack[] }): void => {
  const tracks = Array.isArray(plan.tracks) ? plan.tracks : [];
  const audio = tracks.filter((item) => item.type === 'audio').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const primaryAudio = audio[0];
  const text = tracks.find((item) => item.type === 'text');
  audioTrack.value = {
    id: primaryAudio?.id || 'audio-main',
    name: primaryAudio?.name || 'Audio Main',
    type: 'audio',
    order: typeof primaryAudio?.order === 'number' ? primaryAudio.order : 1,
    isLocked: Boolean(primaryAudio?.isLocked),
    isMuted: Boolean(primaryAudio?.isMuted),
    volume: typeof primaryAudio?.volume === 'number' ? primaryAudio.volume : 100,
    clips: normalizeAuxClips(primaryAudio?.clips ?? [])
  };
  audioTracks.value = audio.length > 0
    ? audio.map((track, index) => ({
        id: track.id || `audio-main-${index}`,
        name: track.name || (index === 0 ? 'Audio Main' : `Audio Track ${index + 1}`),
        type: 'audio',
        order: typeof track.order === 'number' ? track.order : index + 1,
        isLocked: Boolean(track.isLocked),
        isMuted: Boolean(track.isMuted),
        volume: typeof track.volume === 'number' ? track.volume : 100,
        clips: normalizeAuxClips(track.clips ?? [])
      }))
    : [{ ...audioTrack.value }];
  textTrack.value = {
    id: text?.id || 'text-main',
    name: text?.name || 'Text Overlay',
    type: 'text',
    order: typeof text?.order === 'number' ? text.order : 2,
    isLocked: Boolean(text?.isLocked),
    isMuted: Boolean(text?.isMuted),
    volume: typeof text?.volume === 'number' ? text.volume : 100,
    clips: normalizeAuxClips(text?.clips ?? [])
  };
};

const buildPersistedTracks = (): TimelineTrack[] => {
  const persistedAudioTracks = (audioTracks.value.length > 0 ? audioTracks.value : [{ ...audioTrack.value }]).map((track, index) => {
    const source = index === 0 ? audioTrack.value : track;
    return {
      id: source.id || `audio-main-${index}`,
      name: source.name || (index === 0 ? 'Audio Main' : `Audio Track ${index + 1}`),
      type: 'audio' as const,
      order: Number.isFinite(source.order) ? source.order : index + 1,
      isLocked: Boolean(source.isLocked),
      isMuted: Boolean(source.isMuted),
      volume: Number.isFinite(source.volume) ? source.volume : 100,
      clips: normalizeAuxClips(source.clips)
    } as TimelineTrack;
  });
  return [
    {
      id: 'video-main',
      name: 'Video Main',
      type: 'video' as const,
      order: 0,
      isLocked: false,
      isMuted: false,
      volume: 100,
      clips: normalizeClips(clips.value)
    } as TimelineTrack,
    ...persistedAudioTracks,
    {
      id: textTrack.value.id || 'text-main',
      name: textTrack.value.name || 'Text Overlay',
      type: 'text' as const,
      order: Number.isFinite(textTrack.value.order) ? textTrack.value.order : 2,
      isLocked: Boolean(textTrack.value.isLocked),
      isMuted: Boolean(textTrack.value.isMuted),
      volume: Number.isFinite(textTrack.value.volume) ? textTrack.value.volume : 100,
      clips: normalizeAuxClips(textTrack.value.clips)
    } as TimelineTrack
  ].sort((a, b) => a.order - b.order);
};

const { createMergeByTimeline, loadAll, loadTimeline, saveTimeline } = useTimelineLoadSave({
  projectId,
  routeProjectId,
  routeDramaId,
  dramaId,
  hasDramaScopedApi,
  project,
  storyboards,
  latestDoneVideoTaskByStoryboardId,
  episodes,
  selectedEpisodeId,
  timelineId,
  timelineTitle,
  clips,
  loading,
  error,
  timelinePlayheadSec,
  undoStack,
  redoStack,
  commandHistory,
  normalizeClips,
  pickPlanClips,
  applyAuxTracks,
  ensureSelectedClipIndex,
  applyRouteEpisodePreset,
  applyRouteStoryboardPreset,
  buildPersistedTracks,
  pushCommandHistory
});

const {
  createTimelineAudioTasks,
  generateSubtitleTrackForTimeline,
  postproductionMessage,
  syncCompletedAudioToTimeline,
} = useTimelinePostProductionOps({
  projectId,
  dramaId,
  hasDramaScopedApi,
  selectedEpisodeId,
  timelineId,
  clips,
  loading,
  error,
  saveTimeline,
  normalizeClips,
  pickPlanClips,
  applyAuxTracks,
  ensureSelectedClipIndex,
  pushCommandHistory,
});

const isTypingElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
};
const applyDockKeyframePreset = (presetId: string): void => {
  selectedKeyframePresetId.value = presetId;
  applySelectedKeyframePreset();
};

const applyDockTransitionPreset = (presetId: string): void => {
  selectedTransitionCurveId.value = presetId;
  applySelectedTransitionCurvePreset();
};

const normalizeDuration = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 5;
  }
  const clamped = Math.max(MIN_CLIP_DURATION_SEC, Math.min(600, Number(value.toFixed(3))));
  if (!snapEnabled.value) {
    return clamped;
  }
  const step = Number.isFinite(snapStepSec.value) ? Math.max(0.01, snapStepSec.value) : 0.25;
  const snapped = Math.round(clamped / step) * step;
  return Math.max(MIN_CLIP_DURATION_SEC, Math.min(600, Number(snapped.toFixed(3))));
};

const normalizePlayhead = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (timelineTotalDurationSec.value <= 0) {
    return 0;
  }
  return clampNumber(value, 0, timelineTotalDurationSec.value);
};
const {
  onTimelineCanvasWheel,
  toggleStudioDenseMode,
  toggleStudioImmersiveMode,
  toggleHotkeyHelp,
  focusQuickCommandInput,
  onTimelineRulerPointerDown,
  stepPlayhead,
  stopTimelinePlayback,
  toggleTimelinePlayback,
  seekTimelineStart
} = useTimelinePlaybackControls({
  studioDenseMode,
  studioImmersiveMode,
  showHotkeyHelp,
  quickCommandInputRef,
  timelineZoomPercent,
  timelinePlayheadSec,
  timelinePlaying,
  timelineLoopEnabled,
  timelineTotalDurationSec,
  clampNumber: (value, min, max) => clampNumber(value, min, max),
  normalizePlayhead: (value) => normalizePlayhead(value)
});

const {
  duplicateSelectedClips,
  focusSelectedClipPlayhead,
  moveClip,
  nudgeSelectedClipDuration,
  removeClip,
  removeSelectedClips,
  selectClip,
  selectClipFromTimelineBar,
  stepSelectedClip
} = useTimelineLocalClipOps({
  clips,
  selectedClip,
  selectedClipIndex,
  selectedClipIndices,
  videoClipSpans,
  timelinePlayheadSec,
  checkpointTimelineEdit: (action, detail) => checkpointTimelineEdit(action, detail),
  syncVideoClipTimeline: () => syncVideoClipTimeline(),
  ensureSelectedClipIndex: () => ensureSelectedClipIndex(),
  normalizeClipIndices: (input) => normalizeClipIndices(input),
  normalizePlayhead: (value) => normalizePlayhead(value),
  normalizeDuration: (value) => normalizeDuration(value),
  clampNumber: (value, min, max) => clampNumber(value, min, max)
});

const clampNumber = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const {
  addClipFromStoryboard,
  applyMediaToSelectedClip,
  applyMediaToSelectedClipsBatch,
  appendMediaAsClip,
  autoBindMediaForTimelineClips,
  dockDragStoryboardId,
  dockDropIndicator,
  dragSourceIndex,
  dragTargetIndex,
  externalFileDragActive,
  onClipDragEnd,
  onClipDragOver,
  onClipDragStart,
  onClipDrop,
  onClipDropToEnd,
  onDockShotDragEnd,
  onDockShotDragStart,
  onTimelineBarDragEnd,
  onTimelineBarDragOver,
  onTimelineBarDragStart,
  onTimelineBarDrop,
  onTimelineLaneDockDragLeave,
  onTimelineLaneDockDragOver,
  onTimelineLaneDockDrop,
  replaceSelectedClipSourceWithLatestTask,
  timelineBarDragSourceIndex,
  timelineBarDragTargetIndex
} = useTimelineClipDockOps({
  clips,
  storyboards,
  selectedClip,
  selectedClipIndex,
  selectedClipIndices,
  latestDoneVideoTaskByStoryboardId,
  videoClipSpans,
  timelineTotalDurationSec,
  quickCommandFeedback,
  error,
  desktopIngestStatus,
  transientObjectUrls,
  desktopLocalMedia,
  getBatchPanelTargetIndices: () => getBatchPanelTargetIndices(),
  checkpointTimelineEdit: (action, detail) => checkpointTimelineEdit(action, detail),
  syncVideoClipTimeline: () => syncVideoClipTimeline(),
  selectClip: (idx) => selectClip(idx),
  clampNumber: (value, min, max) => clampNumber(value, min, max)
});

useTimelineScreenShell({
  handleVideoResizeMove,
  handleGlobalPointerUp,
  restoreUiPrefs,
  loadGlobalMacros,
  loadWorkspaceQuickSlots,
  loadPersonalLayoutTemplates,
  loadTeamLayoutTemplates,
  refreshLocalDraftMeta,
  startWorkspaceAutoSave,
  stopWorkspaceAutoSave,
  loadAll,
  stopKeyframePreview,
  transientObjectUrls,
  disposeFloatingPanels,
  persistUiPrefs,
  autoSaveEnabled,
  saveWorkspaceDraftToLocal,
  workspaceDraftStorageKey,
  workspaceScopeToken,
  persistUiPreferenceSources: [
    studioImmersiveMode,
    studioDenseMode,
    studioDockCollapsed,
    dockWidthPx,
    clipPanelWidthPx,
    dockLayoutMode,
    clipPanelLayoutMode,
    dockPinned,
    clipPanelPinned,
    dockLocked,
    clipPanelLocked,
    activeDockPanel,
    activePanelTab,
    timelineZoomPercent,
    workspacePresetId,
    () => dockFloatPosition.value.x,
    () => dockFloatPosition.value.y,
    () => clipPanelFloatPosition.value.x,
    () => clipPanelFloatPosition.value.y
  ]
});
</script>

<style scoped>
.timeline-workbench-shell {
  --rail-width: 360px;
  --inspector-width: 320px;
}

.timeline-editor-layout {
  display: grid;
  gap: 12px;
  align-items: start;
}

.timeline-editor-layout.dense {
  gap: 10px;
}

.timeline-summary-panel {
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
}

@media (max-width: 980px) {
  .timeline-editor-layout {
    grid-template-columns: 1fr;
  }
}
</style>
