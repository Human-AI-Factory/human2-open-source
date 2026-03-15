export const PROVIDER_CAPABILITY_PRESETS = {
  video: {
    volcengine: {
      modes: ['text', 'singleImage', 'startEnd'],
      durations: [4, 5, 6, 8, 10, 12],
      resolutions: ['480p', '720p', '1080p'],
      aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
      audioSupported: true,
      providerOptions: {
        seed: { type: 'number', integer: true, min: 0, max: 2147483647 },
        negativePrompt: { type: 'string', maxLength: 600 },
        motionStrength: { type: 'number', min: 0, max: 1 },
        watermark: { type: 'boolean' },
        camera: {
          type: 'object',
          properties: {
            moveX: { type: 'number', min: -1, max: 1 },
            moveY: { type: 'number', min: -1, max: 1 },
            zoom: { type: 'number', min: 0.5, max: 2 },
            rotate: { type: 'number', min: -45, max: 45 }
          }
        },
        motion: {
          type: 'object',
          properties: {
            amount: { type: 'number', min: 0, max: 1 },
            blur: { type: 'number', min: 0, max: 1 }
          }
        }
      }
    },
    kling: {
      modes: ['text', 'startEnd'],
      durations: [5, 10],
      resolutions: ['720p', '1080p'],
      aspectRatios: ['16:9', '9:16', '1:1'],
      audioSupported: false,
      providerOptions: {
        seed: { type: 'number', integer: true, min: 0, max: 2147483647 },
        negativePrompt: { type: 'string', maxLength: 600 },
        cfgScale: { type: 'number', min: 1, max: 30 },
        steps: { type: 'number', integer: true, min: 1, max: 100 },
        camera: {
          type: 'object',
          properties: {
            pan: { type: 'number', min: -1, max: 1 },
            tilt: { type: 'number', min: -1, max: 1 },
            zoom: { type: 'number', min: 0.5, max: 2 }
          }
        },
        motion: {
          type: 'object',
          properties: {
            brushStrength: { type: 'number', min: 0, max: 1 },
            amount: { type: 'number', min: 0, max: 1 }
          }
        }
      }
    },
    vidu: {
      modes: ['text', 'singleImage', 'startEnd', 'reference'],
      durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      resolutions: ['540p', '720p', '1080p'],
      aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
      audioSupported: true,
      providerOptions: {
        seed: { type: 'number', integer: true, min: 0, max: 2147483647 },
        negativePrompt: { type: 'string', maxLength: 600 },
        style: { type: 'string', enum: ['cinematic', 'anime', 'realistic', 'illustration'] },
        movementAmplitude: { type: 'number', min: 0, max: 1 },
        camera: {
          type: 'object',
          properties: {
            moveX: { type: 'number', min: -1, max: 1 },
            moveY: { type: 'number', min: -1, max: 1 },
            zoom: { type: 'number', min: 0.5, max: 2 }
          }
        },
        motion: {
          type: 'object',
          properties: {
            amount: { type: 'number', min: 0, max: 1 },
            frequency: { type: 'number', min: 0, max: 2 }
          }
        }
      }
    },
    wan: {
      modes: ['text', 'singleImage', 'startEnd'],
      durations: [2, 3, 4, 5, 6, 8, 10],
      resolutions: ['480p', '720p', '1080p'],
      aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
      audioSupported: false,
      providerOptions: {
        seed: { type: 'number', integer: true, min: 0, max: 2147483647 },
        negativePrompt: { type: 'string', maxLength: 600 },
        style: { type: 'string', enum: ['cinematic', 'anime', 'realistic', 'illustration'] },
        cinematic: { type: 'boolean' },
        motionStrength: { type: 'number', min: 0, max: 1 },
        camera: {
          type: 'object',
          properties: {
            pan: { type: 'number', min: -1, max: 1 },
            tilt: { type: 'number', min: -1, max: 1 },
            zoom: { type: 'number', min: 0.5, max: 2 }
          }
        },
        motion: {
          type: 'object',
          properties: {
            amount: { type: 'number', min: 0, max: 1 },
            blur: { type: 'number', min: 0, max: 1 }
          }
        }
      }
    },
    runninghub: {
      modes: ['text', 'singleImage'],
      durations: [5, 10],
      resolutions: ['720p', '1080p'],
      aspectRatios: ['16:9', '9:16', '1:1'],
      audioSupported: false
    },
    apimart: {
      modes: ['text', 'singleImage', 'reference'],
      durations: [5, 10],
      resolutions: ['720p', '1080p'],
      aspectRatios: ['16:9', '9:16', '1:1'],
      audioSupported: false,
      imageInputSupported: true
    },
    gemini: {
      modes: ['text', 'singleImage', 'reference'],
      durations: [5, 8, 10],
      resolutions: ['720p', '1080p'],
      aspectRatios: ['16:9', '9:16', '1:1'],
      audioSupported: false
    }
  },
  image: {
    volcengine: {
      kinds: ['storyboard', 'asset'],
      resolutions: ['1K', '2K', '4K'],
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      providerOptions: {
        seed: { type: 'number', integer: true, min: 0, max: 2147483647 },
        negativePrompt: { type: 'string', maxLength: 500 },
        cfgScale: { type: 'number', min: 1, max: 30 },
        style: { type: 'string', enum: ['cinematic', 'anime', 'realistic', 'illustration'] }
      }
    },
    kling: {
      kinds: ['storyboard', 'asset'],
      resolutions: ['1K', '2K', '4K'],
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      providerOptions: {
        seed: { type: 'number', integer: true, min: 0, max: 2147483647 },
        negativePrompt: { type: 'string', maxLength: 500 },
        cfgScale: { type: 'number', min: 1, max: 30 },
        style: { type: 'string', enum: ['cinematic', 'anime', 'realistic', 'illustration'] }
      }
    },
    vidu: {
      kinds: ['storyboard', 'asset'],
      resolutions: ['1K', '2K', '4K'],
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      providerOptions: {
        seed: { type: 'number', integer: true, min: 0, max: 2147483647 },
        negativePrompt: { type: 'string', maxLength: 500 },
        style: { type: 'string', enum: ['cinematic', 'anime', 'realistic', 'illustration'] },
        refStrength: { type: 'number', min: 0, max: 1 }
      }
    },
    wan: {
      kinds: ['storyboard', 'asset'],
      resolutions: ['1K', '2K', '4K'],
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      providerOptions: {
        seed: { type: 'number', integer: true, min: 0, max: 2147483647 },
        negativePrompt: { type: 'string', maxLength: 500 },
        style: { type: 'string', enum: ['cinematic', 'anime', 'realistic', 'illustration'] },
        watermark: { type: 'boolean' }
      }
    },
    runninghub: {
      kinds: ['storyboard', 'asset'],
      resolutions: ['1K', '2K'],
      aspectRatios: ['1:1', '16:9', '9:16']
    },
    apimart: {
      kinds: ['storyboard', 'asset'],
      resolutions: ['1K', '2K'],
      aspectRatios: ['1:1', '3:2', '2:3']
    },
    gemini: {
      kinds: ['storyboard', 'asset'],
      resolutions: ['1K', '2K'],
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4']
    },
    other: {
      kinds: ['storyboard', 'asset'],
      resolutions: ['1K', '2K', '4K'],
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4']
    }
  },
  audio: {
    volcengine: {
      voices: ['male_1', 'female_1', 'female_2'],
      speeds: [0.8, 1, 1.2],
      emotions: ['neutral', 'happy', 'sad'],
      formats: ['mp3', 'wav'],
      providerOptions: {
        language: { type: 'string', enum: ['zh', 'en'] },
        style: { type: 'string', enum: ['narration', 'conversational'] },
        temperature: { type: 'number', min: 0, max: 2 },
        topP: { type: 'number', min: 0, max: 1 },
        sampleRate: { type: 'number', integer: true, enum: [16000, 22050, 24000, 44100, 48000] }
      }
    },
    kling: {
      voices: ['narrator_m', 'narrator_f'],
      speeds: [0.9, 1, 1.1],
      emotions: ['neutral', 'excited'],
      formats: ['mp3'],
      providerOptions: {
        language: { type: 'string', enum: ['zh', 'en'] },
        style: { type: 'string', enum: ['narration', 'conversational'] },
        temperature: { type: 'number', min: 0, max: 2 },
        topP: { type: 'number', min: 0, max: 1 },
        sampleRate: { type: 'number', integer: true, enum: [16000, 22050, 24000, 44100, 48000] }
      }
    },
    vidu: {
      voices: ['standard_m', 'standard_f'],
      speeds: [0.75, 1, 1.25],
      emotions: ['neutral', 'calm', 'energetic'],
      formats: ['mp3', 'wav', 'aac'],
      providerOptions: {
        language: { type: 'string', enum: ['zh', 'en'] },
        style: { type: 'string', enum: ['narration', 'conversational'] },
        temperature: { type: 'number', min: 0, max: 2 },
        topP: { type: 'number', min: 0, max: 1 },
        sampleRate: { type: 'number', integer: true, enum: [16000, 22050, 24000, 44100, 48000] }
      }
    },
    'dashscope-cosyvoice': {
      voices: ['longanyang'],
      speeds: [0.5, 0.8, 1, 1.2, 1.5, 2],
      emotions: ['neutral'],
      formats: ['mp3', 'wav', 'pcm', 'opus'],
      providerOptions: {
        language: { type: 'string', enum: ['zh', 'en'] },
        style: { type: 'string', enum: ['narration', 'conversational', 'storytelling'] },
        temperature: { type: 'number', min: 0, max: 2 },
        topP: { type: 'number', min: 0, max: 1 },
        sampleRate: { type: 'number', integer: true, enum: [16000, 22050, 24000, 44100, 48000] },
        bitrateKbps: { type: 'number', integer: true, enum: [64, 96, 128, 192, 256, 320] },
        channels: { type: 'number', integer: true, enum: [1, 2] },
        volume: { type: 'number', min: 0, max: 100 },
        pitch: { type: 'number', min: 0.5, max: 2 }
      }
    },
    wan: {
      voices: ['longanyang'],
      speeds: [0.5, 0.8, 1, 1.2, 1.5, 2],
      emotions: ['neutral'],
      formats: ['mp3', 'wav', 'pcm', 'opus'],
      providerOptions: {
        language: { type: 'string', enum: ['zh', 'en'] },
        style: { type: 'string', enum: ['narration', 'conversational', 'storytelling'] },
        temperature: { type: 'number', min: 0, max: 2 },
        topP: { type: 'number', min: 0, max: 1 },
        sampleRate: { type: 'number', integer: true, enum: [16000, 22050, 24000, 44100, 48000] },
        bitrateKbps: { type: 'number', integer: true, enum: [64, 96, 128, 192, 256, 320] },
        channels: { type: 'number', integer: true, enum: [1, 2] },
        volume: { type: 'number', min: 0, max: 100 },
        pitch: { type: 'number', min: 0.5, max: 2 }
      }
    },
    runninghub: {
      voices: ['voice_a', 'voice_b'],
      speeds: [1],
      emotions: ['neutral'],
      formats: ['mp3'],
      providerOptions: {
        language: { type: 'string', enum: ['zh', 'en'] },
        style: { type: 'string', enum: ['narration', 'conversational'] },
        sampleRate: { type: 'number', integer: true, enum: [16000, 22050, 24000, 44100, 48000] },
        volume: { type: 'number', min: 0, max: 2 }
      }
    },
    apimart: {
      voices: ['alloy'],
      speeds: [0.8, 1, 1.2],
      emotions: ['neutral', 'happy'],
      formats: ['mp3', 'wav', 'opus'],
      providerOptions: {
        language: { type: 'string', enum: ['zh', 'en'] },
        style: { type: 'string', enum: ['narration', 'conversational'] },
        temperature: { type: 'number', min: 0, max: 2 },
        topP: { type: 'number', min: 0, max: 1 },
        sampleRate: { type: 'number', integer: true, enum: [16000, 22050, 24000, 44100, 48000] }
      }
    },
    gemini: {
      voices: ['alloy', 'verse'],
      speeds: [0.8, 1, 1.2],
      emotions: ['neutral', 'warm'],
      formats: ['mp3', 'wav', 'ogg'],
      providerOptions: {
        language: { type: 'string', enum: ['zh', 'en'] },
        style: { type: 'string', enum: ['narration', 'conversational'] },
        temperature: { type: 'number', min: 0, max: 2 },
        topP: { type: 'number', min: 0, max: 1 }
      }
    },
    other: {
      voices: ['default'],
      speeds: [1],
      emotions: ['neutral'],
      formats: ['mp3']
    }
  }
} as const;
