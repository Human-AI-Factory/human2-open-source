import { ProviderValidationError } from '../../errors.js';
import { VendorAsrAdapter } from './types.js';
import { normalizeAuthHeader, toJsonHeaders } from '../video/common.js';

const extractAsrText = (data: unknown): string => {
  if (!data || typeof data !== 'object') {
    throw new ProviderValidationError('wan asr response is not valid');
  }

  const record = data as Record<string, unknown>;
  const output = record.output as Record<string, unknown> | undefined;

  if (!output || typeof output !== 'object') {
    throw new ProviderValidationError('wan asr response missing output');
  }

  // Check for transcription_url and fetch result
  const transcriptionUrl = output.transcription_url as string | undefined;
  if (transcriptionUrl) {
    // This is async - need to return task info for polling
    throw new ProviderValidationError('wan asr requires polling, use polling adapter');
  }

  // Check for direct results
  const results = output.results as Array<{ transcription_text?: string }> | undefined;
  if (Array.isArray(results) && results.length > 0) {
    const text = results[0]?.transcription_text;
    if (typeof text === 'string') {
      return text;
    }
  }

  throw new ProviderValidationError('wan asr response missing transcription text');
};

const extractTaskId = (data: unknown): string => {
  if (!data || typeof data !== 'object') {
    throw new ProviderValidationError('wan asr response is not valid');
  }

  const record = data as Record<string, unknown>;
  const output = record.output as Record<string, unknown> | undefined;

  if (!output || typeof output !== 'object') {
    throw new ProviderValidationError('wan asr response missing output');
  }

  const taskId = output.task_id as string | undefined;
  if (!taskId) {
    throw new ProviderValidationError('wan asr response missing task_id');
  }

  return taskId;
};

const extractPollingUrl = (endpoint: string): string => {
  // Extract base URL and construct polling URL
  const url = new URL(endpoint);
  url.pathname = url.pathname.replace(/\/transcription$/, '/tasks/{taskId}');
  // Remove query params
  return url.origin + url.pathname;
};

export const wanAsrAdapter: VendorAsrAdapter = {
  manufacturer: 'wan',
  async generate(args): Promise<{ text: string }> {
    const config = args.input.modelConfig;
    if (!config) {
      throw new ProviderValidationError('Missing model config for wan asr');
    }

    const endpoint = config.endpoints.submit || config.endpoint || args.defaultEndpoint;
    if (!endpoint) {
      throw new ProviderValidationError('wan asr endpoint is not configured');
    }

    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, args.defaultAuthHeader);
    const options = args.input.providerOptions as Record<string, unknown> | undefined;

    // Submit task
    const submitResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...toJsonHeaders(authHeaders),
        'X-DashScope-Async': 'enable'
      },
      body: JSON.stringify({
        model: config.model || args.input.model,
        input: {
          file_urls: [args.input.audioUrl]
        },
        parameters: {
          ...(args.input.language ? { language_hints: [args.input.language] } : {}),
          ...(options?.diarization_enabled !== undefined ? { diarization_enabled: options.diarization_enabled } : {})
        }
      })
    });

    if (!submitResponse.ok) {
      const text = await submitResponse.text().catch(() => '');
      throw new ProviderValidationError(`wan asr submit failed: ${submitResponse.status} ${text}`.trim());
    }

    const submitData = await submitResponse.json();
    const taskId = extractTaskId(submitData);

    // Poll for result
    const queryEndpoint = config.endpoints.query || extractPollingUrl(endpoint);
    const pollUrl = queryEndpoint.replace('{taskId}', taskId);

    const maxAttempts = 60;
    const intervalMs = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      const pollResponse = await fetch(pollUrl, {
        method: 'GET',
        headers: toJsonHeaders(authHeaders)
      });

      if (!pollResponse.ok) {
        const text = await pollResponse.text().catch(() => '');
        throw new ProviderValidationError(`wan asr poll failed: ${pollResponse.status} ${text}`.trim());
      }

      const pollData = await pollResponse.json();
      const pollOutput = (pollData as Record<string, unknown>).output as Record<string, unknown> | undefined;
      const status = (pollOutput?.task_status as string || '').toUpperCase();

      if (status === 'SUCCEEDED') {
        const results = pollOutput?.results as Array<{ transcription_text?: string }> | undefined;
        if (Array.isArray(results) && results.length > 0) {
          const text = results[0]?.transcription_text;
          if (typeof text === 'string') {
            return { text };
          }
        }
        throw new ProviderValidationError('wan asr succeeded but missing transcription text');
      }

      if (status === 'FAILED' || status === 'CANCELED') {
        const errorMsg = pollOutput?.message as string || 'wan asr task failed';
        throw new ProviderValidationError(errorMsg);
      }

      // Continue polling for PENDING or RUNNING
    }

    throw new ProviderValidationError('wan asr polling timed out');
  }
};
