<template>
  <div class="inline-between">
    <h4>轨道时间轴预览</h4>
    <p class="muted">总时长约 {{ timelineTotalDurationSec.toFixed(2) }}s</p>
  </div>
  <div id="timeline-batch-tools" class="actions" style="margin-bottom: 8px">
    <label>
      Zoom {{ timelineZoomPercentModel }}%
      <input v-model.number="timelineZoomPercentModel" type="range" min="60" max="300" step="10" />
    </label>
    <label>
      播放头 {{ timelinePlayheadSecModel.toFixed(2) }}s
      <input v-model.number="timelinePlayheadSecModel" type="range" :min="0" :max="Math.max(0.01, timelineTotalDurationSec)" step="0.01" />
    </label>
    <button class="primary" @click="toggleTimelinePlayback">{{ timelinePlaying ? '暂停' : '播放' }}</button>
    <button @click="seekTimelineStart">回到开头</button>
    <button @click="stepPlayhead(-1)">-1 帧</button>
    <button @click="stepPlayhead(1)">+1 帧</button>
    <label class="check-inline">
      <input v-model="timelineLoopEnabledModel" type="checkbox" />
      循环播放
    </label>
    <label class="check-inline">
      <input v-model="snapEnabledModel" type="checkbox" />
      启用吸附
    </label>
    <label>
      吸附步长
      <select v-model.number="snapStepSecModel" :disabled="!snapEnabledModel">
        <option :value="0.05">0.05s</option>
        <option :value="0.1">0.1s</option>
        <option :value="0.25">0.25s</option>
        <option :value="0.5">0.5s</option>
        <option :value="1">1s</option>
      </select>
    </label>
  </div>
  <div class="actions" style="margin-bottom: 8px">
    <label>
      区间开始(s)
      <input v-model.number="selectionRangeStartSecModel" type="number" min="0" step="0.1" />
    </label>
    <label>
      区间结束(s)
      <input v-model.number="selectionRangeEndSecModel" type="number" min="0" step="0.1" />
    </label>
    <button @click="selectClipsByRange">按区间选中</button>
    <button @click="clearClipRangeSelection">清空选中</button>
    <button :disabled="selectedClipCount === 0" @click="applyKeyframePresetToSelection">预设应用到选中（{{ selectedClipCount }}）</button>
    <button :disabled="selectedClipCount === 0" @click="applyTransitionPresetToSelection">转场应用到选中</button>
    <label>
      时长缩放
      <input v-model.number="durationScaleFactorModel" type="number" min="0.1" max="3" step="0.05" />
    </label>
    <button :disabled="selectedClipCount === 0" @click="scaleSelectedClipDurations">应用缩放</button>
    <button :disabled="selectedClipCount === 0" @click="quickScaleSelectedClipDurations(0.9)">-10%</button>
    <button :disabled="selectedClipCount === 0" @click="quickScaleSelectedClipDurations(1.1)">+10%</button>
    <label>
      转场时长
      <input v-model.number="batchTransitionDurationSecModel" type="number" min="0" max="5" step="0.05" />
    </label>
    <button :disabled="selectedClipCount === 0" @click="applyBatchTransitionDuration">批量统一转场时长</button>
    <button :disabled="selectedClipCount === 0 || !hasSelectedClip" @click="copyCurrentClipParamsToSelection">复制当前片段参数到选中</button>
    <button :disabled="selectedClipCount === 0" @click="resetSelectedClipKeyframes">批量重置关键帧</button>
    <button :disabled="selectedClipCount === 0" @click="duplicateSelectedClips">复制选中片段</button>
    <button class="danger" :disabled="selectedClipCount === 0" @click="removeSelectedClips">删除选中片段</button>
  </div>
  <RouteRestoreHint :text="restoredTip" />
  <p class="muted" style="margin-bottom: 8px">
    画布直控: `Ctrl/⌘ + 滚轮` 缩放时间轴，双击片段快速定位编辑，`[`/`]` 微调时长，`Space` 播放/暂停，`←/→` 步进，`Delete` 删除，`Ctrl/⌘ + D` 复制，`Ctrl/⌘ + Z/Y` 撤销重做。
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import RouteRestoreHint from '@/components/RouteRestoreHint.vue';

type AsyncAction = () => void | Promise<void>;

const props = defineProps<{
  timelineTotalDurationSec: number;
  timelinePlaying: boolean;
  timelineZoomPercent: number;
  timelinePlayheadSec: number;
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
  setTimelineZoomPercent: (value: number) => void | Promise<void>;
  setTimelinePlayheadSec: (value: number) => void | Promise<void>;
  setTimelineLoopEnabled: (value: boolean) => void | Promise<void>;
  setSnapEnabled: (value: boolean) => void | Promise<void>;
  setSnapStepSec: (value: number) => void | Promise<void>;
  setSelectionRangeStartSec: (value: number) => void | Promise<void>;
  setSelectionRangeEndSec: (value: number) => void | Promise<void>;
  setDurationScaleFactor: (value: number) => void | Promise<void>;
  setBatchTransitionDurationSec: (value: number) => void | Promise<void>;
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
}>();

const timelineZoomPercentModel = computed<number>({
  get: () => props.timelineZoomPercent,
  set: (value) => props.setTimelineZoomPercent(value)
});
const timelinePlayheadSecModel = computed<number>({
  get: () => props.timelinePlayheadSec,
  set: (value) => props.setTimelinePlayheadSec(value)
});
const timelineLoopEnabledModel = computed<boolean>({
  get: () => props.timelineLoopEnabled,
  set: (value) => props.setTimelineLoopEnabled(value)
});
const snapEnabledModel = computed<boolean>({
  get: () => props.snapEnabled,
  set: (value) => props.setSnapEnabled(value)
});
const snapStepSecModel = computed<number>({
  get: () => props.snapStepSec,
  set: (value) => props.setSnapStepSec(value)
});
const selectionRangeStartSecModel = computed<number>({
  get: () => props.selectionRangeStartSec,
  set: (value) => props.setSelectionRangeStartSec(value)
});
const selectionRangeEndSecModel = computed<number>({
  get: () => props.selectionRangeEndSec,
  set: (value) => props.setSelectionRangeEndSec(value)
});
const durationScaleFactorModel = computed<number>({
  get: () => props.durationScaleFactor,
  set: (value) => props.setDurationScaleFactor(value)
});
const batchTransitionDurationSecModel = computed<number>({
  get: () => props.batchTransitionDurationSec,
  set: (value) => props.setBatchTransitionDurationSec(value)
});
</script>
