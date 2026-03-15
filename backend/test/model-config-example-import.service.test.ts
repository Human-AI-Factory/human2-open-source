import test from 'node:test';
import assert from 'node:assert/strict';
import { importModelDraftFromExample } from '../src/modules/settings/model-config-example-import.js';

test('example importer should parse APIMart audio speech curl examples into audio model drafts', () => {
  const draft = importModelDraftFromExample({
    example: `curl --request POST \\
  --url https://api.apimart.ai/v1/audio/speech \\
  --header 'Authorization: Bearer sk-demo-token' \\
  --header 'Content-Type: application/json' \\
  --data '{
    "model": "gpt-4o-mini-tts",
    "input": "hello world",
    "voice": "alloy",
    "response_format": "opus",
    "speed": 1.0
  }'`,
  });

  assert.equal(draft.source, 'curl');
  assert.equal(draft.type, 'audio');
  assert.equal(draft.provider, 'http');
  assert.equal(draft.manufacturer, 'apimart');
  assert.equal(draft.model, 'gpt-4o-mini-tts');
  assert.equal(draft.authType, 'bearer');
  assert.equal(draft.apiKey, 'sk-demo-token');
  assert.equal(draft.endpoint, 'https://api.apimart.ai/v1/audio/speech');
  assert.deepEqual(draft.endpoints, {
    submit: 'https://api.apimart.ai/v1/audio/speech',
  });
});

test('example importer should parse requests chat examples into text model drafts', () => {
  const draft = importModelDraftFromExample({
    example: `import requests

url = "https://api.apimart.ai/v1/chat/completions"

payload = {
    "model": "gpt-4o",
    "messages": [
      {
        "role": "system",
        "content": "You are a professional AI assistant."
      }
    ]
}

headers = {
    "Authorization": "Bearer sk-live-token",
    "Content-Type": "application/json"
}

response = requests.post(url, json=payload, headers=headers)`,
  });

  assert.equal(draft.source, 'python_requests');
  assert.equal(draft.type, 'text');
  assert.equal(draft.manufacturer, 'apimart');
  assert.equal(draft.model, 'gpt-4o');
  assert.equal(draft.authType, 'bearer');
  assert.equal(draft.apiKey, 'sk-live-token');
  assert.equal(draft.endpoint, 'https://api.apimart.ai/v1/chat/completions');
});

test('example importer should parse DashScope OpenAI SDK examples into text model drafts', () => {
  const draft = importModelDraftFromExample({
    example: `import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)

completion = client.chat.completions.create(
    model="qwen-plus",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "你是谁？"},
    ]
)

# 单独附带真实 token
api token: sk-dashscope-live-token`,
  });

  assert.equal(draft.source, 'python_openai_sdk');
  assert.equal(draft.type, 'text');
  assert.equal(draft.manufacturer, 'openai-compatible');
  assert.equal(draft.model, 'qwen-plus');
  assert.equal(draft.authType, 'bearer');
  assert.equal(draft.apiKey, 'sk-dashscope-live-token');
  assert.equal(draft.endpoint, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
});

test('example importer should parse DashScope image curl examples into wan image model drafts', () => {
  const draft = importModelDraftFromExample({
    example: `curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \\
--header 'Content-Type: application/json' \\
--header 'Authorization: Bearer sk-dashscope-image-token' \\
--data '{
    "model": "qwen-image-2.0-pro",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "text": "一副古典中式厅堂"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "size": "1024*1024"
    }
}'`,
  });

  assert.equal(draft.source, 'curl');
  assert.equal(draft.type, 'image');
  assert.equal(draft.manufacturer, 'wan');
  assert.equal(draft.model, 'qwen-image-2.0-pro');
  assert.equal(draft.authType, 'bearer');
  assert.equal(draft.apiKey, 'sk-dashscope-image-token');
  assert.equal(draft.endpoint, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
  assert.deepEqual(draft.endpoints, {
    submit: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    query: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}',
  });
});

test('example importer should tolerate wrapped line breaks inside curl JSON string payloads', () => {
  const draft = importModelDraftFromExample({
    example: `curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \\
--header 'Content-Type: application/json' \\
--header 'Authorization: Bearer sk-dashscope-image-token' \\
--data '{
  "model": "qwen-image-2.0-pro",
  "input": {
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "text": "一副典雅庄重的对联悬挂于厅堂之中，房间是个安静古
典的中式布置，桌子上放着一些青花瓷。"
          }
        ]
      }
    ]
  },
  "parameters": {
    "negative_prompt": "低分辨率，低画质，肢体畸形，手指畸形，画面过饱
和。",
    "watermark": false,
    "size": "1024*1024"
  }
}'`,
  });

  assert.equal(draft.type, 'image');
  assert.equal(draft.manufacturer, 'wan');
  assert.equal(draft.model, 'qwen-image-2.0-pro');
  assert.equal(draft.apiKey, 'sk-dashscope-image-token');
  assert.equal(draft.endpoint, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
});

test('example importer should parse DashScope video curl examples into wan video model drafts', () => {
  const draft = importModelDraftFromExample({
    example: `curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \\
    -H 'X-DashScope-Async: enable' \\
    -H "Authorization: Bearer sk-dashscope-video-token" \\
    -H 'Content-Type: application/json' \\
    -d '{
    "model": "wanx2.1-i2v-turbo",
    "input": {
        "img_url": "https://cdn.translate.alibaba.com/r/wanx-demo-1.png",
        "template": "flying"
    },
    "parameters": {
        "resolution": "720P"
    }
}'`,
  });

  assert.equal(draft.source, 'curl');
  assert.equal(draft.type, 'video');
  assert.equal(draft.manufacturer, 'wan');
  assert.equal(draft.model, 'wanx2.1-i2v-turbo');
  assert.equal(draft.authType, 'bearer');
  assert.equal(draft.apiKey, 'sk-dashscope-video-token');
  assert.equal(draft.endpoint, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis');
  assert.deepEqual(draft.endpoints, {
    submit: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
    query: 'https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}',
  });
});

test('example importer should parse DashScope realtime TTS requests examples into dashscope-cosyvoice audio model drafts', () => {
  const draft = importModelDraftFromExample({
    example: `import requests

url = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/realtimesynthesizer"
headers = {
    "Authorization": "Bearer sk-dashscope-audio-token",
    "Content-Type": "application/json"
}
payload = {
    "model": "cosyvoice-v3-flash",
    "input": {
        "text": "今天天气怎么样？"
    },
    "parameters": {
        "voice": "longanyang",
        "format": "mp3",
        "sample_rate": 22050,
        "volume": 50,
        "speech_rate": 1.0,
        "pitch_rate": 1.0
    }
}

response = requests.post(url, headers=headers, json=payload)`,
  });

  assert.equal(draft.source, 'python_requests');
  assert.equal(draft.type, 'audio');
  assert.equal(draft.manufacturer, 'dashscope-cosyvoice');
  assert.equal(draft.model, 'cosyvoice-v3-flash');
  assert.equal(draft.authType, 'bearer');
  assert.equal(draft.apiKey, 'sk-dashscope-audio-token');
  assert.equal(draft.endpoint, 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/realtimesynthesizer');
  assert.deepEqual(draft.endpoints, {
    submit: 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/realtimesynthesizer',
  });
});
