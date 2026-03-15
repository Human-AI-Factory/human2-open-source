<template>
  <div v-if="resizeCurvePreview?.active" class="resize-curve-preview">
    <p class="muted">
      拖拽曲线预览：clip #{{ resizeCurvePreview.clipIndex + 1 }} · {{ resizeCurvePreview.edge }} ·
      {{ resizeCurvePreview.fromDurationSec.toFixed(2) }}s -> {{ resizeCurvePreview.toDurationSec.toFixed(2) }}s
    </p>
    <p class="muted">
      Δduration={{ resizeCurveDurationDeltaSec >= 0 ? '+' : '' }}{{ resizeCurveDurationDeltaSec.toFixed(2) }}s ·
      Δslope(start)={{ resizeCurveStartSlopeDelta >= 0 ? '+' : '' }}{{ resizeCurveStartSlopeDelta.toFixed(3) }} ·
      Δslope(end)={{ resizeCurveEndSlopeDelta >= 0 ? '+' : '' }}{{ resizeCurveEndSlopeDelta.toFixed(3) }}
    </p>
    <p class="muted">灰色=旧曲线（拖拽前），蓝色=新曲线（拖拽中）</p>
    <svg viewBox="0 0 300 100" preserveAspectRatio="none">
      <path d="M 8 90 L 292 90" class="axis" />
      <path :d="resizeCurveOldPath" class="curve old" />
      <path :d="resizeCurveNewPath" class="curve new" />
    </svg>
  </div>
  <div v-if="resizeCurveSnapshots.length > 0" class="snapshot-list">
    <div class="inline-between">
      <p class="muted">快照历史（最近 {{ resizeCurveSnapshots.length }} / 最多 5 条）</p>
      <button @click="clearResizeCurveSnapshots">清空快照</button>
    </div>
    <div class="list compact-list">
      <article v-for="(snapshot, idx) in resizeCurveSnapshots" :key="`snapshot-${idx}-${snapshot.clipIndex}`" class="card resize-curve-preview snapshot">
        <p class="muted">
          #{{ idx + 1 }} · clip #{{ snapshot.clipIndex + 1 }} · {{ snapshot.edge }} ·
          {{ snapshot.fromDurationSec.toFixed(2) }}s -> {{ snapshot.toDurationSec.toFixed(2) }}s
        </p>
        <p class="muted">
          Δduration={{ snapshot.durationDeltaSec >= 0 ? '+' : '' }}{{ snapshot.durationDeltaSec.toFixed(2) }}s ·
          Δslope(start)={{ snapshot.startSlopeDelta >= 0 ? '+' : '' }}{{ snapshot.startSlopeDelta.toFixed(3) }} ·
          Δslope(end)={{ snapshot.endSlopeDelta >= 0 ? '+' : '' }}{{ snapshot.endSlopeDelta.toFixed(3) }}
        </p>
        <p class="muted">灰色=旧曲线，蓝色=新曲线</p>
        <svg viewBox="0 0 300 100" preserveAspectRatio="none">
          <path d="M 8 90 L 292 90" class="axis" />
          <path :d="snapshot.oldPath" class="curve old" />
          <path :d="snapshot.newPath" class="curve new" />
        </svg>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ResizeCurvePreview } from '@/composables/useTimelineLanePointerOps';
import type { ResizeCurveSnapshot } from '@/composables/useTimelineResizeCurvePreview';

type AsyncAction = () => void | Promise<void>;

defineProps<{
  resizeCurvePreview: ResizeCurvePreview | null;
  resizeCurveDurationDeltaSec: number;
  resizeCurveStartSlopeDelta: number;
  resizeCurveEndSlopeDelta: number;
  resizeCurveOldPath: string;
  resizeCurveNewPath: string;
  resizeCurveSnapshots: ResizeCurveSnapshot[];
  clearResizeCurveSnapshots: AsyncAction;
}>();
</script>

<style scoped>
.resize-curve-preview {
  border: 1px solid #d7deea;
  border-radius: 10px;
  background: #ffffff;
  padding: 8px;
  margin-bottom: 10px;
}

.resize-curve-preview.snapshot {
  background: #f8fbff;
}

.resize-curve-preview svg {
  width: 100%;
  height: 90px;
  display: block;
}

.resize-curve-preview .axis {
  stroke: #9aa9c1;
  stroke-width: 1;
}

.resize-curve-preview .curve {
  fill: none;
  stroke-width: 2;
}

.resize-curve-preview .curve.old {
  stroke: #9ca3af;
  stroke-dasharray: 4 3;
}

.resize-curve-preview .curve.new {
  stroke: #2f6fed;
}
</style>
