import { PROVIDER_CAPABILITY_PRESETS } from './capability-presets.js';

type ModelTaskType = 'text' | 'image' | 'video' | 'audio';
type ModelAuthType = 'bearer' | 'api_key' | 'none';

type ProviderTemplateSeed = {
  label: string;
  provider: string;
  authType: ModelAuthType;
  description: string;
  endpointTemplates: Record<string, string>;
  modelPlaceholder: string;
  tags: string[];
  aliases?: string[];
};

export type ProviderTemplateDescriptor = {
  type: ModelTaskType;
  manufacturer: string;
  label: string;
  provider: string;
  authType: ModelAuthType;
  description: string;
  endpointTemplates: Record<string, string>;
  modelPlaceholder: string;
  tags: string[];
  aliases: string[];
  capabilities: Record<string, unknown>;
};

const PROVIDER_TEMPLATE_SEEDS: Record<ModelTaskType, Record<string, ProviderTemplateSeed>> = {
  text: {
    openai: {
      label: 'OpenAI',
      provider: 'http',
      authType: 'bearer',
      description: '标准聊天补全接入，适合作为通用文本能力模板。',
      endpointTemplates: { submit: 'https://api.openai.com/v1/chat/completions' },
      modelPlaceholder: 'gpt-4.1-mini / gpt-4o-mini',
      tags: ['chat', 'json', 'streaming'],
      aliases: ['openai-compatible']
    },
    deepseek: {
      label: 'DeepSeek',
      provider: 'http',
      authType: 'bearer',
      description: 'DeepSeek 官方兼容接口，适合文本生成与推理。',
      endpointTemplates: { submit: 'https://api.deepseek.com/v1/chat/completions' },
      modelPlaceholder: 'deepseek-chat / deepseek-reasoner',
      tags: ['reasoning', 'chat']
    },
    gemini: {
      label: 'Gemini',
      provider: 'http',
      authType: 'api_key',
      description: 'Google Gemini 原生接口模板。',
      endpointTemplates: { submit: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent' },
      modelPlaceholder: 'gemini-2.5-pro / gemini-2.5-flash',
      tags: ['multimodal', 'google']
    },
    modelscope: {
      label: 'ModelScope',
      provider: 'http',
      authType: 'bearer',
      description: 'ModelScope 推理 API 兼容聊天补全入口。',
      endpointTemplates: { submit: 'https://api-inference.modelscope.cn/v1/chat/completions' },
      modelPlaceholder: 'Qwen/Qwen3-Next-80B-A3B-Instruct',
      tags: ['qwen', 'chat']
    },
    atlascloud: {
      label: 'AtlasCloud',
      provider: 'http',
      authType: 'bearer',
      description: 'AtlasCloud 兼容聊天补全模板。',
      endpointTemplates: { submit: 'https://api.atlascloud.ai/v1/chat/completions' },
      modelPlaceholder: 'atlas-chat',
      tags: ['compat']
    },
    apimart: {
      label: 'API Mart',
      provider: 'http',
      authType: 'bearer',
      description: 'API Mart 多模型聚合文本入口。',
      endpointTemplates: { submit: 'https://api.apimart.ai/v1/chat/completions' },
      modelPlaceholder: 'qwen-plus / deepseek-v3',
      tags: ['aggregator', 'chat']
    },
    other: {
      label: 'Other Compatible',
      provider: 'http',
      authType: 'bearer',
      description: '通用 OpenAI 兼容文本接口模板。',
      endpointTemplates: { submit: 'https://api.example.com/v1/chat/completions' },
      modelPlaceholder: 'your-model-name',
      tags: ['custom', 'compat']
    }
  },
  image: {
    volcengine: {
      label: 'Volcengine',
      provider: 'http',
      authType: 'bearer',
      description: '火山引擎图像生成模板。',
      endpointTemplates: { submit: 'https://ark.cn-beijing.volces.com/api/v3/images/generations' },
      modelPlaceholder: 'doubao-image-3.0',
      tags: ['storyboard', 'asset']
    },
    modelscope: {
      label: 'ModelScope',
      provider: 'http',
      authType: 'bearer',
      description: 'ModelScope 图像生成模板。',
      endpointTemplates: {
        submit: 'https://api-inference.modelscope.cn/v1/images/generations',
        query: 'https://api-inference.modelscope.cn/v1/tasks/{taskId}'
      },
      modelPlaceholder: 'Qwen/Qwen-Image',
      tags: ['storyboard', 'task-polling']
    },
    kling: {
      label: 'Kling',
      provider: 'http',
      authType: 'bearer',
      description: '可灵图像生成模板。',
      endpointTemplates: { submit: 'https://api-beijing.klingai.com/v1/images/omni-image' },
      modelPlaceholder: 'kling-v1-image',
      tags: ['storyboard', 'character']
    },
    vidu: {
      label: 'Vidu',
      provider: 'http',
      authType: 'bearer',
      description: 'Vidu 图像生成模板。',
      endpointTemplates: {
        submit: 'https://api.vidu.cn/ent/v2/reference2image',
        query: 'https://api.vidu.cn/ent/v2/tasks/{id}/creations'
      },
      modelPlaceholder: 'vidu-reference-image',
      tags: ['reference', 'task-polling']
    },
    wan: {
      label: 'Wan / DashScope',
      provider: 'http',
      authType: 'bearer',
      description: '通义万相图像生成模板。',
      endpointTemplates: {
        submit: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
        query: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}'
      },
      modelPlaceholder: 'wanx2.1-t2i-turbo',
      tags: ['dashscope', 'task-polling'],
      aliases: ['dashscope', 'wanx']
    },
    runninghub: {
      label: 'RunningHub',
      provider: 'http',
      authType: 'bearer',
      description: 'RunningHub 图像生成模板。',
      endpointTemplates: {
        submit: 'https://www.runninghub.cn/openapi/v2/rhart-image-n-pro/text-to-image',
        query: 'https://www.runninghub.cn/task/openapi/outputs'
      },
      modelPlaceholder: 'rhart-image-n-pro',
      tags: ['aggregator']
    },
    apimart: {
      label: 'API Mart',
      provider: 'http',
      authType: 'bearer',
      description: 'API Mart 图像聚合模板。',
      endpointTemplates: {
        submit: 'https://api.apimart.ai/v1/images/generations',
        query: 'https://api.apimart.ai/v1/tasks/{taskId}'
      },
      modelPlaceholder: 'qwen-image',
      tags: ['aggregator', 'task-polling']
    },
    gemini: {
      label: 'Gemini',
      provider: 'http',
      authType: 'api_key',
      description: 'Google Gemini 图像生成模板。',
      endpointTemplates: {
        submit: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:predict',
        query: 'https://generativelanguage.googleapis.com/v1beta/{name}'
      },
      modelPlaceholder: 'imagen-4.0-generate-preview-06-06',
      tags: ['google', 'task-polling']
    },
    other: {
      label: 'Other Compatible',
      provider: 'http',
      authType: 'bearer',
      description: '通用图像生成兼容模板。',
      endpointTemplates: { submit: 'https://api.example.com/v1/images/generations' },
      modelPlaceholder: 'your-image-model',
      tags: ['custom']
    }
  },
  video: {
    volcengine: {
      label: 'Volcengine',
      provider: 'http',
      authType: 'bearer',
      description: '火山引擎视频生成模板。',
      endpointTemplates: {
        submit: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
        query: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{taskId}'
      },
      modelPlaceholder: 'doubao-seedance-1-5-pro',
      tags: ['text2video', 'image2video', 'audio']
    },
    modelscope: {
      label: 'ModelScope',
      provider: 'http',
      authType: 'bearer',
      description: 'ModelScope 视频生成模板。',
      endpointTemplates: {
        submit: 'https://api-inference.modelscope.cn/v1/videos/generations',
        query: 'https://api-inference.modelscope.cn/v1/tasks/{taskId}'
      },
      modelPlaceholder: 'Wan-AI/Wan2.2-T2V-A14B',
      tags: ['wan', 'task-polling']
    },
    kling: {
      label: 'Kling',
      provider: 'http',
      authType: 'bearer',
      description: '可灵视频生成模板。',
      endpointTemplates: {
        submit: 'https://api-beijing.klingai.com/v1/videos/text2video',
        query: 'https://api-beijing.klingai.com/v1/videos/text2video/{taskId}'
      },
      modelPlaceholder: 'kling-v1-6',
      tags: ['text2video', 'start-end']
    },
    vidu: {
      label: 'Vidu',
      provider: 'http',
      authType: 'bearer',
      description: 'Vidu 视频生成模板。',
      endpointTemplates: {
        submit: 'https://api.vidu.cn/ent/v2/text2video',
        query: 'https://api.vidu.cn/ent/v2/tasks'
      },
      modelPlaceholder: 'vidu-q1',
      tags: ['reference', 'image2video', 'audio']
    },
    wan: {
      label: 'Wan / DashScope',
      provider: 'http',
      authType: 'bearer',
      description: '通义万相视频生成模板。',
      endpointTemplates: {
        submit: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
        query: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}'
      },
      modelPlaceholder: 'wanx2.1-t2v-turbo',
      tags: ['dashscope', 'task-polling'],
      aliases: ['dashscope', 'wanx']
    },
    runninghub: {
      label: 'RunningHub',
      provider: 'http',
      authType: 'bearer',
      description: 'RunningHub 视频聚合模板。',
      endpointTemplates: {
        submit: 'https://www.runninghub.cn/openapi/v2/rhart-video-s/text-to-video',
        query: 'https://www.runninghub.cn/openapi/v2/query'
      },
      modelPlaceholder: 'rhart-video-s',
      tags: ['aggregator']
    },
    apimart: {
      label: 'API Mart',
      provider: 'http',
      authType: 'bearer',
      description: 'API Mart 视频聚合模板。',
      endpointTemplates: {
        submit: 'https://api.apimart.ai/v1/videos/generations',
        query: 'https://api.apimart.ai/v1/tasks/{taskId}'
      },
      modelPlaceholder: 'kling-video',
      tags: ['aggregator', 'task-polling']
    },
    gemini: {
      label: 'Gemini',
      provider: 'http',
      authType: 'api_key',
      description: 'Google Gemini 长任务视频模板。',
      endpointTemplates: {
        submit: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:predictLongRunning',
        query: 'https://generativelanguage.googleapis.com/v1beta/{name}'
      },
      modelPlaceholder: 'veo-3.0-generate-preview',
      tags: ['google', 'long-running']
    }
  },
  audio: {
    volcengine: {
      label: 'Volcengine',
      provider: 'http',
      authType: 'bearer',
      description: '火山引擎语音合成模板。',
      endpointTemplates: { submit: 'https://ark.cn-beijing.volces.com/api/v3/audio/speech' },
      modelPlaceholder: 'doubao-tts',
      tags: ['tts', 'voice']
    },
    kling: {
      label: 'Kling',
      provider: 'http',
      authType: 'bearer',
      description: '可灵语音模板。',
      endpointTemplates: { submit: 'https://api-beijing.klingai.com/v1/audio/speech' },
      modelPlaceholder: 'kling-tts',
      tags: ['tts']
    },
    vidu: {
      label: 'Vidu',
      provider: 'http',
      authType: 'bearer',
      description: 'Vidu 语音合成模板。',
      endpointTemplates: { submit: 'https://api.vidu.cn/ent/v2/tts' },
      modelPlaceholder: 'vidu-tts',
      tags: ['tts']
    },
    'dashscope-cosyvoice': {
      label: 'DashScope CosyVoice',
      provider: 'http',
      authType: 'bearer',
      description: '阿里云 DashScope CosyVoice 模板。',
      endpointTemplates: { submit: 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/realtimesynthesizer' },
      modelPlaceholder: 'cosyvoice-v1',
      tags: ['tts', 'dashscope', 'voice-clone'],
      aliases: ['dashscope', 'cosyvoice']
    },
    wan: {
      label: 'Wan Audio',
      provider: 'http',
      authType: 'bearer',
      description: 'Wan 兼容语音模板。',
      endpointTemplates: { submit: 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/realtimesynthesizer' },
      modelPlaceholder: 'wan-tts',
      tags: ['tts', 'compat']
    },
    runninghub: {
      label: 'RunningHub',
      provider: 'http',
      authType: 'bearer',
      description: 'RunningHub 语音聚合模板。',
      endpointTemplates: { submit: 'https://www.runninghub.cn/openapi/v2/tts' },
      modelPlaceholder: 'runninghub-tts',
      tags: ['aggregator', 'tts']
    },
    apimart: {
      label: 'API Mart',
      provider: 'http',
      authType: 'bearer',
      description: 'API Mart 语音聚合模板。',
      endpointTemplates: { submit: 'https://api.apimart.ai/v1/audio/speech' },
      modelPlaceholder: 'minimax-speech',
      tags: ['aggregator', 'tts']
    },
    gemini: {
      label: 'Gemini',
      provider: 'http',
      authType: 'api_key',
      description: 'Google Gemini 语音模板。',
      endpointTemplates: { submit: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateSpeech' },
      modelPlaceholder: 'gemini-2.5-pro-preview-tts',
      tags: ['google', 'tts']
    },
    other: {
      label: 'Other Compatible',
      provider: 'http',
      authType: 'bearer',
      description: '通用语音接口模板。',
      endpointTemplates: { submit: 'https://api.example.com/audio/generate' },
      modelPlaceholder: 'your-audio-model',
      tags: ['custom']
    }
  }
};

const TYPE_ORDER: ModelTaskType[] = ['text', 'image', 'video', 'audio'];

const titleCase = (value: string): string =>
  value
    .split(/[_\-\s/]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const readPresetCapabilities = (type: ModelTaskType, manufacturer: string): Record<string, unknown> => {
  if (type === 'text') {
    return {};
  }
  const presetGroup = (PROVIDER_CAPABILITY_PRESETS as Partial<Record<ModelTaskType, Record<string, unknown>>>)[type];
  const preset = presetGroup?.[manufacturer];
  return preset ? { [type]: preset } : {};
};

const listManufacturersForType = (type: ModelTaskType): string[] => {
  const seeded = Object.keys(PROVIDER_TEMPLATE_SEEDS[type] ?? {});
  const presetGroup = (PROVIDER_CAPABILITY_PRESETS as Partial<Record<ModelTaskType, Record<string, unknown>>>)[type];
  const fromPreset = presetGroup ? Object.keys(presetGroup) : [];
  return Array.from(new Set([...seeded, ...fromPreset]));
};

const getDefaultSeed = (type: ModelTaskType, manufacturer: string): ProviderTemplateSeed => ({
  label: titleCase(manufacturer),
  provider: 'http',
  authType: 'bearer',
  description: `${titleCase(manufacturer)} ${type} 能力模板。`,
  endpointTemplates: {},
  modelPlaceholder: 'your-model-name',
  tags: [type]
});

export const listProviderTemplateDescriptors = (): ProviderTemplateDescriptor[] =>
  TYPE_ORDER.flatMap((type) =>
    listManufacturersForType(type).map((manufacturer) => {
      const seed = PROVIDER_TEMPLATE_SEEDS[type]?.[manufacturer] ?? getDefaultSeed(type, manufacturer);
      return {
        type,
        manufacturer,
        label: seed.label,
        provider: seed.provider,
        authType: seed.authType,
        description: seed.description,
        endpointTemplates: { ...seed.endpointTemplates },
        modelPlaceholder: seed.modelPlaceholder,
        tags: [...seed.tags],
        aliases: [...(seed.aliases ?? [])],
        capabilities: readPresetCapabilities(type, manufacturer)
      };
    })
  );
