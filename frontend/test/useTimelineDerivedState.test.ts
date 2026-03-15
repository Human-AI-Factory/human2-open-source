import test from 'node:test';
import assert from 'node:assert/strict';
import { computed, ref } from 'vue';
import { useTimelineDerivedState } from '../src/composables/useTimelineDerivedState';

test('useTimelineDerivedState should build transitions, track previews and playhead state', () => {
  const storyboardTitleMap = computed(
    () =>
      new Map([
        ['sb-1', '镜头一'],
        ['sb-2', '镜头二'],
        ['audio-1', '配音片段'],
        ['text-1', '字幕片段']
      ])
  );
  const clips = ref([
    {
      id: 'clip-1',
      storyboardId: 'sb-1',
      durationSec: 4,
      transition: { type: 'fade', durationSec: 0.75, easing: 'easeInOut', direction: 'left' }
    },
    {
      id: 'clip-2',
      storyboardId: 'sb-2',
      durationSec: 6,
      speed: 2
    }
  ] as any);
  const audioTracks = ref([
    {
      id: 'audio-main',
      name: 'Audio Main',
      type: 'audio',
      clips: [{ id: 'audio-clip-1', storyboardId: 'audio-1', durationSec: 3 }]
    },
    {
      id: 'audio-dialogue-xiaoyuan',
      name: '对白 · 小圆',
      type: 'audio',
      clips: [{ id: 'audio-clip-2', storyboardId: 'sb-1', startMs: 1000, endMs: 2500, durationSec: 1.5 }]
    }
  ] as any);
  const textTrack = ref({
    id: 'text-main',
    name: 'Text Overlay',
    type: 'text',
    clips: [{ id: 'text-clip-1', storyboardId: 'text-1', startMs: 500, endMs: 2500, durationSec: 4 }]
  } as any);
  const selectedClipIndex = ref(1);
  const timelinePlayheadSec = ref(5);

  const state = useTimelineDerivedState({
    storyboardTitleMap,
    clips,
    audioTracks,
    textTrack,
    selectedClipIndex,
    timelinePlayheadSec
  });

  assert.equal(state.transitionPreview.value.length, 1);
  assert.equal(state.transitionPreview.value[0].fromTitle, '镜头一');
  assert.equal(state.transitionPreview.value[0].toTitle, '镜头二');
  assert.equal(state.transitionPreview.value[0].filter, 'xfade=transition=fade:duration=0.750:offset=3.250');
  assert.equal(state.timelineTracksPreview.value.length, 4);
  assert.equal(state.timelineTotalDurationSec.value, 7);
  assert.deepEqual(state.timelineTicks.value, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(state.timelineTracksPreviewWithPct.value[0].items[0].leftPct, 0);
  assert.equal(state.timelineTracksPreviewWithPct.value[0].items[1].widthPct, 42.8571);
  assert.equal(state.videoClipSpans.value[1].startSec, 4);
  assert.equal(state.selectedClipSpan.value?.endSec, 7);
  assert.equal(state.formatClipSpan(state.selectedClipSpan.value), '4.00s -> 7.00s');
  assert.equal(state.timelinePlayheadPct.value, 71.4286);
});
