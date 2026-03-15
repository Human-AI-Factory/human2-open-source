import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFilterComplex,
  buildFilterComplexWithTransitions,
  buildDrawtextSubtitleFilterChain,
  buildOverlaySubtitleFilterChain,
  buildTimelineAudioFilterComplex,
  escapeDrawtextValue,
  escapeSubtitleFilterValue,
  parseSrtContent,
} from '../src/modules/pipeline/video-merge-ffmpeg';

test('escapeSubtitleFilterValue should produce ffmpeg-compatible subtitle filter value without shell quotes', () => {
  const escaped = escapeSubtitleFilterValue("data/video-merges/shot,01[alt];cut's=final/timeline-subtitles.srt");

  assert.equal(escaped.startsWith("'"), false);
  assert.equal(escaped.endsWith("'"), false);
  assert.match(escaped, /timeline-subtitles\.srt$/);
  assert.match(escaped, /\\,/);
  assert.match(escaped, /\\\[/);
  assert.match(escaped, /\\\]/);
  assert.match(escaped, /\\;/);
  assert.match(escaped, /\\'/);
  assert.match(escaped, /\\=/);
});

test('parseSrtContent should parse subtitle cues with timestamps and text', () => {
  const cues = parseSrtContent(
    [
      '1',
      '00:00:01,000 --> 00:00:03,500',
      '第一句字幕',
      '',
      '2',
      '00:00:03,600 --> 00:00:05,000',
      '第二句字幕',
    ].join('\n')
  );

  assert.equal(cues.length, 2);
  assert.deepEqual(cues[0], {
    startMs: 1000,
    endMs: 3500,
    text: '第一句字幕',
  });
  assert.deepEqual(cues[1], {
    startMs: 3600,
    endMs: 5000,
    text: '第二句字幕',
  });
});

test('buildDrawtextSubtitleFilterChain should generate visible hard subtitle filters', () => {
  const filter = buildDrawtextSubtitleFilterChain(
    [
      {
        startMs: 1000,
        endMs: 3500,
        text: "第一句: Hello, 100%",
      },
    ],
    '/System/Library/Fonts/Supplemental/PingFang.ttc'
  );

  assert.match(filter, /^drawtext=/);
  assert.match(filter, /fontfile='/);
  assert.match(filter, /enable='between\(t,1,3.5\)'/);
  assert.match(filter, /text='第一句\\: Hello\\, 100\\%'/);
  assert.match(filter, /box=1/);
  assert.match(filter, /borderw=3/);
});

test('buildDrawtextSubtitleFilterChain should join multiple drawtext filters with commas', () => {
  const filter = buildDrawtextSubtitleFilterChain(
    [
      {
        startMs: 0,
        endMs: 1000,
        text: '第一句',
      },
      {
        startMs: 1200,
        endMs: 2400,
        text: '第二句',
      },
    ],
    null
  );

  assert.match(filter, /^drawtext=text='第一句'/);
  assert.match(filter, /,drawtext=text='第二句'/);
});

test('buildOverlaySubtitleFilterChain should chain timed overlay filters for each cue', () => {
  const filter = buildOverlaySubtitleFilterChain([
    { startMs: 0, endMs: 1000, text: '第一句' },
    { startMs: 1200, endMs: 2400, text: '第二句' },
  ]);

  assert.match(filter, /^\[0:v:0\]format=yuv420p\[sv0\]/);
  assert.match(filter, /\[sv0\]\[1:v:0\]overlay=/);
  assert.match(filter, /enable='between\(t,0,1\)'/);
  assert.match(filter, /\[sv1\]\[2:v:0\]overlay=/);
  assert.match(filter, /enable='between\(t,1.2,2.4\)'/);
  assert.match(filter, /\[vout\]$/);
});

test('escapeDrawtextValue should escape ffmpeg drawtext control characters', () => {
  const escaped = escapeDrawtextValue("第一句: it's 100%, ok\\n");

  assert.match(escaped, /\\:/);
  assert.match(escaped, /\\'/);
  assert.match(escaped, /\\%/);
  assert.match(escaped, /\\\\n/);
});

test('buildFilterComplex should normalize clips to a shared fps, timebase and sar', () => {
  const filter = buildFilterComplex(
    [
      { input: 'https://example.com/apimart.mp4', tempFiles: [], durationSec: 5 },
      { input: 'https://example.com/wan.mp4', tempFiles: [], durationSec: 5 },
    ],
    [
      { storyboardId: 'shot-1' },
      { storyboardId: 'shot-2' },
    ],
    24
  );

  assert.match(filter, /fps=24,settb=AVTB,setsar=1,format=yuv420p\[v0\]/);
  assert.match(filter, /fps=24,settb=AVTB,setsar=1,format=yuv420p\[v1\]/);
  assert.match(filter, /concat=n=2:v=1:a=0\[vout\]$/);
});

test('buildFilterComplexWithTransitions should normalize mixed-source clips before xfade', () => {
  const filter = buildFilterComplexWithTransitions(
    [
      { input: 'https://example.com/apimart.mp4', tempFiles: [], durationSec: 5 },
      { input: 'https://example.com/wan.mp4', tempFiles: [], durationSec: 4 },
    ],
    [
      {
        storyboardId: 'shot-1',
        transition: {
          type: 'fade',
          durationSec: 0.6,
        },
      },
      { storyboardId: 'shot-2' },
    ],
    24
  );

  assert.match(filter, /fps=24,settb=AVTB,setsar=1,format=yuv420p\[v0\]/);
  assert.match(filter, /fps=24,settb=AVTB,setsar=1,format=yuv420p\[v1\]/);
  assert.match(filter, /\[v0\]\[v1\]xfade=transition=fade:duration=0.6:offset=4.4\[vx1\]/);
  assert.match(filter, /\[vx1\]format=yuv420p\[vout\]$/);
});

test('buildTimelineAudioFilterComplex should build a bounded delayed audio mix with reset output pts', () => {
  const filter = buildTimelineAudioFilterComplex([
    {
      storyboardId: 'shot-1',
      sourceUrl: '/tmp/voice-1.wav',
      startMs: 5000,
      endMs: 6500,
      speed: 1,
      volume: 100,
    },
    {
      storyboardId: 'shot-2',
      sourceUrl: '/tmp/voice-2.wav',
      startMs: 7000,
      endMs: 9000,
      speed: 1,
      volume: 100,
    },
  ]);

  assert.match(filter, /\[0:a\]atrim=0:1\.5,asetpts=PTS-STARTPTS/);
  assert.match(
    filter,
    /aformat=sample_rates=48000:channel_layouts=stereo,adelay=5000\|5000,aresample=async=1:first_pts=0,asetpts=N\/SR\/TB\[ta0\]/
  );
  assert.match(filter, /\[1:a\]atrim=0:2,asetpts=PTS-STARTPTS/);
  assert.match(
    filter,
    /aformat=sample_rates=48000:channel_layouts=stereo,adelay=7000\|7000,aresample=async=1:first_pts=0,asetpts=N\/SR\/TB\[ta1\]/
  );
  assert.match(
    filter,
    /amix=inputs=2:duration=longest:dropout_transition=0,aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:9,aresample=async=1:first_pts=0,asetpts=N\/SR\/TB\[aout\]$/
  );
});
