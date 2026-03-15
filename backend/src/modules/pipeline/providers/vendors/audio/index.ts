import { createVendorRegistry } from '../registry.js';
import { audioVendorCatalog } from './catalog.js';

export const getAudioAdapter = createVendorRegistry(audioVendorCatalog);
