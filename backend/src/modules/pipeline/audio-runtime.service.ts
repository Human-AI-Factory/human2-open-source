import { v4 as uuid } from 'uuid';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { AudioTask, AudioTaskParams, ModelConfig } from '../../core/types.js';
import { type SqliteStore } from '../../db/sqlite.js';
import type { AiProvider, ProviderModelConfig } from './providers/types.js';
import { ProviderValidationError } from './providers/errors.js';

export type AudioExtractItem = {
  id: string;
  projectId: string;
  sourceUrl: string;
  format: 'mp3' | 'wav' | 'aac' | 'flac' | 'ogg';
  sampleRate: number | null;
  channels: number | null;
  bitrateKbps: number | null;
  resultUrl: string;
  outputPath: string;
  createdAt: string;
};

type ResolveModelName = (
  type: 'text' | 'image' | 'video' | 'audio',
  modelId?: string,
  customModel?: string
) => string | undefined;

type PickModelConfig = (type: 'text' | 'image' | 'video' | 'audio', modelName?: string) => ModelConfig | null;

type AudioRuntimeServiceDeps = {
  resolveModelName: ResolveModelName;
  pickModelConfig: PickModelConfig;
  normalizeAudioTaskParams: (raw: AudioTaskParams) => AudioTaskParams;
  validateAudioTaskParams: (modelConfig: ModelConfig | null, params: AudioTaskParams) => void;
  toProviderModelConfig: (modelConfig: ModelConfig) => ProviderModelConfig;
  compileAudioPrompt: (projectId: string, storyboardId: string, fallbackPrompt: string) => string;
  maybeThrowInjectedFailure: (taskType: 'audio', input: { projectId: string; taskId: string; stage: string }) => void;
};

type AudioRuntimeServiceOptions = {
  ffmpegBin: string;
  ffprobeBin: string;
  audioExtractOutputDir: string;
};

export class AudioRuntimeService {
  private readonly audioExtracts = new Map<string, AudioExtractItem>();
  private static readonly AUDIO_FILE_EXTENSIONS = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'opus', 'm4a'] as const;

  constructor(
    private readonly store: SqliteStore,
    private readonly provider: AiProvider,
    private readonly options: AudioRuntimeServiceOptions,
    private readonly deps: AudioRuntimeServiceDeps
  ) {}

  listAudioTasks(projectId: string): AudioTask[] | null {
    return this.store.listAudioTasks(projectId);
  }

  listAudioExtracts(projectId: string): AudioExtractItem[] | null {
    const project = this.store.getProjectById(projectId);
    if (!project) {
      return null;
    }
    return [...this.audioExtracts.values()]
      .filter((item) => item.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  resolveAudioExtractDownload(projectId: string, extractId: string): { path: string } | { reason: 'not_found' | 'forbidden' } {
    const item = this.audioExtracts.get(extractId);
    if (!item || item.projectId !== projectId) {
      return { reason: 'not_found' };
    }
    const resolved = path.resolve(item.outputPath);
    if (!this.isPathWithinBase(resolved, this.options.audioExtractOutputDir)) {
      return { reason: 'forbidden' };
    }
    if (!fs.existsSync(resolved)) {
      return { reason: 'not_found' };
    }
    return { path: resolved };
  }

  resolveAudioTaskDownload(projectId: string, taskId: string): { path: string } | { reason: 'not_found' | 'not_ready' | 'forbidden' } {
    const task = this.store.getAudioTask(projectId, taskId);
    if (!task) {
      return { reason: 'not_found' };
    }
    if (task.status !== 'done' || !task.resultUrl) {
      return { reason: 'not_ready' };
    }
    const resolvedPath = this.resolveAudioTaskLocalPath(projectId, taskId, task.resultUrl, task.params.format);
    if (!resolvedPath) {
      return { reason: 'not_found' };
    }
    if (!this.isPathWithinKnownAudioOutputDir(resolvedPath)) {
      return { reason: 'forbidden' };
    }
    if (!fs.existsSync(resolvedPath)) {
      return { reason: 'not_found' };
    }
    return { path: resolvedPath };
  }

  resolveAudioTaskSourceUrl(projectId: string, taskId: string): string | null {
    const task = this.store.getAudioTask(projectId, taskId);
    if (!task || task.status !== 'done' || !task.resultUrl) {
      return null;
    }
    return this.resolveAudioTaskLocalPath(projectId, taskId, task.resultUrl, task.params.format) ?? task.resultUrl;
  }

  resolveAudioTaskTiming(projectId: string, taskId: string): { sourceUrl: string | null; durationSec: number | null } {
    const task = this.store.getAudioTask(projectId, taskId);
    if (!task || task.status !== 'done' || !task.resultUrl) {
      return { sourceUrl: null, durationSec: null };
    }
    const localPath = this.resolveAudioTaskLocalPath(projectId, taskId, task.resultUrl, task.params.format);
    return {
      sourceUrl: localPath ?? task.resultUrl,
      durationSec: localPath ? this.probeLocalAudioDurationSec(localPath) : null,
    };
  }

  async createAndRunAudioTask(
    projectId: string,
    storyboardId: string,
    priority: 'low' | 'medium' | 'high' = 'medium',
    options: {
      promptOverride?: string;
      modelId?: string;
      customModel?: string;
      trackKind?: 'narration' | 'dialogue' | 'ambience' | 'music';
      speaker?: string;
      sourceText?: string;
      segmentIndex?: number;
      segmentStartMs?: number;
      segmentEndMs?: number;
      voice?: string;
      speed?: number;
      emotion?: string;
      format?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<AudioTask | null> {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }
    const modelName = this.deps.resolveModelName('audio', options.modelId, options.customModel) ?? null;
    const modelConfig = this.deps.pickModelConfig('audio', modelName ?? undefined);
    this.ensureRealAudioModelConfigured(modelConfig, modelName);
    const taskParams: AudioTaskParams = this.sanitizeAudioTaskParamsForModel(
      modelConfig,
      this.deps.normalizeAudioTaskParams({
        trackKind: options.trackKind,
        speaker: options.speaker,
        sourceText: options.sourceText,
        segmentIndex: options.segmentIndex,
        segmentStartMs: options.segmentStartMs,
        segmentEndMs: options.segmentEndMs,
        voice: options.voice,
        speed: options.speed,
        emotion: options.emotion,
        format: options.format,
        providerOptions: options.providerOptions,
      })
    );
    this.deps.validateAudioTaskParams(modelConfig, taskParams);
    const fallbackPrompt = `${storyboard.prompt}；为该镜头生成配套旁白与环境声。`;
    const prompt = cleanValue(options.promptOverride) || this.deps.compileAudioPrompt(projectId, storyboardId, fallbackPrompt);
    const created = this.store.createAudioTask({
      id: uuid(),
      projectId,
      storyboardId,
      prompt,
      modelName,
      params: taskParams as Record<string, unknown>,
      priority,
    });
    if (!created) {
      return null;
    }

    this.store.updateAudioTask(projectId, created.id, { status: 'running', progress: 20, resultUrl: null, error: null });
    try {
      await this.sleep(100);
      this.store.updateAudioTask(projectId, created.id, { status: 'running', progress: 70, resultUrl: null, error: null });
      this.deps.maybeThrowInjectedFailure('audio', {
        projectId,
        taskId: created.id,
        stage: 'running',
      });
      const result = await this.provider.generateAudio({
        prompt: created.prompt,
        projectId,
        storyboardId,
        model: modelConfig?.model ?? modelName ?? undefined,
        modelConfig: modelConfig ? this.deps.toProviderModelConfig(modelConfig) : undefined,
        voice: taskParams.voice,
        speed: taskParams.speed,
        emotion: taskParams.emotion,
        format: taskParams.format,
        providerOptions: taskParams.providerOptions,
      });
      const resultUrl = await this.persistAudioTaskResult(projectId, created.id, result.url, taskParams.format);
      return this.store.updateAudioTask(projectId, created.id, {
        status: 'done',
        progress: 100,
        resultUrl,
        error: null,
      });
    } catch (err) {
      return this.store.updateAudioTask(projectId, created.id, {
        status: 'failed',
        progress: 100,
        resultUrl: null,
        error: err instanceof Error ? err.message : 'Audio generation failed',
      });
    }
  }

  async retryAudioTask(projectId: string, taskId: string): Promise<AudioTask | null> {
    const existing = this.store.getAudioTask(projectId, taskId);
    if (!existing) {
      return null;
    }
    if (existing.status !== 'failed') {
      return existing;
    }
    return this.createAndRunAudioTask(projectId, existing.storyboardId, existing.priority, {
      promptOverride: existing.prompt,
      customModel: existing.modelName ?? undefined,
      trackKind: existing.params.trackKind,
      speaker: existing.params.speaker,
      sourceText: existing.params.sourceText,
      segmentIndex: existing.params.segmentIndex,
      segmentStartMs: existing.params.segmentStartMs,
      segmentEndMs: existing.params.segmentEndMs,
      voice: existing.params.voice,
      speed: existing.params.speed,
      emotion: existing.params.emotion,
      format: existing.params.format,
      providerOptions: existing.params.providerOptions,
    });
  }

  private sanitizeAudioTaskParamsForModel(modelConfig: ModelConfig | null, params: AudioTaskParams): AudioTaskParams {
    if (!modelConfig) {
      return params;
    }
    const next: AudioTaskParams = { ...params };
    if (next.voice) {
      const supportedVoices = this.extractModelVoiceCapabilities(modelConfig);
      if (supportedVoices.length > 0 && !supportedVoices.includes(next.voice)) {
        next.voice = supportedVoices[0];
      }
    }
    if (typeof next.speed === 'number' && Number.isFinite(next.speed)) {
      const supportedSpeeds = this.extractModelSpeedCapabilities(modelConfig);
      if (supportedSpeeds.length > 0 && !supportedSpeeds.includes(next.speed)) {
        next.speed = this.pickNearestNumericCapability(supportedSpeeds, next.speed);
      }
    }
    return next;
  }

  private extractModelVoiceCapabilities(modelConfig: ModelConfig): string[] {
    const root =
      modelConfig.capabilities && typeof modelConfig.capabilities === 'object' && !Array.isArray(modelConfig.capabilities)
        ? (modelConfig.capabilities as Record<string, unknown>)
        : {};
    const directVoices = this.extractStringArray(root.voices);
    if (directVoices.length > 0) {
      return directVoices;
    }
    const nestedAudio =
      root.audio && typeof root.audio === 'object' && !Array.isArray(root.audio)
        ? (root.audio as Record<string, unknown>)
        : null;
    return this.extractStringArray(nestedAudio?.voices);
  }

  private extractStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  private extractModelSpeedCapabilities(modelConfig: ModelConfig): number[] {
    const root =
      modelConfig.capabilities && typeof modelConfig.capabilities === 'object' && !Array.isArray(modelConfig.capabilities)
        ? (modelConfig.capabilities as Record<string, unknown>)
        : {};
    const direct = this.extractNumberArray(root.speeds);
    if (direct.length > 0) {
      return direct;
    }
    const nestedAudio =
      root.audio && typeof root.audio === 'object' && !Array.isArray(root.audio)
        ? (root.audio as Record<string, unknown>)
        : null;
    return this.extractNumberArray(nestedAudio?.speeds);
  }

  private extractNumberArray(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  }

  private pickNearestNumericCapability(values: number[], target: number): number {
    return values.reduce((best, current) =>
      Math.abs(current - target) < Math.abs(best - target) ? current : best
    );
  }

  async createAndRunAudioExtract(
    projectId: string,
    input: {
      videoTaskId?: string;
      sourceUrl?: string;
      format?: 'mp3' | 'wav' | 'aac' | 'flac' | 'ogg';
      sampleRate?: number;
      channels?: number;
      bitrateKbps?: number;
    }
  ): Promise<AudioExtractItem | null> {
    const project = this.store.getProjectById(projectId);
    if (!project) {
      return null;
    }

    const sourceUrl = await this.resolveAudioExtractSource(projectId, input);
    const format = input.format ?? 'mp3';
    const extractId = uuid();
    await fsPromises.mkdir(this.options.audioExtractOutputDir, { recursive: true });
    const outputPath = path.join(this.options.audioExtractOutputDir, `${projectId}-${extractId}.${format}`);

    const prepared = await this.prepareAudioExtractInputSource(sourceUrl, extractId);
    try {
      const args: string[] = ['-y', '-i', prepared.ffmpegInput, '-vn'];
      if (typeof input.channels === 'number' && Number.isFinite(input.channels)) {
        args.push('-ac', String(Math.max(1, Math.min(8, Math.floor(input.channels)))));
      }
      if (typeof input.sampleRate === 'number' && Number.isFinite(input.sampleRate)) {
        args.push('-ar', String(Math.max(8000, Math.min(96000, Math.floor(input.sampleRate)))));
      }
      if (typeof input.bitrateKbps === 'number' && Number.isFinite(input.bitrateKbps) && ['mp3', 'aac', 'ogg'].includes(format)) {
        args.push('-b:a', `${Math.max(32, Math.min(320, Math.floor(input.bitrateKbps)))}k`);
      }
      switch (format) {
        case 'mp3':
          args.push('-acodec', 'libmp3lame');
          break;
        case 'wav':
          args.push('-acodec', 'pcm_s16le');
          break;
        case 'aac':
          args.push('-acodec', 'aac');
          break;
        case 'flac':
          args.push('-acodec', 'flac');
          break;
        case 'ogg':
          args.push('-acodec', 'libvorbis');
          break;
      }
      args.push(outputPath);
      await this.runFfmpeg(this.options.ffmpegBin, args, 5 * 60 * 1000);
    } finally {
      if (prepared.tempInputPath) {
        await fsPromises.rm(prepared.tempInputPath, { force: true });
      }
    }

    const resultUrl = `/api/pipeline/projects/${encodeURIComponent(projectId)}/audio-extracts/${encodeURIComponent(extractId)}/file`;
    const item: AudioExtractItem = {
      id: extractId,
      projectId,
      sourceUrl,
      format,
      sampleRate: typeof input.sampleRate === 'number' && Number.isFinite(input.sampleRate) ? Math.max(8000, Math.min(96000, Math.floor(input.sampleRate))) : null,
      channels: typeof input.channels === 'number' && Number.isFinite(input.channels) ? Math.max(1, Math.min(8, Math.floor(input.channels))) : null,
      bitrateKbps:
        typeof input.bitrateKbps === 'number' && Number.isFinite(input.bitrateKbps) ? Math.max(32, Math.min(320, Math.floor(input.bitrateKbps))) : null,
      resultUrl,
      outputPath,
      createdAt: new Date().toISOString(),
    };
    this.audioExtracts.set(item.id, item);
    return item;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private ensureRealAudioModelConfigured(modelConfig: ModelConfig | null, modelName: string | null): void {
    if (modelConfig && modelConfig.provider !== 'mock') {
      return;
    }
    if (modelName?.trim()) {
      throw new ProviderValidationError(
        `Audio model ${modelName.trim()} is not configured as a real provider. Configure a real audio model before generating final audio.`
      );
    }
    throw new ProviderValidationError('No real audio model is configured. Configure a real audio model before generating final audio.');
  }

  private async resolveAudioExtractSource(
    projectId: string,
    input: { videoTaskId?: string; sourceUrl?: string }
  ): Promise<string> {
    const direct = input.sourceUrl?.trim();
    if (direct) {
      return direct;
    }
    const taskId = input.videoTaskId?.trim();
    if (!taskId) {
      throw new Error('sourceUrl or videoTaskId is required');
    }
    const task = this.store.getVideoTask(projectId, taskId);
    if (!task || task.status !== 'done' || !task.resultUrl) {
      throw new Error(`Video task is not ready: ${taskId}`);
    }
    return task.resultUrl;
  }

  private async prepareAudioExtractInputSource(
    sourceUrl: string,
    extractId: string
  ): Promise<{ ffmpegInput: string; tempInputPath?: string }> {
    if (/^https?:\/\//i.test(sourceUrl)) {
      return { ffmpegInput: sourceUrl };
    }
    if (sourceUrl.startsWith('/mock/videos/')) {
      const tempInputPath = path.join(this.options.audioExtractOutputDir, `mock-audio-src-${extractId}.mp4`);
      await fsPromises.mkdir(this.options.audioExtractOutputDir, { recursive: true });
      await this.runFfmpeg(this.options.ffmpegBin, [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=#1b4965:s=640x360:d=3',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=3',
        '-shortest',
        '-c:v',
        'libx264',
        '-c:a',
        'aac',
        '-pix_fmt',
        'yuv420p',
        tempInputPath,
      ]);
      return { ffmpegInput: tempInputPath, tempInputPath };
    }
    const localPath = this.parseLocalPathFromUrl(sourceUrl);
    if (!localPath) {
      throw new Error(`Unsupported audio extract source URL: ${sourceUrl}`);
    }
    await fsPromises.access(localPath);
    return { ffmpegInput: localPath };
  }

  private parseLocalPathFromUrl(value: string): string | null {
    if (path.isAbsolute(value) && !value.startsWith('/api/') && !value.startsWith('/mock/')) {
      return value;
    }
    try {
      const u = new URL(value);
      if (u.protocol !== 'file:') {
        return null;
      }
      return decodeURIComponent(u.pathname);
    } catch {
      return null;
    }
  }

  private async persistAudioTaskResult(
    projectId: string,
    taskId: string,
    resultUrl: string,
    preferredFormat?: string
  ): Promise<string> {
    const inline = this.decodeInlineAudioData(resultUrl);
    if (!inline) {
      return resultUrl;
    }
    const ext = this.inferAudioExtension(inline.mimeType, preferredFormat);
    const outputPath = this.buildAudioTaskOutputPath(projectId, taskId, ext);
    await fsPromises.mkdir(this.options.audioExtractOutputDir, { recursive: true });
    await fsPromises.writeFile(outputPath, inline.buffer);
    return `/api/pipeline/projects/${encodeURIComponent(projectId)}/audio-tasks/${encodeURIComponent(taskId)}/file`;
  }

  private resolveAudioTaskLocalPath(projectId: string, taskId: string, resultUrl: string, preferredFormat?: string): string | null {
    const localPath = this.parseLocalPathFromUrl(resultUrl);
    if (localPath) {
      return localPath;
    }
    const internalPrefix = `/api/pipeline/projects/${encodeURIComponent(projectId)}/audio-tasks/${encodeURIComponent(taskId)}/file`;
    if (resultUrl !== internalPrefix) {
      return null;
    }
    const extensions = this.buildAudioTaskExtensionCandidates(preferredFormat);
    for (const outputDir of this.getAudioTaskOutputDirs()) {
      for (const ext of extensions) {
        const candidatePath = this.buildAudioTaskOutputPath(projectId, taskId, ext, outputDir);
        if (fs.existsSync(candidatePath)) {
          return candidatePath;
        }
      }
    }
    return null;
  }

  private buildAudioTaskOutputPath(projectId: string, taskId: string, extension: string, outputDir = this.options.audioExtractOutputDir): string {
    const safeExt = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp3';
    return path.join(outputDir, `${projectId}-task-${taskId}.${safeExt}`);
  }

  private getAudioTaskOutputDirs(): string[] {
    const candidates = [
      this.options.audioExtractOutputDir,
      path.resolve(process.cwd(), 'data/audio-extracts'),
      path.resolve(process.cwd(), '../data/audio-extracts'),
    ];
    return [...new Set(candidates.map((item) => path.resolve(item)))];
  }

  private isPathWithinKnownAudioOutputDir(targetPath: string): boolean {
    return this.getAudioTaskOutputDirs().some((basePath) => this.isPathWithinBase(targetPath, basePath));
  }

  private buildAudioTaskExtensionCandidates(preferredFormat?: string): string[] {
    const normalizedPreferred = preferredFormat?.trim().toLowerCase();
    const seen = new Set<string>();
    const output: string[] = [];
    const push = (value: string | undefined) => {
      const normalized = value?.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      output.push(normalized);
    };
    push(normalizedPreferred);
    for (const value of AudioRuntimeService.AUDIO_FILE_EXTENSIONS) {
      push(value);
    }
    return output;
  }

  private probeLocalAudioDurationSec(filePath: string): number | null {
    try {
      const result = spawnSync(
        this.options.ffprobeBin,
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          filePath,
        ],
        {
          encoding: 'utf8',
          timeout: 5000,
        }
      );
      if (result.status !== 0) {
        return null;
      }
      const value = Number.parseFloat(String(result.stdout ?? '').trim());
      if (!Number.isFinite(value) || value <= 0) {
        return null;
      }
      return Number(value.toFixed(3));
    } catch {
      return null;
    }
  }

  private inferAudioExtension(mimeType: string, preferredFormat?: string): string {
    const normalizedPreferred = preferredFormat?.trim().toLowerCase();
    if (normalizedPreferred) {
      return normalizedPreferred;
    }
    const normalizedMime = mimeType.trim().toLowerCase();
    if (normalizedMime.includes('mpeg') || normalizedMime.includes('mp3')) {
      return 'mp3';
    }
    if (normalizedMime.includes('wav')) {
      return 'wav';
    }
    if (normalizedMime.includes('aac')) {
      return 'aac';
    }
    if (normalizedMime.includes('flac')) {
      return 'flac';
    }
    if (normalizedMime.includes('opus')) {
      return 'opus';
    }
    if (normalizedMime.includes('ogg')) {
      return 'ogg';
    }
    if (normalizedMime.includes('mp4') || normalizedMime.includes('m4a')) {
      return 'm4a';
    }
    return 'mp3';
  }

  private decodeInlineAudioData(value: string): { mimeType: string; buffer: Buffer } | null {
    const match = /^data:([^;,]+)(;base64)?,(.*)$/isu.exec(value.trim());
    if (!match) {
      return null;
    }
    const mimeType = match[1]?.trim().toLowerCase() || 'audio/mpeg';
    const raw = match[3] ?? '';
    const buffer = match[2]
      ? Buffer.from(raw, 'base64')
      : Buffer.from(decodeURIComponent(raw), 'utf8');
    return { mimeType, buffer };
  }

  private async runFfmpeg(ffmpegBin: string, args: string[], timeoutMs = 10 * 60 * 1000): Promise<void> {
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
  }

  private isPathWithinBase(targetPath: string, basePath: string): boolean {
    const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }
}

const cleanValue = (value: string | null | undefined): string => String(value ?? '').trim();
