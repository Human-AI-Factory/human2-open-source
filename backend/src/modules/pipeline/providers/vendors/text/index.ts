import { createVendorRegistry } from '../registry.js';
import { textVendorCatalog } from './catalog.js';

export const getTextAdapter = createVendorRegistry(textVendorCatalog);
