import { createVendorRegistry } from '../registry.js';
import { videoVendorCatalog } from './catalog.js';

export const getVideoAdapter = createVendorRegistry(videoVendorCatalog);
