import { createVendorRegistry } from '../registry.js';
import { embeddingVendorCatalog } from './catalog.js';

export const getEmbeddingAdapter = createVendorRegistry(embeddingVendorCatalog);
