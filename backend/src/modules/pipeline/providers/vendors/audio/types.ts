import { ProviderAudioInput } from '../../types.js';

export type VendorAudioGenerateInput = {
  input: ProviderAudioInput;
  timeoutMs: number;
  defaultEndpoint: string;
  defaultAuthHeader: string;
};

export interface VendorAudioAdapter {
  manufacturer: string;
  generate(input: VendorAudioGenerateInput): Promise<{ url: string }>;
}
