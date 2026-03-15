import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTick, ref } from 'vue';
import { useTimelinePlaybackControls } from '../src/composables/useTimelinePlaybackControls';

test('useTimelinePlaybackControls should manage wheel zoom, playhead seeking and playback loop state', async () => {
  const originalWindow = globalThis.window;
  const originalWarn = console.warn;

  let intervalCallback: (() => void) | null = null;
  let clearedTimer = false;

  globalThis.window = {
    setInterval(callback: TimerHandler) {
      intervalCallback = callback as () => void;
      return 1 as unknown as number;
    },
    clearInterval() {
      clearedTimer = true;
    }
  } as Window & typeof globalThis;
  console.warn = () => {};

  const studioDenseMode = ref(false);
  const studioImmersiveMode = ref(false);
  const showHotkeyHelp = ref(false);
  let focused = 0;
  let selected = 0;
  const quickCommandInputRef = ref({
    focus() {
      focused += 1;
    },
    select() {
      selected += 1;
    }
  } as HTMLInputElement);
  const timelineZoomPercent = ref(100);
  const timelinePlayheadSec = ref(1);
  const timelinePlaying = ref(false);
  const timelineLoopEnabled = ref(false);
  const timelineTotalDurationSec = ref(2);

  const controls = useTimelinePlaybackControls({
    studioDenseMode,
    studioImmersiveMode,
    showHotkeyHelp,
    quickCommandInputRef,
    timelineZoomPercent,
    timelinePlayheadSec,
    timelinePlaying,
    timelineLoopEnabled,
    timelineTotalDurationSec,
    clampNumber: (value, min, max) => Math.max(min, Math.min(max, value)),
    normalizePlayhead: (value) => Math.max(0, Math.min(value, timelineTotalDurationSec.value))
  });

  try {
    let prevented = false;
    controls.onTimelineCanvasWheel({
      ctrlKey: true,
      metaKey: false,
      deltaY: -1,
      preventDefault() {
        prevented = true;
      }
    } as WheelEvent);
    assert.equal(prevented, true);
    assert.equal(timelineZoomPercent.value, 110);

    controls.toggleStudioDenseMode();
    controls.toggleStudioImmersiveMode();
    controls.toggleHotkeyHelp();
    controls.focusQuickCommandInput();
    assert.equal(studioDenseMode.value, true);
    assert.equal(studioImmersiveMode.value, true);
    assert.equal(showHotkeyHelp.value, true);
    assert.equal(focused, 1);
    assert.equal(selected, 1);

    controls.onTimelineRulerPointerDown({
      clientX: 50,
      currentTarget: {
        getBoundingClientRect() {
          return { left: 0, width: 200 };
        }
      }
    } as unknown as PointerEvent);
    assert.equal(timelinePlayheadSec.value, 0.5);

    controls.stepPlayhead(1);
    assert.equal(timelinePlayheadSec.value, 0.533);

    controls.startTimelinePlayback();
    assert.equal(timelinePlaying.value, true);
    intervalCallback?.();
    assert.equal(timelinePlayheadSec.value, 0.566);

    timelinePlayheadSec.value = 1.99;
    intervalCallback?.();
    assert.equal(timelinePlayheadSec.value, 2);
    assert.equal(timelinePlaying.value, false);
    assert.equal(clearedTimer, true);

    timelinePlaying.value = true;
    timelinePlayheadSec.value = 5;
    timelineTotalDurationSec.value = 0;
    await nextTick();
    assert.equal(timelinePlaying.value, false);
    assert.equal(timelinePlayheadSec.value, 0);

    controls.seekTimelineStart();
    assert.equal(timelinePlayheadSec.value, 0);
  } finally {
    globalThis.window = originalWindow;
    console.warn = originalWarn;
  }
});
