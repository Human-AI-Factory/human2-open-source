import { ProviderTextInput } from '../../types.js';
import { ProviderValidationError } from '../../errors.js';

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
};

const readTextFromContentPart = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (!Array.isArray(value)) {
    return '';
  }
  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      const rec = asRecord(item);
      if (!rec) {
        return '';
      }
      if (typeof rec.text === 'string') {
        return rec.text;
      }
      if (typeof rec.output_text === 'string') {
        return rec.output_text;
      }
      return '';
    })
    .filter((item) => item.length > 0)
    .join('\n');
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const shouldDisableModelScopeThinking = (endpoint: string | undefined): boolean => {
  if (!endpoint?.trim()) {
    return false;
  }
  try {
    const url = new URL(endpoint);
    return url.hostname === 'api-inference.modelscope.cn';
  } catch {
    return endpoint.includes('api-inference.modelscope.cn');
  }
};

const shouldForceNonStreaming = (endpoint: string | undefined): boolean => {
  if (!endpoint?.trim()) {
    return false;
  }
  try {
    const url = new URL(endpoint);
    return url.hostname === 'api.apimart.ai';
  } catch {
    return endpoint.includes('api.apimart.ai');
  }
};

export const buildOpenAiChatPayload = (
  input: ProviderTextInput,
  options: {
    endpoint?: string;
  } = {}
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    model: input.modelConfig?.model || input.model,
    messages: [{ role: 'user', content: input.prompt }]
  };

  if (isRecord(input.providerOptions)) {
    Object.assign(payload, input.providerOptions);
  }

  if (shouldDisableModelScopeThinking(options.endpoint) && payload.enable_thinking === undefined) {
    payload.enable_thinking = false;
  }

  if (shouldForceNonStreaming(options.endpoint) && payload.stream === undefined) {
    payload.stream = false;
  }

  return payload;
};

export const parseOpenAiTextResponse = (raw: unknown): string | null => {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  if (typeof record.text === 'string' && record.text.trim()) {
    return record.text;
  }
  if (typeof record.output_text === 'string' && record.output_text.trim()) {
    return record.output_text;
  }
  const choices = Array.isArray(record.choices) ? record.choices : [];
  for (const choice of choices) {
    const choiceRecord = asRecord(choice);
    if (!choiceRecord) {
      continue;
    }
    const message = asRecord(choiceRecord.message);
    if (message) {
      const content = readTextFromContentPart(message.content);
      if (content.trim()) {
        return content;
      }
    }
    const text = readTextFromContentPart(choiceRecord.text);
    if (text.trim()) {
      return text;
    }
  }
  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    const itemRecord = asRecord(item);
    if (!itemRecord) {
      continue;
    }
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];
    for (const contentItem of content) {
      const contentRecord = asRecord(contentItem);
      const text = contentRecord ? readTextFromContentPart(contentRecord.text) : '';
      if (text.trim()) {
        return text;
      }
    }
  }
  return null;
};

export const buildGeminiTextPayload = (input: ProviderTextInput): Record<string, unknown> => ({
  contents: [
    {
      role: 'user',
      parts: [{ text: input.prompt }]
    }
  ]
});

export const parseGeminiTextResponse = (raw: unknown): string | null => {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  for (const candidate of candidates) {
    const candidateRecord = asRecord(candidate);
    const content = asRecord(candidateRecord?.content);
    const parts = Array.isArray(content?.parts) ? content?.parts : [];
    const text = parts
      .map((part) => {
        const partRecord = asRecord(part);
        return typeof partRecord?.text === 'string' ? partRecord.text : '';
      })
      .filter((item) => item.length > 0)
      .join('\n');
    if (text.trim()) {
      return text;
    }
  }
  return null;
};

export const requireTextResponse = (text: string | null, manufacturer: string): string => {
  if (!text || !text.trim()) {
    throw new ProviderValidationError(`${manufacturer} text response missing text`);
  }
  return text.trim();
};
