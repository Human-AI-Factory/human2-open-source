import type { Ref } from 'vue';
import { getPromptTemplateVersions, updatePromptTemplate } from '@/api/settings-admin';
import type { PromptTemplateVersion } from '@/types/models';
import { toErrorMessage } from '@/utils/errors';

type UseSettingsPromptOpsOptions = {
  error: Ref<string>;
  promptDrafts: Ref<Record<string, string>>;
  promptVersions: Ref<Record<string, PromptTemplateVersion[]>>;
  versionVisible: Ref<Record<string, boolean>>;
  loadAll: () => Promise<void>;
};

export const useSettingsPromptOps = (options: UseSettingsPromptOpsOptions) => {
  const savePrompt = async (promptId: string): Promise<void> => {
    try {
      await updatePromptTemplate(promptId, { content: options.promptDrafts.value[promptId] ?? '' });
      await options.loadAll();
    } catch (err) {
      options.error.value = toErrorMessage(err, '保存提示词失败');
    }
  };

  const toggleVersions = async (promptId: string): Promise<void> => {
    options.versionVisible.value[promptId] = !options.versionVisible.value[promptId];
    if (!options.versionVisible.value[promptId]) {
      return;
    }
    try {
      options.promptVersions.value[promptId] = await getPromptTemplateVersions(promptId);
    } catch (err) {
      options.error.value = toErrorMessage(err, '加载提示词历史失败');
    }
  };

  const restoreVersion = (promptId: string, content: string): void => {
    options.promptDrafts.value[promptId] = content;
  };

  return {
    restoreVersion,
    savePrompt,
    toggleVersions
  };
};
