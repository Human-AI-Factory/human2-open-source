<template>
  <div class="timeline-scroll">
    <div class="timeline-canvas" :style="{ width: `${timelineZoomPercent}%` }" @wheel="onTimelineCanvasWheel">
      <div class="timeline-ruler" @pointerdown="onTimelineRulerPointerDown">
        <span v-for="tick in timelineTicks" :key="`tick-${tick}`" class="tick" :style="{ left: `${(tick / timelineTotalDurationSec) * 100}%` }">
          {{ tick }}s
        </span>
        <span class="playhead-line" :style="{ left: `${timelinePlayheadPct}%` }"></span>
      </div>
      <article v-for="lane in timelineTracksPreviewWithPct" :key="lane.trackId" class="timeline-lane">
        <p class="lane-title">{{ lane.title }}</p>
        <div
          class="lane-bars"
          :class="{ 'file-drop-active': lane.trackId === 'video-main' && externalFileDragActive }"
          @dragover="lane.trackId === 'video-main' ? onTimelineLaneDockDragOver($event) : undefined"
          @drop="lane.trackId === 'video-main' ? onTimelineLaneDockDrop($event) : undefined"
          @dragleave="lane.trackId === 'video-main' ? onTimelineLaneDockDragLeave($event) : undefined"
          @pointerdown="lane.trackId === 'video-main' ? onVideoLanePointerDown($event) : undefined">
          <div
            v-for="item in lane.items"
            :key="item.key"
            class="lane-bar"
            :class="{
              'video-editable': lane.trackId === 'video-main',
              'bar-drag-source': lane.trackId === 'video-main' && timelineBarDragSourceIndex === item.clipIndex,
              'bar-drop-target': lane.trackId === 'video-main' && timelineBarDragTargetIndex === item.clipIndex,
              'bar-selected': lane.trackId === 'video-main' && selectedClipIndices.includes(item.clipIndex)
            }"
            :style="{ left: `${item.leftPct}%`, width: `${item.widthPct}%` }"
            :title="`${item.label} (${item.startSec.toFixed(2)}s - ${item.endSec.toFixed(2)}s)`"
            :draggable="lane.trackId === 'video-main'"
            @dragstart="lane.trackId === 'video-main' ? onTimelineBarDragStart(item.clipIndex, $event) : undefined"
            @dragover="lane.trackId === 'video-main' ? onTimelineBarDragOver(item.clipIndex, $event) : undefined"
            @drop="lane.trackId === 'video-main' ? onTimelineBarDrop(item.clipIndex, $event) : undefined"
            @dragend="lane.trackId === 'video-main' ? onTimelineBarDragEnd() : undefined"
            @dblclick="lane.trackId === 'video-main' ? selectClipFromTimelineBar(item.clipIndex) : undefined">
            {{ item.label }}
            <button
              v-if="lane.trackId === 'video-main' && item.clipIndex > 0"
              class="resize-handle start"
              type="button"
              title="拖拽调整开始时间"
              @pointerdown.stop.prevent="startVideoResize(item.clipIndex, 'start', lane.durationSec, $event)"></button>
            <button
              v-if="lane.trackId === 'video-main'"
              class="resize-handle end"
              type="button"
              title="拖拽调整结束时间"
              @pointerdown.stop.prevent="startVideoResize(item.clipIndex, 'end', lane.durationSec, $event)"></button>
          </div>
          <div
            v-if="lane.trackId === 'video-main' && selectionBox.active"
            class="selection-box"
            :style="{ left: `${selectionBox.leftPx}px`, width: `${selectionBox.widthPx}px` }"></div>
          <div
            v-if="lane.trackId === 'video-main' && dockDropIndicator.active"
            class="dock-insert-indicator"
            :style="{ left: `${dockDropIndicator.leftPx}px` }"></div>
          <p v-if="lane.trackId === 'video-main' && externalFileDragActive" class="file-drop-hint">释放以导入本地视频并自动入本地队列</p>
          <div class="playhead-line lane" :style="{ left: `${timelinePlayheadPct}%` }"></div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
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

defineProps<{
  timelineZoomPercent: number;
  timelineTicks: readonly number[];
  timelineTotalDurationSec: number;
  timelinePlayheadPct: number;
  timelineTracksPreviewWithPct: readonly TimelineLane[];
  externalFileDragActive: boolean;
  timelineBarDragSourceIndex: number | null;
  timelineBarDragTargetIndex: number | null;
  selectedClipIndices: readonly number[];
  selectionBox: SelectionBox;
  dockDropIndicator: DockDropIndicator;
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
}>();
</script>

<style scoped>
.timeline-scroll {
  overflow-x: auto;
}

.timeline-canvas {
  min-width: 100%;
}

.timeline-ruler {
  position: relative;
  height: 22px;
  margin: 8px 0 10px;
  border-bottom: 1px dashed var(--line-strong);
}

.playhead-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--status-danger-fill);
  pointer-events: none;
  transform: translateX(-1px);
  z-index: 4;
}

.playhead-line.lane {
  top: 0;
  bottom: 0;
  background: var(--status-danger-fill-soft);
}

.tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--ink-2);
}

.timeline-lane {
  margin-bottom: 10px;
}

.lane-title {
  font-size: 13px;
  color: var(--ink-1);
  margin-bottom: 4px;
}

.lane-bars {
  position: relative;
  min-height: 32px;
  background: var(--card-soft);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.lane-bars.file-drop-active {
  border-color: var(--brand);
  box-shadow: inset 0 0 0 2px var(--brand-glow);
}

.lane-bar {
  position: absolute;
  top: 4px;
  bottom: 4px;
  background: linear-gradient(135deg, var(--meter-brand-start), var(--meter-brand-end));
  border-radius: 6px;
  color: var(--card);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 6px;
}

.lane-bar.video-editable {
  padding: 0 12px;
  cursor: grab;
}

.lane-bar.bar-drag-source {
  opacity: 0.68;
}

.lane-bar.bar-drop-target {
  outline: 2px dashed var(--contrast-solid);
  outline-offset: -2px;
}

.lane-bar.bar-selected {
  box-shadow: inset 0 0 0 2px var(--contrast-solid);
}

.dock-insert-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--status-warning-ink);
  box-shadow: 0 0 0 1px var(--status-warning-line-soft);
  transform: translateX(-1px);
  pointer-events: none;
  z-index: 6;
}

.file-drop-hint {
  position: absolute;
  top: 6px;
  right: 8px;
  margin: 0;
  font-size: 11px;
  color: var(--status-info-ink);
  background: var(--status-info-bg);
  border: 1px solid var(--status-info-border);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
  z-index: 7;
  pointer-events: none;
}

.selection-box {
  position: absolute;
  top: 2px;
  bottom: 2px;
  border: 1px dashed var(--brand);
  background: var(--brand-glow);
  border-radius: 6px;
  pointer-events: none;
}

.resize-handle {
  position: absolute;
  top: 2px;
  bottom: 2px;
  width: 8px;
  border: 0;
  background: var(--contrast-mid);
  cursor: ew-resize;
  padding: 0;
}

.resize-handle.start {
  left: 0;
  border-top-left-radius: 6px;
  border-bottom-left-radius: 6px;
}

.resize-handle.end {
  right: 0;
  border-top-right-radius: 6px;
  border-bottom-right-radius: 6px;
}
</style>
