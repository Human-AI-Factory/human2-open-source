<template>
  <aside class="clip-editor" :class="clipPanelClassList" :style="clipPanelFloatingStyle" @pointerdown="activateClipPanel">
    <div class="inline-between">
      <h4 class="drag-handle" @pointerdown.prevent="startClipPanelFloatDrag">参数面板</h4>
      <div class="actions">
        <button v-if="clipPanelLayoutMode === 'float'" @click="toggleClipPanelPinned">{{ clipPanelPinned ? '取消置顶' : '置顶' }}</button>
        <button v-if="clipPanelLayoutMode === 'float'" @click="toggleClipPanelLocked">{{ clipPanelLocked ? '解锁' : '锁定' }}</button>
        <p class="muted">{{ clipPanelLayoutMode === 'float' ? '浮动中' : `停靠${clipPanelLayoutMode === 'left' ? '左侧' : '右侧'}` }}</p>
      </div>
    </div>
    <p class="muted">分镜：{{ storyboardTitleMap.get(selectedClip.storyboardId) || selectedClip.storyboardId }}</p>
    <p class="muted">时间段：{{ formatClipSpan(selectedClipSpan) }} · 播放头 {{ timelinePlayheadSec.toFixed(2) }}s</p>
    <div class="actions panel-tabs">
      <button :class="{ primary: activePanelTabModel === 'shot' }" @click="activePanelTabModel = 'shot'">镜头</button>
      <button :class="{ primary: activePanelTabModel === 'transition' }" @click="activePanelTabModel = 'transition'">转场</button>
      <button :class="{ primary: activePanelTabModel === 'effects' }" @click="activePanelTabModel = 'effects'">特效</button>
      <button :class="{ primary: activePanelTabModel === 'audio' }" @click="activePanelTabModel = 'audio'">音频</button>
    </div>
    <div class="actions">
      <button @click="focusSelectedClipPlayhead">定位播放头到当前片段</button>
      <button @click="replaceSelectedClipSourceWithLatestTask">替换为该分镜最近成片</button>
    </div>
    <div v-show="activePanelTabModel === 'shot'" class="form">
      <label>
        视频源 URL
        <input v-model="selectedClip.sourceUrl" placeholder="https://..." />
      </label>
      <label>
        时长（秒）
        <input v-model.number="selectedClip.durationSec" type="number" min="0.1" max="600" step="0.1" @input="syncVideoClipTimeline" />
      </label>
      <label>
        开始时间(ms)
        <input v-model.number="selectedClip.startMs" type="number" min="0" step="100" @input="syncVideoClipTimeline" />
      </label>
      <label>
        结束时间(ms)
        <input v-model.number="selectedClip.endMs" type="number" min="0" step="100" @input="syncVideoClipTimeline" />
      </label>
      <label>
        trimStart(ms)
        <input v-model.number="selectedClip.trimStartMs" type="number" min="0" step="50" />
      </label>
      <label>
        trimEnd(ms)
        <input v-model.number="selectedClip.trimEndMs" type="number" min="0" step="50" />
      </label>
      <label>
        speed
        <input v-model.number="selectedClip.speed" type="number" min="0.1" max="8" step="0.05" @input="syncVideoClipTimeline" />
      </label>
      <label>
        volume
        <input v-model.number="selectedClip.volume" type="number" min="0" max="200" step="1" />
      </label>
      <label class="check-inline">
        <input v-model="selectedClip.muted" type="checkbox" />
        muted
      </label>
      <label>
        fadeIn(ms)
        <input v-model.number="selectedClip.fadeInMs" type="number" min="0" max="30000" step="100" />
      </label>
      <label>
        fadeOut(ms)
        <input v-model.number="selectedClip.fadeOutMs" type="number" min="0" max="30000" step="100" />
      </label>
    </div>

    <h5 v-show="activePanelTabModel === 'transition'">转场参数</h5>
    <div v-show="activePanelTabModel === 'transition'" class="form">
      <label>
        类型
        <select v-model="selectedClip.transition.type">
          <option value="cut">cut</option>
          <option value="fade">fade</option>
          <option value="dissolve">dissolve</option>
          <option value="wipeleft">wipeleft</option>
          <option value="wiperight">wiperight</option>
          <option value="slideleft">slideleft</option>
          <option value="slideright">slideright</option>
          <option value="circleopen">circleopen</option>
          <option value="circleclose">circleclose</option>
        </select>
      </label>
      <label>
        时长（秒）
        <input v-model.number="selectedClip.transition.durationSec" type="number" min="0" max="5" step="0.05" />
      </label>
      <label>
        easing
        <select v-model="selectedClip.transition.easing">
          <option value="linear">linear</option>
          <option value="easeIn">easeIn</option>
          <option value="easeOut">easeOut</option>
          <option value="easeInOut">easeInOut</option>
        </select>
      </label>
      <label>
        direction
        <select v-model="selectedClip.transition.direction">
          <option value="left">left</option>
          <option value="right">right</option>
          <option value="up">up</option>
          <option value="down">down</option>
        </select>
      </label>
    </div>

    <h5 v-show="activePanelTabModel === 'shot'">关键帧参数</h5>
    <div v-show="activePanelTabModel === 'shot'" class="actions">
      <select v-model="selectedKeyframePresetIdModel">
        <option v-for="preset in keyframePresets" :key="preset.id" :value="preset.id">{{ preset.label }}</option>
      </select>
      <button @click="applySelectedKeyframePreset">应用关键帧预设</button>
      <select v-model="selectedTransitionCurveIdModel">
        <option v-for="preset in transitionCurvePresets" :key="preset.id" :value="preset.id">{{ preset.label }}</option>
      </select>
      <button @click="applySelectedTransitionCurvePreset">应用转场曲线</button>
    </div>
    <div v-show="activePanelTabModel === 'shot'" class="keyframe-canvas-panel">
      <div class="inline-between">
        <p class="muted">画布直控：拖拽 Start / End 点直接改位移（X/Y）</p>
        <p class="muted">
          曲线：{{ keyframeCurveLabel }} · Start({{ keyframeStartPosition.x.toFixed(1) }}, {{ keyframeStartPosition.y.toFixed(1) }}) / End({{ keyframeEndPosition.x.toFixed(1) }}, {{ keyframeEndPosition.y.toFixed(1) }})
        </p>
      </div>
      <div class="actions" style="margin-bottom: 8px">
        <label>
          播放进度 {{ Math.round(keyframePreviewProgressModel * 100) }}%
          <input v-model.number="keyframePreviewProgressModel" type="range" min="0" max="1" step="0.01" />
        </label>
        <label>
          曲线强度 {{ curveStrengthPercentModel }}%
          <input v-model.number="curveStrengthPercentModel" type="range" min="0" max="100" step="1" />
        </label>
        <button @click="toggleKeyframePreviewPlay">{{ keyframePreviewPlaying ? '暂停预览' : '播放预览' }}</button>
        <button @click="resetBezierControlsByPreset">按曲线重置控制点</button>
      </div>
      <div :ref="setKeyframeCanvasRef" class="keyframe-canvas" @pointerdown="onKeyframeCanvasPointerDown">
        <div class="keyframe-grid-lines"></div>
        <div class="keyframe-axis x"></div>
        <div class="keyframe-axis y"></div>
        <svg class="keyframe-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path class="keyframe-path-line" :d="keyframeCurvePathD" />
          <circle
            v-for="sample in keyframeSamplePoints"
            :key="`sample-${sample.t}`"
            class="keyframe-sample-dot"
            :cx="sample.x"
            :cy="sample.y"
            r="1.25" />
          <line class="keyframe-control-line" :x1="keyframeStartCanvas.x" :y1="keyframeStartCanvas.y" :x2="bezierControl1.x" :y2="bezierControl1.y" />
          <line class="keyframe-control-line" :x1="keyframeEndCanvas.x" :y1="keyframeEndCanvas.y" :x2="bezierControl2.x" :y2="bezierControl2.y" />
          <circle class="keyframe-progress-dot" :cx="keyframeProgressCanvas.x" :cy="keyframeProgressCanvas.y" r="2.8" />
        </svg>
        <button
          type="button"
          class="keyframe-point start"
          :style="keyframePointStyle('start')"
          title="拖拽编辑起点位移"
          @pointerdown.stop.prevent="startKeyframePointDrag('start', $event)">
          S
        </button>
        <button
          type="button"
          class="keyframe-point end"
          :style="keyframePointStyle('end')"
          title="拖拽编辑终点位移"
          @pointerdown.stop.prevent="startKeyframePointDrag('end', $event)">
          E
        </button>
        <button
          type="button"
          class="keyframe-point control"
          :style="keyframePointStyle('cp1')"
          title="拖拽编辑控制点 1"
          @pointerdown.stop.prevent="startKeyframePointDrag('cp1', $event)">
          C1
        </button>
        <button
          type="button"
          class="keyframe-point control"
          :style="keyframePointStyle('cp2')"
          title="拖拽编辑控制点 2"
          @pointerdown.stop.prevent="startKeyframePointDrag('cp2', $event)">
          C2
        </button>
        <button
          type="button"
          class="keyframe-point progress"
          :style="keyframePointStyle('progress')"
          title="拖拽进度点预览运动轨迹"
          @pointerdown.stop.prevent="startKeyframePointDrag('progress', $event)">
          P
        </button>
      </div>
    </div>
    <div v-show="activePanelTabModel === 'shot'" class="panel" style="padding: 10px; margin-bottom: 10px">
      <p class="muted">图形化调参（滑块）</p>
      <div class="form">
        <label>
          缩放起点 {{ selectedClip.keyframe.startScale ?? 1 }}
          <input v-model.number="selectedClip.keyframe.startScale" type="range" min="0.1" max="5" step="0.01" />
        </label>
        <label>
          缩放终点 {{ selectedClip.keyframe.endScale ?? 1 }}
          <input v-model.number="selectedClip.keyframe.endScale" type="range" min="0.1" max="5" step="0.01" />
        </label>
        <label>
          横向位移终点 {{ selectedClip.keyframe.endX ?? 0 }}%
          <input v-model.number="selectedClip.keyframe.endX" type="range" min="-100" max="100" step="0.1" />
        </label>
        <label>
          纵向位移终点 {{ selectedClip.keyframe.endY ?? 0 }}%
          <input v-model.number="selectedClip.keyframe.endY" type="range" min="-100" max="100" step="0.1" />
        </label>
        <label>
          旋转 {{ selectedClip.keyframe.rotationDeg ?? 0 }}°
          <input v-model.number="selectedClip.keyframe.rotationDeg" type="range" min="-180" max="180" step="0.1" />
        </label>
      </div>
    </div>
    <div v-show="activePanelTabModel === 'shot'" class="form keyframe-grid">
      <label>
        startScale
        <input v-model.number="selectedClip.keyframe.startScale" type="number" min="0.1" max="5" step="0.01" />
      </label>
      <label>
        endScale
        <input v-model.number="selectedClip.keyframe.endScale" type="number" min="0.1" max="5" step="0.01" />
      </label>
      <label>
        startX(%)
        <input v-model.number="selectedClip.keyframe.startX" type="number" min="-100" max="100" step="0.1" />
      </label>
      <label>
        startY(%)
        <input v-model.number="selectedClip.keyframe.startY" type="number" min="-100" max="100" step="0.1" />
      </label>
      <label>
        endX(%)
        <input v-model.number="selectedClip.keyframe.endX" type="number" min="-100" max="100" step="0.1" />
      </label>
      <label>
        endY(%)
        <input v-model.number="selectedClip.keyframe.endY" type="number" min="-100" max="100" step="0.1" />
      </label>
      <label>
        rotationDeg
        <input v-model.number="selectedClip.keyframe.rotationDeg" type="number" min="-180" max="180" step="0.1" />
      </label>
    </div>
    <div v-show="activePanelTabModel === 'shot'" class="actions">
      <button @click="resetSelectedClipKeyframe">重置关键帧</button>
      <button @click="resetSelectedClipTransition">重置转场</button>
    </div>

    <h5 v-show="activePanelTabModel === 'effects'">视觉效果链</h5>
    <div v-show="activePanelTabModel === 'effects'" class="form">
      <label class="check-inline">
        <input type="checkbox" :checked="isEffectEnabled('brightness')" @change="setEffectEnabled('brightness', ($event.target as HTMLInputElement).checked)" />
        启用亮度
      </label>
      <label v-if="isEffectEnabled('brightness')">
        brightness {{ getNumericEffectConfig('brightness', 'amount', 0).toFixed(2) }}
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          :value="getNumericEffectConfig('brightness', 'amount', 0)"
          @input="setNumericEffectConfig('brightness', 'amount', Number(($event.target as HTMLInputElement).value), -1, 1, 0.01)" />
      </label>

      <label class="check-inline">
        <input type="checkbox" :checked="isEffectEnabled('contrast')" @change="setEffectEnabled('contrast', ($event.target as HTMLInputElement).checked)" />
        启用对比度
      </label>
      <label v-if="isEffectEnabled('contrast')">
        contrast {{ getNumericEffectConfig('contrast', 'amount', 1).toFixed(2) }}
        <input
          type="range"
          min="0"
          max="3"
          step="0.01"
          :value="getNumericEffectConfig('contrast', 'amount', 1)"
          @input="setNumericEffectConfig('contrast', 'amount', Number(($event.target as HTMLInputElement).value), 0, 3, 0.01)" />
      </label>

      <label class="check-inline">
        <input type="checkbox" :checked="isEffectEnabled('saturation')" @change="setEffectEnabled('saturation', ($event.target as HTMLInputElement).checked)" />
        启用饱和度
      </label>
      <label v-if="isEffectEnabled('saturation')">
        saturation {{ getNumericEffectConfig('saturation', 'amount', 1).toFixed(2) }}
        <input
          type="range"
          min="0"
          max="3"
          step="0.01"
          :value="getNumericEffectConfig('saturation', 'amount', 1)"
          @input="setNumericEffectConfig('saturation', 'amount', Number(($event.target as HTMLInputElement).value), 0, 3, 0.01)" />
      </label>

      <label class="check-inline">
        <input type="checkbox" :checked="isEffectEnabled('blur')" @change="setEffectEnabled('blur', ($event.target as HTMLInputElement).checked)" />
        启用模糊
      </label>
      <label v-if="isEffectEnabled('blur')">
        blur radius {{ getNumericEffectConfig('blur', 'radius', 0).toFixed(2) }}
        <input
          type="range"
          min="0"
          max="20"
          step="0.1"
          :value="getNumericEffectConfig('blur', 'radius', 0)"
          @input="setNumericEffectConfig('blur', 'radius', Number(($event.target as HTMLInputElement).value), 0, 20, 0.1)" />
      </label>

      <label class="check-inline">
        <input type="checkbox" :checked="isEffectEnabled('color')" @change="setEffectEnabled('color', ($event.target as HTMLInputElement).checked)" />
        启用色相
      </label>
      <label v-if="isEffectEnabled('color')">
        hue {{ getNumericEffectConfig('color', 'hue', 0).toFixed(1) }}°
        <input
          type="range"
          min="-180"
          max="180"
          step="0.5"
          :value="getNumericEffectConfig('color', 'hue', 0)"
          @input="setNumericEffectConfig('color', 'hue', Number(($event.target as HTMLInputElement).value), -180, 180, 0.1)" />
      </label>

      <label class="check-inline">
        <input type="checkbox" :checked="isEffectEnabled('crop')" @change="setEffectEnabled('crop', ($event.target as HTMLInputElement).checked)" />
        启用局部裁剪
      </label>
      <label v-if="isEffectEnabled('crop')">
        crop width {{ getNumericEffectConfig('crop', 'width', 100).toFixed(0) }}%
        <input
          type="range"
          min="10"
          max="100"
          step="1"
          :value="getNumericEffectConfig('crop', 'width', 100)"
          @input="setNumericEffectConfig('crop', 'width', Number(($event.target as HTMLInputElement).value), 10, 100, 1)" />
      </label>
      <label v-if="isEffectEnabled('crop')">
        crop height {{ getNumericEffectConfig('crop', 'height', 100).toFixed(0) }}%
        <input
          type="range"
          min="10"
          max="100"
          step="1"
          :value="getNumericEffectConfig('crop', 'height', 100)"
          @input="setNumericEffectConfig('crop', 'height', Number(($event.target as HTMLInputElement).value), 10, 100, 1)" />
      </label>
      <label v-if="isEffectEnabled('crop')">
        crop offsetX {{ getNumericEffectConfig('crop', 'offsetX', 0).toFixed(0) }}%
        <input
          type="range"
          min="-100"
          max="100"
          step="1"
          :value="getNumericEffectConfig('crop', 'offsetX', 0)"
          @input="setNumericEffectConfig('crop', 'offsetX', Number(($event.target as HTMLInputElement).value), -100, 100, 1)" />
      </label>
      <label v-if="isEffectEnabled('crop')">
        crop offsetY {{ getNumericEffectConfig('crop', 'offsetY', 0).toFixed(0) }}%
        <input
          type="range"
          min="-100"
          max="100"
          step="1"
          :value="getNumericEffectConfig('crop', 'offsetY', 0)"
          @input="setNumericEffectConfig('crop', 'offsetY', Number(($event.target as HTMLInputElement).value), -100, 100, 1)" />
      </label>
      <div v-if="isEffectEnabled('crop')" class="crop-canvas-panel">
        <div class="actions" style="margin-bottom: 6px">
          <label>
            比例锁定
            <select v-model="cropAspectLockModel">
              <option value="free">自由</option>
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
            </select>
          </label>
          <button @click="resetCropToFullFrame">重置全画幅</button>
        </div>
        <p class="muted">拖拽框体移动裁剪区域，拖拽右下角手柄缩放范围（锁定比例时自动保持宽高比）</p>
        <div :ref="setCropCanvasRef" class="crop-canvas">
          <div class="crop-grid"></div>
          <div class="crop-box" :style="cropBoxStyle" @pointerdown.stop.prevent="startCropDrag('move', $event)">
            <button type="button" class="crop-resize-handle" @pointerdown.stop.prevent="startCropDrag('resize', $event)"></button>
          </div>
        </div>
      </div>
    </div>
    <h5 v-show="activePanelTabModel === 'audio'">音频参数</h5>
    <div v-show="activePanelTabModel === 'audio'" class="form">
      <label>
        片段音量
        <input v-model.number="selectedClip.volume" type="number" min="0" max="200" step="1" />
      </label>
      <label class="check-inline">
        <input v-model="selectedClip.muted" type="checkbox" />
        片段静音
      </label>
      <label>
        淡入(ms)
        <input v-model.number="selectedClip.fadeInMs" type="number" min="0" max="30000" step="100" />
      </label>
      <label>
        淡出(ms)
        <input v-model.number="selectedClip.fadeOutMs" type="number" min="0" max="30000" step="100" />
      </label>
      <label>
        音频轨音量
        <input v-model.number="audioTrack.volume" type="number" min="0" max="200" step="1" />
      </label>
      <label class="check-inline">
        <input v-model="audioTrack.isMuted" type="checkbox" />
        音频轨静音
      </label>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, type HTMLAttributes, type StyleValue } from 'vue';
import type { TimelineClip, TimelineTrack } from '@/types/models';

type AsyncAction = () => void | Promise<void>;
type EditableClip = TimelineClip & {
  transition: NonNullable<TimelineClip['transition']>;
  keyframe: NonNullable<TimelineClip['keyframe']>;
};
type ClipPanelTab = 'shot' | 'transition' | 'effects' | 'audio';
type ClipPanelLayoutMode = 'left' | 'right' | 'float';
type ClipEffectType = 'filter' | 'color' | 'saturation' | 'blur' | 'crop' | 'brightness' | 'contrast';
type CropAspectLock = 'free' | '16:9' | '9:16' | '1:1';
type TimelineSpan = {
  startSec: number;
  endSec: number;
};
type KeyframePreset = {
  id: string;
  label: string;
};
type TransitionCurvePreset = {
  id: string;
  label: string;
};
type Point = {
  x: number;
  y: number;
};
type SamplePoint = Point & {
  t: string | number;
};
type KeyframePointId = 'start' | 'end' | 'cp1' | 'cp2' | 'progress';
type SetElementRef = (element: unknown) => void;

const props = defineProps<{
  selectedClip: EditableClip;
  audioTrack: TimelineTrack;
  storyboardTitleMap: Map<string, string>;
  selectedClipSpan?: TimelineSpan;
  timelinePlayheadSec: number;
  clipPanelClassList?: HTMLAttributes['class'];
  clipPanelFloatingStyle?: StyleValue;
  clipPanelLayoutMode: ClipPanelLayoutMode;
  clipPanelPinned: boolean;
  clipPanelLocked: boolean;
  activePanelTab: ClipPanelTab;
  selectedKeyframePresetId: string;
  selectedTransitionCurveId: string;
  keyframePresets: readonly KeyframePreset[];
  transitionCurvePresets: readonly TransitionCurvePreset[];
  keyframeCurveLabel: string;
  keyframeStartPosition: Point;
  keyframeEndPosition: Point;
  keyframePreviewProgress: number;
  curveStrengthPercent: number;
  keyframePreviewPlaying: boolean;
  keyframeCurvePathD: string;
  keyframeSamplePoints: readonly SamplePoint[];
  keyframeStartCanvas: Point;
  keyframeEndCanvas: Point;
  bezierControl1: Point;
  bezierControl2: Point;
  keyframeProgressCanvas: Point;
  cropAspectLock: CropAspectLock;
  cropBoxStyle?: StyleValue;
  formatClipSpan: (span: TimelineSpan | undefined) => string;
  activateClipPanel: AsyncAction;
  toggleClipPanelPinned: AsyncAction;
  toggleClipPanelLocked: AsyncAction;
  setActivePanelTab: (value: ClipPanelTab) => void | Promise<void>;
  setSelectedKeyframePresetId: (value: string) => void | Promise<void>;
  setSelectedTransitionCurveId: (value: string) => void | Promise<void>;
  setKeyframePreviewProgress: (value: number) => void | Promise<void>;
  setCurveStrengthPercent: (value: number) => void | Promise<void>;
  setCropAspectLock: (value: CropAspectLock) => void | Promise<void>;
  setKeyframeCanvasRef: SetElementRef;
  setCropCanvasRef: SetElementRef;
  startClipPanelFloatDrag: (event: PointerEvent) => void | Promise<void>;
  focusSelectedClipPlayhead: AsyncAction;
  replaceSelectedClipSourceWithLatestTask: AsyncAction;
  syncVideoClipTimeline: AsyncAction;
  applySelectedKeyframePreset: AsyncAction;
  applySelectedTransitionCurvePreset: AsyncAction;
  toggleKeyframePreviewPlay: AsyncAction;
  resetBezierControlsByPreset: AsyncAction;
  onKeyframeCanvasPointerDown: (event: PointerEvent) => void | Promise<void>;
  keyframePointStyle: (point: KeyframePointId) => StyleValue;
  startKeyframePointDrag: (point: KeyframePointId, event: PointerEvent) => void | Promise<void>;
  resetSelectedClipKeyframe: AsyncAction;
  resetSelectedClipTransition: AsyncAction;
  isEffectEnabled: (type: ClipEffectType) => boolean;
  getNumericEffectConfig: (type: ClipEffectType, key: string, fallback: number) => number;
  setEffectEnabled: (type: ClipEffectType, enabled: boolean) => void | Promise<void>;
  setNumericEffectConfig: (type: ClipEffectType, key: string, rawValue: number, min: number, max: number, precision: number) => void | Promise<void>;
  resetCropToFullFrame: AsyncAction;
  startCropDrag: (mode: 'move' | 'resize', event: PointerEvent) => void | Promise<void>;
}>();

const activePanelTabModel = computed<ClipPanelTab>({
  get: () => props.activePanelTab,
  set: (value) => {
    props.setActivePanelTab(value);
  }
});
const selectedKeyframePresetIdModel = computed<string>({
  get: () => props.selectedKeyframePresetId,
  set: (value) => {
    props.setSelectedKeyframePresetId(value);
  }
});
const selectedTransitionCurveIdModel = computed<string>({
  get: () => props.selectedTransitionCurveId,
  set: (value) => {
    props.setSelectedTransitionCurveId(value);
  }
});
const keyframePreviewProgressModel = computed<number>({
  get: () => props.keyframePreviewProgress,
  set: (value) => {
    props.setKeyframePreviewProgress(value);
  }
});
const curveStrengthPercentModel = computed<number>({
  get: () => props.curveStrengthPercent,
  set: (value) => {
    props.setCurveStrengthPercent(value);
  }
});
const cropAspectLockModel = computed<CropAspectLock>({
  get: () => props.cropAspectLock,
  set: (value) => {
    props.setCropAspectLock(value);
  }
});
</script>

<style scoped>
.clip-editor.floating.snap-animating {
  transition: left 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.clip-editor.pinned {
  box-shadow: var(--selection-shadow-float);
}

.clip-editor.locked .drag-handle {
  cursor: not-allowed;
  opacity: 0.65;
}

.panel-tabs {
  margin: 8px 0;
}

.clip-editor {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--card-soft);
  padding: 10px;
}

.clip-editor.floating {
  position: fixed;
  z-index: 41;
  box-shadow: var(--shadow-float);
  max-height: min(80vh, 900px);
  overflow: auto;
}

.drag-handle {
  cursor: grab;
  user-select: none;
}

.drag-handle:active {
  cursor: grabbing;
}

.clip-editor h5 {
  margin: 10px 0 6px;
}

.keyframe-canvas-panel {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-canvas);
  padding: 10px;
  margin-bottom: 10px;
}

.keyframe-canvas {
  position: relative;
  height: 220px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background:
    linear-gradient(0deg, var(--canvas-grid-strong) 1px, transparent 1px) 0 0 / 100% 20%,
    linear-gradient(90deg, var(--canvas-grid-strong) 1px, transparent 1px) 0 0 / 20% 100%,
    var(--card-soft);
  overflow: hidden;
}

.keyframe-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.keyframe-path-line {
  stroke: var(--brand);
  stroke-width: 1.2;
  stroke-dasharray: 3 2;
  opacity: 0.9;
}

.keyframe-control-line {
  stroke: var(--line-strong);
  stroke-width: 0.8;
  stroke-dasharray: 2 2;
  opacity: 0.75;
}

.keyframe-progress-dot {
  fill: var(--status-danger-ink);
  stroke: var(--card);
  stroke-width: 0.9;
}

.keyframe-sample-dot {
  fill: var(--status-info-ink);
  opacity: 0.35;
}

.keyframe-grid-lines {
  position: absolute;
  inset: 0;
}

.keyframe-axis {
  position: absolute;
  background: var(--axis-soft);
  opacity: 0.7;
}

.keyframe-axis.x {
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
}

.keyframe-axis.y {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
}

.keyframe-point {
  position: absolute;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--radius-pill);
  transform: translate(-50%, -50%);
  color: var(--card);
  font-weight: 700;
  cursor: grab;
  box-shadow: var(--shadow-md);
}

.keyframe-point.start {
  background: var(--status-success-ink);
}

.keyframe-point.end {
  background: var(--status-info-ink);
}

.keyframe-point.control {
  background: var(--status-accent-ink);
}

.keyframe-point.progress {
  background: var(--status-danger-ink);
}

.keyframe-point:active {
  cursor: grabbing;
}

.keyframe-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.crop-canvas-panel {
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  padding: 8px;
  background: var(--card-soft);
}

.crop-canvas {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: linear-gradient(135deg, var(--status-neutral-bg) 0%, var(--card-soft) 100%);
}

.crop-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, var(--canvas-grid-soft) 1px, transparent 1px),
    linear-gradient(to bottom, var(--canvas-grid-soft) 1px, transparent 1px);
  background-size: 20% 20%;
}

.crop-box {
  position: absolute;
  border: 2px solid var(--brand);
  background: var(--brand-glow);
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px var(--contrast-strong);
  cursor: move;
}

.crop-resize-handle {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 14px;
  height: 14px;
  border: 1px solid var(--status-info-ink);
  border-radius: 4px;
  background: var(--card);
  cursor: nwse-resize;
}
</style>
