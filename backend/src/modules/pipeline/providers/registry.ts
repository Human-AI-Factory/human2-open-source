import type { ProviderCapability } from './types.js';
import { defaultProviderRegistryService } from '../../ai/provider-registry.service.js';

export const getProviderCatalogCapabilities = (): Record<string, ProviderCapability[]> =>
  defaultProviderRegistryService.getProviderCatalogCapabilities();
