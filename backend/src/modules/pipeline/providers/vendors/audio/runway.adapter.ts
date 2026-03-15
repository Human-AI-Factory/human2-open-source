import { ProviderValidationError } from '../../errors.js';
import { VendorAudioAdapter } from './types.js';
import { normalizeAuthHeader, toJsonHeaders } from '../video/common.js';

const extractRunwayAudio = (data: unknown): string => {
  if (!data || typeof data !== 'object') {
    throw new ProviderValidationError('runway audio response is not valid');
  }

  const record = data as Record<string, unknown>;

  // Check for output array with audio URL
  const output = record.output as string[] | undefined;
  if (Array.isArray(output) && output.length > 0) {
    const url = output.find((u) => typeof u === 'string' && u.trim());
    if (url) {
      return url;
    }
  }

  // Check for direct audio URL
  const audioUrl = record.audio_url as string | undefined;
  if (typeof audioUrl === 'string' && audioUrl.trim()) {
    return audioUrl.trim();
  }

  throw new ProviderValidationError('runway audio response missing audio URL');
};

export const runwayAudioAdapter: VendorAudioAdapter = {
  manufacturer: 'runway',
  async generate(args): Promise<{ url: string }> {
    const config = args.input.modelConfig;
    if (!config) {
      throw new ProviderValidationError('Missing model config for runway audio');
    }

    const endpoint = config.endpoints.submit || config.endpoint || args.defaultEndpoint;
    if (!endpoint) {
      throw new ProviderValidationError('runway audio endpoint is not configured');
    }

    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, args.defaultAuthHeader);
    const options = args.input.providerOptions as Record<string, unknown> | undefined;

    // Build payload - Runway TTS uses text_to_speech endpoint
    const payload: Record<string, unknown> = {
      model: config.model || args.input.model || 'text-to-speech',
      text: args.input.prompt
    };

    // Add voice settings if provided
    if (args.input.voice) {
      // Runway uses voice_id
      (payload as Record<string, unknown>).voice_id = args.input.voice;
    }

    if (args.input.speed) {
      (payload as Record<string, unknown>).speed = args.input.speed;
    }

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
      throw new ProviderValidationError(`runway audio failed: ${response.status} ${text}`.trim());
    }

    // Runway TTS might return binary audio or JSON
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('audio/')) {
      // Binary audio response
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');
      const mimeType = contentType.includes('mp3') ? 'audio/mpeg' :
                       contentType.includes('wav') ? 'audio/wav' : 'audio/mpeg';
      return { url: `data:${mimeType};base64,${base64}` };
    }

    const data = await response.json();
    const url = extractRunwayAudio(data);

    return { url };
  }
};
