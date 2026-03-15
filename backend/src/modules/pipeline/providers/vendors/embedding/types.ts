import { ProviderEmbeddingInput } from '../../types.js';

export type VendorEmbeddingGenerateInput = {
  input: ProviderEmbeddingInput;
  timeoutMs: number;
  defaultEndpoint: string;
  defaultAuthHeader: string;
};

export interface VendorEmbeddingAdapter {
  manufacturer: string;
  generate(input: VendorEmbeddingGenerateInput): Promise<{ embedding: number[] }>;
}
