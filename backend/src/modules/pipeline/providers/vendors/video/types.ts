import { ProviderVideoInput } from '../../types.js';

export type VendorVideoGenerateInput = {
  input: ProviderVideoInput;
  timeoutMs: number;
  defaultEndpoint: string;
  defaultAuthHeader: string;
};

export interface VendorVideoAdapter {
  manufacturer: string;
  generate(input: VendorVideoGenerateInput): Promise<{ url: string; providerTaskId?: string }>;
}
