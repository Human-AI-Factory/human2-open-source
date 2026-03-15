import { DEFAULT_HTTP_PROVIDER_CAPABILITIES } from './capabilities.js';
import { ProviderAuthError, ProviderRateLimitError, ProviderTransientError, ProviderValidationError } from './errors.js';
import { appendProviderLog } from './provider-logs.js';
import { AiProvider, ProviderAsrInput, ProviderAudioInput, ProviderCapability, ProviderEmbeddingInput, ProviderImageInput, ProviderTextInput, ProviderVideoInput, ProviderVideoWithFramesInput, ProviderVideoWithFramesResult } from './types.js';
import { getAsrAdapter } from './vendors/asr/index.js';
import { getAudioAdapter } from './vendors/audio/index.js';
import { getEmbeddingAdapter } from './vendors/embedding/index.js';
import { getImageAdapter } from './vendors/image/index.js';
import { getTextAdapter } from './vendors/text/index.js';
import { getVideoAdapter } from './vendors/video/index.js';
import { getProviderOptions } from './vendors/video/common.js';

export class HttpAiProvider implements AiProvider {
  constructor(
    private readonly textEndpoint: string,
    private readonly imageEndpoint: string,
    private readonly videoEndpoint: string,
    private readonly audioEndpoint: string,
    private readonly timeoutMs: number,
    private readonly authHeader: string,
    private readonly apiKey: string,
    private readonly maxRetries: number,
    private readonly retryDelayMs: number
  ) {}

  getCapabilities(): ProviderCapability[] {
    return DEFAULT_HTTP_PROVIDER_CAPABILITIES;
  }

  async generateText(input: ProviderTextInput): Promise<{ text: string }> {
    const configuredEndpoint = input.modelConfig?.endpoints.submit || input.modelConfig?.endpoint;
    const adapter = getTextAdapter(input.modelConfig?.manufacturer, configuredEndpoint);
    if (adapter) {
      const endpoint = configuredEndpoint || this.textEndpoint;
      return this.withProviderLog('text', input.modelConfig?.manufacturer ?? 'http', endpoint, () =>
        adapter.generate({
          input,
          timeoutMs: this.timeoutMs,
          defaultEndpoint: this.textEndpoint,
          defaultAuthHeader: this.authHeader
        })
      );
    }

    const targetEndpoint = configuredEndpoint || this.textEndpoint;
    if (!targetEndpoint) {
      throw new Error('AI_TEXT_ENDPOINT is not configured');
    }

    const requestApiKey = input.modelConfig?.apiKey || this.apiKey;
    const requestAuthType = input.modelConfig?.authType ?? 'bearer';

    return this.withProviderLog('text', input.modelConfig?.manufacturer ?? 'http', targetEndpoint, () =>
      this.post<{ text: string }>(
        targetEndpoint,
        {
          ...input,
          type: 'text'
        },
        {
          authHeader: this.authHeader,
          apiKey: requestApiKey,
          authType: requestAuthType
        }
      )
    );
  }

  async generateImage(input: ProviderImageInput): Promise<{ url: string }> {
    const adapter = getImageAdapter(input.modelConfig?.manufacturer);
    if (adapter) {
      const endpoint = input.modelConfig?.endpoints.submit || input.modelConfig?.endpoint || this.imageEndpoint;
      return this.withProviderLog('image', input.modelConfig?.manufacturer ?? 'http', endpoint, () =>
        adapter.generate({
          input,
          timeoutMs: this.timeoutMs,
          defaultEndpoint: this.imageEndpoint,
          defaultAuthHeader: this.authHeader
        })
      );
    }

    if (!(input.modelConfig?.endpoint || this.imageEndpoint)) {
      throw new Error('AI_IMAGE_ENDPOINT is not configured');
    }

    const targetEndpoint = input.modelConfig?.endpoint || this.imageEndpoint;
    const requestApiKey = input.modelConfig?.apiKey || this.apiKey;
    const requestAuthType = input.modelConfig?.authType ?? 'bearer';

    return this.withProviderLog('image', input.modelConfig?.manufacturer ?? 'http', targetEndpoint, () =>
      this.post<{ url: string }>(
        targetEndpoint,
        {
          ...input,
          type: 'image'
        },
        {
          authHeader: this.authHeader,
          apiKey: requestApiKey,
          authType: requestAuthType
        }
      )
    );
  }

  async generateVideo(input: ProviderVideoInput): Promise<{ url: string; providerTaskId?: string }> {
    const adapter = getVideoAdapter(input.modelConfig?.manufacturer);
    if (adapter) {
      const endpoint = input.modelConfig?.endpoints.submit || input.modelConfig?.endpoint || this.videoEndpoint;
      return this.withProviderLog('video', input.modelConfig?.manufacturer ?? 'http', endpoint, () =>
        adapter.generate({
          input,
          timeoutMs: this.timeoutMs,
          defaultEndpoint: this.videoEndpoint,
          defaultAuthHeader: this.authHeader
        })
      );
    }

    if (!(input.modelConfig?.endpoint || this.videoEndpoint)) {
      throw new Error('AI_VIDEO_ENDPOINT is not configured');
    }

    const targetEndpoint = input.modelConfig?.endpoint || this.videoEndpoint;
    const requestAuthHeader = input.modelConfig?.authType === 'api_key' ? this.authHeader : this.authHeader;
    const requestApiKey = input.modelConfig?.apiKey || this.apiKey;
    const requestAuthType = input.modelConfig?.authType ?? 'bearer';

    return this.withProviderLog('video', input.modelConfig?.manufacturer ?? 'http', targetEndpoint, () =>
      this.post<{ url: string }>(
        targetEndpoint,
        {
          ...input,
          type: 'video'
        },
        {
          authHeader: requestAuthHeader,
          apiKey: requestApiKey,
          authType: requestAuthType
        },
        input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined
      )
    );
  }

  async generateVideoWithFrames(input: ProviderVideoWithFramesInput): Promise<ProviderVideoWithFramesResult> {
    // First, generate the video
    const videoResult = await this.generateVideo({
      prompt: input.prompt || '',
      projectId: input.projectId,
      storyboardId: input.storyboardId,
      model: input.model,
      modelConfig: input.modelConfig,
      mode: input.mode === 'startEnd' ? 'startEnd' : 'singleImage',
      duration: input.duration,
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
      imageInputs: input.imageInputs,
      imageWithRoles: input.imageWithRoles,
      endFrame: input.endFrame,
      providerOptions: input.providerOptions,
      idempotencyKey: input.idempotencyKey
    });

    // Extract frames from the video
    const frames = await this.extractVideoFrames(videoResult.url);

    return {
      videoUrl: videoResult.url,
      firstFrameUrl: frames.firstFrame,
      lastFrameUrl: frames.lastFrame,
      providerTaskId: videoResult.providerTaskId
    };
  }

  /**
   * Extract first and last frames from a video URL
   * This is a placeholder - in production, you'd use a video processing service
   */
  private async extractVideoFrames(videoUrl: string): Promise<{ firstFrame: string; lastFrame: string }> {
    // For now, return the video URL as both frames
    // In production, this would use a video processing service like FFmpeg or a cloud service
    // The actual frame extraction should happen via:
    // 1. Download video
    // 2. Extract first frame (0s) and last frame (duration-1s)
    // 3. Upload extracted frames and return URLs

    // TODO: Implement actual frame extraction
    // For now, we return the video URL itself as a placeholder
    // The video URL can be used to generate a preview/thumbnail

    return {
      firstFrame: videoUrl,
      lastFrame: videoUrl
    };
  }

  async generateAudio(input: ProviderAudioInput): Promise<{ url: string }> {
    const configuredEndpoint = input.modelConfig?.endpoints.submit || input.modelConfig?.endpoint;
    const adapter = getAudioAdapter(input.modelConfig?.manufacturer, configuredEndpoint);
    if (adapter) {
      const endpoint = configuredEndpoint || this.audioEndpoint;
      return this.withProviderLog('audio', input.modelConfig?.manufacturer ?? 'http', endpoint, () =>
        adapter.generate({
          input,
          timeoutMs: this.timeoutMs,
          defaultEndpoint: this.audioEndpoint,
          defaultAuthHeader: this.authHeader
        })
      );
    }

    const targetEndpoint = input.modelConfig?.endpoints.submit || input.modelConfig?.endpoint || this.audioEndpoint;
    if (!targetEndpoint) {
      throw new Error('AI_AUDIO_ENDPOINT is not configured');
    }

    const manufacturer = input.modelConfig?.manufacturer ?? 'http';
    const requestApiKey = input.modelConfig?.apiKey || this.apiKey;
    const requestAuthType = input.modelConfig?.authType ?? 'bearer';
    const options = getProviderOptions(input.providerOptions, manufacturer);
    const payload: Record<string, unknown> = {
      ...input,
      type: 'audio'
    };
    if (manufacturer === 'volcengine' || manufacturer === 'kling' || manufacturer === 'vidu' || manufacturer === 'wan') {
      if (typeof options.language === 'string') payload.language = options.language;
      if (typeof options.style === 'string') payload.style = options.style;
      if (typeof options.seed === 'number') payload.seed = Math.floor(options.seed);
      if (typeof options.temperature === 'number') payload.temperature = options.temperature;
      if (typeof options.topP === 'number') payload.top_p = options.topP;
      if (typeof options.sampleRate === 'number') payload.sample_rate = Math.floor(options.sampleRate);
      if (typeof options.bitrateKbps === 'number') payload.bitrate_kbps = Math.floor(options.bitrateKbps);
      if (typeof options.volume === 'number') payload.volume = options.volume;
      if (typeof options.pitch === 'number') payload.pitch = options.pitch;
      if (typeof options.channels === 'number') payload.channels = Math.floor(options.channels);
      if (typeof options.noiseScale === 'number') payload.noise_scale = options.noiseScale;
    }

    return this.withProviderLog('audio', manufacturer, targetEndpoint, () =>
      this.post<{ url: string }>(
        targetEndpoint,
        payload,
        {
          authHeader: this.authHeader,
          apiKey: requestApiKey,
          authType: requestAuthType
        }
      )
    );
  }

  async generateEmbedding(input: ProviderEmbeddingInput): Promise<{ embedding: number[] }> {
    const adapter = getEmbeddingAdapter(input.modelConfig?.manufacturer, input.modelConfig?.endpoint);
    if (adapter) {
      return this.withProviderLog('embedding', input.modelConfig?.manufacturer ?? 'http', input.modelConfig?.endpoint ?? '', () =>
        adapter.generate({
          input,
          timeoutMs: this.timeoutMs,
          defaultEndpoint: '',
          defaultAuthHeader: this.authHeader
        })
      );
    }

    throw new Error('No embedding adapter found for this provider');
  }

  async generateAsr(input: ProviderAsrInput): Promise<{ text: string }> {
    const configuredEndpoint = input.modelConfig?.endpoints.submit || input.modelConfig?.endpoint;
    const adapter = getAsrAdapter(input.modelConfig?.manufacturer, configuredEndpoint);
    if (adapter) {
      return this.withProviderLog('asr', input.modelConfig?.manufacturer ?? 'http', configuredEndpoint ?? '', () =>
        adapter.generate({
          input,
          timeoutMs: this.timeoutMs,
          defaultEndpoint: '',
          defaultAuthHeader: this.authHeader
        })
      );
    }

    throw new Error('No ASR adapter found for this provider');
  }

  private async withProviderLog<T>(
    taskType: 'text' | 'image' | 'video' | 'audio' | 'embedding' | 'asr',
    provider: string,
    endpoint: string,
    run: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await run();
      appendProviderLog({
        provider,
        taskType,
        endpoint: this.maskEndpoint(endpoint),
        success: true,
        durationMs: Date.now() - start
      });
      return result;
    } catch (err) {
      appendProviderLog({
        provider,
        taskType,
        endpoint: this.maskEndpoint(endpoint),
        success: false,
        durationMs: Date.now() - start,
        statusCode: err instanceof Error && 'statusCode' in err ? Number((err as { statusCode?: number }).statusCode) : undefined,
        message: err instanceof Error ? err.message.slice(0, 300) : 'provider call failed'
      });
      throw err;
    }
  }

  private maskEndpoint(endpoint: string): string {
    try {
      const url = new URL(endpoint);
      return `${url.origin}${url.pathname}`;
    } catch {
      return endpoint.split('?')[0] ?? endpoint;
    }
  }

  private async post<T>(
    url: string,
    body: unknown,
    auth?: { authHeader: string; apiKey: string; authType: 'bearer' | 'api_key' | 'none' },
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    let lastError: unknown = null;
    const attempts = Math.max(1, this.maxRetries + 1);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(extraHeaders ?? {})
        };
        const authHeader = auth?.authHeader ?? this.authHeader;
        const authType = auth?.authType ?? 'bearer';
        const apiKey = auth?.apiKey ?? this.apiKey;
        if (apiKey && authType !== 'none') {
          headers[authHeader] = authType === 'bearer' ? `Bearer ${apiKey.replace(/^Bearer\s+/i, '').trim()}` : apiKey;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          const message = `HTTP provider failed: ${response.status} ${text}`.trim();
          if (response.status === 400 || response.status === 402) {
            throw new ProviderValidationError(message, response.status);
          }
          if (response.status === 401 || response.status === 403) {
            throw new ProviderAuthError(message, response.status);
          }
          if (response.status === 429) {
            throw new ProviderRateLimitError(message, response.status);
          }
          if (response.status >= 500) {
            throw new ProviderTransientError(message, response.status);
          }
          throw new Error(message);
        }

        return (await response.json()) as T;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          lastError = new ProviderTransientError('HTTP provider timed out');
        } else {
          lastError = err;
        }
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
        }
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('HTTP provider failed');
  }
}
