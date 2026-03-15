<template>
  <div class="track-grid">
    <article class="track-card">
      <div class="inline-between">
        <h4>音频轨</h4>
        <div class="actions">
          <button @click="addAudioClip">新增音频片段</button>
        </div>
      </div>
      <div class="form">
        <label>
          轨道名称
          <input v-model="audioTrack.name" placeholder="Audio Main" />
        </label>
        <label>
          轨道音量
          <input v-model.number="audioTrack.volume" type="number" min="0" max="200" />
        </label>
        <label><input v-model="audioTrack.isMuted" type="checkbox" /> 静音</label>
      </div>
      <div class="track-clips">
        <article
          v-for="(clip, idx) in audioTrack.clips"
          :key="clip.id || `${clip.storyboardId}-${idx}`"
          class="track-clip-row"
          :class="{ dragging: auxDragSource?.trackType === 'audio' && auxDragSource.index === idx }"
          draggable="true"
          @dragstart="onAuxClipDragStart('audio', idx, $event)"
          @dragover="onAuxClipDragOver('audio', idx, $event)"
          @drop="onAuxClipDrop('audio', idx, $event)"
          @dragend="onAuxClipDragEnd">
          <div class="form">
            <label>
              分镜
              <select v-model="clip.storyboardId">
                <option v-for="item in storyboards" :key="item.id" :value="item.id">{{ item.title }}</option>
              </select>
            </label>
            <label>
              音频 URL
              <input v-model="clip.sourceUrl" placeholder="https://..." />
            </label>
            <label>
              时长（秒）
              <input v-model.number="clip.durationSec" type="number" min="1" max="600" />
            </label>
          </div>
          <div class="actions">
            <button :disabled="idx === 0" @click="moveAuxClip('audio', idx, -1)">上移</button>
            <button :disabled="idx === audioTrack.clips.length - 1" @click="moveAuxClip('audio', idx, 1)">下移</button>
            <button class="danger" @click="removeAudioClip(idx)">删除</button>
          </div>
          <p class="muted">时间：{{ formatClipSpan(audioClipSpans[idx]) }}</p>
        </article>
        <div class="drop-end" @dragover.prevent @drop="onAuxClipDropToEnd('audio', $event)">拖到这里放到音频轨末尾</div>
        <p v-if="audioTrack.clips.length === 0" class="muted">暂无音频片段，可用于后续混音和对齐。</p>
      </div>
    </article>

    <article class="track-card">
      <div class="inline-between">
        <h4>文本轨</h4>
        <div class="actions">
          <button @click="addTextClip">新增文本片段</button>
        </div>
      </div>
      <div class="form">
        <label>
          轨道名称
          <input v-model="textTrack.name" placeholder="Text Overlay" />
        </label>
        <label><input v-model="textTrack.isMuted" type="checkbox" /> 隐藏文本轨</label>
      </div>
      <div class="track-clips">
        <article
          v-for="(clip, idx) in textTrack.clips"
          :key="clip.id || `${clip.storyboardId}-${idx}`"
          class="track-clip-row"
          :class="{ dragging: auxDragSource?.trackType === 'text' && auxDragSource.index === idx }"
          draggable="true"
          @dragstart="onAuxClipDragStart('text', idx, $event)"
          @dragover="onAuxClipDragOver('text', idx, $event)"
          @drop="onAuxClipDrop('text', idx, $event)"
          @dragend="onAuxClipDragEnd">
          <div class="form">
            <label>
              分镜
              <select v-model="clip.storyboardId">
                <option v-for="item in storyboards" :key="item.id" :value="item.id">{{ item.title }}</option>
              </select>
            </label>
            <label>
              文本内容
              <input v-model="clip.sourceUrl" placeholder="字幕文本" />
            </label>
            <label>
              时长（秒）
              <input v-model.number="clip.durationSec" type="number" min="1" max="600" />
            </label>
          </div>
          <div class="actions">
            <button :disabled="idx === 0" @click="moveAuxClip('text', idx, -1)">上移</button>
            <button :disabled="idx === textTrack.clips.length - 1" @click="moveAuxClip('text', idx, 1)">下移</button>
            <button class="danger" @click="removeTextClip(idx)">删除</button>
          </div>
          <p class="muted">时间：{{ formatClipSpan(textClipSpans[idx]) }}</p>
        </article>
        <div class="drop-end" @dragover.prevent @drop="onAuxClipDropToEnd('text', $event)">拖到这里放到文本轨末尾</div>
        <p v-if="textTrack.clips.length === 0" class="muted">暂无文本片段，可用于字幕/标题占位。</p>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { Storyboard, TimelineTrack } from '@/types/models';

type AuxTrackType = 'audio' | 'text';
type AuxDragSource = {
  trackType: AuxTrackType;
  index: number;
} | null;
type ClipSpan = {
  startSec: number;
  endSec: number;
};
type AsyncAction = () => void | Promise<void>;

defineProps<{
  audioTrack: TimelineTrack;
  textTrack: TimelineTrack;
  storyboards: Storyboard[];
  auxDragSource: AuxDragSource;
  audioClipSpans: Array<ClipSpan | undefined>;
  textClipSpans: Array<ClipSpan | undefined>;
  formatClipSpan: (span: ClipSpan | undefined) => string;
  addAudioClip: AsyncAction;
  addTextClip: AsyncAction;
  moveAuxClip: (trackType: AuxTrackType, index: number, delta: number) => void | Promise<void>;
  onAuxClipDragStart: (trackType: AuxTrackType, index: number, event: DragEvent) => void | Promise<void>;
  onAuxClipDragOver: (trackType: AuxTrackType, index: number, event: DragEvent) => void | Promise<void>;
  onAuxClipDrop: (trackType: AuxTrackType, index: number, event: DragEvent) => void | Promise<void>;
  onAuxClipDragEnd: (event: DragEvent) => void | Promise<void>;
  onAuxClipDropToEnd: (trackType: AuxTrackType, event: DragEvent) => void | Promise<void>;
  removeAudioClip: (index: number) => void | Promise<void>;
  removeTextClip: (index: number) => void | Promise<void>;
}>();
</script>

<style scoped>
.track-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.track-card {
  border: 1px solid #d7deea;
  border-radius: 10px;
  background: #f8fbff;
  padding: 10px;
  display: grid;
  gap: 8px;
}

.track-clips {
  display: grid;
  gap: 8px;
}

.track-clip-row {
  border: 1px solid #d7deea;
  border-radius: 8px;
  background: #fff;
  padding: 8px;
}

.track-clip-row.dragging {
  opacity: 0.65;
}

.drop-end {
  border: 1px dashed #a8b4c9;
  border-radius: 10px;
  padding: 10px;
  color: #65748b;
  text-align: center;
  background: #f9fbff;
}

@media (max-width: 980px) {
  .track-grid {
    grid-template-columns: 1fr;
  }
}
</style>
