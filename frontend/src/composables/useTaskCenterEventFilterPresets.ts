import { computed, ref, watch, type Ref } from 'vue';

const EVENT_FILTER_PRESETS_STORAGE_KEY = 'human2_task_center_event_filter_presets_v1';
const EVENT_PRESET_CONFIRM_PREF_STORAGE_KEY = 'human2_task_center_event_preset_confirm_pref_v1';
const EVENT_PRESET_SHARE_PREFIX = 'TF_EVENT_PRESET:';

export type EventFilterPreset = {
  name: string;
  favorite: boolean;
  status: string;
  failedOnly: boolean;
  keyword: string;
  createdFrom: string;
  createdTo: string;
};

type UseTaskCenterEventFilterPresetsOptions = {
  error: Ref<string>;
  actionMessage: Ref<string>;
  eventStatusFilter: Ref<string>;
  eventFailedOnly: Ref<boolean>;
  eventKeyword: Ref<string>;
  eventCreatedFromLocal: Ref<string>;
  eventCreatedToLocal: Ref<string>;
};

const sortEventFilterPresets = (list: EventFilterPreset[]): EventFilterPreset[] =>
  [...list].sort((a, b) => (a.favorite === b.favorite ? a.name.localeCompare(b.name) : a.favorite ? -1 : 1));

const normalizeEventFilterPreset = (input: unknown): EventFilterPreset | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const item = input as Record<string, unknown>;
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  if (!name) {
    return null;
  }
  return {
    name,
    favorite: Boolean(item.favorite),
    status: typeof item.status === 'string' ? item.status : '',
    failedOnly: Boolean(item.failedOnly),
    keyword: typeof item.keyword === 'string' ? item.keyword : '',
    createdFrom: typeof item.createdFrom === 'string' ? item.createdFrom : '',
    createdTo: typeof item.createdTo === 'string' ? item.createdTo : ''
  };
};

const downloadBlobFile = (filename: string, blob: Blob): void => {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(href);
};

export const useTaskCenterEventFilterPresets = (options: UseTaskCenterEventFilterPresetsOptions) => {
  const eventPresetName = ref('');
  const selectedEventPresetName = ref('');
  const eventPresetShareText = ref('');
  const eventFilterPresets = ref<EventFilterPreset[]>([]);
  const eventPresetFileInputRef = ref<HTMLInputElement | null>(null);
  const eventPresetApplyConfirmOpen = ref(false);
  const pendingEventPresetName = ref('');
  const pendingEventPresetChangedFields = ref<string[]>([]);
  const skipEventPresetApplyConfirmInSession = ref(false);
  const eventPresetImportConfirmOpen = ref(false);
  const pendingImportEventFilterPresets = ref<EventFilterPreset[]>([]);
  const pendingImportConflictNames = ref<string[]>([]);
  const pendingImportSource = ref<'share' | 'json'>('share');

  const selectedEventFilterPreset = computed(() =>
    eventFilterPresets.value.find((item) => item.name === selectedEventPresetName.value) ?? null
  );

  const selectedEventFilterPresetDiff = computed(() => {
    const picked = selectedEventFilterPreset.value;
    if (!picked) {
      return {
        status: false,
        failedOnly: false,
        keyword: false,
        createdFrom: false,
        createdTo: false
      };
    }
    return {
      status: picked.status !== options.eventStatusFilter.value,
      failedOnly: picked.failedOnly !== options.eventFailedOnly.value,
      keyword: picked.keyword !== options.eventKeyword.value,
      createdFrom: picked.createdFrom !== options.eventCreatedFromLocal.value,
      createdTo: picked.createdTo !== options.eventCreatedToLocal.value
    };
  });

  const applyEventFilterPreset = (picked: EventFilterPreset): void => {
    options.eventStatusFilter.value = picked.status;
    options.eventFailedOnly.value = picked.failedOnly;
    options.eventKeyword.value = picked.keyword;
    options.eventCreatedFromLocal.value = picked.createdFrom;
    options.eventCreatedToLocal.value = picked.createdTo;
    options.actionMessage.value = `已加载日志预设：${picked.name}`;
    options.error.value = '';
  };

  const cancelApplyEventFilterPreset = (): void => {
    eventPresetApplyConfirmOpen.value = false;
    pendingEventPresetName.value = '';
    pendingEventPresetChangedFields.value = [];
  };

  const applyImportedEventFilterPresets = (
    imported: EventFilterPreset[],
    source: 'share' | 'json'
  ): void => {
    const merged = [...eventFilterPresets.value];
    for (const item of imported) {
      const index = merged.findIndex((it) => it.name === item.name);
      if (index >= 0) {
        merged[index] = item;
      } else {
        merged.push(item);
      }
    }
    eventFilterPresets.value = sortEventFilterPresets(merged).slice(0, 20);
    if (imported.length === 1) {
      selectedEventPresetName.value = imported[0].name;
    }
    options.actionMessage.value =
      source === 'share'
        ? imported.length === 1
          ? `已导入日志预设：${imported[0].name}`
          : `已导入分享日志预设 ${imported.length} 条`
        : `已导入日志预设 ${imported.length} 条`;
    options.error.value = '';
  };

  const prepareImportEventFilterPresets = (
    imported: EventFilterPreset[],
    source: 'share' | 'json'
  ): void => {
    if (imported.length === 0) {
      options.error.value = '导入失败：未识别到有效日志预设';
      return;
    }
    const existingNames = new Set(eventFilterPresets.value.map((item) => item.name));
    const conflictNames = imported
      .map((item) => item.name)
      .filter((name, index, list) => existingNames.has(name) && list.indexOf(name) === index);
    if (conflictNames.length === 0) {
      applyImportedEventFilterPresets(imported, source);
      return;
    }
    pendingImportEventFilterPresets.value = imported;
    pendingImportConflictNames.value = conflictNames;
    pendingImportSource.value = source;
    eventPresetImportConfirmOpen.value = true;
  };

  const loadStoredEventFilterPresetPreferences = (): void => {
    try {
      const rawEventFilterPresets = localStorage.getItem(EVENT_FILTER_PRESETS_STORAGE_KEY);
      if (rawEventFilterPresets) {
        const parsed = JSON.parse(rawEventFilterPresets) as unknown;
        if (Array.isArray(parsed)) {
          eventFilterPresets.value = sortEventFilterPresets(
            parsed
              .map((item) => normalizeEventFilterPreset(item))
              .filter((item): item is EventFilterPreset => item !== null)
              .slice(0, 20)
          );
        }
      }
    } catch {
      // ignore storage failures
    }

    try {
      const rawConfirmPref = localStorage.getItem(EVENT_PRESET_CONFIRM_PREF_STORAGE_KEY);
      if (rawConfirmPref === '1') {
        skipEventPresetApplyConfirmInSession.value = true;
      }
    } catch {
      // ignore storage failures
    }
  };

  const saveEventFilterPreset = (): void => {
    const name = eventPresetName.value.trim();
    if (!name) {
      options.error.value = '请输入日志预设名';
      return;
    }
    const existing = eventFilterPresets.value.find((item) => item.name === name);
    const payload: EventFilterPreset = {
      name,
      favorite: existing?.favorite ?? false,
      status: options.eventStatusFilter.value,
      failedOnly: options.eventFailedOnly.value,
      keyword: options.eventKeyword.value.trim(),
      createdFrom: options.eventCreatedFromLocal.value,
      createdTo: options.eventCreatedToLocal.value
    };
    const next = [...eventFilterPresets.value];
    const index = next.findIndex((item) => item.name === name);
    if (index >= 0) {
      next[index] = payload;
    } else {
      next.unshift(payload);
    }
    eventFilterPresets.value = sortEventFilterPresets(next).slice(0, 20);
    selectedEventPresetName.value = name;
    options.actionMessage.value = `已保存日志预设：${name}`;
    options.error.value = '';
  };

  const applySelectedEventFilterPreset = (): void => {
    const picked = selectedEventFilterPreset.value;
    if (!picked) {
      options.error.value = '未找到所选日志预设';
      return;
    }
    const changedFields: string[] = [];
    if (picked.status !== options.eventStatusFilter.value) changedFields.push('状态');
    if (picked.failedOnly !== options.eventFailedOnly.value) changedFields.push('仅失败');
    if (picked.keyword !== options.eventKeyword.value) changedFields.push('关键词');
    if (picked.createdFrom !== options.eventCreatedFromLocal.value) changedFields.push('起始时间');
    if (picked.createdTo !== options.eventCreatedToLocal.value) changedFields.push('截止时间');
    if (changedFields.length === 0 || skipEventPresetApplyConfirmInSession.value) {
      applyEventFilterPreset(picked);
      return;
    }
    pendingEventPresetName.value = picked.name;
    pendingEventPresetChangedFields.value = changedFields;
    eventPresetApplyConfirmOpen.value = true;
  };

  const confirmApplyEventFilterPreset = (): void => {
    const picked = eventFilterPresets.value.find((item) => item.name === pendingEventPresetName.value);
    if (!picked) {
      options.error.value = '日志预设不存在或已被删除';
      cancelApplyEventFilterPreset();
      return;
    }
    applyEventFilterPreset(picked);
    cancelApplyEventFilterPreset();
  };

  const restoreEventPresetApplyConfirm = (): void => {
    skipEventPresetApplyConfirmInSession.value = false;
    try {
      localStorage.removeItem(EVENT_PRESET_CONFIRM_PREF_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
    options.actionMessage.value = '已恢复加载确认提示';
    options.error.value = '';
  };

  const deleteSelectedEventFilterPreset = (): void => {
    if (!selectedEventPresetName.value) {
      return;
    }
    const name = selectedEventPresetName.value;
    eventFilterPresets.value = eventFilterPresets.value.filter((item) => item.name !== name);
    selectedEventPresetName.value = '';
    options.actionMessage.value = `已删除日志预设：${name}`;
    options.error.value = '';
  };

  const renameSelectedEventFilterPreset = (): void => {
    if (!selectedEventPresetName.value) {
      return;
    }
    const nextName = eventPresetName.value.trim();
    if (!nextName) {
      options.error.value = '请输入新的日志预设名';
      return;
    }
    const exists = eventFilterPresets.value.find((item) => item.name === nextName);
    if (exists) {
      options.error.value = '日志预设名已存在';
      return;
    }
    eventFilterPresets.value = sortEventFilterPresets(
      eventFilterPresets.value.map((item) =>
        item.name === selectedEventPresetName.value ? { ...item, name: nextName } : item
      )
    );
    selectedEventPresetName.value = nextName;
    options.actionMessage.value = `已重命名日志预设：${nextName}`;
    options.error.value = '';
  };

  const toggleFavoriteSelectedEventFilterPreset = (): void => {
    if (!selectedEventPresetName.value) {
      return;
    }
    eventFilterPresets.value = sortEventFilterPresets(
      eventFilterPresets.value.map((item) =>
        item.name === selectedEventPresetName.value ? { ...item, favorite: !item.favorite } : item
      )
    );
    const selected = selectedEventFilterPreset.value;
    options.actionMessage.value = selected?.favorite ? '已收藏日志预设' : '已取消收藏日志预设';
    options.error.value = '';
  };

  const formatEventFilterPresetOption = (name: string): string => {
    const selected = eventFilterPresets.value.find((item) => item.name === name);
    if (!selected) {
      return name;
    }
    return selected.favorite ? `★ ${selected.name}` : selected.name;
  };

  const exportEventFilterPresetsJson = (): void => {
    const payload = JSON.stringify(eventFilterPresets.value, null, 2);
    downloadBlobFile('task-center-event-filter-presets.json', new Blob([payload], { type: 'application/json;charset=utf-8' }));
    options.actionMessage.value = '已导出日志预设 JSON';
    options.error.value = '';
  };

  const triggerImportEventFilterPresets = (): void => {
    eventPresetFileInputRef.value?.click();
  };

  const confirmImportEventFilterPresets = (): void => {
    const imported = pendingImportEventFilterPresets.value;
    if (imported.length === 0) {
      pendingImportEventFilterPresets.value = [];
      pendingImportConflictNames.value = [];
      pendingImportSource.value = 'share';
      eventPresetImportConfirmOpen.value = false;
      return;
    }
    applyImportedEventFilterPresets(imported, pendingImportSource.value);
    pendingImportEventFilterPresets.value = [];
    pendingImportConflictNames.value = [];
    pendingImportSource.value = 'share';
    eventPresetImportConfirmOpen.value = false;
  };

  const cancelImportEventFilterPresets = (): void => {
    eventPresetImportConfirmOpen.value = false;
    pendingImportEventFilterPresets.value = [];
    pendingImportConflictNames.value = [];
    pendingImportSource.value = 'share';
  };

  const onImportEventFilterPresetsFileChange = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const imported = list.map((item) => normalizeEventFilterPreset(item)).filter((item): item is EventFilterPreset => item !== null);
      prepareImportEventFilterPresets(imported, 'json');
    } catch {
      options.error.value = '导入失败：JSON 格式错误';
    } finally {
      input.value = '';
    }
  };

  const copySelectedEventFilterPresetShareText = async (): Promise<void> => {
    const picked = selectedEventFilterPreset.value;
    if (!picked) {
      options.error.value = '未找到所选日志预设';
      return;
    }
    const text = `${EVENT_PRESET_SHARE_PREFIX}${JSON.stringify(picked)}`;
    try {
      await navigator.clipboard.writeText(text);
      options.actionMessage.value = '已复制日志预设分享文本';
      options.error.value = '';
    } catch {
      options.error.value = '复制分享文本失败，请检查浏览器剪贴板权限';
    }
  };

  const copySelectedEventFilterPresetReadableText = async (): Promise<void> => {
    const picked = selectedEventFilterPreset.value;
    if (!picked) {
      options.error.value = '未找到所选日志预设';
      return;
    }
    const human = [
      `日志预设：${picked.name}${picked.favorite ? '（已收藏）' : ''}`,
      `状态：${picked.status || '全部'}`,
      `仅失败：${picked.failedOnly ? '是' : '否'}`,
      `关键词：${picked.keyword || '(空)'}`,
      `起始时间：${picked.createdFrom || '(空)'}`,
      `截止时间：${picked.createdTo || '(空)'}`,
      '',
      `机器导入串：${EVENT_PRESET_SHARE_PREFIX}${JSON.stringify(picked)}`
    ].join('\n');
    try {
      await navigator.clipboard.writeText(human);
      options.actionMessage.value = '已复制可读版分享文本';
      options.error.value = '';
    } catch {
      options.error.value = '复制可读版分享文本失败，请检查浏览器剪贴板权限';
    }
  };

  const importEventFilterPresetFromShareText = (): void => {
    const raw = eventPresetShareText.value.trim();
    if (!raw) {
      options.error.value = '请先粘贴分享文本';
      return;
    }
    let payloadText = raw;
    if (raw.startsWith(EVENT_PRESET_SHARE_PREFIX)) {
      payloadText = raw.slice(EVENT_PRESET_SHARE_PREFIX.length).trim();
    } else if (raw.includes(EVENT_PRESET_SHARE_PREFIX)) {
      const line = raw
        .split('\n')
        .map((item) => item.trim())
        .find((item) => item.startsWith(EVENT_PRESET_SHARE_PREFIX));
      if (!line) {
        options.error.value = '分享文本无效：未找到机器导入串';
        return;
      }
      payloadText = line.slice(EVENT_PRESET_SHARE_PREFIX.length).trim();
    }
    try {
      const parsed = JSON.parse(payloadText) as unknown;
      const normalized = normalizeEventFilterPreset(parsed);
      if (!normalized) {
        options.error.value = '分享文本无效：无法解析日志预设';
        return;
      }
      prepareImportEventFilterPresets([normalized], 'share');
      eventPresetShareText.value = '';
    } catch {
      options.error.value = '分享文本无效：JSON 解析失败';
    }
  };

  watch(
    eventFilterPresets,
    (value) => {
      try {
        localStorage.setItem(EVENT_FILTER_PRESETS_STORAGE_KEY, JSON.stringify(value));
      } catch {
        // ignore storage failures
      }
    },
    { deep: true }
  );

  watch(skipEventPresetApplyConfirmInSession, (value) => {
    try {
      if (value) {
        localStorage.setItem(EVENT_PRESET_CONFIRM_PREF_STORAGE_KEY, '1');
      } else {
        localStorage.removeItem(EVENT_PRESET_CONFIRM_PREF_STORAGE_KEY);
      }
    } catch {
      // ignore storage failures
    }
  });

  return {
    eventFilterPresets,
    eventPresetApplyConfirmOpen,
    eventPresetFileInputRef,
    eventPresetImportConfirmOpen,
    eventPresetName,
    eventPresetShareText,
    formatEventFilterPresetOption,
    applySelectedEventFilterPreset,
    cancelApplyEventFilterPreset,
    cancelImportEventFilterPresets,
    confirmApplyEventFilterPreset,
    confirmImportEventFilterPresets,
    copySelectedEventFilterPresetReadableText,
    copySelectedEventFilterPresetShareText,
    deleteSelectedEventFilterPreset,
    exportEventFilterPresetsJson,
    importEventFilterPresetFromShareText,
    loadStoredEventFilterPresetPreferences,
    onImportEventFilterPresetsFileChange,
    pendingEventPresetChangedFields,
    pendingEventPresetName,
    pendingImportConflictNames,
    pendingImportEventFilterPresets,
    pendingImportSource,
    renameSelectedEventFilterPreset,
    restoreEventPresetApplyConfirm,
    saveEventFilterPreset,
    selectedEventFilterPreset,
    selectedEventFilterPresetDiff,
    selectedEventPresetName,
    skipEventPresetApplyConfirmInSession,
    toggleFavoriteSelectedEventFilterPreset,
    triggerImportEventFilterPresets
  };
};
