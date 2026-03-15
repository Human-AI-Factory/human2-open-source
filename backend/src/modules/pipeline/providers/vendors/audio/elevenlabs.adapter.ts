import { ProviderValidationError } from '../../errors.js';
import { VendorAudioAdapter } from './types.js';
import { normalizeAuthHeader, toJsonHeaders } from '../video/common.js';

export const elevenlabsAudioAdapter: VendorAudioAdapter = {
  manufacturer: 'elevenlabs',
  async generate(args): Promise<{ url: string }> {
    const config = args.input.modelConfig;
    if (!config) {
      throw new ProviderValidationError('Missing model config for elevenlabs audio');
    }

    // ElevenLabs uses voice_id in the URL path
    const voiceId = args.input.voice || config.model || '21m00Tcm4TlvDq8ikWAM'; // Default voice
    const endpoint = config.endpoint || args.defaultEndpoint;

    if (!endpoint) {
      throw new ProviderValidationError('elevenlabs audio endpoint is not configured');
    }

    // Build URL: /v1/text_to_speech/{voice_id}
    const url = endpoint.includes('{voice_id}')
      ? endpoint.replace('{voice_id}', voiceId)
      : `${endpoint}/v1/text_to_speech/${voiceId}`;

    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, args.defaultAuthHeader);
    const options = args.input.providerOptions as Record<string, unknown> | undefined;

    const payload: Record<string, unknown> = {
      text: args.input.prompt,
      model_id: config.model || args.input.model || 'eleven_multilingual_v2'
    };

    // Add optional parameters
    if (args.input.speed) {
      payload.speed = args.input.speed;
    }
    if (options?.voiceSettings) {
      payload.voice_settings = options.voiceSettings;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...toJsonHeaders(authHeaders),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ProviderValidationError(`elevenlabs audio failed: ${response.status} ${text}`.trim());
    }

    // ElevenLabs returns binary audio
    const contentType = response.headers.get('content-type') || '';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');

    const mimeType = contentType.includes('mp3') ? 'audio/mpeg' :
                     contentType.includes('wav') ? 'audio/wav' :
                     contentType.includes('ogg') ? 'audio/ogg' : 'audio/mpeg';

    return { url: `data:${mimeType};base64,${base64}` };
  }
};
