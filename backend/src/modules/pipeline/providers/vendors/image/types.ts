import { ProviderImageInput } from '../../types.js';

export type VendorImageGenerateInput = {
  input: ProviderImageInput;
  timeoutMs: number;
  defaultEndpoint: string;
  defaultAuthHeader: string;
};

export interface VendorImageAdapter {
  manufacturer: string;
  generate(input: VendorImageGenerateInput): Promise<{ url: string }>;
}
