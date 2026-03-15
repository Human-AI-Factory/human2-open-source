import { ProviderValidationError } from '../../errors.js';
import { VendorImageAdapter } from './types.js';
import { getProviderOptions, normalizeAuthHeader } from '../video/common.js';

export const deepaiImageAdapter: VendorImageAdapter = {
  manufacturer: 'deepai',
  async generate(args): Promise<{ url: string }> {
    const config = args.input.modelConfig;
    if (!config) {
      throw new ProviderValidationError('Missing model config for deepai image');
    }

    const endpoint = config.endpoints.submit || config.endpoint || args.defaultEndpoint;
    if (!endpoint) {
      throw new ProviderValidationError('deepai image endpoint is not configured');
    }

    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, args.defaultAuthHeader);
    const options = getProviderOptions(args.input.providerOptions, 'deepai');

    // DeepAI uses form data or JSON
    const useFormData = options.useFormData !== false;

    // Map aspect ratio to dimensions
    const getDimensions = (aspectRatio?: string) => {
      const sizeMap: Record<string, [number, number]> = {
        '1:1': [1024, 1024],
        '16:9': [1024, 576],
        '9:16': [576, 1024],
        '4:3': [1024, 768],
        '3:4': [768, 1024]
      };
      return aspectRatio ? sizeMap[aspectRatio] : [1024, 1024];
    };

    const dims = getDimensions(args.input.aspectRatio);

    const payload: Record<string, unknown> = {
      text: args.input.prompt,
      ...(args.input.resolution || args.input.aspectRatio ? { width: dims[0], height: dims[1] } : {}),
      ...(options.imageGeneratorVersion ? { image_generator_version: options.imageGeneratorVersion } : {}),
      ...(options.negativePrompt ? { negative_prompt: options.negativePrompt } : {}),
      ...(options.geniusPreference ? { genius_preference: options.geniusPreference } : {}),
      ...(options.resolution ? { resolution: options.resolution } : {})
    };

    // Use model from config or input
    const model = config.model || args.input.model || 'text2img';

    let response: Response;

    if (useFormData) {
      const formData = new FormData();
      for (const [key, value] of Object.entries(payload)) {
        if (value !== undefined) {
          formData.append(key, String(value));
        }
      }
      // Add image URL if provided (for img2img)
      if (typeof options.imageUrl === 'string') {
        formData.append('image', options.imageUrl);
      }

      response = await fetch(`${endpoint}/api/${model}`, {
        method: 'POST',
        headers: {
          ...authHeaders
          // Don't set Content-Type for FormData - browser will set boundary
        },
        body: formData
      });
    } else {
      response = await fetch(`${endpoint}/api/${model}`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ProviderValidationError(`deepai image failed: ${response.status} ${text}`.trim());
    }

    const data = await response.json();

    // Extract image URL from response
    const extractUrl = (record: unknown): string | undefined => {
      if (!record || typeof record !== 'object') {
        return undefined;
      }

      const r = record as {
        output_url?: string;
        output?: string;
        url?: string;
      };

      return r.output_url || r.output || r.url;
    };

    const url = extractUrl(data);
    if (!url) {
      throw new ProviderValidationError(`deepai image response missing output URL: ${JSON.stringify(data)}`);
    }

    return { url };
  }
};
