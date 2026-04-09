<template>
  <div :ref="setTimelineListRef" class="timeline-list" :style="timelineListStyle">
    <article
      v-for="(clip, idx) in clips"
      :key="`${clip.storyboardId}-${idx}`"
      class="clip-row"
      :class="{
        selected: selectedClipIndex === idx,
        'range-selected': selectedClipIndices.includes(idx),
        dragging: dragSourceIndex === idx,
        'drop-target': dragTargetIndex === idx,
        dense: studioDenseMode,
      }"
      draggable="true"
      @click="selectClip(idx)"
      @dragstart="onClipDragStart(idx, $event)"
      @dragover="onClipDragOver(idx, $event)"
      @drop="onClipDrop(idx, $event)"
      @dragend="onClipDragEnd">
      <div class="clip-handle" title="拖拽排序">::</div>
      <div class="clip-meta">
        <h4>{{ idx + 1 }}. {{ storyboardTitleMap.get(clip.storyboardId) || clip.storyboardId }}</h4>
        <p class="muted">{{ clip.durationSec || 5 }}s · {{ clip.transition?.type || 'cut' }}</p>
        <p class="muted">时间：{{ formatClipSpan(videoClipSpans[idx]) }}</p>
      </div>
      <div class="actions">
        <button :disabled="idx === 0" @click.stop="moveClip(idx, -1)">上移</button>
        <button :disabled="idx === clips.length - 1" @click.stop="moveClip(idx, 1)">下移</button>
        <button class="danger" @click.stop="removeClip(idx)">删除</button>
      </div>
    </article>
    <div class="drop-end" @dragover.prevent @drop="onClipDropToEnd">拖到这里追加到末尾（支持本地视频文件拖入）</div>
  </div>
</template>

<script setup lang="ts">
import type { TimelineClip } from '@/types/models';

type ClipSpan = {
  startSec: number;
  endSec: number;
};
type SetRef = (element: unknown) => void;

defineProps<{
  clips: TimelineClip[];
  selectedClipIndex: number;
  selectedClipIndices: number[];
  dragSourceIndex: number | null;
  dragTargetIndex: number | null;
  studioDenseMode: boolean;
  storyboardTitleMap: Map<string, string>;
  videoClipSpans: Array<ClipSpan | undefined>;
  timelineListStyle?: Record<string, string | number> | undefined;
  setTimelineListRef: SetRef;
  formatClipSpan: (span: ClipSpan | undefined) => string;
  selectClip: (idx: number) => void | Promise<void>;
  onClipDragStart: (idx: number, event: DragEvent) => void | Promise<void>;
  onClipDragOver: (idx: number, event: DragEvent) => void | Promise<void>;
  onClipDrop: (idx: number, event: DragEvent) => void | Promise<void>;
  onClipDragEnd: (event: DragEvent) => void | Promise<void>;
  moveClip: (idx: number, delta: number) => void | Promise<void>;
  removeClip: (idx: number) => void | Promise<void>;
  onClipDropToEnd: (event: DragEvent) => void | Promise<void>;
}>();
</script>

<style scoped>
.timeline-list {
  display: grid;
  gap: 8px;
}

.clip-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-panel-soft);
  padding: 10px;
  cursor: pointer;
}

.clip-row.dense {
  padding: 7px 8px;
  gap: 8px;
}

.clip-row.dense .clip-meta h4 {
  margin: 0;
  font-size: 13px;
}

.clip-row.dense .clip-meta .muted {
  margin: 2px 0 0;
  font-size: 12px;
}

.clip-row.selected {
  border-color: var(--brand);
  box-shadow: var(--selection-ring);
}

.clip-row.range-selected:not(.selected) {
  border-color: var(--status-info-border);
  box-shadow: var(--selection-ring-soft);
}

.clip-row.dragging {
  opacity: 0.65;
}

.clip-row.drop-target {
  border-style: dashed;
}

.clip-handle {
  width: 22px;
  text-align: center;
  color: var(--ink-2);
  font-weight: 700;
  user-select: none;
}

.clip-meta {
  flex: 1;
}

.drop-end {
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  padding: 10px;
  color: var(--ink-2);
  text-align: center;
  background: var(--card-soft);
}
</style>
