import { ref, type Ref } from 'vue';
import { toErrorMessage } from '@/utils/errors';

export type ProviderOptionRuleType = 'string' | 'number' | 'boolean' | 'object';

export type ProviderOptionRuleDraft = {
  key: string;
  type: ProviderOptionRuleType;
  enumText: string;
  minText: string;
  maxText: string;
  maxLengthText: string;
  integer: boolean;
  children: ProviderOptionRuleDraft[];
};

export type RuleEditorScope = 'new' | 'edit';

type ProviderOptionRuleTarget = {
  type: 'text' | 'image' | 'video' | 'audio';
  manufacturer: string;
  capabilitiesText: string;
};

type UseSettingsProviderOptionRulesOptions = {
  error: Ref<string>;
  newModel: Ref<ProviderOptionRuleTarget>;
  editingModel: Ref<ProviderOptionRuleTarget | null>;
};

const createEmptyProviderOptionRule = (type: ProviderOptionRuleType = 'string'): ProviderOptionRuleDraft => ({
  key: '',
  type,
  enumText: '',
  minText: '',
  maxText: '',
  maxLengthText: '',
  integer: false,
  children: []
});

const cloneProviderOptionRule = (rule: ProviderOptionRuleDraft): ProviderOptionRuleDraft => ({
  key: rule.key,
  type: rule.type,
  enumText: rule.enumText,
  minText: rule.minText,
  maxText: rule.maxText,
  maxLengthText: rule.maxLengthText,
  integer: rule.integer,
  children: rule.children.map((item) => cloneProviderOptionRule(item))
});

const parseJsonUnknownRecord = (text: string, label: string): Record<string, unknown> => {
  if (!text.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label} 必须是对象`);
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.includes('必须是对象')) {
      throw err;
    }
    throw new Error(`${label} 必须是合法 JSON`);
  }
};

const toNumberOrUndefined = (raw: string): number | undefined => {
  const text = raw.trim();
  if (!text) {
    return undefined;
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
};

const parseRuleFromRaw = (key: string, raw: unknown): ProviderOptionRuleDraft => {
  const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rawType = typeof item.type === 'string' ? item.type : 'string';
  const type: ProviderOptionRuleType =
    rawType === 'number' || rawType === 'boolean' || rawType === 'object' ? rawType : 'string';
  const children =
    type === 'object' && item.properties && typeof item.properties === 'object' && !Array.isArray(item.properties)
      ? Object.entries(item.properties as Record<string, unknown>).map(([childKey, childRule]) => parseRuleFromRaw(childKey, childRule))
      : [];
  return {
    key,
    type,
    enumText: Array.isArray(item.enum) ? item.enum.map((value) => String(value)).join(',') : '',
    minText: typeof item.min === 'number' ? String(item.min) : '',
    maxText: typeof item.max === 'number' ? String(item.max) : '',
    maxLengthText: typeof item.maxLength === 'number' ? String(Math.floor(item.maxLength)) : '',
    integer: item.integer === true,
    children
  };
};

const serializeProviderRule = (rule: ProviderOptionRuleDraft): Record<string, unknown> | null => {
  const key = rule.key.trim();
  if (!key) {
    return null;
  }
  if (rule.type === 'boolean') {
    return { type: 'boolean' };
  }
  if (rule.type === 'string') {
    const next: Record<string, unknown> = { type: 'string' };
    const maxLength = toNumberOrUndefined(rule.maxLengthText);
    if (maxLength !== undefined && maxLength > 0) {
      next.maxLength = Math.floor(maxLength);
    }
    const enumValues = rule.enumText
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (enumValues.length > 0) {
      next.enum = enumValues;
    }
    return next;
  }
  if (rule.type === 'number') {
    const next: Record<string, unknown> = { type: 'number' };
    const min = toNumberOrUndefined(rule.minText);
    const max = toNumberOrUndefined(rule.maxText);
    if (min !== undefined) {
      next.min = min;
    }
    if (max !== undefined) {
      next.max = max;
    }
    if (rule.integer) {
      next.integer = true;
    }
    const enumValues = rule.enumText
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
    if (enumValues.length > 0) {
      next.enum = enumValues;
    }
    return next;
  }
  const properties: Record<string, unknown> = {};
  for (const child of rule.children) {
    const childKey = child.key.trim();
    if (!childKey) {
      continue;
    }
    const childSerialized = serializeProviderRule(child);
    if (!childSerialized) {
      continue;
    }
    properties[childKey] = childSerialized;
  }
  return {
    type: 'object',
    properties
  };
};

const buildProviderOptionsTemplateFromRules = (rules: ProviderOptionRuleDraft[]): Record<string, unknown> => {
  const providerOptions: Record<string, unknown> = {};
  for (const rule of rules) {
    const key = rule.key.trim();
    if (!key) {
      continue;
    }
    const serialized = serializeProviderRule(rule);
    if (!serialized) {
      continue;
    }
    providerOptions[key] = serialized;
  }
  return providerOptions;
};

export const useSettingsProviderOptionRules = (options: UseSettingsProviderOptionRulesOptions) => {
  const newProviderOptionRules = ref<ProviderOptionRuleDraft[]>([]);
  const editProviderOptionRules = ref<ProviderOptionRuleDraft[]>([]);
  const newProviderRuleClipboard = ref<ProviderOptionRuleDraft | null>(null);
  const editProviderRuleClipboard = ref<ProviderOptionRuleDraft | null>(null);
  const newProviderRuleSearchQuery = ref('');
  const editProviderRuleSearchQuery = ref('');
  const newProviderRulesTemplateInput = ref<HTMLInputElement | null>(null);
  const editProviderRulesTemplateInput = ref<HTMLInputElement | null>(null);

  const getProviderRuleContext = (
    scope: RuleEditorScope
  ): {
    target: ProviderOptionRuleTarget | null;
    list: ProviderOptionRuleDraft[];
    setList: (next: ProviderOptionRuleDraft[]) => void;
  } => {
    if (scope === 'new') {
      return {
        target: options.newModel.value,
        list: newProviderOptionRules.value,
        setList: (next) => {
          newProviderOptionRules.value = next;
        }
      };
    }
    return {
      target: options.editingModel.value,
      list: editProviderOptionRules.value,
      setList: (next) => {
        editProviderOptionRules.value = next;
      }
    };
  };

  const getProviderRuleClipboardRef = (scope: RuleEditorScope) =>
    scope === 'new' ? newProviderRuleClipboard : editProviderRuleClipboard;

  const getProviderRuleSearchRef = (scope: RuleEditorScope) =>
    scope === 'new' ? newProviderRuleSearchQuery : editProviderRuleSearchQuery;

  const parseProviderRulesFromCapabilities = (target: ProviderOptionRuleTarget): ProviderOptionRuleDraft[] => {
    let capabilities: Record<string, unknown> = {};
    try {
      capabilities = parseJsonUnknownRecord(target.capabilitiesText, 'capabilities');
    } catch {
      return [];
    }
    const root =
      capabilities[target.type] && typeof capabilities[target.type] === 'object' && !Array.isArray(capabilities[target.type])
        ? (capabilities[target.type] as Record<string, unknown>)
        : capabilities;
    const optionsRoot =
      root.providerOptions && typeof root.providerOptions === 'object' && !Array.isArray(root.providerOptions)
        ? (root.providerOptions as Record<string, unknown>)
        : {};
    return Object.entries(optionsRoot).map(([key, rule]) => parseRuleFromRaw(key, rule));
  };

  const persistProviderOptionRulesToCapabilities = (scope: RuleEditorScope): void => {
    const context = getProviderRuleContext(scope);
    if (!context.target) {
      return;
    }
    let capabilities: Record<string, unknown> = {};
    try {
      capabilities = parseJsonUnknownRecord(context.target.capabilitiesText, 'capabilities');
    } catch {
      capabilities = {};
    }
    const typedRootCandidate = capabilities[context.target.type];
    const typedRoot =
      typedRootCandidate && typeof typedRootCandidate === 'object' && !Array.isArray(typedRootCandidate)
        ? ({ ...(typedRootCandidate as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    typedRoot.providerOptions = buildProviderOptionsTemplateFromRules(context.list);
    capabilities[context.target.type] = typedRoot;
    context.target.capabilitiesText = JSON.stringify(capabilities, null, 2);
  };

  const exportProviderOptionRulesTemplate = (scope: RuleEditorScope): void => {
    const context = getProviderRuleContext(scope);
    if (!context.target) {
      return;
    }
    const payload = {
      version: 'provider-options-template-v1',
      exportedAt: new Date().toISOString(),
      modelType: context.target.type,
      manufacturer: context.target.manufacturer.trim().toLowerCase(),
      providerOptions: buildProviderOptionsTemplateFromRules(context.list)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `provider-options-template-${payload.modelType}-${payload.manufacturer || 'unknown'}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const triggerImportProviderOptionRulesTemplate = (scope: RuleEditorScope): void => {
    if (scope === 'new') {
      newProviderRulesTemplateInput.value?.click();
      return;
    }
    editProviderRulesTemplateInput.value?.click();
  };

  const handleImportProviderOptionRulesTemplate = async (scope: RuleEditorScope, event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('规则模板格式错误');
      }
      const root = parsed as Record<string, unknown>;
      const providerOptionsRaw =
        root.providerOptions && typeof root.providerOptions === 'object' && !Array.isArray(root.providerOptions)
          ? (root.providerOptions as Record<string, unknown>)
          : root;
      const importedRules = Object.entries(providerOptionsRaw).map(([key, rule]) => parseRuleFromRaw(key, rule));
      const context = getProviderRuleContext(scope);
      if (!context.target) {
        return;
      }
      context.setList(importedRules);
      persistProviderOptionRulesToCapabilities(scope);
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '导入 providerOptions 规则模板失败');
    } finally {
      if (input) {
        input.value = '';
      }
    }
  };

  const syncProviderOptionRulesFromCapabilities = (scope: RuleEditorScope): void => {
    const context = getProviderRuleContext(scope);
    if (!context.target) {
      return;
    }
    context.setList(parseProviderRulesFromCapabilities(context.target));
  };

  const addProviderOptionRule = (scope: RuleEditorScope): void => {
    const context = getProviderRuleContext(scope);
    if (!context.target) {
      return;
    }
    context.list.push(createEmptyProviderOptionRule());
    persistProviderOptionRulesToCapabilities(scope);
  };

  const copyProviderOptionRuleNode = (scope: RuleEditorScope, node: ProviderOptionRuleDraft): void => {
    getProviderRuleClipboardRef(scope).value = cloneProviderOptionRule(node);
    options.error.value = '';
  };

  const updateProviderOptionRuleSearchQuery = (scope: RuleEditorScope, value: string): void => {
    getProviderRuleSearchRef(scope).value = value;
  };

  return {
    addProviderOptionRule,
    copyProviderOptionRuleNode,
    editProviderOptionRules,
    editProviderRuleClipboard,
    editProviderRuleSearchQuery,
    editProviderRulesTemplateInput,
    exportProviderOptionRulesTemplate,
    handleImportProviderOptionRulesTemplate,
    newProviderOptionRules,
    newProviderRuleClipboard,
    newProviderRuleSearchQuery,
    newProviderRulesTemplateInput,
    persistProviderOptionRulesToCapabilities,
    syncProviderOptionRulesFromCapabilities,
    triggerImportProviderOptionRulesTemplate,
    updateProviderOptionRuleSearchQuery
  };
};
