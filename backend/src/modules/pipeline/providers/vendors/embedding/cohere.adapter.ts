import { ProviderValidationError } from '../../errors.js';
import { VendorEmbeddingAdapter } from './types.js';

export const cohereEmbeddingAdapter: VendorEmbeddingAdapter = {
  manufacturer: 'cohere',
  async generate(args): Promise<{ embedding: number[] }> {
    const config = args.input.modelConfig;
    if (!config) {
      throw new ProviderValidationError('Missing model config for cohere embedding');
    }

    const endpoint = config.endpoints.submit || config.endpoint || args.defaultEndpoint;
    if (!endpoint) {
      throw new ProviderValidationError('cohere embedding endpoint is not configured');
    }

    // Build auth header
    const apiKey = config.apiKey || args.defaultAuthHeader;
    const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;

    const options = args.input.providerOptions as Record<string, unknown> | undefined;

    const payload: Record<string, unknown> = {
      model: config.model || args.input.model || 'embed-english-v3.0',
      input_type: options?.inputType || 'search_document',
      texts: [args.input.prompt]
    };

    // Add optional parameters
    if (options?.embeddingTypes) {
      payload.embedding_types = options.embeddingTypes;
    }
    if (options?.truncate) {
      payload.truncate = options.truncate;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ProviderValidationError(`cohere embedding failed: ${response.status} ${text}`.trim());
    }

    const data = await response.json();

    // Extract embedding from response
    const embeddings = data.embeddings || data;
    if (!embeddings || !Array.isArray(embeddings) || embeddings.length === 0) {
      throw new ProviderValidationError(`cohere embedding response missing embeddings: ${JSON.stringify(data)}`);
    }

    // Return first embedding
    const embedding = embeddings[0];
    if (!Array.isArray(embedding)) {
      throw new ProviderValidationError(`cohere embedding response format error: ${JSON.stringify(data)}`);
    }

    return { embedding };
  }
};
