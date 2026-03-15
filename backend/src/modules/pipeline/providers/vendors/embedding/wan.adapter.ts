import { ProviderValidationError } from '../../errors.js';
import { VendorEmbeddingAdapter } from './types.js';
import { normalizeAuthHeader } from '../video/common.js';

const extractEmbedding = (data: unknown): number[] => {
  if (!data || typeof data !== 'object') {
    throw new ProviderValidationError('wan embedding response is not valid');
  }

  const record = data as Record<string, unknown>;

  // Try OpenAI-compatible format: data[].embedding
  const openaiData = record.data as Array<{ embedding?: number[] }> | undefined;
  if (Array.isArray(openaiData) && openaiData.length > 0) {
    const embedding = openaiData[0]?.embedding;
    if (Array.isArray(embedding) && embedding.every((n) => typeof n === 'number')) {
      return embedding;
    }
  }

  // Try DashScope format: output.embeddings[].embedding
  const output = record.output as Record<string, unknown> | undefined;
  if (output && typeof output === 'object') {
    const embeddings = output.embeddings as Array<{ embedding?: number[] }> | undefined;
    if (Array.isArray(embeddings) && embeddings.length > 0) {
      const embedding = embeddings[0]?.embedding;
      if (Array.isArray(embedding) && embedding.every((n) => typeof n === 'number')) {
        return embedding;
      }
    }
  }

  throw new ProviderValidationError('wan embedding response missing embedding array');
};

export const wanEmbeddingAdapter: VendorEmbeddingAdapter = {
  manufacturer: 'wan',
  async generate(args): Promise<{ embedding: number[] }> {
    const config = args.input.modelConfig;
    if (!config) {
      throw new ProviderValidationError('Missing model config for wan embedding');
    }

    const endpoint = config.endpoints.submit || config.endpoint || args.defaultEndpoint;
    if (!endpoint) {
      throw new ProviderValidationError('wan embedding endpoint is not configured');
    }

    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, args.defaultAuthHeader);
    const options = args.input.providerOptions as Record<string, unknown> | undefined;

    // Support both OpenAI-compatible and DashScope native endpoints
    const isOpenAICompatible = endpoint.includes('/compatible-mode/') || endpoint.includes('/embeddings');
    const isDashScopeNative = endpoint.includes('/api/v1/services/embeddings/');

    const payload: Record<string, unknown> = {
      model: config.model || args.input.model,
      input: args.input.prompt
    };

    // Add optional parameters
    if (args.input.dimensions) {
      payload.dimensions = args.input.dimensions;
    }

    if (isDashScopeNative) {
      // DashScope native format
      if (options?.text_type) {
        payload.text_type = options.text_type;
      }
      if (options?.dimension) {
        payload.dimension = options.dimension;
      }
      if (options?.output_type) {
        payload.output_type = options.output_type;
      }
    } else if (isOpenAICompatible) {
      // OpenAI-compatible format
      if (args.input.dimensions) {
        payload.dimensions = args.input.dimensions;
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ProviderValidationError(`wan embedding failed: ${response.status} ${text}`.trim());
    }

    const data = await response.json();
    const embedding = extractEmbedding(data);

    return { embedding };
  }
};
