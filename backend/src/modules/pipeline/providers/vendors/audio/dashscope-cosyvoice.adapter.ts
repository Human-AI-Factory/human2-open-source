import { randomUUID } from 'node:crypto';
import WebSocket, { type RawData } from 'ws';
import { ProviderTransientError, ProviderValidationError } from '../../errors.js';
import type { VendorAudioAdapter, VendorAudioGenerateInput } from './types.js';
import { normalizeAuthHeader, sanitizeApiKey } from '../video/common.js';
import { readAudioProviderOptions } from './common.js';

type DashScopeCosyvoiceSocketLike = {
  on(event: 'open', listener: () => void): unknown;
  on(event: 'message', listener: (data: RawData, isBinary: boolean) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'close', listener: (code: number, reason: Buffer) => void): unknown;
  send(data: string): void;
  close(): void;
  terminate(): void;
};

type DashScopeCosyvoiceSocketFactory = (url: string, init: { headers: Record<string, string> }) => DashScopeCosyvoiceSocketLike;

let dashscopeCosyvoiceSocketFactory: DashScopeCosyvoiceSocketFactory = (url, init) =>
  new WebSocket(url, {
    headers: init.headers,
    perMessageDeflate: false,
  });

export const setDashscopeCosyvoiceSocketFactoryForTests = (factory: DashScopeCosyvoiceSocketFactory | null): void => {
  dashscopeCosyvoiceSocketFactory =
    factory ??
    ((url, init) =>
      new WebSocket(url, {
        headers: init.headers,
        perMessageDeflate: false,
      }));
};

const looksLikeMp3 = (buffer: Buffer): boolean => {
  if (buffer.length < 3) {
    return false;
  }
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3') {
    return true;
  }
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
};

const looksLikeWav = (buffer: Buffer): boolean =>
  buffer.length >= 12 &&
  buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
  buffer.subarray(8, 12).toString('ascii') === 'WAVE';

const looksLikeOgg = (buffer: Buffer): boolean =>
  buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'OggS';

const looksLikeAacAdts = (buffer: Buffer): boolean =>
  buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0;

const looksLikeMp4Audio = (buffer: Buffer): boolean =>
  buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';

const wrapPcm16MonoAsWav = (buffer: Buffer, sampleRate: number): Buffer => {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + buffer.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(buffer.length, 40);
  return Buffer.concat([header, buffer]);
};

const normalizeBinaryAudio = (
  buffer: Buffer,
  options: { format?: string; sampleRate?: number },
): { mimeType: string; buffer: Buffer } => {
  if (looksLikeWav(buffer)) {
    return { mimeType: 'audio/wav', buffer };
  }
  if (looksLikeOgg(buffer)) {
    return { mimeType: 'audio/ogg', buffer };
  }
  if (looksLikeMp3(buffer)) {
    return { mimeType: 'audio/mpeg', buffer };
  }
  if (looksLikeAacAdts(buffer)) {
    return { mimeType: 'audio/aac', buffer };
  }
  if (looksLikeMp4Audio(buffer)) {
    return { mimeType: 'audio/mp4', buffer };
  }
  const sampleRate =
    typeof options.sampleRate === 'number' && Number.isFinite(options.sampleRate) && options.sampleRate > 0
      ? Math.floor(options.sampleRate)
      : 22050;
  return {
    mimeType: 'audio/wav',
    buffer: wrapPcm16MonoAsWav(buffer, sampleRate),
  };
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const buildWebSocketUrl = (
  endpoint: string,
  providerOptions: Record<string, unknown>,
): string => {
  const direct = firstString(providerOptions.websocketUrl, providerOptions.wsUrl, providerOptions.baseWebsocketApiUrl);
  if (direct) {
    return direct;
  }
  if (endpoint.startsWith('wss://') || endpoint.startsWith('ws://')) {
    return endpoint;
  }
  try {
    const parsed = new URL(endpoint);
    const host = parsed.host.toLowerCase();
    if (host === 'dashscope-intl.aliyuncs.com') {
      return 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference';
    }
    return 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
  } catch {
    throw new ProviderValidationError('dashscope-cosyvoice websocket endpoint is invalid');
  }
};

const buildRunTaskMessage = (args: {
  taskId: string;
  model: string;
  voice?: string;
  format?: string;
  sampleRate?: number;
  volume?: number;
  speed?: number;
  pitch?: number;
}): string =>
  JSON.stringify({
    header: {
      action: 'run-task',
      task_id: args.taskId,
      streaming: 'duplex',
    },
    payload: {
      task_group: 'audio',
      task: 'tts',
      function: 'SpeechSynthesizer',
      model: args.model,
      input: {
      },
      parameters: {
        text_type: 'PlainText',
        ...(args.voice ? { voice: args.voice } : {}),
        ...(args.format ? { format: args.format } : {}),
        ...(args.sampleRate !== undefined ? { sample_rate: args.sampleRate } : {}),
        ...(args.volume !== undefined ? { volume: args.volume } : {}),
        ...(args.speed !== undefined ? { rate: args.speed } : {}),
        ...(args.pitch !== undefined ? { pitch: args.pitch } : {}),
      },
    },
  });

const buildContinueTaskMessage = (args: { taskId: string; text: string }): string =>
  JSON.stringify({
    header: {
      action: 'continue-task',
      task_id: args.taskId,
      streaming: 'duplex',
    },
    payload: {
      input: {
        text: args.text,
      },
    },
  });

const buildFinishTaskMessage = (taskId: string): string =>
  JSON.stringify({
    header: {
      action: 'finish-task',
      task_id: taskId,
      streaming: 'duplex',
    },
    payload: {
      input: {},
    },
  });

const parseSocketEvent = (raw: string): { event?: string; message?: string } => {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const header = asRecord(parsed.header);
    const payload = asRecord(parsed.payload);
    const output = asRecord(payload?.output);
    const event = firstString(header?.event, header?.action);
    const message = firstString(
      header?.error_message,
      header?.errorMessage,
      output?.message,
      output?.error_message,
      output?.errorMessage,
      payload?.message,
      parsed.message,
    );
    return { event, message };
  } catch {
    return {};
  }
};

const toReasonString = (reason: Buffer): string => {
  const text = reason.toString('utf8').trim();
  return text || 'socket closed';
};

const isNormalClosure = (code: number): boolean => code === 1000 || code === 1005;

const rawDataToBuffer = (data: RawData): Buffer => {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data.map((item) => Buffer.isBuffer(item) ? item : Buffer.from(item)));
  }
  return Buffer.from(data);
};

export const dashscopeCosyvoiceAudioAdapter: VendorAudioAdapter = {
  manufacturer: 'dashscope-cosyvoice',
  async generate(args: VendorAudioGenerateInput): Promise<{ url: string }> {
    const config = args.input.modelConfig;
    if (!config) {
      throw new ProviderValidationError('Missing model config for dashscope-cosyvoice audio');
    }

    const endpoint = config.endpoints.submit || config.endpoint || args.defaultEndpoint || '';
    if (!endpoint) {
      throw new ProviderValidationError('dashscope-cosyvoice audio endpoint is not configured');
    }

    const scoped = readAudioProviderOptions(args.input.providerOptions, 'dashscope-cosyvoice');
    const legacy = readAudioProviderOptions(args.input.providerOptions, 'wan');
    const socketOptions = {
      ...legacy,
      ...scoped,
    };
    const websocketUrl = buildWebSocketUrl(endpoint, socketOptions as Record<string, unknown>);
    const authHeaders = normalizeAuthHeader(config.authType, config.apiKey, args.defaultAuthHeader);
    if (config.authType !== 'none' && !Object.keys(authHeaders).length) {
      throw new ProviderValidationError('dashscope-cosyvoice audio api key is not configured');
    }
    if (config.authType === 'bearer' && config.apiKey.trim()) {
      sanitizeApiKey(config.apiKey);
    }

    const taskId = randomUUID();
    const model = config.model || args.input.model;
    if (!model) {
      throw new ProviderValidationError('dashscope-cosyvoice audio model is not configured');
    }

    return await new Promise<{ url: string }>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let completed = false;
      let settled = false;

      const socket = dashscopeCosyvoiceSocketFactory(websocketUrl, {
        headers: authHeaders,
      });

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        socket.terminate();
        reject(new ProviderTransientError('dashscope-cosyvoice websocket timed out'));
      }, Math.max(args.timeoutMs, 30_000));

      const cleanup = (): void => {
        clearTimeout(timer);
      };

      const fail = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        try {
          socket.close();
        } catch {
          // ignore close failure
        }
        reject(error);
      };

      const finish = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        try {
          socket.close();
        } catch {
          // ignore close failure
        }
        const buffer = Buffer.concat(chunks);
        if (!buffer.length) {
          reject(new ProviderValidationError('dashscope-cosyvoice audio response missing binary audio'));
          return;
        }
        const normalized = normalizeBinaryAudio(buffer, {
          format: args.input.format,
          sampleRate: socketOptions.sampleRate,
        });
        resolve({
          url: `data:${normalized.mimeType};base64,${normalized.buffer.toString('base64')}`,
        });
      };

      socket.on('open', () => {
        try {
          socket.send(
            buildRunTaskMessage({
              taskId,
              model,
              voice: args.input.voice,
              format: args.input.format,
              sampleRate: socketOptions.sampleRate,
              volume: socketOptions.volume,
              speed: args.input.speed,
              pitch: socketOptions.pitch,
            }),
          );
        } catch (error) {
          fail(error instanceof Error ? error : new Error('dashscope-cosyvoice websocket send failed'));
        }
      });

      socket.on('message', (data, isBinary) => {
        if (settled) {
          return;
        }
        if (isBinary) {
          chunks.push(rawDataToBuffer(data));
          return;
        }
        const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        const event = parseSocketEvent(text);
        switch (event.event) {
          case 'task-started':
            socket.send(buildContinueTaskMessage({ taskId, text: args.input.prompt }));
            socket.send(buildFinishTaskMessage(taskId));
            break;
          case 'task-finished':
            completed = true;
            finish();
            break;
          case 'task-failed':
            fail(new Error(event.message || 'dashscope-cosyvoice task failed'));
            break;
          default:
            break;
        }
      });

      socket.on('error', (error) => {
        fail(error);
      });

      socket.on('close', (code, reason) => {
        if (settled) {
          return;
        }
        if (completed) {
          finish();
          return;
        }
        const reasonText = toReasonString(reason);
        if (isNormalClosure(code) && chunks.length > 0) {
          finish();
          return;
        }
        fail(new Error(`dashscope-cosyvoice websocket closed unexpectedly (${code}): ${reasonText}`));
      });
    });
  },
};
