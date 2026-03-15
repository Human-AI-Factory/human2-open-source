import { ref, type Ref } from 'vue';
import {
  deleteTaskCenterFilterPreset,
  getTaskCenterFilterPresets,
  markTaskCenterFilterPresetUsed,
  saveTaskCenterFilterPreset,
  setDefaultTaskCenterFilterPreset
} from '@/api/task-center';
import type { TaskCenterFilterPreset } from '@/types/models';
import { toErrorMessage } from '@/utils/errors';

const PRESETS_STORAGE_KEY = 'human2_task_center_presets_v1';

type UseTaskCenterQueryPresetsOptions = {
  error: Ref<string>;
  actionMessage: Ref<string>;
  keyword: Ref<string>;
  providerTaskIdKeyword: Ref<string>;
  status: Ref<string>;
  providerErrorCode: Ref<string>;
  createdFromLocal: Ref<string>;
  createdToLocal: Ref<string>;
  sortBy: Ref<TaskCenterFilterPreset['sortBy']>;
  order: Ref<TaskCenterFilterPreset['order']>;
  page: Ref<number>;
  loadTasks: () => Promise<void>;
};

export const useTaskCenterQueryPresets = (options: UseTaskCenterQueryPresetsOptions) => {
  const presetName = ref('');
  const selectedPresetName = ref('');
  const presets = ref<TaskCenterFilterPreset[]>([]);

  const readCurrentPresetPayload = (): Omit<TaskCenterFilterPreset, 'name' | 'isDefault' | 'updatedAt' | 'lastUsedAt'> => ({
    q: options.keyword.value.trim(),
    providerTaskId: options.providerTaskIdKeyword.value.trim(),
    status: options.status.value as TaskCenterFilterPreset['status'],
    providerErrorCode: options.providerErrorCode.value as TaskCenterFilterPreset['providerErrorCode'],
    createdFrom: options.createdFromLocal.value,
    createdTo: options.createdToLocal.value,
    sortBy: options.sortBy.value,
    order: options.order.value
  });

  const readLegacyLocalPresets = (): TaskCenterFilterPreset[] => {
    try {
      const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => {
          const sortBy: TaskCenterFilterPreset['sortBy'] =
            typeof item.sortBy === 'string' && ['createdAt', 'updatedAt', 'priority', 'status'].includes(item.sortBy)
              ? (item.sortBy as TaskCenterFilterPreset['sortBy'])
              : 'createdAt';
          const order: TaskCenterFilterPreset['order'] = item.order === 'asc' ? 'asc' : 'desc';
          return {
            name: typeof item.name === 'string' ? item.name.trim() : '',
            q: typeof item.q === 'string' ? item.q : '',
            providerTaskId: typeof item.providerTaskId === 'string' ? item.providerTaskId : '',
            status:
              typeof item.status === 'string' && ['', 'queued', 'submitting', 'polling', 'running', 'done', 'failed', 'cancelled'].includes(item.status)
                ? (item.status as TaskCenterFilterPreset['status'])
                : '',
            providerErrorCode:
              typeof item.providerErrorCode === 'string' &&
              ['', 'CAPABILITY_MISMATCH', 'PROVIDER_AUTH_FAILED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_TIMEOUT', 'PROVIDER_UNKNOWN'].includes(
                item.providerErrorCode
              )
                ? (item.providerErrorCode as TaskCenterFilterPreset['providerErrorCode'])
                : '',
            createdFrom: typeof item.createdFrom === 'string' ? item.createdFrom : '',
            createdTo: typeof item.createdTo === 'string' ? item.createdTo : '',
            sortBy,
            order,
            isDefault: false,
            updatedAt: new Date(0).toISOString(),
            lastUsedAt: null
          };
        })
        .filter((item) => Boolean(item.name))
        .slice(0, 20);
    } catch {
      return [];
    }
  };

  const loadPresets = async (): Promise<void> => {
    const remote = await getTaskCenterFilterPresets();
    presets.value = remote;
    if (remote.length > 0) {
      localStorage.removeItem(PRESETS_STORAGE_KEY);
      return;
    }

    const legacy = readLegacyLocalPresets();
    if (legacy.length === 0) {
      return;
    }
    for (const item of legacy) {
      await saveTaskCenterFilterPreset(item.name, {
        q: item.q,
        providerTaskId: item.providerTaskId,
        status: item.status,
        providerErrorCode: item.providerErrorCode,
        createdFrom: item.createdFrom,
        createdTo: item.createdTo,
        sortBy: item.sortBy,
        order: item.order
      });
    }
    presets.value = await getTaskCenterFilterPresets();
    localStorage.removeItem(PRESETS_STORAGE_KEY);
  };

  const initializeTaskCenterPresets = async (): Promise<void> => {
    await loadPresets();
    if (!selectedPresetName.value) {
      const defaultPreset = presets.value.find((item) => item.isDefault);
      if (defaultPreset) {
        selectedPresetName.value = defaultPreset.name;
      }
    }
  };

  const saveCurrentPreset = async (): Promise<void> => {
    const name = presetName.value.trim();
    if (!name) {
      options.error.value = '请输入预设名';
      return;
    }
    try {
      presets.value = await saveTaskCenterFilterPreset(name, readCurrentPresetPayload());
      selectedPresetName.value = name;
      options.actionMessage.value = `已保存预设：${name}`;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '保存预设失败');
    }
  };

  const applySelectedPreset = async (): Promise<void> => {
    const picked = presets.value.find((item) => item.name === selectedPresetName.value);
    if (!picked) {
      options.error.value = '未找到所选预设';
      return;
    }
    options.keyword.value = picked.q;
    options.providerTaskIdKeyword.value = picked.providerTaskId;
    options.status.value = picked.status;
    options.providerErrorCode.value = picked.providerErrorCode;
    options.createdFromLocal.value = picked.createdFrom;
    options.createdToLocal.value = picked.createdTo;
    options.sortBy.value = picked.sortBy;
    options.order.value = picked.order;
    options.page.value = 1;
    options.actionMessage.value = `已加载预设：${picked.name}`;
    options.error.value = '';
    try {
      presets.value = await markTaskCenterFilterPresetUsed(picked.name);
    } catch {
      // non-blocking
    }
    await options.loadTasks();
  };

  const makeSelectedPresetDefault = async (): Promise<void> => {
    if (!selectedPresetName.value) {
      return;
    }
    try {
      presets.value = await setDefaultTaskCenterFilterPreset(selectedPresetName.value);
      options.actionMessage.value = `已设为默认预设：${selectedPresetName.value}`;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '设置默认预设失败');
    }
  };

  const deleteSelectedPreset = async (): Promise<void> => {
    if (!selectedPresetName.value) {
      return;
    }
    const name = selectedPresetName.value;
    try {
      presets.value = await deleteTaskCenterFilterPreset(name);
      options.actionMessage.value = `已删除预设：${name}`;
      selectedPresetName.value = '';
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '删除预设失败');
    }
  };

  const formatPresetOption = (item: TaskCenterFilterPreset): string => {
    const tags: string[] = [];
    if (item.isDefault) {
      tags.push('默认');
    }
    if (item.lastUsedAt) {
      tags.push('最近');
    }
    return tags.length > 0 ? `${item.name} [${tags.join(' / ')}]` : item.name;
  };

  return {
    applySelectedPreset,
    deleteSelectedPreset,
    formatPresetOption,
    initializeTaskCenterPresets,
    makeSelectedPresetDefault,
    presetName,
    presets,
    saveCurrentPreset,
    selectedPresetName
  };
};
