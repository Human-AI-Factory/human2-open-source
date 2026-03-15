import { createVendorRegistry } from '../registry.js';
import { asrVendorCatalog } from './catalog.js';

export const getAsrAdapter = createVendorRegistry(asrVendorCatalog);
