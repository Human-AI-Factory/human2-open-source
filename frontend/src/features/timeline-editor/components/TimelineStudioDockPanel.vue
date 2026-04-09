<template>
  <aside class="studio-dock" :class="dockClassList" :style="dockFloatingStyle" @pointerdown="activateDockPanel">
    <div class="inline-between">
      <h4 class="drag-handle" @pointerdown.prevent="startDockFloatDrag">创作 Dock</h4>
      <div class="actions">
        <button v-if="dockLayoutMode === 'float'" @click="toggleDockPinned">{{ dockPinned ? '取消置顶' : '置顶' }}</button>
        <button v-if="dockLayoutMode === 'float'" @click="toggleDockLocked">{{ dockLocked ? '解锁' : '锁定' }}</button>
        <button @click="toggleStudioDockCollapsed">{{ studioDockCollapsed ? '展开' : '收起' }}</button>
      </div>
    </div>
    <template v-if="!studioDockCollapsed">
      <div class="actions dock-tabs">
        <button :class="{ primary: activeDockPanel === 'shots' }" @click="setActiveDockPanel('shots')">镜头库</button>
        <button :class="{ primary: activeDockPanel === 'media' }" @click="setActiveDockPanel('media')">素材库</button>
        <button :class="{ primary: activeDockPanel === 'actions' }" @click="setActiveDockPanel('actions')">动作库</button>
      </div>
      <input :value="dockSearch" placeholder="搜索分镜/素材/预设" @input="handleDockSearchInput" />
      <div v-if="activeDockPanel === 'shots'" class="dock-list">
        <article v-for="item in filteredStoryboardDockItems" :key="`dock-shot-${item.id}`" class="card">
          <p>{{ item.title }}</p>
          <p class="muted">{{ item.id }}</p>
          <button draggable="true" @dragstart="onDockShotDragStart(item.id, $event)" @dragend="onDockShotDragEnd">拖拽到轨道</button>
          <button @click="addClipFromStoryboard(item.id)">追加到时间线</button>
        </article>
        <p v-if="filteredStoryboardDockItems.length === 0" class="muted">无匹配镜头</p>
      </div>
      <div v-else-if="activeDockPanel === 'media'" class="dock-list">
        <div class="actions">
          <button :disabled="selectedClipCount === 0" @click="applyMediaToSelectedClipsBatch">批量替换选中媒体</button>
          <button @click="autoBindMediaForTimelineClips">按分镜自动绑定媒体</button>
        </div>
        <article v-for="item in filteredMediaDockItems" :key="`dock-media-${item.storyboardId}`" class="card">
          <p>{{ item.title }}</p>
          <p class="muted">{{ item.taskId }}</p>
          <button :disabled="!hasSelectedClip" @click="applyMediaToSelectedClip(item.storyboardId)">替换当前片段源</button>
          <button @click="appendMediaAsClip(item.storyboardId)">追加为新片段</button>
        </article>
        <p v-if="filteredMediaDockItems.length === 0" class="muted">暂无可用素材</p>
      </div>
      <div v-else class="dock-list">
        <article v-for="preset in filteredKeyframeDockPresets" :key="`dock-kf-${preset.id}`" class="card">
          <p>{{ preset.label }}</p>
          <button :disabled="!hasSelectedClip" @click="applyDockKeyframePreset(preset.id)">应用关键帧</button>
        </article>
        <article v-for="preset in filteredTransitionDockPresets" :key="`dock-tr-${preset.id}`" class="card">
          <p>{{ preset.label }}</p>
          <button :disabled="!hasSelectedClip" @click="applyDockTransitionPreset(preset.id)">应用转场曲线</button>
        </article>
      </div>
    </template>
    <div
      v-if="!studioDockCollapsed"
      class="dock-resizer"
      role="separator"
      aria-label="调整 Dock 宽度"
      @pointerdown.prevent="startDockResize"></div>
  </aside>
</template>

<script setup lang="ts">
import type { HTMLAttributes, StyleValue } from 'vue';

type DockPanel = 'shots' | 'media' | 'actions';
type AsyncAction = () => void | Promise<void>;
type StoryboardDockItem = {
  id: string;
  title: string;
};
type MediaDockItem = {
  storyboardId: string;
  title: string;
  taskId?: string | null;
};
type DockPreset = {
  id: string;
  label: string;
};

const props = defineProps<{
  dockClassList?: HTMLAttributes['class'];
  dockFloatingStyle?: StyleValue;
  dockPinned: boolean;
  dockLocked: boolean;
  studioDockCollapsed: boolean;
  dockLayoutMode: 'left' | 'right' | 'float';
  activeDockPanel: DockPanel;
  dockSearch: string;
  filteredStoryboardDockItems: readonly StoryboardDockItem[];
  filteredMediaDockItems: readonly MediaDockItem[];
  filteredKeyframeDockPresets: readonly DockPreset[];
  filteredTransitionDockPresets: readonly DockPreset[];
  hasSelectedClip: boolean;
  selectedClipCount: number;
  activateDockPanel: AsyncAction;
  toggleDockPinned: AsyncAction;
  toggleDockLocked: AsyncAction;
  toggleStudioDockCollapsed: AsyncAction;
  setActiveDockPanel: (panel: DockPanel) => void | Promise<void>;
  setDockSearch: (value: string) => void | Promise<void>;
  startDockFloatDrag: (event: PointerEvent) => void | Promise<void>;
  startDockResize: (event: PointerEvent) => void | Promise<void>;
  onDockShotDragStart: (storyboardId: string, event: DragEvent) => void | Promise<void>;
  onDockShotDragEnd: (event: DragEvent) => void | Promise<void>;
  addClipFromStoryboard: (storyboardId: string) => void | Promise<void>;
  applyMediaToSelectedClipsBatch: AsyncAction;
  autoBindMediaForTimelineClips: AsyncAction;
  applyMediaToSelectedClip: (storyboardId: string) => void | Promise<void>;
  appendMediaAsClip: (storyboardId: string) => void | Promise<void>;
  applyDockKeyframePreset: (presetId: string) => void | Promise<void>;
  applyDockTransitionPreset: (presetId: string) => void | Promise<void>;
}>();

const handleDockSearchInput = (event: Event): void => {
  props.setDockSearch((event.target as HTMLInputElement).value);
};
</script>

<style scoped>
.studio-dock {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-spotlight);
  padding: 10px;
  position: relative;
  display: grid;
  gap: 8px;
  align-content: start;
  max-height: 900px;
  overflow: hidden auto;
}

.studio-dock.collapsed {
  width: 72px;
}

.studio-dock.floating {
  position: fixed;
  z-index: 40;
  box-shadow: var(--shadow-float);
  max-height: min(78vh, 900px);
}

.studio-dock.floating.snap-animating {
  transition: left 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.studio-dock.pinned {
  box-shadow: var(--selection-shadow-float);
}

.studio-dock.locked .drag-handle {
  cursor: not-allowed;
  opacity: 0.65;
}

.dock-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.dock-list {
  display: grid;
  gap: 8px;
}

.dock-resizer {
  position: absolute;
  top: 6px;
  right: -6px;
  bottom: 6px;
  width: 12px;
  cursor: col-resize;
  z-index: 2;
}

.dock-resizer::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 5px;
  width: 2px;
  border-radius: 1px;
  background: var(--status-neutral-border);
}

.drag-handle {
  cursor: grab;
  user-select: none;
}

@media (max-width: 980px) {
  .studio-dock.collapsed {
    width: auto;
  }
}
</style>
