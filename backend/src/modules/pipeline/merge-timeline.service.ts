import { v4 as uuid } from 'uuid';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type {
  Asset,
  Storyboard,
  TimelinePlan,
  TimelineTrack,
  VideoMerge,
  VideoMergeClip,
  VideoMergeParams,
  VideoTask,
} from '../../core/types.js';
import { type SqliteStore } from '../../db/sqlite.js';
import { mergeVideoClipsWithFfmpeg } from './video-merge-ffmpeg.js';

type MergeTimelineServiceOptions = {
  ffmpegBin: string;
  videoMergeEngine: 'ffmpeg' | 'placeholder';
  videoMergeOutputDir: string;
  uploadOutputDir: string;
};

type MergeTimelineServiceDeps = {
  maybeThrowInjectedFailure: (taskType: 'video_merge', input: { projectId: string; taskId: string; stage: string }) => void;
};

export class MergeTimelineService {
  constructor(
    private readonly store: SqliteStore,
    private readonly options: MergeTimelineServiceOptions,
    private readonly deps: MergeTimelineServiceDeps
  ) {}

  listVideoMerges(projectId: string): VideoMerge[] | null {
    return this.store.listVideoMerges(projectId);
  }

  getVideoMerge(projectId: string, mergeId: string): VideoMerge | null {
    return this.store.getVideoMerge(projectId, mergeId);
  }

  resolveVideoMergeDownload(projectId: string, mergeId: string): { path: string } | { reason: 'not_found' | 'not_ready' | 'forbidden' } {
    const item = this.store.getVideoMerge(projectId, mergeId);
    if (!item) {
      return { reason: 'not_found' };
    }
    if (item.status !== 'done' || !item.outputPath) {
      return { reason: 'not_ready' };
    }
    const resolved = path.resolve(item.outputPath);
    if (!this.isPathWithinBase(resolved, this.options.videoMergeOutputDir)) {
      return { reason: 'forbidden' };
    }
    if (!fs.existsSync(resolved)) {
      return { reason: 'not_found' };
    }
    return { path: resolved };
  }

  getTimelinePlan(projectId: string, episodeId: string | null): TimelinePlan | null {
    const existing = this.store.getTimelinePlan(projectId, episodeId);
    if (existing) {
      if ((!existing.tracks || existing.tracks.length === 0) && existing.clips.length > 0) {
        return {
          ...existing,
          tracks: this.buildDefaultTimelineTracks(existing.clips),
        };
      }
      return existing;
    }
    const clips = this.buildDefaultTimelineClips(projectId, episodeId);
    if (!clips) {
      return null;
    }
    return {
      id: `timeline-${projectId}-${episodeId ?? 'default'}`,
      projectId,
      episodeId,
      title: episodeId ? '分集时间线' : '项目主时间线',
      tracks: this.buildDefaultTimelineTracks(clips),
      clips,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  saveTimelinePlan(
    projectId: string,
    input: { id?: string; episodeId?: string | null; title?: string; tracks?: TimelineTrack[]; clips: VideoMergeClip[] }
  ): TimelinePlan | null {
    const episodeId = input.episodeId ?? null;
    const normalizedTracks = this.normalizeTimelineTracks(projectId, input.tracks ?? [], episodeId, input.clips ?? []);
    const normalizedClips = this.flattenVideoTrackClips(normalizedTracks);
    return this.store.upsertTimelinePlan({
      id: input.id?.trim() || uuid(),
      projectId,
      episodeId,
      title: input.title?.trim() || (episodeId ? '分集时间线' : '项目主时间线'),
      tracks: normalizedTracks,
      clips: normalizedClips,
    });
  }

  async createVideoMergeFromTimeline(projectId: string, episodeId: string | null, title?: string): Promise<VideoMerge | null> {
    const plan = this.getTimelinePlan(projectId, episodeId);
    if (!plan) {
      return null;
    }
    const sourceClips = this.flattenVideoTrackClips(plan.tracks?.length ? plan.tracks : this.buildDefaultTimelineTracks(plan.clips));
    const audioTracks = this.filterUsableAudioTracks((plan.tracks ?? []).filter((item) => item.type === 'audio' && item.clips.length > 0));
    const textTracks = (plan.tracks ?? []).filter((item) => item.type === 'text' && item.clips.length > 0);
    return this.createAndRunVideoMerge(projectId, {
      title: title?.trim() || plan.title,
      clips: sourceClips.map((item) => ({
        storyboardId: item.storyboardId,
        videoTaskId: item.videoTaskId,
        sourceUrl: item.sourceUrl,
        durationSec: item.durationSec,
        startMs: item.startMs,
        endMs: item.endMs,
        trimStartMs: item.trimStartMs,
        trimEndMs: item.trimEndMs,
        speed: item.speed,
        volume: item.volume,
        muted: item.muted,
        fadeInMs: item.fadeInMs,
        fadeOutMs: item.fadeOutMs,
        transition: item.transition,
        keyframe: item.keyframe,
      })),
      params: {
        keepAudio: audioTracks.length === 0,
        subtitleBurnIn: textTracks.length > 0,
        audioTracks,
        textTracks,
      },
    });
  }

  async saveUploadedImage(
    projectId: string,
    input: {
      originalName: string;
      buffer: Buffer;
      purpose: 'storyboard' | 'asset';
      storyboardId: string;
      assetId?: string;
      assetType?: 'character' | 'scene' | 'prop';
      assetName?: string;
      prompt?: string;
    }
  ): Promise<{ fileUrl: string; storyboard?: Storyboard; asset?: Asset }> {
    const storyboard = this.store.getStoryboard(projectId, input.storyboardId);
    if (!storyboard) {
      throw new Error('Storyboard not found');
    }
    const ext = this.pickImageExtension(input.originalName);
    const fileName = `${Date.now()}-${uuid()}${ext}`;
    const projectDir = path.join(this.options.uploadOutputDir, projectId);
    await fsPromises.mkdir(projectDir, { recursive: true });
    const finalPath = path.join(projectDir, fileName);
    await fsPromises.writeFile(finalPath, input.buffer);
    const fileUrl = `/api/pipeline/projects/${encodeURIComponent(projectId)}/uploads/files/${encodeURIComponent(fileName)}`;

    if (input.purpose === 'storyboard') {
      const updated = this.store.updateStoryboard(projectId, input.storyboardId, { imageUrl: fileUrl });
      if (!updated) {
        throw new Error('Failed to update storyboard image');
      }
      return { fileUrl, storyboard: updated };
    }

    if (input.assetId?.trim()) {
      const updatedAsset = this.store.updateAsset(projectId, input.assetId.trim(), { imageUrl: fileUrl });
      if (!updatedAsset) {
        throw new Error('Asset not found');
      }
      return { fileUrl, asset: updatedAsset };
    }

    const created = this.store.createAsset({
      id: uuid(),
      projectId,
      storyboardId: input.storyboardId,
      name: input.assetName?.trim() || `${storyboard.title}-上传素材`,
      type: input.assetType ?? 'scene',
      prompt: input.prompt?.trim() || storyboard.prompt,
      imageUrl: fileUrl,
    });
    if (!created) {
      throw new Error('Failed to create asset');
    }
    return { fileUrl, asset: created };
  }

  async saveUploadedImageForAssetObject(
    projectId: string,
    input: {
      objectType: 'character' | 'scene' | 'prop';
      assetId: string;
      originalName: string;
      buffer: Buffer;
    }
  ): Promise<{ fileUrl: string; asset: Asset }> {
    const asset = this.store.getAsset(projectId, input.assetId);
    if (!asset) {
      throw new Error('Asset not found');
    }
    if (asset.type !== input.objectType) {
      throw new Error(`Asset type mismatch: expected ${input.objectType}, got ${asset.type}`);
    }
    const uploaded = await this.saveUploadedImage(projectId, {
      originalName: input.originalName,
      buffer: input.buffer,
      purpose: 'asset',
      storyboardId: asset.storyboardId,
      assetId: asset.id,
      assetType: asset.type,
      assetName: asset.name,
      prompt: asset.prompt,
    });
    if (!uploaded.asset) {
      throw new Error('Failed to update asset image');
    }
    return {
      fileUrl: uploaded.fileUrl,
      asset: uploaded.asset,
    };
  }

  resolveUploadedImage(projectId: string, fileName: string): { path: string } | { reason: 'forbidden' | 'not_found' } {
    const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '');
    if (!safeName || safeName !== fileName) {
      return { reason: 'forbidden' };
    }
    const target = path.resolve(path.join(this.options.uploadOutputDir, projectId, safeName));
    const root = path.resolve(path.join(this.options.uploadOutputDir, projectId));
    if (!target.startsWith(`${root}${path.sep}`)) {
      return { reason: 'forbidden' };
    }
    if (!fs.existsSync(target)) {
      return { reason: 'not_found' };
    }
    return { path: target };
  }

  async createAndRunVideoMerge(
    projectId: string,
    input: {
      title?: string;
      clips: Array<{
        storyboardId: string;
        videoTaskId?: string;
        sourceUrl?: string;
        durationSec?: number;
        startMs?: number;
        endMs?: number;
        trimStartMs?: number;
        trimEndMs?: number;
        speed?: number;
        volume?: number;
        muted?: boolean;
        fadeInMs?: number;
        fadeOutMs?: number;
        transition?: VideoMergeClip['transition'];
        keyframe?: VideoMergeClip['keyframe'];
      }>;
      params?: VideoMergeParams;
    }
  ): Promise<VideoMerge | null> {
    const storyboards = this.store.listStoryboards(projectId);
    if (!storyboards) {
      return null;
    }

    const storyboardIds = new Set(storyboards.map((item) => item.id));
    const normalizedClips = input.clips.map((clip) => {
      if (!storyboardIds.has(clip.storyboardId)) {
        throw new Error(`Storyboard not found: ${clip.storyboardId}`);
      }
      let sourceUrl = clip.sourceUrl?.trim() || '';
      if (!sourceUrl && clip.videoTaskId?.trim()) {
        const task = this.store.getVideoTask(projectId, clip.videoTaskId.trim());
        if (!task || task.status !== 'done' || !task.resultUrl) {
          throw new Error(`Video task is not ready: ${clip.videoTaskId}`);
        }
        sourceUrl = task.resultUrl;
      }
      if (!sourceUrl) {
        const latest = (this.store.listVideoTasks(projectId) ?? []).find((task) => task.storyboardId === clip.storyboardId && task.status === 'done');
        if (!latest?.resultUrl) {
          throw new Error(`No ready video source for storyboard: ${clip.storyboardId}`);
        }
        sourceUrl = latest.resultUrl;
      }
      const startMs = typeof clip.startMs === 'number' && Number.isFinite(clip.startMs) ? Math.max(0, Math.floor(clip.startMs)) : undefined;
      const endMs = typeof clip.endMs === 'number' && Number.isFinite(clip.endMs) ? Math.max(0, Math.floor(clip.endMs)) : undefined;
      const durationFromTimeline = typeof startMs === 'number' && typeof endMs === 'number' && endMs > startMs ? (endMs - startMs) / 1000 : undefined;
      return {
        storyboardId: clip.storyboardId,
        videoTaskId: clip.videoTaskId?.trim() || undefined,
        sourceUrl,
        durationSec:
          typeof (durationFromTimeline ?? clip.durationSec) === 'number' && Number.isFinite(durationFromTimeline ?? clip.durationSec)
            ? Math.max(0.1, Math.min(600, Number(durationFromTimeline ?? clip.durationSec)))
            : undefined,
        startMs,
        endMs,
        trimStartMs:
          typeof clip.trimStartMs === 'number' && Number.isFinite(clip.trimStartMs) ? Math.max(0, Math.floor(clip.trimStartMs)) : undefined,
        trimEndMs:
          typeof clip.trimEndMs === 'number' && Number.isFinite(clip.trimEndMs) ? Math.max(0, Math.floor(clip.trimEndMs)) : undefined,
        speed: typeof clip.speed === 'number' && Number.isFinite(clip.speed) ? Math.max(0.1, Math.min(8, clip.speed)) : undefined,
        volume: typeof clip.volume === 'number' && Number.isFinite(clip.volume) ? Math.max(0, Math.min(200, clip.volume)) : undefined,
        muted: typeof clip.muted === 'boolean' ? clip.muted : undefined,
        fadeInMs:
          typeof clip.fadeInMs === 'number' && Number.isFinite(clip.fadeInMs) ? Math.max(0, Math.min(30 * 1000, Math.floor(clip.fadeInMs))) : undefined,
        fadeOutMs:
          typeof clip.fadeOutMs === 'number' && Number.isFinite(clip.fadeOutMs) ? Math.max(0, Math.min(30 * 1000, Math.floor(clip.fadeOutMs))) : undefined,
        transition: clip.transition ?? { type: 'cut' },
        keyframe: clip.keyframe,
      };
    });

    const created = this.store.createVideoMerge({
      id: uuid(),
      projectId,
      title: input.title?.trim() || `合成任务-${new Date().toLocaleString()}`,
      status: 'queued',
      clips: normalizedClips,
      params: this.normalizeVideoMergeParams(projectId, input.params),
    });
    if (!created) {
      return null;
    }

    void this.runVideoMerge(created);
    return created;
  }

  async retryVideoMerge(projectId: string, mergeId: string): Promise<VideoMerge | null> {
    const existing = this.store.getVideoMerge(projectId, mergeId);
    if (!existing) {
      return null;
    }
    if (existing.status !== 'failed') {
      return existing;
    }
    const reset = this.store.updateVideoMerge(projectId, mergeId, {
      status: 'queued',
      resultUrl: null,
      outputPath: null,
      errorCode: null,
      error: null,
      completedAt: null,
    });
    if (!reset) {
      return null;
    }
    void this.runVideoMerge(reset);
    return reset;
  }

  private async runVideoMerge(merge: VideoMerge): Promise<void> {
    const toProcessing = this.store.updateVideoMerge(merge.projectId, merge.id, {
      status: 'processing',
      errorCode: null,
      error: null,
      resultUrl: null,
      outputPath: null,
    });
    if (!toProcessing) {
      return;
    }
    try {
      this.deps.maybeThrowInjectedFailure('video_merge', {
        projectId: merge.projectId,
        taskId: merge.id,
        stage: this.options.videoMergeEngine,
      });
      if (this.options.videoMergeEngine === 'placeholder') {
        await this.sleep(150);
        const resultUrl = `/mock/merged/${merge.projectId}-${merge.id}.mp4`;
        this.store.updateVideoMerge(merge.projectId, merge.id, {
          status: 'done',
          resultUrl,
          outputPath: null,
          errorCode: null,
          error: null,
          completedAt: new Date().toISOString(),
        });
        return;
      }

      const merged = await mergeVideoClipsWithFfmpeg({
        ffmpegBin: this.options.ffmpegBin,
        outputDir: this.options.videoMergeOutputDir,
        projectId: merge.projectId,
        mergeId: merge.id,
        clips: merge.clips,
        params: merge.params,
      });
      const resultUrl = `/api/pipeline/projects/${encodeURIComponent(merge.projectId)}/video-merges/${encodeURIComponent(merge.id)}/file`;
      this.store.updateVideoMerge(merge.projectId, merge.id, {
        status: 'done',
        resultUrl,
        outputPath: merged.outputPath,
        errorCode: null,
        error: null,
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      const code = this.resolveVideoMergeErrorCode(err);
      this.store.updateVideoMerge(merge.projectId, merge.id, {
        status: 'failed',
        resultUrl: null,
        outputPath: null,
        errorCode: code,
        error: err instanceof Error ? err.message : 'Video merge failed',
        completedAt: new Date().toISOString(),
      });
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private pickImageExtension(name: string): string {
    const ext = path.extname(name || '').toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp') {
      return ext;
    }
    return '.png';
  }

  private buildDefaultTimelineClips(projectId: string, episodeId: string | null): VideoMergeClip[] | null {
    const storyboards = episodeId
      ? this.store.listStoryboardsByEpisode(projectId, episodeId)
      : this.store.listStoryboards(projectId);
    if (!storyboards) {
      return null;
    }
    const doneTaskByStoryboard = new Map<string, VideoTask>();
    for (const task of this.store.listVideoTasks(projectId) ?? []) {
      if (task.status !== 'done' || !task.resultUrl) {
        continue;
      }
      if (episodeId) {
        const sb = storyboards.find((item) => item.id === task.storyboardId);
        if (!sb) {
          continue;
        }
      }
      const existed = doneTaskByStoryboard.get(task.storyboardId);
      if (!existed || existed.updatedAt < task.updatedAt) {
        doneTaskByStoryboard.set(task.storyboardId, task);
      }
    }
    const output: VideoMergeClip[] = [];
    for (let index = 0; index < storyboards.length; index += 1) {
      const sb = storyboards[index];
      const task = doneTaskByStoryboard.get(sb.id);
      if (!task?.resultUrl) {
        continue;
      }
      output.push({
        storyboardId: sb.id,
        videoTaskId: task.id,
        sourceUrl: task.resultUrl,
        durationSec: typeof task.params.duration === 'number' ? task.params.duration : 5,
        transition: index === 0 ? { type: 'cut' } : { type: 'fade', durationSec: 0.6, easing: 'easeInOut', direction: 'left' },
        keyframe: { startScale: 1, endScale: 1, startX: 0, startY: 0, endX: 0, endY: 0, rotationDeg: 0 },
      });
    }
    return output;
  }

  private normalizeTimelineClips(projectId: string, clips: VideoMergeClip[], episodeId: string | null): VideoMergeClip[] {
    const storyboards = episodeId
      ? this.store.listStoryboardsByEpisode(projectId, episodeId)
      : this.store.listStoryboards(projectId);
    if (!storyboards) {
      throw new Error('Project or episode not found');
    }
    const storyboardIds = new Set(storyboards.map((item) => item.id));
    const next: VideoMergeClip[] = [];
    for (const clip of clips) {
      if (!storyboardIds.has(clip.storyboardId)) {
        throw new Error(`Storyboard not found in timeline scope: ${clip.storyboardId}`);
      }
      const startMs = typeof clip.startMs === 'number' && Number.isFinite(clip.startMs) ? Math.max(0, Math.floor(clip.startMs)) : undefined;
      const endMs = typeof clip.endMs === 'number' && Number.isFinite(clip.endMs) ? Math.max(0, Math.floor(clip.endMs)) : undefined;
      const durationFromTimeline = typeof startMs === 'number' && typeof endMs === 'number' && endMs > startMs ? (endMs - startMs) / 1000 : undefined;
      const durationSecRaw = durationFromTimeline ?? clip.durationSec;
      const durationSec =
        typeof durationSecRaw === 'number' && Number.isFinite(durationSecRaw) ? Math.max(0.1, Math.min(600, durationSecRaw)) : undefined;
      const trimStartMs =
        typeof clip.trimStartMs === 'number' && Number.isFinite(clip.trimStartMs) ? Math.max(0, Math.floor(clip.trimStartMs)) : undefined;
      const trimEndMs =
        typeof clip.trimEndMs === 'number' && Number.isFinite(clip.trimEndMs) ? Math.max(0, Math.floor(clip.trimEndMs)) : undefined;
      const speed = typeof clip.speed === 'number' && Number.isFinite(clip.speed) ? Math.max(0.1, Math.min(8, clip.speed)) : undefined;
      const volume = typeof clip.volume === 'number' && Number.isFinite(clip.volume) ? Math.max(0, Math.min(200, clip.volume)) : undefined;
      const muted = typeof clip.muted === 'boolean' ? clip.muted : undefined;
      const fadeInMs =
        typeof clip.fadeInMs === 'number' && Number.isFinite(clip.fadeInMs) ? Math.max(0, Math.min(30 * 1000, Math.floor(clip.fadeInMs))) : undefined;
      const fadeOutMs =
        typeof clip.fadeOutMs === 'number' && Number.isFinite(clip.fadeOutMs) ? Math.max(0, Math.min(30 * 1000, Math.floor(clip.fadeOutMs))) : undefined;
      const transition = clip.transition?.type
        ? {
            type: clip.transition.type,
            durationSec:
              typeof clip.transition.durationSec === 'number' && Number.isFinite(clip.transition.durationSec)
                ? Math.max(0, Math.min(5, clip.transition.durationSec))
                : undefined,
            easing: clip.transition.easing ?? 'linear',
            direction: clip.transition.direction ?? 'left',
          }
        : { type: 'cut' as const };
      const keyframe = clip.keyframe
        ? {
            startScale:
              typeof clip.keyframe.startScale === 'number' && Number.isFinite(clip.keyframe.startScale)
                ? Math.max(0.1, Math.min(5, clip.keyframe.startScale))
                : undefined,
            endScale:
              typeof clip.keyframe.endScale === 'number' && Number.isFinite(clip.keyframe.endScale)
                ? Math.max(0.1, Math.min(5, clip.keyframe.endScale))
                : undefined,
            startX:
              typeof clip.keyframe.startX === 'number' && Number.isFinite(clip.keyframe.startX)
                ? Math.max(-100, Math.min(100, clip.keyframe.startX))
                : undefined,
            startY:
              typeof clip.keyframe.startY === 'number' && Number.isFinite(clip.keyframe.startY)
                ? Math.max(-100, Math.min(100, clip.keyframe.startY))
                : undefined,
            endX:
              typeof clip.keyframe.endX === 'number' && Number.isFinite(clip.keyframe.endX)
                ? Math.max(-100, Math.min(100, clip.keyframe.endX))
                : undefined,
            endY:
              typeof clip.keyframe.endY === 'number' && Number.isFinite(clip.keyframe.endY)
                ? Math.max(-100, Math.min(100, clip.keyframe.endY))
                : undefined,
            rotationDeg:
              typeof clip.keyframe.rotationDeg === 'number' && Number.isFinite(clip.keyframe.rotationDeg)
                ? Math.max(-180, Math.min(180, clip.keyframe.rotationDeg))
                : undefined,
          }
        : undefined;
      next.push({
        storyboardId: clip.storyboardId,
        videoTaskId: clip.videoTaskId?.trim() || undefined,
        sourceUrl: clip.sourceUrl?.trim() || undefined,
        durationSec,
        startMs,
        endMs,
        trimStartMs,
        trimEndMs,
        speed,
        volume,
        muted,
        fadeInMs,
        fadeOutMs,
        transition,
        keyframe,
      });
    }
    if (next.length === 0) {
      throw new Error('Timeline clips cannot be empty');
    }
    return next;
  }

  private buildDefaultTimelineTracks(clips: VideoMergeClip[]): TimelineTrack[] {
    return [
      {
        id: 'video-main',
        name: 'Video Main',
        type: 'video',
        order: 0,
        isLocked: false,
        isMuted: false,
        volume: 100,
        clips,
      },
    ];
  }

  private flattenVideoTrackClips(tracks: TimelineTrack[]): VideoMergeClip[] {
    const firstVideo = [...tracks].sort((a, b) => a.order - b.order).find((item) => item.type === 'video');
    if (!firstVideo) {
      return [];
    }
    return Array.isArray(firstVideo.clips) ? firstVideo.clips : [];
  }

  private normalizeTimelineTracks(
    projectId: string,
    tracks: TimelineTrack[],
    episodeId: string | null,
    fallbackClips: VideoMergeClip[]
  ): TimelineTrack[] {
    const scopeStoryboards = episodeId ? this.store.listStoryboardsByEpisode(projectId, episodeId) : this.store.listStoryboards(projectId);
    if (!scopeStoryboards) {
      throw new Error('Project or episode not found');
    }
    const storyboardIds = new Set(scopeStoryboards.map((item) => item.id));
    const sourceTracks =
      tracks.length > 0
        ? tracks
        : [
            {
              id: 'video-main',
              name: 'Video Main',
              type: 'video' as const,
              order: 0,
              isLocked: false,
              isMuted: false,
              volume: 100,
              clips: fallbackClips,
            },
          ];
    const next = sourceTracks.map((track, index) => {
      const normalizedType = track.type === 'audio' || track.type === 'text' ? track.type : 'video';
      const rawClips = Array.isArray(track.clips) ? track.clips.filter((clip) => storyboardIds.has(clip.storyboardId)) : [];
      const normalizedClips = rawClips.length > 0 ? this.normalizeTimelineClips(projectId, rawClips, episodeId) : [];
      return {
        id: track.id?.trim() || `track-${index + 1}`,
        name: track.name?.trim() || `Track ${index + 1}`,
        type: normalizedType,
        order: Number.isFinite(track.order) ? Math.max(0, Math.floor(track.order)) : index,
        isLocked: Boolean(track.isLocked),
        isMuted: Boolean(track.isMuted),
        volume:
          typeof track.volume === 'number' && Number.isFinite(track.volume) ? Math.max(0, Math.min(200, Math.floor(track.volume))) : 100,
        clips: normalizedClips,
      } satisfies TimelineTrack;
    });
    if (!next.some((item) => item.type === 'video' && item.clips.length > 0)) {
      throw new Error('Timeline requires at least one non-empty video track');
    }
    return next.sort((a, b) => a.order - b.order);
  }

  private isPathWithinBase(targetPath: string, basePath: string): boolean {
    const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  private resolveVideoMergeErrorCode(err: unknown): string {
    const message = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
    if (message.includes('injected_failure')) {
      return 'MERGE_INJECTED_FAILURE';
    }
    if (message.includes('ffmpeg timeout') || message.includes('timeout')) {
      return 'MERGE_FFMPEG_TIMEOUT';
    }
    if (message.includes("no such filter: 'subtitles'") || message.includes('filter not found')) {
      return 'MERGE_FFMPEG_EXEC_FAILED';
    }
    if (message.includes('clip source missing') || message.includes('unsupported clip source')) {
      return 'MERGE_SOURCE_INVALID';
    }
    if (message.includes('not found') || message.includes('no such file') || message.includes('enoent')) {
      return 'MERGE_SOURCE_NOT_FOUND';
    }
    if (message.includes('permission denied') || message.includes('operation not permitted') || message.includes('forbidden')) {
      return 'MERGE_PERMISSION_DENIED';
    }
    if (message.includes('ffmpeg')) {
      return 'MERGE_FFMPEG_EXEC_FAILED';
    }
    return 'MERGE_UNKNOWN';
  }

  private normalizeVideoMergeParams(projectId: string, raw?: VideoMergeParams): VideoMergeParams {
    const next: VideoMergeParams = {};
    if (typeof raw?.keepAudio === 'boolean') {
      next.keepAudio = raw.keepAudio;
    }
    if (typeof raw?.fps === 'number' && Number.isFinite(raw.fps)) {
      next.fps = Math.max(12, Math.min(60, Math.floor(raw.fps)));
    }
    if (typeof raw?.crf === 'number' && Number.isFinite(raw.crf)) {
      next.crf = Math.max(16, Math.min(40, Math.floor(raw.crf)));
    }
    const allowedPresets = new Set(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow']);
    if (raw?.preset && allowedPresets.has(raw.preset)) {
      next.preset = raw.preset;
    }
    if (typeof raw?.subtitleBurnIn === 'boolean') {
      next.subtitleBurnIn = raw.subtitleBurnIn;
    }
    if (Array.isArray(raw?.audioTracks)) {
      next.audioTracks = this.normalizeAuxiliaryTracks(projectId, raw.audioTracks, 'audio');
    }
    if (Array.isArray(raw?.textTracks)) {
      next.textTracks = this.normalizeAuxiliaryTracks(projectId, raw.textTracks, 'text');
    }
    return next;
  }

  private normalizeAuxiliaryTracks(
    projectId: string,
    tracks: TimelineTrack[],
    targetType: 'audio' | 'text'
  ): TimelineTrack[] {
    return tracks
      .filter((track) => track.type === targetType)
      .map((track, index) => {
        const rawClips = Array.isArray(track.clips) ? track.clips : [];
        const normalizedClips = rawClips.length > 0 ? this.normalizeTimelineClips(projectId, rawClips, null) : [];
        const usableClips =
          targetType === 'audio' ? normalizedClips.filter((clip) => !this.isMockAudioSource(clip.sourceUrl)) : normalizedClips;
        return {
          id: track.id?.trim() || `${targetType}-track-${index + 1}`,
          name: track.name?.trim() || `${targetType === 'audio' ? 'Audio' : 'Text'} Track ${index + 1}`,
          type: targetType,
          order: Number.isFinite(track.order) ? Math.max(0, Math.floor(track.order)) : index + 1,
          isLocked: Boolean(track.isLocked),
          isMuted: Boolean(track.isMuted),
          volume:
            typeof track.volume === 'number' && Number.isFinite(track.volume) ? Math.max(0, Math.min(200, Math.floor(track.volume))) : 100,
          clips: usableClips,
        } satisfies TimelineTrack;
      })
      .filter((track) => track.clips.length > 0);
  }

  private filterUsableAudioTracks(tracks: TimelineTrack[]): TimelineTrack[] {
    return tracks
      .map((track) => ({
        ...track,
        clips: track.clips.filter((clip) => !this.isMockAudioSource(clip.sourceUrl)),
      }))
      .filter((track) => track.clips.length > 0);
  }

  private isMockAudioSource(sourceUrl: string | null | undefined): boolean {
    return String(sourceUrl ?? '').startsWith('/mock/audio/');
  }
}
