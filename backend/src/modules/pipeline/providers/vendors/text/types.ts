import { ProviderTextInput } from '../../types.js';

export type VendorTextGenerateInput = {
  input: ProviderTextInput;
  timeoutMs: number;
  defaultEndpoint: string;
  defaultAuthHeader: string;
};

export interface VendorTextAdapter {
  manufacturer: string;
  generate(input: VendorTextGenerateInput): Promise<{ text: string }>;
}
