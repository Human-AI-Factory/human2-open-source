import { ProviderAsrInput } from '../../types.js';

export type VendorAsrGenerateInput = {
  input: ProviderAsrInput;
  timeoutMs: number;
  defaultEndpoint: string;
  defaultAuthHeader: string;
};

export interface VendorAsrAdapter {
  manufacturer: string;
  generate(input: VendorAsrGenerateInput): Promise<{ text: string }>;
}
