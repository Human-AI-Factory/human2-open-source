import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpAiProvider } from '../src/modules/pipeline/providers/http.provider.js';
import { ProviderValidationError } from '../src/modules/pipeline/providers/errors.js';
import { setDashscopeCosyvoiceSocketFactoryForTests } from '../src/modules/pipeline/providers/vendors/audio/dashscope-cosyvoice.adapter.js';

test('http provider should call openai-compatible text endpoint from model config', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: 'atlas reply'
            }
          }
        ]
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }) as typeof fetch;

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    const result = await provider.generateText({
      prompt: 'hello atlas',
      projectId: 'p-1',
      model: 'ignored-by-model-config',
      modelConfig: {
        provider: 'http',
        manufacturer: 'atlascloud',
        model: 'deepseek-ai/deepseek-v3.2-speciale',
        authType: 'bearer',
        endpoint: 'https://api.atlascloud.ai/v1/chat/completions',
        endpoints: {},
        apiKey: 'atlas-key',
        capabilities: {}
      }
    });

    assert.equal(result.text, 'atlas reply');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, 'https://api.atlascloud.ai/v1/chat/completions');
    assert.equal((calls[0]?.init?.headers as Record<string, string>)?.Authorization, 'Bearer atlas-key');

    const payload = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(payload.model, 'deepseek-ai/deepseek-v3.2-speciale');
    assert.deepEqual(payload.messages, [{ role: 'user', content: 'hello atlas' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('http provider should disable thinking for ModelScope openai-compatible text calls by default', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: 'modelscope reply'
            }
          }
        ]
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }) as typeof fetch;

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    const result = await provider.generateText({
      prompt: 'hello modelscope',
      projectId: 'p-2',
      modelConfig: {
        provider: 'http',
        manufacturer: 'openai-compatible',
        model: 'Qwen/Qwen3-8B',
        authType: 'bearer',
        endpoint: 'https://api-inference.modelscope.cn/v1/chat/completions',
        endpoints: {},
        apiKey: 'ms-token',
        capabilities: {}
      }
    });

    assert.equal(result.text, 'modelscope reply');
    assert.equal(calls.length, 1);
    const payload = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(payload.enable_thinking, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('http provider should force non-streaming payload for APIMart text calls by default', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: 'Connected'
            }
          }
        ]
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }) as typeof fetch;

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    const result = await provider.generateText({
      prompt: 'reply connected',
      projectId: 'p-apimart',
      modelConfig: {
        provider: 'http',
        manufacturer: 'apimart',
        model: 'gpt-4o',
        authType: 'bearer',
        endpoint: 'https://api.apimart.ai/v1/chat/completions',
        endpoints: {},
        apiKey: 'apimart-key',
        capabilities: {}
      }
    });

    assert.equal(result.text, 'Connected');
    assert.equal(calls.length, 1);
    const payload = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(payload.stream, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('http provider should submit APIMart audio speech payload and read binary audio responses', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(Buffer.from('apimart-audio-binary'), {
      status: 200,
      headers: { 'Content-Type': 'audio/ogg' }
    });
  }) as typeof fetch;

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    const result = await provider.generateAudio({
      prompt: '今夜风很轻',
      projectId: 'p-audio',
      storyboardId: 'sb-audio',
      voice: 'alloy',
      speed: 1,
      format: 'opus',
      modelConfig: {
        provider: 'http',
        manufacturer: 'apimart',
        model: 'gpt-4o-mini-tts',
        authType: 'bearer',
        endpoint: 'https://api.apimart.ai/v1/audio/speech',
        endpoints: {},
        apiKey: 'apimart-audio-key',
        capabilities: {}
      }
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, 'https://api.apimart.ai/v1/audio/speech');
    assert.equal((calls[0]?.init?.headers as Record<string, string>)?.Authorization, 'Bearer apimart-audio-key');
    const payload = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(payload.model, 'gpt-4o-mini-tts');
    assert.equal(payload.input, '今夜风很轻');
    assert.equal(payload.voice, 'alloy');
    assert.equal(payload.response_format, 'opus');
    assert.equal(payload.speed, 1);
    assert.equal('prompt' in payload, false);
    assert.equal('format' in payload, false);
    assert.match(result.url, /^data:audio\/ogg;base64,/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('http provider should submit DashScope realtime TTS messages over websocket and read binary audio responses', async () => {
  const events: Array<{ type: string; payload?: string; headers?: Record<string, string>; url?: string }> = [];

  class FakeSocket {
    private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

    constructor(url: string, init: { headers: Record<string, string> }) {
      events.push({ type: 'connect', url, headers: init.headers });
      queueMicrotask(() => this.emit('open'));
    }

    on(event: string, listener: (...args: unknown[]) => void): void {
      const existing = this.listeners.get(event) ?? [];
      existing.push(listener);
      this.listeners.set(event, existing);
    }

    send(payload: string): void {
      events.push({ type: 'send', payload });
      const parsed = JSON.parse(payload) as { header?: { action?: string; task_id?: string } };
      const action = parsed.header?.action;
      const taskId = parsed.header?.task_id ?? 'task-1';
      if (action === 'run-task') {
        queueMicrotask(() =>
          this.emit(
            'message',
            Buffer.from(JSON.stringify({ header: { event: 'task-started', task_id: taskId } }), 'utf8'),
            false
          )
        );
      }
      if (action === 'finish-task') {
        queueMicrotask(() => this.emit('message', Buffer.from('dashscope-audio-binary'), true));
        queueMicrotask(() =>
          this.emit(
            'message',
            Buffer.from(JSON.stringify({ header: { event: 'task-finished', task_id: taskId } }), 'utf8'),
            false
          )
        );
        queueMicrotask(() => this.emit('close', 1000, Buffer.from('')));
      }
    }

    close(): void {
      events.push({ type: 'close-call' });
    }

    terminate(): void {
      events.push({ type: 'terminate-call' });
    }

    private emit(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(...args);
      }
    }
  }

  setDashscopeCosyvoiceSocketFactoryForTests((url, init) => new FakeSocket(url, init));

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    const result = await provider.generateAudio({
      prompt: '今天天气怎么样？',
      projectId: 'p-ds-audio',
      storyboardId: 'sb-ds-audio',
      voice: 'longanyang',
      speed: 1,
      format: 'mp3',
      providerOptions: {
        'dashscope-cosyvoice': {
          sampleRate: 22050,
          volume: 50,
          pitch: 1,
        },
      },
      modelConfig: {
        provider: 'http',
        manufacturer: 'dashscope-cosyvoice',
        model: 'cosyvoice-v3-flash',
        authType: 'bearer',
        endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/realtimesynthesizer',
        endpoints: {},
        apiKey: 'dashscope-audio-key',
        capabilities: {}
      }
    });

    const connectEvent = events.find((item) => item.type === 'connect');
    assert.equal(connectEvent?.url, 'wss://dashscope.aliyuncs.com/api-ws/v1/inference');
    assert.equal(connectEvent?.headers?.Authorization, 'Bearer dashscope-audio-key');

    const sendEvents = events.filter((item) => item.type === 'send').map((item) => JSON.parse(String(item.payload)));
    assert.equal(sendEvents.length, 3);
    assert.equal(sendEvents[0]?.header?.action, 'run-task');
    assert.equal(sendEvents[0]?.header?.streaming, 'duplex');
    assert.equal(sendEvents[0]?.payload?.model, 'cosyvoice-v3-flash');
    assert.deepEqual(sendEvents[0]?.payload?.input, {});
    assert.deepEqual(sendEvents[0]?.payload?.parameters, {
      text_type: 'PlainText',
      voice: 'longanyang',
      format: 'mp3',
      sample_rate: 22050,
      volume: 50,
      rate: 1,
      pitch: 1,
    });
    assert.equal(sendEvents[1]?.header?.action, 'continue-task');
    assert.equal(sendEvents[1]?.header?.streaming, 'duplex');
    assert.deepEqual(sendEvents[1]?.payload, { input: { text: '今天天气怎么样？' } });
    assert.equal(sendEvents[2]?.header?.action, 'finish-task');
    assert.equal(sendEvents[2]?.header?.streaming, 'duplex');
    assert.match(result.url, /^data:audio\/wav;base64,/);
  } finally {
    setDashscopeCosyvoiceSocketFactoryForTests(null);
  }
});

test('http provider should submit and resolve ModelScope image tasks', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let callCount = 0;

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    callCount += 1;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          task_status: 'RUNNING',
          task_id: '5759383'
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    return new Response(
      JSON.stringify({
        task_status: 'SUCCEED',
        output_images: ['https://modelscope.example/image.png']
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }) as typeof fetch;

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    const result = await provider.generateImage({
      prompt: 'apple',
      kind: 'storyboard',
      projectId: 'p-image',
      modelConfig: {
        provider: 'http',
        manufacturer: 'modelscope',
        model: 'MAILAND/majicflus_v1',
        authType: 'bearer',
        endpoint: 'https://api-inference.modelscope.cn/v1/images/generations',
        endpoints: {},
        apiKey: 'ms-token',
        capabilities: {}
      }
    });

    assert.equal(result.url, 'https://modelscope.example/image.png');
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.url, 'https://api-inference.modelscope.cn/v1/images/generations');
    assert.equal((calls[0]?.init?.headers as Record<string, string>)?.['X-ModelScope-Async-Mode'], 'true');
    const submitPayload = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(submitPayload.size, '1024x1024');
    assert.equal(calls[1]?.url, 'https://api-inference.modelscope.cn/v1/tasks/5759383');
    assert.equal((calls[1]?.init?.headers as Record<string, string>)?.['X-ModelScope-Task-Type'], 'image_generation');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('http provider should reject placeholder or non-ascii bearer api keys before image submission', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;

  globalThis.fetch = (async () => {
    called = true;
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    await assert.rejects(
      () =>
        provider.generateImage({
          prompt: '一只绵羊站在草原上',
          kind: 'asset',
          projectId: 'p-dashscope-image-invalid-token',
          modelConfig: {
            provider: 'http',
            manufacturer: 'wan',
            model: 'qwen-image-2.0-pro',
            authType: 'bearer',
            endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
            endpoints: {
              submit: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
              query: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}'
            },
            apiKey: 'sk-你的真实token',
            capabilities: {}
          }
        }),
      (error) => {
        assert.ok(error instanceof ProviderValidationError);
        assert.match(String(error.message), /placeholder or non-ASCII/i);
        return true;
      }
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('http provider should submit DashScope multimodal image payload with messages content', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let callCount = 0;

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    callCount += 1;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          output: {
            task_id: 'dashscope-image-task-1'
          }
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    return new Response(
      JSON.stringify({
        output: {
          task_status: 'SUCCEEDED',
          results: [{ url: 'https://dashscope.example/image.png' }]
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }) as typeof fetch;

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    const result = await provider.generateImage({
      prompt: '一副典雅庄重的对联悬挂于厅堂之中',
      kind: 'storyboard',
      projectId: 'p-dashscope-image',
      resolution: '1K',
      aspectRatio: '1:1',
      providerOptions: {
        wan: {
          negativePrompt: '低分辨率',
          promptExtend: true,
          watermark: false
        }
      },
      modelConfig: {
        provider: 'http',
        manufacturer: 'wan',
        model: 'qwen-image-2.0-pro',
        authType: 'bearer',
        endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        endpoints: {
          submit: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
          query: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}'
        },
        apiKey: 'dashscope-image-key',
        capabilities: {}
      }
    });

    assert.equal(result.url, 'https://dashscope.example/image.png');
    assert.equal(calls.length, 2);
    assert.equal(
      ((calls[0]?.init?.headers as Record<string, string>) ?? {})['X-DashScope-Async'],
      undefined
    );
    const submitPayload = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(submitPayload.model, 'qwen-image-2.0-pro');
    assert.deepEqual(submitPayload.input, {
      messages: [
        {
          role: 'user',
          content: [{ text: '一副典雅庄重的对联悬挂于厅堂之中' }]
        }
      ]
    });
    assert.deepEqual(submitPayload.parameters, {
      negative_prompt: '低分辨率',
      prompt_extend: true,
      watermark: false,
      size: '1024*1024'
    });
    assert.equal(calls[1]?.url, 'https://dashscope.aliyuncs.com/api/v1/tasks/dashscope-image-task-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('http provider should accept direct DashScope multimodal image results without async polling', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        output: {
          results: [{ url: 'https://dashscope.example/direct-image.png' }]
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }) as typeof fetch;

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    const result = await provider.generateImage({
      prompt: '草原上的清晨放羊场景',
      kind: 'asset',
      projectId: 'p-dashscope-image-direct',
      modelConfig: {
        provider: 'http',
        manufacturer: 'wan',
        model: 'qwen-image-2.0-pro',
        authType: 'bearer',
        endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        endpoints: {
          submit: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
          query: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}'
        },
        apiKey: 'dashscope-image-key',
        capabilities: {}
      }
    });

    assert.equal(result.url, 'https://dashscope.example/direct-image.png');
    assert.equal(calls.length, 1);
    assert.equal(
      ((calls[0]?.init?.headers as Record<string, string>) ?? {})['X-DashScope-Async'],
      undefined
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('http provider should accept direct DashScope multimodal image choices payload without async polling', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        output: {
          choices: [
            {
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: [
                  {
                    image: 'https://dashscope.example/direct-choice-image.png'
                  }
                ]
              }
            }
          ]
        },
        request_id: 'wan-choice-response'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }) as typeof fetch;

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    const result = await provider.generateImage({
      prompt: '草原上的清晨放羊场景',
      kind: 'asset',
      projectId: 'p-dashscope-image-direct-choice',
      modelConfig: {
        provider: 'http',
        manufacturer: 'wan',
        model: 'qwen-image-2.0-pro',
        authType: 'bearer',
        endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        endpoints: {
          submit: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
          query: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}'
        },
        apiKey: 'dashscope-image-key',
        capabilities: {}
      }
    });

    assert.equal(result.url, 'https://dashscope.example/direct-choice-image.png');
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('http provider should submit and resolve ModelScope video tasks', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let callCount = 0;

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    callCount += 1;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          status: 'SUCCESS',
          task_id: 'video-task-1'
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    return new Response(
      JSON.stringify({
        task_status: 'SUCCEED',
        output_video_url: 'https://modelscope.example/video.mp4'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }) as typeof fetch;

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    const result = await provider.generateVideo({
      prompt: 'ocean waves',
      projectId: 'p-video',
      storyboardId: 'sb-1',
      modelConfig: {
        provider: 'http',
        manufacturer: 'modelscope',
        model: 'Wan-AI/Wan2.1-T2V-1.3B',
        authType: 'bearer',
        endpoint: 'https://api-inference.modelscope.cn/v1/videos/generations',
        endpoints: {},
        apiKey: 'ms-token',
        capabilities: {}
      }
    });

    assert.equal(result.url, 'https://modelscope.example/video.mp4');
    assert.equal(result.providerTaskId, 'video-task-1');
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.url, 'https://api-inference.modelscope.cn/v1/videos/generations');
    assert.equal((calls[0]?.init?.headers as Record<string, string>)?.['X-ModelScope-Async-Mode'], 'true');
    assert.equal((calls[0]?.init?.headers as Record<string, string>)?.['X-ModelScope-DataInspection'], '{}');
    assert.equal(calls[1]?.url, 'https://api-inference.modelscope.cn/v1/tasks/video-task-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('http provider should submit APIMart video tasks with reference images', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let callCount = 0;

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    callCount += 1;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          code: 200,
          data: [{ task_id: 'apimart-video-task-1' }]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    return new Response(
      JSON.stringify({
        code: 200,
        data: {
          status: 'completed',
          result: {
            videos: [{ url: 'https://apimart.example/video.mp4' }]
          }
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }) as typeof fetch;

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    const result = await provider.generateVideo({
      prompt: 'cinematic night scene',
      projectId: 'p-apimart-video',
      storyboardId: 'sb-apimart-video',
      imageInputs: [
        'https://cdn.example/storyboard.png',
        'https://cdn.example/scene-asset.png'
      ],
      imageWithRoles: [
        { url: 'https://cdn.example/storyboard.png', role: 'first_frame' },
        { url: 'https://cdn.example/scene-asset.png', role: 'reference' }
      ],
      modelConfig: {
        provider: 'http',
        manufacturer: 'apimart',
        model: 'doubao-seedance-1-0-pro-fast',
        authType: 'bearer',
        endpoint: 'https://api.apimart.ai/v1/videos/generations',
        endpoints: {
          submit: 'https://api.apimart.ai/v1/videos/generations',
          query: 'https://api.apimart.ai/v1/tasks/{taskId}'
        },
        apiKey: 'apimart-key',
        capabilities: {}
      }
    });

    assert.equal(result.url, 'https://apimart.example/video.mp4');
    assert.equal(result.providerTaskId, 'apimart-video-task-1');
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.url, 'https://api.apimart.ai/v1/videos/generations');
    assert.equal((calls[0]?.init?.headers as Record<string, string>)?.Authorization, 'Bearer apimart-key');

    const submitPayload = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.deepEqual(submitPayload.image_urls, [
      'https://cdn.example/storyboard.png',
      'https://cdn.example/scene-asset.png'
    ]);
    assert.deepEqual(submitPayload.image_with_roles, [
      { image_url: 'https://cdn.example/storyboard.png', role: 'first_frame' },
      { image_url: 'https://cdn.example/scene-asset.png', role: 'reference' }
    ]);
    assert.equal(calls[1]?.url, 'https://api.apimart.ai/v1/tasks/apimart-video-task-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('http provider should surface DashScope wan video task failure details and use extended timeout floor', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let callCount = 0;

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    callCount += 1;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          output: { task_id: 'wan-video-task-1' }
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    return new Response(
      JSON.stringify({
        output: {
          task_status: 'FAILED',
          message: 'video safety review blocked by provider'
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }) as typeof fetch;

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    await assert.rejects(
      () =>
        provider.generateVideo({
          prompt: 'snow storm on the grassland',
          projectId: 'p-wan-video',
          storyboardId: 'sb-wan-video',
          modelConfig: {
            provider: 'http',
            manufacturer: 'wan',
            model: 'wanx2.1-i2v-turbo',
            authType: 'bearer',
            endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
            endpoints: {
              submit: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
              query: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}'
            },
            apiKey: 'wan-video-key',
            capabilities: {}
          }
        }),
      /video safety review blocked by provider/
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[1]?.url, 'https://dashscope.aliyuncs.com/api/v1/tasks/wan-video-task-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('http provider should submit DashScope wan image-to-video payload with img_url from reference inputs', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let callCount = 0;
  const acceptedTaskIds: string[] = [];

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    callCount += 1;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          output: { task_id: 'wan-i2v-task-1' }
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    return new Response(
      JSON.stringify({
        output: {
          task_status: 'SUCCEEDED',
          video_url: 'https://dashscope.example/wan-video.mp4'
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }) as typeof fetch;

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    const result = await provider.generateVideo({
      prompt: 'ignored by i2v payload',
      projectId: 'p-wan-i2v',
      storyboardId: 'sb-wan-i2v',
      mode: 'singleImage',
      imageInputs: ['https://cdn.example/storyboard.png'],
      imageWithRoles: [{ url: 'https://cdn.example/storyboard.png', role: 'reference' }],
      onProviderTaskAccepted: async (taskId) => {
        acceptedTaskIds.push(taskId);
      },
      providerOptions: { wan: { template: 'flying' } },
      modelConfig: {
        provider: 'http',
        manufacturer: 'wan',
        model: 'wanx2.1-i2v-turbo',
        authType: 'bearer',
        endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
        endpoints: {
          submit: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
          query: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}'
        },
        apiKey: 'wan-video-key',
        capabilities: {}
      }
    });

    assert.equal(result.url, 'https://dashscope.example/wan-video.mp4');
    assert.equal(result.providerTaskId, 'wan-i2v-task-1');
    assert.equal(calls.length, 2);
    const submitPayload = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    assert.equal(submitPayload.model, 'wanx2.1-i2v-turbo');
    assert.deepEqual(submitPayload.input, {
      img_url: 'https://cdn.example/storyboard.png',
      template: 'flying'
    });
    assert.deepEqual(acceptedTaskIds, ['wan-i2v-task-1']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('http provider should resume DashScope wan video polling from an existing provider task id', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        output: {
          task_status: 'SUCCEEDED',
          video_url: 'https://dashscope.example/resumed-video.mp4'
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }) as typeof fetch;

  try {
    const provider = new HttpAiProvider('', '', '', '', 1000, 'Authorization', '', 0, 0);
    const result = await provider.generateVideo({
      prompt: 'resume existing wan task',
      projectId: 'p-wan-resume',
      storyboardId: 'sb-wan-resume',
      providerTaskId: 'wan-resume-task-1',
      modelConfig: {
        provider: 'http',
        manufacturer: 'wan',
        model: 'wanx2.1-i2v-turbo',
        authType: 'bearer',
        endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
        endpoints: {
          submit: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
          query: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}'
        },
        apiKey: 'wan-video-key',
        capabilities: {}
      }
    });

    assert.equal(result.url, 'https://dashscope.example/resumed-video.mp4');
    assert.equal(result.providerTaskId, 'wan-resume-task-1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, 'https://dashscope.aliyuncs.com/api/v1/tasks/wan-resume-task-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
