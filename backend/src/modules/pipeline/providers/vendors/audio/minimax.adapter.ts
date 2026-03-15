import { ProviderValidationError } from '../../errors.js';
import { VendorAudioAdapter } from './types.js';
import { normalizeAuthHeader, toJsonHeaders } from '../video/common.js';

const extractMiniMaxAudio = (data: unknown): string => {
  if (!data || typeof data !== 'object') {
    throw new ProviderValidationError('minimax audio response is not valid');
  }

  const record = data as Record<string, unknown>;
  const dataObj = record.data as Record<string, unknown> | undefined;

  if (!dataObj) {
    throw new ProviderValidationError('minimax audio response missing data');
  }

  // Check for direct URL
  const url = dataObj.file_url as string | undefined;
  if (typeof url === 'string' && url.trim()) {
    return url.trim();
  }

  // Check for hex audio data
  const hexAudio = dataObj.audio as string | undefined;
  if (typeof hexAudio === 'string' && hexAudio.trim()) {
    // Convert hex to base64 data URL
    try {
      const buffer = Buffer.from(hexAudio.trim(), 'hex');
      return `data:audio/mp3;base64,${buffer.toString('base64')}`;
    } catch {
      throw new ProviderValidationError('minimax audio response has invalid hex data');
    }
  }

  throw new ProviderValidationError('minimax audio response missing audio data');
};

export const minimaxAudioAdapter: VendorAudioAdapter = {
  manufacturer: 'minimax',
  async generate(args): Promise<{ url: string }> {
    const config = args.input.modelConfig;
    if (!config) {
      throw new ProviderValidationError('Missing model config for minimax audio');
    }

    const endpoint = config.endpoints.submit || config.endpoint || args.defaultEndpoint;
    if (!endpoint) {
      throw new ProviderValidationError('minimax audio endpoint is not configured');
    }

    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, args.defaultAuthHeader);
    const options = args.input.providerOptions as Record<string, unknown> | undefined;

    // Build voice settings
    const voiceSetting: Record<string, unknown> = {};
    if (args.input.voice) {
      voiceSetting.voice_id = args.input.voice;
    }
    if (args.input.speed) {
      voiceSetting.speed = args.input.speed;
    }
    // Map emotion from provider options
    if (options?.emotion) {
      voiceSetting.emotion = options.emotion;
    }

    // Build audio settings
    const audioSetting: Record<string, unknown> = {};
    if (options?.sampleRate) {
      audioSetting.sample_rate = options.sampleRate;
    }
    if (options?.bitrate) {
      audioSetting.bitrate = options.bitrate;
    }
    if (options?.format) {
      audioSetting.format = options.format;
    }

    const payload: Record<string, unknown> = {
      model: config.model || args.input.model || 'speech-2.6-hd',
      text: args.input.prompt,
      stream: false,
      ...(Object.keys(voiceSetting).length > 0 ? { voice_setting: voiceSetting } : {}),
      ...(Object.keys(audioSetting).length > 0 ? { audio_setting: audioSetting } : {})
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...toJsonHeaders(authHeaders),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ProviderValidationError(`minimax audio failed: ${response.status} ${text}`.trim());
    }

    const data = await response.json();
    const baseResp = (data as Record<string, unknown>).base_resp as Record<string, unknown> | undefined;
    if (baseResp) {
      const statusCode = baseResp.status_code as number;
      if (statusCode !== 0) {
        throw new ProviderValidationError(`minimax audio failed: ${baseResp.status_msg || 'unknown error'}`);
      }
    }

    const url = extractMiniMaxAudio(data);

    return { url };
  }
};
