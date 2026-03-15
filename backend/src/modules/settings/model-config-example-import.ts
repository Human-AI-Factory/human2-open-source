import { PROVIDER_CAPABILITY_PRESETS } from './capability-presets.js';

export type ImportedModelDraft = {
  type: 'text' | 'image' | 'video' | 'audio';
  name: string;
  provider: string;
  manufacturer: string;
  model: string;
  authType: 'bearer' | 'api_key' | 'none';
  endpoint: string;
  endpoints: Record<string, string>;
  capabilities: Record<string, unknown>;
  apiKey: string;
  priority: number;
  rateLimit: number;
  isDefault: boolean;
  enabled: boolean;
  source: 'curl' | 'python_requests' | 'python_openai_sdk';
  warnings: string[];
};

type ParsedExample = {
  source: 'curl' | 'python_requests' | 'python_openai_sdk';
  url: string;
  headers: Record<string, string>;
  payload: Record<string, unknown>;
  apiKeyHint?: string;
  warnings: string[];
};

const CURL_PREFIX = 'curl ';
const PYTHON_REQUESTS_HINT = 'requests.post(';
const PYTHON_OPENAI_HINT = 'OpenAI(';

const MANUFACTURER_BY_HOST: Array<{ pattern: RegExp; manufacturer: string }> = [
  { pattern: /(^|\.)api\.apimart\.ai$/i, manufacturer: 'apimart' },
  { pattern: /(^|\.)api\.atlascloud\.ai$/i, manufacturer: 'atlascloud' },
  { pattern: /(^|\.)api-inference\.modelscope\.cn$/i, manufacturer: 'modelscope' },
  { pattern: /(^|\.)api\.openai\.com$/i, manufacturer: 'openai' },
  { pattern: /(^|\.)api\.deepseek\.com$/i, manufacturer: 'deepseek' },
  { pattern: /(^|\.)generativelanguage\.googleapis\.com$/i, manufacturer: 'gemini' },
  { pattern: /(^|\.)api\.vidu\.cn$/i, manufacturer: 'vidu' },
  { pattern: /(^|\.)api-beijing\.klingai\.com$/i, manufacturer: 'kling' },
  { pattern: /(^|\.)ark\.cn-beijing\.volces\.com$/i, manufacturer: 'volcengine' },
];

const readPresetCapabilities = (
  type: ImportedModelDraft['type'],
  manufacturer: string
): Record<string, unknown> => {
  if (type === 'text') {
    return {};
  }
  const typeGroup = PROVIDER_CAPABILITY_PRESETS[type] as Record<string, unknown> | undefined;
  const preset = typeGroup?.[manufacturer];
  return preset ? { [type]: preset } : {};
};

const titleCase = (value: string): string =>
  value
    .split(/[_\-\s]+/g)
    .filter(Boolean)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(' ');

const stripWrappingQuotes = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const unescapeShellString = (value: string): string =>
  stripWrappingQuotes(value)
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');

const sanitizeSnippet = (example: string): string =>
  example
    .replace(/\r\n/g, '\n')
    .replace(/\\\n/g, ' ')
    .trim();

const extractLooseApiKey = (source: string): string => {
  const explicitApiKeyMatch = /api[_-]?key\s*[:=]\s*["'](sk-[^"']+)["']/i.exec(source);
  if (explicitApiKeyMatch?.[1]) {
    return explicitApiKeyMatch[1].trim();
  }
  const explicitBearerMatch = /authorization["']?\s*[:=]\s*["']Bearer\s+(sk-[^"']+)["']/i.exec(source);
  if (explicitBearerMatch?.[1]) {
    return explicitBearerMatch[1].trim();
  }
  const genericKeyMatch = /\b(?:sk|ms)-[a-z0-9-]{16,}\b/i.exec(source);
  return genericKeyMatch?.[0]?.trim() ?? '';
};

const escapeRawLineBreaksInsideQuotedStrings = (raw: string): string => {
  let result = '';
  let inString: '"' | "'" | null = null;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]!;
    if (inString) {
      if (escaped) {
        result += char;
        escaped = false;
        continue;
      }
      if (char === '\\') {
        result += char;
        escaped = true;
        continue;
      }
      if (char === inString) {
        result += char;
        inString = null;
        continue;
      }
      if (char === '\r') {
        continue;
      }
      if (char === '\n') {
        result += '\\n';
        continue;
      }
      result += char;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
    }
    result += char;
  }

  return result;
};

const tryParseJsonObject = (raw: string): Record<string, unknown> | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    const repaired = escapeRawLineBreaksInsideQuotedStrings(trimmed);
    if (repaired !== trimmed) {
      try {
        const parsed = JSON.parse(repaired) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    }
    return null;
  }
};

const normalizePythonObjectLiteral = (raw: string): string =>
  raw
    .replace(/#.*$/gm, '')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, content: string) => `"${content.replace(/"/g, '\\"')}"`)
    .replace(/,\s*([}\]])/g, '$1');

const parseLooseObject = (raw: string): Record<string, unknown> => {
  const direct = tryParseJsonObject(raw);
  if (direct) {
    return direct;
  }
  const normalized = normalizePythonObjectLiteral(raw);
  const parsed = tryParseJsonObject(normalized);
  if (parsed) {
    return parsed;
  }
  throw new Error('无法解析示例中的 JSON / dict payload');
};

const collectMatches = (source: string, expression: RegExp): string[] => {
  const values: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = expression.exec(source))) {
    values.push(match[1] ?? '');
  }
  return values;
};

const parseHeaderMap = (lines: string[]): Record<string, string> =>
  lines.reduce<Record<string, string>>((acc, raw) => {
    const normalized = unescapeShellString(raw);
    const separatorIndex = normalized.indexOf(':');
    if (separatorIndex <= 0) {
      return acc;
    }
    const key = normalized.slice(0, separatorIndex).trim();
    const value = normalized.slice(separatorIndex + 1).trim();
    if (key) {
      acc[key] = value;
    }
    return acc;
  }, {});

const parseCurlForms = (formArgs: string[]): Record<string, unknown> =>
  formArgs.reduce<Record<string, unknown>>((acc, raw) => {
    const normalized = unescapeShellString(raw);
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex <= 0) {
      return acc;
    }
    const key = normalized.slice(0, separatorIndex).trim();
    const value = normalized.slice(separatorIndex + 1).trim();
    if (!key) {
      return acc;
    }
    acc[key] = value.startsWith('@') ? value : value;
    return acc;
  }, {});

const extractAssignedObjectLiteral = (source: string, variableNames: string[]): string | null => {
  for (const variableName of variableNames) {
    const match = new RegExp(`${variableName}\\s*=\\s*\\{`, 'm').exec(source);
    if (!match || match.index < 0) {
      continue;
    }
    const start = match.index + match[0].lastIndexOf('{');
    let depth = 0;
    let inString: '"' | "'" | null = null;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index]!;
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === inString) {
          inString = null;
        }
        continue;
      }
      if (char === '"' || char === "'") {
        inString = char;
        continue;
      }
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return source.slice(start, index + 1);
        }
      }
    }
  }
  return null;
};

const parseCurlExample = (snippet: string): ParsedExample => {
  const source = sanitizeSnippet(snippet);
  const urlMatch = /(?:--url|--location)\s+((?:'[^']*')|(?:"[^"]*")|(?:\S+))/m.exec(source);
  const url = urlMatch ? unescapeShellString(urlMatch[1]!) : '';
  if (!url) {
    throw new Error('未在 curl 示例中识别到 --url');
  }
  const headers = parseHeaderMap(collectMatches(source, /(?:--header|-H)\s+((?:'[^']*')|(?:"[^"]*")|(?:\S+))/gm));
  const dataMatch = /(?:--data(?:-raw|-binary)?|-d)\s+((?:'[\s\S]*?')|(?:"[\s\S]*?"))/m.exec(source);
  const formArgs = collectMatches(source, /(?:--form|-F)\s+((?:'[^']*')|(?:"[^"]*")|(?:\S+))/gm);
  const payload =
    dataMatch && dataMatch[1]
      ? parseLooseObject(unescapeShellString(dataMatch[1]))
      : parseCurlForms(formArgs);
  return {
    source: 'curl',
    url,
    headers,
    payload,
    warnings: [],
  };
};

const parsePythonRequestsExample = (snippet: string): ParsedExample => {
  const source = sanitizeSnippet(snippet);
  const urlMatch = /url\s*=\s*["']([^"']+)["']/m.exec(source);
  const url = urlMatch?.[1]?.trim() ?? '';
  if (!url) {
    throw new Error('未在 requests 示例中识别到 url');
  }
  const headersLiteral = extractAssignedObjectLiteral(source, ['headers']);
  const payloadLiteral = extractAssignedObjectLiteral(source, ['payload', 'data', 'json']);
  return {
    source: 'python_requests',
    url,
    headers: headersLiteral ? parseLooseObject(headersLiteral) as Record<string, string> : {},
    payload: payloadLiteral ? parseLooseObject(payloadLiteral) : {},
    apiKeyHint: extractLooseApiKey(source),
    warnings: [],
  };
};

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, '');

const parsePythonOpenAiExample = (snippet: string): ParsedExample => {
  const source = sanitizeSnippet(snippet);
  const baseUrlMatch = /base_url\s*=\s*["']([^"']+)["']/m.exec(source);
  const baseUrl = baseUrlMatch?.[1]?.trim() ?? '';
  if (!baseUrl) {
    throw new Error('未在 OpenAI SDK 示例中识别到 base_url');
  }

  const chatCompletions = source.includes('.chat.completions.create(');
  const responsesCreate = source.includes('.responses.create(');
  if (!chatCompletions && !responsesCreate) {
    throw new Error('暂时只支持 OpenAI SDK 的 chat.completions.create / responses.create 示例导入');
  }

  const modelMatch =
    /model\s*=\s*["']([^"']+)["']/m.exec(source) ||
    /model\s*:\s*["']([^"']+)["']/m.exec(source);
  const model = modelMatch?.[1]?.trim() ?? '';

  const apiKeyLiteralMatch = /api_key\s*=\s*["']([^"']+)["']/m.exec(source);
  const apiKeyEnvMatch = /api_key\s*=\s*os\.getenv\(([^)]+)\)/m.exec(source);
  const warnings: string[] = [];
  const apiKeyHint =
    apiKeyLiteralMatch?.[1]?.trim() ||
    extractLooseApiKey(source);

  if (!apiKeyHint && apiKeyEnvMatch?.[1]) {
    warnings.push(`示例里的 api_key 来自环境变量 ${apiKeyEnvMatch[1].trim()}，请导入后补真实 token。`);
  }

  return {
    source: 'python_openai_sdk',
    url: `${normalizeBaseUrl(baseUrl)}${chatCompletions ? '/chat/completions' : '/responses'}`,
    headers: {},
    payload: model ? { model } : {},
    apiKeyHint,
    warnings,
  };
};

const inferManufacturer = (url: URL): string => {
  const pathname = url.pathname.toLowerCase();
  if (/(\.|^)dashscope(-intl)?\.aliyuncs\.com$/i.test(url.hostname)) {
    if (pathname.includes('/compatible-mode/')) {
      return 'openai-compatible';
    }
    if (pathname.includes('/api/v1/services/audio/tts/realtimesynthesizer')) {
      return 'dashscope-cosyvoice';
    }
    if (
      pathname.includes('/api/v1/services/aigc/') ||
      pathname.includes('/api/v1/tasks/')
    ) {
      return 'wan';
    }
  }
  const matched = MANUFACTURER_BY_HOST.find((item) => item.pattern.test(url.hostname));
  if (matched) {
    return matched.manufacturer;
  }
  return 'other';
};

const inferType = (url: URL, payload: Record<string, unknown>, warnings: string[]): ImportedModelDraft['type'] => {
  const pathname = url.pathname.toLowerCase();
  if (pathname.includes('/chat/completions')) {
    return 'text';
  }
  if (pathname.includes('/responses')) {
    return 'text';
  }
  if (pathname.includes('/images/generations')) {
    return 'image';
  }
  if (
    pathname.includes('/services/aigc/multimodal-generation/generation') ||
    pathname.includes('/services/aigc/text2image/image-synthesis')
  ) {
    return 'image';
  }
  if (pathname.includes('/videos/generations')) {
    return 'video';
  }
  if (pathname.includes('/services/aigc/video-generation/video-synthesis')) {
    return 'video';
  }
  if (pathname.includes('/audio/speech')) {
    return 'audio';
  }
  if (pathname.includes('/services/audio/tts/realtimesynthesizer')) {
    return 'audio';
  }
  if (pathname.includes('/audio/transcriptions')) {
    warnings.push('检测到 audio/transcriptions；它更适合字幕/ASR 链，不是当前默认的 TTS 音频链。');
    return 'audio';
  }
  if (typeof payload.model === 'string' && typeof payload.input === 'string') {
    return 'audio';
  }
  if (typeof payload.model === 'string' && Array.isArray(payload.messages)) {
    return 'text';
  }
  return 'text';
};

const inferAuth = (
  headers: Record<string, string>,
  apiKeyHint: string | undefined,
  warnings: string[]
): { authType: ImportedModelDraft['authType']; apiKey: string } => {
  const entries = Object.entries(headers);
  const authorizationEntry = entries.find(([key]) => key.toLowerCase() === 'authorization');
  if (authorizationEntry) {
    const rawValue = authorizationEntry[1].trim();
    const bearerMatch = /^Bearer\s+(.+)$/i.exec(rawValue);
    if (bearerMatch) {
      const token = bearerMatch[1]!.trim();
      if (token.includes('<token>')) {
        if (apiKeyHint) {
          warnings.push('Authorization 仍是 <token> 占位符，已从示例正文里提取真实 token。');
          return { authType: 'bearer', apiKey: apiKeyHint };
        }
        warnings.push('示例里的 Authorization 仍是 <token> 占位符，请导入后补真实 token。');
        return { authType: 'bearer', apiKey: '' };
      }
      return { authType: 'bearer', apiKey: token };
    }
    if (rawValue) {
      return { authType: 'api_key', apiKey: rawValue };
    }
  }
  const apiKeyEntry = entries.find(([key]) => ['x-api-key', 'api-key'].includes(key.toLowerCase()));
  if (apiKeyEntry) {
    return { authType: 'api_key', apiKey: apiKeyEntry[1].trim() };
  }
  if (apiKeyHint) {
    return { authType: 'bearer', apiKey: apiKeyHint };
  }
  warnings.push('未从示例中识别到鉴权头，将按 authType=none 导入。');
  return { authType: 'none', apiKey: '' };
};

const inferModel = (payload: Record<string, unknown>): string => {
  if (typeof payload.model === 'string' && payload.model.trim()) {
    return payload.model.trim();
  }
  return '';
};

const inferEndpoints = (
  url: URL,
  type: ImportedModelDraft['type'],
  manufacturer: string
): Record<string, string> => {
  const submit = url.toString();
  const endpoints: Record<string, string> = { submit };
  if (manufacturer === 'wan' && (type === 'image' || type === 'video')) {
    endpoints.query = `${url.origin}/api/v1/tasks/{taskId}`;
    return endpoints;
  }
  const asyncMatch = url.pathname.match(/^(.*)\/(?:images|videos)\/generations\/?$/i);
  if ((type === 'image' || type === 'video') && asyncMatch?.[1]) {
    endpoints.query = `${url.origin}${asyncMatch[1]}/tasks/{taskId}`;
  }
  return endpoints;
};

const inferName = (manufacturer: string, type: ImportedModelDraft['type'], model: string): string => {
  const prefix = titleCase(manufacturer === 'other' ? 'Imported' : manufacturer);
  const suffix = titleCase(type);
  const modelTail = model.trim() ? ` · ${model.trim()}` : '';
  return `${prefix} ${suffix}${modelTail}`;
};

export const importModelDraftFromExample = (input: {
  example: string;
  name?: string;
  isDefault?: boolean;
  enabled?: boolean;
}): ImportedModelDraft => {
  const example = input.example.trim();
  if (!example) {
    throw new Error('示例内容不能为空');
  }

  let parsed: ParsedExample;
  const curlIndex = example.indexOf(CURL_PREFIX);
  const requestsIndex = example.indexOf(PYTHON_REQUESTS_HINT);
  const openAiIndex =
    example.includes(PYTHON_OPENAI_HINT) || example.includes('from openai import OpenAI')
      ? Math.min(
          ...[example.indexOf(PYTHON_OPENAI_HINT), example.indexOf('from openai import OpenAI')].filter((value) => value >= 0)
        )
      : -1;
  if (
    curlIndex >= 0 &&
    (requestsIndex < 0 || curlIndex <= requestsIndex) &&
    (openAiIndex < 0 || curlIndex <= openAiIndex)
  ) {
    parsed = parseCurlExample(example.slice(curlIndex));
  } else if (
    openAiIndex >= 0 &&
    (requestsIndex < 0 || openAiIndex <= requestsIndex)
  ) {
    parsed = parsePythonOpenAiExample(example.slice(openAiIndex));
  } else if (requestsIndex >= 0 || example.includes('import requests')) {
    parsed = parsePythonRequestsExample(example);
  } else {
    throw new Error('暂时只支持 curl、Python requests 或 Python OpenAI SDK 示例导入');
  }

  const url = new URL(parsed.url);
  const warnings = [...parsed.warnings];
  const manufacturer = inferManufacturer(url);
  const type = inferType(url, parsed.payload, warnings);
  const { authType, apiKey } = inferAuth(parsed.headers, parsed.apiKeyHint, warnings);
  const model = inferModel(parsed.payload);
  if (!model) {
    warnings.push('示例里没有识别到 model 字段，导入后请手动检查模型名。');
  }
  return {
    type,
    name: input.name?.trim() || inferName(manufacturer, type, model),
    provider: 'http',
    manufacturer,
    model,
    authType,
    endpoint: parsed.url,
    endpoints: inferEndpoints(url, type, manufacturer),
    capabilities: readPresetCapabilities(type, manufacturer),
    apiKey,
    priority: 100,
    rateLimit: 0,
    isDefault: input.isDefault ?? false,
    enabled: input.enabled ?? true,
    source: parsed.source,
    warnings,
  };
};
