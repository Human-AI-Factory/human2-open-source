import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { TimelineTrack, VideoMergeClip, VideoMergeParams, VideoTransitionConfig, VideoTransitionEasing } from '../../core/types.js';

const MOCK_COLORS = ['1b4965', '2a9d8f', 'f4a261', 'e76f51', '264653', '3a86ff'];

type PreparedClip = {
  input: string;
  tempFiles: string[];
  durationSec?: number;
};
type SubtitleCue = {
  startMs: number;
  endMs: number;
  text: string;
};
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DRAW_TEXT_FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/PingFang.ttc',
  '/System/Library/Fonts/Supplemental/Hiragino Sans GB.ttc',
  '/System/Library/Fonts/Supplemental/Songti.ttc',
  '/Library/Fonts/Arial Unicode.ttf',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];
const AUDIO_FILE_EXTENSIONS = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'opus', 'm4a'] as const;
const SUBTITLE_OVERLAY_RENDERER = fileURLToPath(new URL('./render-subtitle-overlays.py', import.meta.url));
const SUBTITLE_OVERLAY_WIDTH = 1120;
const SUBTITLE_OVERLAY_HEIGHT = 180;
const SUBTITLE_OVERLAY_BOTTOM_MARGIN = 28;

const runFfmpeg = async (ffmpegBin: string, args: string[], timeoutMs = 10 * 60 * 1000): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('FFmpeg timeout'));
    }, timeoutMs);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) {
        stderr = stderr.slice(-8000);
      }
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `FFmpeg exited with code ${code ?? -1}`));
    });
  });
};

const runCommand = async (bin: string, args: string[], timeoutMs = 2 * 60 * 1000): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${bin} timeout`));
    }, timeoutMs);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) {
        stderr = stderr.slice(-8000);
      }
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${bin} exited with code ${code ?? -1}`));
    });
  });
};

const parseFileUrl = (value: string): string | null => {
  try {
    const u = new URL(value);
    if (u.protocol !== 'file:') {
      return null;
    }
    return decodeURIComponent(u.pathname);
  } catch {
    return null;
  }
};

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const buildSyntheticMockClip = async (
  ffmpegBin: string,
  workDir: string,
  index: number,
  durationSec: number | undefined,
  colorHex?: string
): Promise<string> => {
  const output = path.join(workDir, `mock-clip-${index + 1}.mp4`);
  const color = colorHex || MOCK_COLORS[index % MOCK_COLORS.length];
  const duration = Math.max(1, durationSec ?? 2);
  await runFfmpeg(ffmpegBin, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=#${color}:s=1280x720:d=${duration}`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    output
  ]);
  return output;
};

const prepareClipSource = async (
  ffmpegBin: string,
  workDir: string,
  clip: VideoMergeClip,
  index: number
): Promise<PreparedClip> => {
  const source = clip.sourceUrl?.trim() ?? '';
  if (!source) {
    throw new Error(`Clip source missing at index ${index}`);
  }
  if (source.startsWith('/mock/videos/__timeline_gap__')) {
    const tempFile = await buildSyntheticMockClip(ffmpegBin, workDir, index, clip.durationSec, '000000');
    return { input: tempFile, tempFiles: [tempFile], durationSec: clip.durationSec };
  }
  if (isHttpUrl(source)) {
    return { input: source, tempFiles: [], durationSec: clip.durationSec };
  }

  if (source.startsWith('/mock/videos/')) {
    const tempFile = await buildSyntheticMockClip(ffmpegBin, workDir, index, clip.durationSec);
    return { input: tempFile, tempFiles: [tempFile], durationSec: clip.durationSec };
  }

  const asFile = parseFileUrl(source);
  const localPath = asFile ?? (path.isAbsolute(source) ? source : null);
  if (!localPath) {
    throw new Error(`Unsupported clip source URL: ${source}`);
  }

  await fs.access(localPath);
  return { input: localPath, tempFiles: [], durationSec: clip.durationSec };
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const normalizeScale = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return clamp(value, 0.1, 5);
};

const normalizePercent = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return clamp(value, -100, 100);
};

const normalizeRotation = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return clamp(value, -180, 180);
};

const normalizeSpeed = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1;
  }
  return clamp(value, 0.1, 8);
};

const normalizeMs = (value: number | undefined, min: number, max: number): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return clamp(Math.floor(value), min, max);
};

const resolveTrimWindow = (clip: VideoMergeClip): { trimStartSec?: number; trimEndSec?: number; timelineDurationSec?: number } => {
  const trimStartMs = normalizeMs(clip.trimStartMs, 0, 60 * 60 * 1000);
  const trimEndMs = normalizeMs(clip.trimEndMs, 0, 60 * 60 * 1000);
  const startMs = normalizeMs(clip.startMs, 0, 60 * 60 * 1000);
  const endMs = normalizeMs(clip.endMs, 0, 60 * 60 * 1000);
  const trimStartSec = typeof trimStartMs === 'number' ? trimStartMs / 1000 : undefined;
  const trimEndSec =
    typeof trimEndMs === 'number' && (typeof trimStartMs !== 'number' || trimEndMs > trimStartMs) ? trimEndMs / 1000 : undefined;
  const timelineDurationSec =
    typeof startMs === 'number' && typeof endMs === 'number' && endMs > startMs ? (endMs - startMs) / 1000 : undefined;
  return { trimStartSec, trimEndSec, timelineDurationSec };
};

const deriveClipDurationSec = (clip: VideoMergeClip): number | undefined => {
  const trimWindow = resolveTrimWindow(clip);
  const timelineDuration = trimWindow.timelineDurationSec;
  const trimWindowDuration =
    typeof trimWindow.trimStartSec === 'number' && typeof trimWindow.trimEndSec === 'number' && trimWindow.trimEndSec > trimWindow.trimStartSec
      ? trimWindow.trimEndSec - trimWindow.trimStartSec
      : undefined;
  const raw = timelineDuration ?? clip.durationSec ?? trimWindowDuration;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return undefined;
  }
  return Math.max(0.1, Math.min(600, raw));
};

const computePlaybackDurationSec = (clip: VideoMergeClip, sourceDurationSec: number | undefined): number => {
  const source = typeof sourceDurationSec === 'number' && Number.isFinite(sourceDurationSec) ? Math.max(0.1, sourceDurationSec) : 5;
  const speed = normalizeSpeed(clip.speed);
  return Math.max(0.1, source / speed);
};

const expandTimelineGapClips = (clips: VideoMergeClip[]): VideoMergeClip[] => {
  const expanded: VideoMergeClip[] = [];
  let cursorMs = 0;
  for (const clip of clips) {
    const startMs = typeof clip.startMs === 'number' && Number.isFinite(clip.startMs) ? Math.max(0, Math.floor(clip.startMs)) : undefined;
    const endMs = typeof clip.endMs === 'number' && Number.isFinite(clip.endMs) ? Math.max(0, Math.floor(clip.endMs)) : undefined;
    if (typeof startMs === 'number' && startMs > cursorMs) {
      const gapSec = (startMs - cursorMs) / 1000;
      if (gapSec > 0.01) {
        expanded.push({
          storyboardId: clip.storyboardId,
          sourceUrl: `/mock/videos/__timeline_gap__/${startMs}`,
          durationSec: Math.max(0.1, gapSec),
          transition: { type: 'cut' },
          keyframe: { startScale: 1, endScale: 1, startX: 0, startY: 0, endX: 0, endY: 0, rotationDeg: 0 }
        });
      }
    }
    const nextClip: VideoMergeClip = { ...clip };
    const derivedDuration = deriveClipDurationSec(nextClip);
    if (typeof derivedDuration === 'number') {
      nextClip.durationSec = derivedDuration;
    }
    expanded.push(nextClip);
    if (typeof startMs === 'number' && typeof endMs === 'number' && endMs > startMs) {
      cursorMs = endMs;
      continue;
    }
    if (typeof derivedDuration === 'number') {
      const playbackDuration = computePlaybackDurationSec(nextClip, derivedDuration);
      cursorMs += Math.floor(playbackDuration * 1000);
    }
  }
  return expanded;
};

const buildAtempoChain = (speed: number): string => {
  if (Math.abs(speed - 1) < 1e-6) {
    return '';
  }
  const filters: string[] = [];
  let remain = speed;
  while (remain > 2) {
    filters.push('atempo=2');
    remain /= 2;
  }
  while (remain < 0.5) {
    filters.push('atempo=0.5');
    remain /= 0.5;
  }
  filters.push(`atempo=${Number(remain.toFixed(6))}`);
  return filters.join(',');
};

const needsAdvancedAudioProcessing = (clip: VideoMergeClip): boolean => {
  const speed = normalizeSpeed(clip.speed);
  if (Math.abs(speed - 1) > 1e-6) {
    return true;
  }
  if (typeof clip.volume === 'number' && Number.isFinite(clip.volume) && Math.abs(clip.volume - 100) > 1e-6) {
    return true;
  }
  if (clip.muted) {
    return true;
  }
  if (typeof clip.fadeInMs === 'number' && Number.isFinite(clip.fadeInMs) && clip.fadeInMs > 0) {
    return true;
  }
  if (typeof clip.fadeOutMs === 'number' && Number.isFinite(clip.fadeOutMs) && clip.fadeOutMs > 0) {
    return true;
  }
  if (typeof clip.trimStartMs === 'number' && Number.isFinite(clip.trimStartMs) && clip.trimStartMs > 0) {
    return true;
  }
  if (typeof clip.trimEndMs === 'number' && Number.isFinite(clip.trimEndMs)) {
    return true;
  }
  return false;
};

const ensureAudioCompatibleInput = async (
  ffmpegBin: string,
  workDir: string,
  index: number,
  prepared: PreparedClip
): Promise<PreparedClip> => {
  const output = path.join(workDir, `normalized-${index + 1}.mp4`);
  await runFfmpeg(ffmpegBin, [
    '-y',
    '-i',
    prepared.input,
    '-f',
    'lavfi',
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-map',
    '1:a:0',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '32',
    '-c:a',
    'aac',
    '-shortest',
    '-movflags',
    '+faststart',
    output
  ]);
  return {
    input: output,
    tempFiles: [...prepared.tempFiles, output],
    durationSec: prepared.durationSec
  };
};

const buildProgressExpr = (durationSec: number): string => `min(max(t/${Math.max(0.01, durationSec)},0),1)`;

const normalizeMotionEasing = (value: unknown): VideoTransitionEasing => {
  if (value === 'easeIn' || value === 'easeOut' || value === 'easeInOut') {
    return value;
  }
  return 'linear';
};

const buildMotionProgressExpr = (durationSec: number, easing: VideoTransitionEasing): string => {
  const base = buildProgressExpr(durationSec);
  if (easing === 'easeIn') {
    return `pow(${base},2)`;
  }
  if (easing === 'easeOut') {
    return `1-pow(1-${base},2)`;
  }
  if (easing === 'easeInOut') {
    return `if(lt(${base},0.5),2*pow(${base},2),1-pow(-2*${base}+2,2)/2)`;
  }
  return base;
};

const buildVideoEffectFilters = (clip: VideoMergeClip): string[] => {
  const effects = Array.isArray(clip.effects) ? clip.effects : [];
  if (effects.length === 0) {
    return [];
  }
  const enabled = effects
    .filter((item: NonNullable<VideoMergeClip['effects']>[number]) => item && item.enabled !== false)
    .slice()
    .sort(
      (a: NonNullable<VideoMergeClip['effects']>[number], b: NonNullable<VideoMergeClip['effects']>[number]) =>
        (a.order ?? 0) - (b.order ?? 0)
    );
  const filters: string[] = [];
  for (const effect of enabled) {
    const cfg = effect.config && typeof effect.config === 'object' && !Array.isArray(effect.config)
      ? (effect.config as Record<string, unknown>)
      : {};
    if (effect.type === 'brightness') {
      const amountRaw = typeof cfg.amount === 'number' && Number.isFinite(cfg.amount) ? cfg.amount : 0;
      const amount = clamp(amountRaw, -1, 1);
      if (Math.abs(amount) > 1e-6) {
        filters.push(`eq=brightness=${Number(amount.toFixed(4))}`);
      }
      continue;
    }
    if (effect.type === 'contrast') {
      const amountRaw = typeof cfg.amount === 'number' && Number.isFinite(cfg.amount) ? cfg.amount : 1;
      const amount = clamp(amountRaw, 0, 3);
      if (Math.abs(amount - 1) > 1e-6) {
        filters.push(`eq=contrast=${Number(amount.toFixed(4))}`);
      }
      continue;
    }
    if (effect.type === 'saturation') {
      const amountRaw = typeof cfg.amount === 'number' && Number.isFinite(cfg.amount) ? cfg.amount : 1;
      const amount = clamp(amountRaw, 0, 3);
      if (Math.abs(amount - 1) > 1e-6) {
        filters.push(`eq=saturation=${Number(amount.toFixed(4))}`);
      }
      continue;
    }
    if (effect.type === 'blur') {
      const radiusRaw = typeof cfg.radius === 'number' && Number.isFinite(cfg.radius) ? cfg.radius : 0;
      const radius = clamp(radiusRaw, 0, 20);
      if (radius > 0.01) {
        filters.push(`boxblur=${Number(radius.toFixed(3))}:1`);
      }
      continue;
    }
    if (effect.type === 'color') {
      const hueRaw = typeof cfg.hue === 'number' && Number.isFinite(cfg.hue) ? cfg.hue : 0;
      const hue = clamp(hueRaw, -180, 180);
      if (Math.abs(hue) > 1e-6) {
        filters.push(`hue=h=${Number(hue.toFixed(3))}`);
      }
      continue;
    }
    if (effect.type === 'crop') {
      const widthRaw = typeof cfg.width === 'number' && Number.isFinite(cfg.width) ? cfg.width : 100;
      const heightRaw = typeof cfg.height === 'number' && Number.isFinite(cfg.height) ? cfg.height : 100;
      const offsetXRaw = typeof cfg.offsetX === 'number' && Number.isFinite(cfg.offsetX) ? cfg.offsetX : 0;
      const offsetYRaw = typeof cfg.offsetY === 'number' && Number.isFinite(cfg.offsetY) ? cfg.offsetY : 0;
      const width = clamp(widthRaw, 10, 100);
      const height = clamp(heightRaw, 10, 100);
      const offsetX = clamp(offsetXRaw, -100, 100);
      const offsetY = clamp(offsetYRaw, -100, 100);
      if (width < 99.99 || height < 99.99 || Math.abs(offsetX) > 1e-6 || Math.abs(offsetY) > 1e-6) {
        const widthRatio = Number((width / 100).toFixed(6));
        const heightRatio = Number((height / 100).toFixed(6));
        const offsetXRatio = Number((offsetX / 100).toFixed(6));
        const offsetYRatio = Number((offsetY / 100).toFixed(6));
        filters.push(
          `crop=w='iw*${widthRatio}':h='ih*${heightRatio}':x='(iw-iw*${widthRatio})/2+(${offsetXRatio})*(iw-iw*${widthRatio})/2':y='(ih-ih*${heightRatio})/2+(${offsetYRatio})*(ih-ih*${heightRatio})/2'`
        );
      }
      continue;
    }
    if (effect.type === 'filter') {
      const expressionRaw = typeof cfg.expression === 'string' ? cfg.expression.trim() : '';
      if (expressionRaw) {
        // Allow controlled custom filters configured by advanced users.
        filters.push(expressionRaw);
      }
    }
  }
  return filters;
};

const buildClipFilter = (
  inputIndex: number,
  outputLabel: string,
  prepared: PreparedClip,
  clip: VideoMergeClip,
  targetFps: number
): string => {
  const trimWindow = resolveTrimWindow(clip);
  const explicitDuration = typeof prepared.durationSec === 'number' && Number.isFinite(prepared.durationSec)
    ? Math.max(0.1, Math.min(600, prepared.durationSec))
    : undefined;
  const trimWindowDuration =
    typeof trimWindow.trimStartSec === 'number' && typeof trimWindow.trimEndSec === 'number' && trimWindow.trimEndSec > trimWindow.trimStartSec
      ? trimWindow.trimEndSec - trimWindow.trimStartSec
      : undefined;
  const timelineDuration = trimWindow.timelineDurationSec;
  const speed = normalizeSpeed(clip.speed);
  const duration = (explicitDuration ?? timelineDuration ?? trimWindowDuration);
  const speedAdjustedDuration = typeof duration === 'number' ? Math.max(0.1, duration / speed) : undefined;
  const durationForMotion = speedAdjustedDuration ?? 5;
  const motionEasing = normalizeMotionEasing(clip.transition?.easing);
  const progress = buildMotionProgressExpr(durationForMotion, motionEasing);
  const keyframe = clip.keyframe ?? {};
  const startScale = normalizeScale(keyframe.startScale, 1);
  const endScale = normalizeScale(keyframe.endScale, startScale);
  const startX = normalizePercent(keyframe.startX);
  const endX = normalizePercent(keyframe.endX);
  const startY = normalizePercent(keyframe.startY);
  const endY = normalizePercent(keyframe.endY);
  const rotationDeg = normalizeRotation(keyframe.rotationDeg);

  const zoomExpr = `${startScale}+(${endScale}-${startScale})*${progress}`;
  const panXExpr = `${startX}+(${endX}-${startX})*${progress}`;
  const panYExpr = `${startY}+(${endY}-${startY})*${progress}`;
  const cropWExpr = `iw/(${zoomExpr})`;
  const cropHExpr = `ih/(${zoomExpr})`;
  const cropXExpr = `(iw-${cropWExpr})/2+(${panXExpr}/100)*(iw-${cropWExpr})/2`;
  const cropYExpr = `(ih-${cropHExpr})/2+(${panYExpr}/100)*(ih-${cropHExpr})/2`;
  const rotateExpr = `(${rotationDeg}*PI/180)*${progress}`;
  const effectFilters = buildVideoEffectFilters(clip);

  const preFilters: string[] = [];
  if (typeof trimWindow.trimStartSec === 'number' || typeof trimWindow.trimEndSec === 'number') {
    const parts: string[] = [];
    if (typeof trimWindow.trimStartSec === 'number') {
      parts.push(`start=${trimWindow.trimStartSec}`);
    }
    if (typeof trimWindow.trimEndSec === 'number') {
      parts.push(`end=${trimWindow.trimEndSec}`);
    }
    preFilters.push(`trim=${parts.join(':')}`);
  }
  if (typeof duration === 'number') {
    preFilters.push(`trim=duration=${duration}`);
  }
  preFilters.push(`setpts=(PTS-STARTPTS)/${speed}`);
  const preTrim = `${preFilters.join(',')},`;

  const chain = [
    `scale=${DEFAULT_WIDTH}:${DEFAULT_HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${DEFAULT_WIDTH}:${DEFAULT_HEIGHT}`,
    `crop=w='${cropWExpr}':h='${cropHExpr}':x='${cropXExpr}':y='${cropYExpr}'`,
    `scale=${DEFAULT_WIDTH}:${DEFAULT_HEIGHT}`,
    `rotate='${rotateExpr}':ow=rotw(iw):oh=roth(ih):c=black@0`,
    `scale=${DEFAULT_WIDTH}:${DEFAULT_HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${DEFAULT_WIDTH}:${DEFAULT_HEIGHT}`,
    ...effectFilters,
    `fps=${targetFps}`,
    'settb=AVTB',
    'setsar=1',
    'format=yuv420p'
  ];
  return `[${inputIndex}:v:0]${preTrim}${chain.join(',')}[${outputLabel}]`;
};

export const buildFilterComplex = (clips: PreparedClip[], originalClips: VideoMergeClip[], targetFps: number): string => {
  const steps: string[] = [];
  const inputs: string[] = [];
  clips.forEach((clip, index) => {
    const label = `v${index}`;
    steps.push(
      buildClipFilter(index, label, clip, originalClips[index] ?? { storyboardId: '', transition: { type: 'cut' } }, targetFps)
    );
    inputs.push(`[${label}]`);
  });
  steps.push(`${inputs.join('')}concat=n=${clips.length}:v=1:a=0[vout]`);
  return steps.join(';');
};

const buildAudioFilterComplex = (clips: PreparedClip[], originalClips: VideoMergeClip[]): string => {
  const steps: string[] = [];
  const inputs: string[] = [];
  clips.forEach((clip, index) => {
    const item = originalClips[index] ?? { storyboardId: '' };
    const trimWindow = resolveTrimWindow(item);
    const sourceDuration = clip.durationSec ?? trimWindow.timelineDurationSec;
    const playbackDuration = computePlaybackDurationSec(item, sourceDuration);
    const filters: string[] = [];
    if (typeof trimWindow.trimStartSec === 'number' || typeof trimWindow.trimEndSec === 'number') {
      const parts: string[] = [];
      if (typeof trimWindow.trimStartSec === 'number') {
        parts.push(`start=${trimWindow.trimStartSec}`);
      }
      if (typeof trimWindow.trimEndSec === 'number') {
        parts.push(`end=${trimWindow.trimEndSec}`);
      }
      filters.push(`atrim=${parts.join(':')}`);
    }
    if (typeof sourceDuration === 'number') {
      filters.push(`atrim=duration=${sourceDuration}`);
    }
    filters.push('asetpts=PTS-STARTPTS');
    const speed = normalizeSpeed(item.speed);
    const atempo = buildAtempoChain(speed);
    if (atempo) {
      filters.push(atempo);
    }
    const volumePercent = typeof item.volume === 'number' && Number.isFinite(item.volume) ? clamp(item.volume, 0, 200) : 100;
    const volume = item.muted ? 0 : volumePercent / 100;
    filters.push(`volume=${Number(volume.toFixed(4))}`);
    const fadeInSec = typeof item.fadeInMs === 'number' && Number.isFinite(item.fadeInMs) ? clamp(item.fadeInMs / 1000, 0, 30) : 0;
    const fadeOutSec = typeof item.fadeOutMs === 'number' && Number.isFinite(item.fadeOutMs) ? clamp(item.fadeOutMs / 1000, 0, 30) : 0;
    if (fadeInSec > 0) {
      filters.push(`afade=t=in:st=0:d=${Number(Math.min(fadeInSec, playbackDuration).toFixed(4))}`);
    }
    if (fadeOutSec > 0) {
      const d = Number(Math.min(fadeOutSec, playbackDuration).toFixed(4));
      const st = Number(Math.max(0, playbackDuration - d).toFixed(4));
      filters.push(`afade=t=out:st=${st}:d=${d}`);
    }
    filters.push('aformat=sample_rates=48000:channel_layouts=stereo');
    const label = `a${index}`;
    steps.push(`[${index}:a:0]${filters.join(',')}[${label}]`);
    inputs.push(`[${label}]`);
  });
  steps.push(`${inputs.join('')}concat=n=${clips.length}:v=0:a=1[aout]`);
  return steps.join(';');
};

const mapTransitionName = (transition: VideoTransitionConfig | undefined): string => {
  const type = transition?.type ?? 'cut';
  switch (type) {
    case 'fade':
      return 'fade';
    case 'dissolve':
      return 'fade';
    case 'wipeleft':
      return 'wipeleft';
    case 'wiperight':
      return 'wiperight';
    case 'slideleft':
      return 'slideleft';
    case 'slideright':
      return 'slideright';
    case 'circleopen':
      return 'circleopen';
    case 'circleclose':
      return 'circleclose';
    case 'cut':
    default:
      return 'fade';
  }
};

const normalizeTransitionDuration = (transition: VideoTransitionConfig | undefined): number => {
  const raw = transition?.durationSec;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0.05, Math.min(5, raw));
  }
  return transition?.type === 'cut' ? 0.05 : 0.6;
};

export const buildFilterComplexWithTransitions = (
  clips: PreparedClip[],
  originalClips: VideoMergeClip[],
  targetFps: number
): string => {
  const steps: string[] = [];
  const durations: number[] = [];
  for (let i = 0; i < clips.length; i += 1) {
    const trimWindow = resolveTrimWindow(originalClips[i] ?? { storyboardId: '' });
    const timelineDuration = trimWindow.timelineDurationSec;
    const trimWindowDuration =
      typeof trimWindow.trimStartSec === 'number' && typeof trimWindow.trimEndSec === 'number' && trimWindow.trimEndSec > trimWindow.trimStartSec
        ? trimWindow.trimEndSec - trimWindow.trimStartSec
        : undefined;
    const sourceDuration = clips[i].durationSec ?? timelineDuration ?? trimWindowDuration;
    const duration = computePlaybackDurationSec(originalClips[i] ?? { storyboardId: '' }, sourceDuration);
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
      throw new Error(`Duration is required for transition merge at clip index ${i}`);
    }
    durations.push(duration);
    steps.push(
      buildClipFilter(i, `v${i}`, clips[i], originalClips[i] ?? { storyboardId: '', transition: { type: 'cut' } }, targetFps)
    );
  }

  let lastLabel = 'v0';
  let timeline = durations[0];
  for (let i = 1; i < clips.length; i += 1) {
    const transition = originalClips[i - 1]?.transition;
    const tName = mapTransitionName(transition);
    const tDuration = normalizeTransitionDuration(transition);
    const outLabel = `vx${i}`;
    const offset = Math.max(0, timeline - tDuration);
    steps.push(`[${lastLabel}][v${i}]xfade=transition=${tName}:duration=${tDuration}:offset=${offset}[${outLabel}]`);
    lastLabel = outLabel;
    timeline = timeline + durations[i] - tDuration;
  }
  steps.push(`[${lastLabel}]format=yuv420p[vout]`);
  return steps.join(';');
};

const resolveTimelineClipWindow = (clip: VideoMergeClip, fallbackStartMs: number): { startMs: number; endMs: number; durationSec: number } => {
  const startMs =
    typeof clip.startMs === 'number' && Number.isFinite(clip.startMs) ? Math.max(0, Math.floor(clip.startMs)) : fallbackStartMs;
  const durationSec =
    typeof clip.durationSec === 'number' && Number.isFinite(clip.durationSec) && clip.durationSec > 0
      ? clip.durationSec
      : typeof clip.endMs === 'number' && Number.isFinite(clip.endMs) && clip.endMs > startMs
        ? (clip.endMs - startMs) / 1000
        : 5;
  const endMs =
    typeof clip.endMs === 'number' && Number.isFinite(clip.endMs) && clip.endMs > startMs
      ? Math.floor(clip.endMs)
      : startMs + Math.max(100, Math.floor(durationSec * 1000));
  return {
    startMs,
    endMs,
    durationSec,
  };
};

const buildSyntheticMockAudioClip = async (
  ffmpegBin: string,
  workDir: string,
  index: number,
  durationSec: number | undefined
): Promise<string> => {
  const output = path.join(workDir, `mock-audio-${index + 1}.mp3`);
  const duration = Math.max(0.1, durationSec ?? 3);
  await runFfmpeg(ffmpegBin, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `anullsrc=channel_layout=stereo:sample_rate=48000`,
    '-t',
    String(duration),
    '-c:a',
    'libmp3lame',
    output,
  ]);
  return output;
};

const isMockAudioSource = (value: string | null | undefined): boolean => String(value ?? '').startsWith('/mock/audio/');

const resolveInternalAudioTaskPath = async (sourceUrl: string): Promise<string | null> => {
  const match = sourceUrl.match(/^\/api\/pipeline\/projects\/([^/]+)\/audio-tasks\/([^/]+)\/file$/);
  if (!match) {
    return null;
  }
  const [, projectId, taskId] = match;
  const outputDirs = [
    path.resolve(process.cwd(), 'data/audio-extracts'),
    path.resolve(process.cwd(), '../data/audio-extracts'),
  ];
  for (const outputDir of [...new Set(outputDirs)]) {
    for (const ext of AUDIO_FILE_EXTENSIONS) {
      const candidate = path.join(outputDir, `${projectId}-task-${taskId}.${ext}`);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        continue;
      }
    }
  }
  return null;
};

const prepareAudioSource = async (
  ffmpegBin: string,
  workDir: string,
  clip: VideoMergeClip,
  index: number
): Promise<PreparedClip> => {
  const source = clip.sourceUrl?.trim() ?? '';
  if (!source) {
    throw new Error(`Audio clip source missing at index ${index}`);
  }
  if (isMockAudioSource(source)) {
    const tempFile = await buildSyntheticMockAudioClip(ffmpegBin, workDir, index, clip.durationSec);
    return { input: tempFile, tempFiles: [tempFile], durationSec: clip.durationSec };
  }
  if (isHttpUrl(source)) {
    return { input: source, tempFiles: [], durationSec: clip.durationSec };
  }
  const asFile = parseFileUrl(source);
  const internalAudioPath = await resolveInternalAudioTaskPath(source);
  const localPath = asFile ?? internalAudioPath ?? (path.isAbsolute(source) ? source : null);
  if (!localPath) {
    throw new Error(`Unsupported audio clip source URL: ${source}`);
  }
  await fs.access(localPath);
  return { input: localPath, tempFiles: [], durationSec: clip.durationSec };
};

const normalizeTimelineAudioInput = async (
  ffmpegBin: string,
  workDir: string,
  index: number,
  prepared: PreparedClip
): Promise<PreparedClip> => {
  const output = path.join(workDir, `timeline-audio-${index + 1}.wav`);
  const transcode = async (args: string[]): Promise<void> => {
    await runFfmpeg(ffmpegBin, [
      '-y',
      ...args,
      '-vn',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-c:a',
      'pcm_s16le',
      output,
    ]);
  };

  try {
    await transcode(['-i', prepared.input]);
  } catch (error) {
    if (!path.isAbsolute(prepared.input)) {
      throw error;
    }
    await transcode([
      '-f',
      's16le',
      '-ar',
      '22050',
      '-ac',
      '1',
      '-i',
      prepared.input,
    ]);
  }

  return {
    input: output,
    tempFiles: [...prepared.tempFiles, output],
    durationSec: prepared.durationSec,
  };
};

const collectTrackClips = (tracks: TimelineTrack[] | undefined, type: 'audio' | 'text'): VideoMergeClip[] => {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return [];
  }
  return tracks
    .filter((track) => track.type === type && Array.isArray(track.clips))
    .sort((a, b) => a.order - b.order)
    .flatMap((track) => track.clips)
    .filter((clip) => typeof clip.sourceUrl === 'string' && clip.sourceUrl.trim().length > 0)
    .filter((clip) => type !== 'audio' || !isMockAudioSource(clip.sourceUrl))
    .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
};

export const buildTimelineAudioFilterComplex = (audioClips: VideoMergeClip[]): string => {
  const filterSteps: string[] = [];
  const mixInputs: string[] = [];
  let cursorMs = 0;
  let timelineEndMs = 0;

  for (let i = 0; i < audioClips.length; i += 1) {
    const clip = audioClips[i];
    const window = resolveTimelineClipWindow(clip, cursorMs);
    cursorMs = window.endMs;
    timelineEndMs = Math.max(timelineEndMs, window.endMs);
    const speed = normalizeSpeed(clip.speed);
    const sourceTrimDurationSec = Number((window.durationSec * speed).toFixed(3));
    const filters: string[] = [
      `atrim=0:${sourceTrimDurationSec}`,
      'asetpts=PTS-STARTPTS',
    ];
    const atempoChain = buildAtempoChain(speed);
    if (atempoChain) {
      filters.push(atempoChain);
    }
    const volumePercent =
      typeof clip.volume === 'number' && Number.isFinite(clip.volume) ? clamp(clip.volume, 0, 200) : 100;
    filters.push(`volume=${Number((volumePercent / 100).toFixed(4))}`);
    const fadeInSec = typeof clip.fadeInMs === 'number' && Number.isFinite(clip.fadeInMs) ? clamp(clip.fadeInMs / 1000, 0, 30) : 0;
    const fadeOutSec = typeof clip.fadeOutMs === 'number' && Number.isFinite(clip.fadeOutMs) ? clamp(clip.fadeOutMs / 1000, 0, 30) : 0;
    if (fadeInSec > 0) {
      filters.push(`afade=t=in:st=0:d=${Number(Math.min(fadeInSec, window.durationSec).toFixed(4))}`);
    }
    if (fadeOutSec > 0) {
      const d = Number(Math.min(fadeOutSec, window.durationSec).toFixed(4));
      const st = Number(Math.max(0, window.durationSec - d).toFixed(4));
      filters.push(`afade=t=out:st=${st}:d=${d}`);
    }
    filters.push('aformat=sample_rates=48000:channel_layouts=stereo');
    filters.push(`adelay=${window.startMs}|${window.startMs}`);
    // Normalize each delayed branch so downstream amix/mux see monotonic timestamps.
    filters.push('aresample=async=1:first_pts=0');
    filters.push('asetpts=N/SR/TB');
    const label = `ta${i}`;
    filterSteps.push(`[${i}:a]${filters.join(',')}[${label}]`);
    mixInputs.push(`[${label}]`);
  }

  const timelineEndSec = Number((timelineEndMs / 1000).toFixed(3));
  if (mixInputs.length === 1) {
    filterSteps.push(
      `${mixInputs[0]}aformat=sample_rates=48000:channel_layouts=stereo,` +
        `atrim=0:${timelineEndSec},aresample=async=1:first_pts=0,asetpts=N/SR/TB[aout]`
    );
  } else {
    filterSteps.push(
      `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=0,` +
        `aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${timelineEndSec},` +
        `aresample=async=1:first_pts=0,asetpts=N/SR/TB[aout]`
    );
  }

  return filterSteps.join(';');
};

const applyTimelineAudioTracks = async (input: {
  ffmpegBin: string;
  workDir: string;
  videoInputPath: string;
  audioTracks: TimelineTrack[];
  outputPath: string;
}): Promise<void> => {
  const audioClips = collectTrackClips(input.audioTracks, 'audio').filter((clip) => !clip.muted);
  if (audioClips.length === 0) {
    await fs.copyFile(input.videoInputPath, input.outputPath);
    return;
  }

  const prepared: PreparedClip[] = [];
  try {
    const renderArgs: string[] = ['-y'];

    for (let i = 0; i < audioClips.length; i += 1) {
      const clip = audioClips[i];
      const preparedClip = await normalizeTimelineAudioInput(
        input.ffmpegBin,
        input.workDir,
        i,
        await prepareAudioSource(input.ffmpegBin, input.workDir, clip, i)
      );
      prepared.push(preparedClip);
      renderArgs.push('-i', preparedClip.input);
    }

    const renderedAudioPath = path.join(input.workDir, 'timeline-audio-render.wav');
    renderArgs.push(
      '-filter_complex',
      buildTimelineAudioFilterComplex(audioClips),
      '-map',
      '[aout]',
      '-vn',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-c:a',
      'pcm_s16le',
      renderedAudioPath
    );
    await runFfmpeg(input.ffmpegBin, renderArgs);
    prepared.push({ input: renderedAudioPath, tempFiles: [renderedAudioPath] });

    await runFfmpeg(input.ffmpegBin, [
      '-y',
      '-i',
      input.videoInputPath,
      '-i',
      renderedAudioPath,
      '-filter_complex',
      '[1:a]aresample=async=1:first_pts=0,asetpts=N/SR/TB[aout]',
      '-map',
      '0:v:0',
      '-map',
      '[aout]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-shortest',
      '-movflags',
      '+faststart',
      input.outputPath,
    ]);
  } finally {
    for (const clip of prepared) {
      for (const file of clip.tempFiles) {
        await fs.rm(file, { force: true });
      }
    }
  }
};

const formatSrtTimestamp = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
};

const parseSrtTimestamp = (value: string): number | null => {
  const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) {
    return null;
  }
  const [, hours, minutes, seconds, millis] = match;
  return (
    Number(hours) * 3600000 +
    Number(minutes) * 60000 +
    Number(seconds) * 1000 +
    Number(millis)
  );
};

export const escapeSubtitleFilterValue = (value: string): string =>
  path
    .resolve(value)
    .split(path.sep)
    .join('/')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/;/g, '\\;')
    .replace(/=/g, '\\=')
    .replace(/'/g, "\\'");

export const escapeDrawtextValue = (value: string): string =>
  String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/;/g, '\\;')
    .replace(/=/g, '\\=')
    .replace(/%/g, '\\%')
    .replace(/'/g, "\\'");

export const parseSrtContent = (content: string): SubtitleCue[] =>
  content
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trimEnd());
      if (lines.length === 0) {
        return null;
      }
      const timeLine = /^\d+$/.test(lines[0] ?? '') ? lines[1] : lines[0];
      const textLines = /^\d+$/.test(lines[0] ?? '') ? lines.slice(2) : lines.slice(1);
      if (!timeLine) {
        return null;
      }
      const match = timeLine.match(
        /^(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})$/
      );
      if (!match) {
        return null;
      }
      const startMs = parseSrtTimestamp(match[1]);
      const endMs = parseSrtTimestamp(match[2]);
      const text = textLines.join('\n').trim();
      if (startMs === null || endMs === null || endMs <= startMs || !text) {
        return null;
      }
      return {
        startMs,
        endMs,
        text,
      } satisfies SubtitleCue;
    })
    .filter((item): item is SubtitleCue => Boolean(item));

const normalizeDrawtextPath = (value: string): string => path.resolve(value).split(path.sep).join('/');

export const buildDrawtextSubtitleFilterChain = (cues: SubtitleCue[], fontFile: string | null): string =>
  cues
    .map((cue) => {
      const parts: string[] = [];
      if (fontFile?.trim()) {
        parts.push(`fontfile='${escapeDrawtextValue(normalizeDrawtextPath(fontFile))}'`);
      }
      parts.push(`text='${escapeDrawtextValue(cue.text)}'`);
      parts.push(`enable='between(t,${Number((cue.startMs / 1000).toFixed(3))},${Number((cue.endMs / 1000).toFixed(3))})'`);
      parts.push(`x='(w-text_w)/2'`);
      parts.push(`y='h-text_h-48'`);
      parts.push('fontsize=40');
      parts.push('fontcolor=white');
      parts.push('borderw=3');
      parts.push(`bordercolor='black@0.9'`);
      parts.push(`box=1`);
      parts.push(`boxcolor='black@0.32'`);
      parts.push('boxborderw=18');
      parts.push('line_spacing=8');
      parts.push('fix_bounds=true');
      parts.push(`shadowcolor='black@0.8'`);
      parts.push('shadowx=1');
      parts.push('shadowy=2');
      return `drawtext=${parts.join(':')}`;
    })
    .join(',');

export const buildOverlaySubtitleFilterChain = (cues: SubtitleCue[]): string => {
  if (cues.length === 0) {
    return '[0:v:0]format=yuv420p[vout]';
  }
  const steps: string[] = ['[0:v:0]format=yuv420p[sv0]'];
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const sourceLabel = `sv${index}`;
    const targetLabel = index === cues.length - 1 ? 'vout' : `sv${index + 1}`;
    const start = Number((cue.startMs / 1000).toFixed(3));
    const end = Number((cue.endMs / 1000).toFixed(3));
    steps.push(
      `[${sourceLabel}][${index + 1}:v:0]overlay=x=(W-w)/2:y=H-h-${SUBTITLE_OVERLAY_BOTTOM_MARGIN}:enable='between(t,${start},${end})'[${targetLabel}]`
    );
  }
  return steps.join(';');
};

const resolveDrawtextFontFile = async (): Promise<string | null> => {
  for (const candidate of DRAW_TEXT_FONT_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
};

const renderSubtitleOverlayImages = async (workDir: string, cues: SubtitleCue[]): Promise<string[]> => {
  const outputDir = path.join(workDir, 'subtitle-overlays');
  await fs.mkdir(outputDir, { recursive: true });
  const items = cues.map((cue, index) => ({
    text: cue.text,
    outputPath: path.join(outputDir, `subtitle-${String(index + 1).padStart(3, '0')}.png`),
  }));
  const configPath = path.join(workDir, 'subtitle-overlay-config.json');
  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        width: SUBTITLE_OVERLAY_WIDTH,
        height: SUBTITLE_OVERLAY_HEIGHT,
        fontSize: 40,
        maxTextWidth: SUBTITLE_OVERLAY_WIDTH - 160,
        fontFile: await resolveDrawtextFontFile(),
        items,
      },
      null,
      2
    ),
    'utf8'
  );
  await runCommand('python', [SUBTITLE_OVERLAY_RENDERER, configPath]);
  return items.map((item) => item.outputPath);
};

const writeSubtitleTrackFile = async (workDir: string, textTracks: TimelineTrack[]): Promise<string | null> => {
  const textClips = collectTrackClips(textTracks, 'text');
  if (textClips.length === 0) {
    return null;
  }
  let cursorMs = 0;
  const rows = textClips
    .map((clip, index) => {
      const window = resolveTimelineClipWindow(clip, cursorMs);
      cursorMs = window.endMs;
      const text = String(clip.sourceUrl ?? '').trim();
      if (!text) {
        return null;
      }
      return `${index + 1}\n${formatSrtTimestamp(window.startMs)} --> ${formatSrtTimestamp(window.endMs)}\n${text}\n`;
    })
    .filter((item): item is string => Boolean(item));
  if (rows.length === 0) {
    return null;
  }
  const subtitlePath = path.join(workDir, 'timeline-subtitles.srt');
  await fs.writeFile(subtitlePath, rows.join('\n'), 'utf8');
  return subtitlePath;
};

const applyTimelineSubtitleBurnInWithDrawtext = async (input: {
  ffmpegBin: string;
  videoInputPath: string;
  subtitlePath: string;
  outputPath: string;
  params?: VideoMergeParams;
}): Promise<void> => {
  const cues = parseSrtContent(await fs.readFile(input.subtitlePath, 'utf8'));
  if (cues.length === 0) {
    throw new Error('Subtitle track is empty');
  }
  const fontFile = await resolveDrawtextFontFile();
  await runFfmpeg(input.ffmpegBin, [
    '-y',
    '-i',
    input.videoInputPath,
    '-vf',
    buildDrawtextSubtitleFilterChain(cues, fontFile),
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    input.params?.preset ?? 'veryfast',
    '-crf',
    String(input.params?.crf ?? 23),
    '-c:a',
    'copy',
    '-r',
    String(input.params?.fps ?? 24),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    input.outputPath,
  ]);
};

const muxTimelineSubtitleTrackSoft = async (input: {
  ffmpegBin: string;
  videoInputPath: string;
  subtitlePath: string;
  outputPath: string;
}): Promise<void> => {
  await runFfmpeg(input.ffmpegBin, [
    '-y',
    '-i',
    input.videoInputPath,
    '-sub_charenc',
    'UTF-8',
    '-f',
    'srt',
    '-i',
    input.subtitlePath,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-map',
    '1:0',
    '-c:v',
    'copy',
    '-c:a',
    'copy',
    '-c:s',
    'mov_text',
    '-movflags',
    '+faststart',
    input.outputPath,
  ]);
};

const applyTimelineSubtitleBurnInWithOverlayImages = async (input: {
  ffmpegBin: string;
  workDir: string;
  videoInputPath: string;
  subtitlePath: string;
  outputPath: string;
  params?: VideoMergeParams;
}): Promise<void> => {
  const cues = parseSrtContent(await fs.readFile(input.subtitlePath, 'utf8'));
  if (cues.length === 0) {
    throw new Error('Subtitle track is empty');
  }
  const overlayImages = await renderSubtitleOverlayImages(input.workDir, cues);
  const args: string[] = ['-y', '-i', input.videoInputPath];
  for (const imagePath of overlayImages) {
    args.push('-loop', '1', '-i', imagePath);
  }
  args.push(
    '-filter_complex',
    buildOverlaySubtitleFilterChain(cues),
    '-map',
    '[vout]',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    input.params?.preset ?? 'veryfast',
    '-crf',
    String(input.params?.crf ?? 23),
    '-c:a',
    'copy',
    '-r',
    String(input.params?.fps ?? 24),
    '-pix_fmt',
    'yuv420p',
    '-shortest',
    '-movflags',
    '+faststart',
    input.outputPath
  );
  await runFfmpeg(input.ffmpegBin, args);
};

const applyTimelineSubtitleBurnIn = async (input: {
  ffmpegBin: string;
  videoInputPath: string;
  subtitlePath: string;
  outputPath: string;
  params?: VideoMergeParams;
}): Promise<void> => {
  try {
    await runFfmpeg(input.ffmpegBin, [
      '-y',
      '-i',
      input.videoInputPath,
      '-vf',
      `subtitles=filename=${escapeSubtitleFilterValue(input.subtitlePath)}`,
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-preset',
      input.params?.preset ?? 'veryfast',
      '-crf',
      String(input.params?.crf ?? 23),
      '-c:a',
      'copy',
      '-r',
      String(input.params?.fps ?? 24),
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      input.outputPath
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? '');
    if (!/no such filter:\s*'subtitles'|filter not found/i.test(message)) {
      throw err;
    }
    try {
      await applyTimelineSubtitleBurnInWithDrawtext(input);
      return;
    } catch (drawErr) {
      const drawMessage = drawErr instanceof Error ? drawErr.message : String(drawErr ?? '');
      if (!/no such filter:\s*'drawtext'|filter not found/i.test(drawMessage)) {
        await applyTimelineSubtitleBurnInWithOverlayImages({ ...input, workDir: path.dirname(input.subtitlePath) });
        return;
      }
    }
    try {
      await applyTimelineSubtitleBurnInWithOverlayImages({ ...input, workDir: path.dirname(input.subtitlePath) });
      return;
    } catch {
      await muxTimelineSubtitleTrackSoft(input);
    }
  }
};

export const mergeVideoClipsWithFfmpeg = async (input: {
  ffmpegBin: string;
  outputDir: string;
  projectId: string;
  mergeId: string;
  clips: VideoMergeClip[];
  params?: VideoMergeParams;
}): Promise<{ outputPath: string }> => {
  if (input.clips.length === 0) {
    throw new Error('No clips to merge');
  }
  const effectiveClips = expandTimelineGapClips(input.clips);
  if (effectiveClips.length === 0) {
    throw new Error('No clips to merge');
  }

  await fs.mkdir(input.outputDir, { recursive: true });
  const workDir = path.join(input.outputDir, `${input.projectId}-${input.mergeId}-tmp`);
  await fs.mkdir(workDir, { recursive: true });

  const prepared: PreparedClip[] = [];
  try {
    const enableAudio = input.params?.keepAudio !== false;
    const advancedAudio = enableAudio && effectiveClips.some((clip) => needsAdvancedAudioProcessing(clip));
    for (let i = 0; i < effectiveClips.length; i += 1) {
      const clip = await prepareClipSource(input.ffmpegBin, workDir, effectiveClips[i], i);
      if (advancedAudio) {
        prepared.push(await ensureAudioCompatibleInput(input.ffmpegBin, workDir, i, clip));
      } else {
        prepared.push(clip);
      }
    }

    const outputPath = path.join(input.outputDir, `${input.projectId}-${input.mergeId}.mp4`);
    const baseOutputPath = path.join(workDir, 'merge-base.mp4');
    const args: string[] = ['-y'];
    prepared.forEach((clip) => {
      args.push('-i', clip.input);
    });
    const hasNonCutTransition = effectiveClips.some((clip) => (clip.transition?.type ?? 'cut') !== 'cut');
    const targetFps = input.params?.fps ?? 24;
    const videoFilter = hasNonCutTransition
      ? buildFilterComplexWithTransitions(prepared, effectiveClips, targetFps)
      : buildFilterComplex(prepared, effectiveClips, targetFps);
    const audioFilter = advancedAudio ? buildAudioFilterComplex(prepared, effectiveClips) : '';
    const filter = audioFilter ? `${videoFilter};${audioFilter}` : videoFilter;
    args.push(
      '-filter_complex',
      filter,
      '-map',
      '[vout]',
      ...(enableAudio ? (advancedAudio ? ['-map', '[aout]'] : ['-map', '0:a?']) : []),
      '-c:v',
      'libx264',
      '-preset',
      input.params?.preset ?? 'veryfast',
      '-crf',
      String(input.params?.crf ?? 23),
      ...(enableAudio ? ['-c:a', 'aac'] : []),
      '-r',
      String(targetFps),
      '-pix_fmt',
      'yuv420p',
      ...(enableAudio ? ['-shortest'] : []),
      '-movflags',
      '+faststart',
      baseOutputPath
    );

    await runFfmpeg(input.ffmpegBin, args);
    let currentPath = baseOutputPath;

    const audioTracks = input.params?.audioTracks ?? [];
    if (audioTracks.length > 0) {
      const audioOutputPath = path.join(workDir, 'merge-audio.mp4');
      await applyTimelineAudioTracks({
        ffmpegBin: input.ffmpegBin,
        workDir,
        videoInputPath: currentPath,
        audioTracks,
        outputPath: audioOutputPath,
      });
      currentPath = audioOutputPath;
    }

    const subtitlePath =
      input.params?.subtitleBurnIn === false ? null : await writeSubtitleTrackFile(workDir, input.params?.textTracks ?? []);
    if (subtitlePath) {
      const subtitleOutputPath = path.join(workDir, 'merge-subtitle.mp4');
      await applyTimelineSubtitleBurnIn({
        ffmpegBin: input.ffmpegBin,
        videoInputPath: currentPath,
        subtitlePath,
        outputPath: subtitleOutputPath,
        params: input.params,
      });
      currentPath = subtitleOutputPath;
    }

    if (currentPath !== outputPath) {
      await fs.copyFile(currentPath, outputPath);
    }
    return { outputPath };
  } finally {
    for (const clip of prepared) {
      for (const file of clip.tempFiles) {
        await fs.rm(file, { force: true });
      }
    }
    await fs.rm(workDir, { recursive: true, force: true });
  }
};
