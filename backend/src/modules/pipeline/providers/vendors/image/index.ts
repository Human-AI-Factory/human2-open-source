import { createVendorRegistry } from '../registry.js';
import { imageVendorCatalog } from './catalog.js';

export const getImageAdapter = createVendorRegistry(imageVendorCatalog);
