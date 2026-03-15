import type { VendorRegistryEntry } from '../registry.js';
import type { VendorTextAdapter } from './types.js';
import { geminiTextAdapter } from './gemini.adapter.js';
import { openAiCompatibleTextAdapter } from './openai-compatible.adapter.js';

export const textVendorCatalog = [
  {
    adapter: geminiTextAdapter,
    aliases: ['google'],
    match: ({ manufacturer, endpoint }) =>
      manufacturer === 'gemini' || manufacturer === 'google' || endpoint.includes(':generatecontent')
  },
  {
    adapter: openAiCompatibleTextAdapter,
    aliases: [
      'openai',
      'atlascloud',
      'apimart',
      'modelscope',
      'deepseek',
      'openrouter',
      'doubao',
      'chatfire',
      'volcengine',
      'other',
      'http',
      'dashscope',
      'wanx'
    ],
    match: ({ endpoint }) => endpoint.includes('/chat/completions') || endpoint.endsWith('/responses')
  }
] satisfies VendorRegistryEntry<VendorTextAdapter>[];
