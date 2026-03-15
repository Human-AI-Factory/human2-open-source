import type { Ref } from 'vue';
import { updateTaskFailurePolicies, updateTaskRuntimeConfig } from '@/api/settings-admin';
import type { TaskFailurePolicyItem, TaskRuntimeConfig } from '@/types/models';
import { toErrorMessage } from '@/utils/errors';

type UseSettingsRuntimePolicyOpsOptions = {
  error: Ref<string>;
  loading: Ref<boolean>;
  runtimeConfig: Ref<TaskRuntimeConfig>;
  taskFailurePolicies: Ref<TaskFailurePolicyItem[]>;
  taskFailurePolicyAutoApply: Ref<boolean>;
  taskFailurePolicyMaxAutoApplyPerTask: Ref<number>;
};

export const useSettingsRuntimePolicyOps = (options: UseSettingsRuntimePolicyOpsOptions) => {
  const saveRuntimeConfig = async (): Promise<void> => {
    options.loading.value = true;
    try {
      options.runtimeConfig.value = await updateTaskRuntimeConfig({
        videoTaskAutoRetry: options.runtimeConfig.value.videoTaskAutoRetry,
        videoTaskRetryDelayMs: options.runtimeConfig.value.videoTaskRetryDelayMs,
        videoTaskPollIntervalMs: options.runtimeConfig.value.videoTaskPollIntervalMs
      });
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '保存调度配置失败');
    } finally {
      options.loading.value = false;
    }
  };

  const saveTaskFailurePolicies = async (): Promise<void> => {
    options.loading.value = true;
    try {
      const saved = await updateTaskFailurePolicies({
        autoApply: options.taskFailurePolicyAutoApply.value,
        maxAutoApplyPerTask: options.taskFailurePolicyMaxAutoApplyPerTask.value,
        items: options.taskFailurePolicies.value
      });
      options.taskFailurePolicies.value = saved.items;
      options.taskFailurePolicyAutoApply.value = saved.autoApply;
      options.taskFailurePolicyMaxAutoApplyPerTask.value = saved.maxAutoApplyPerTask;
      options.error.value = '';
    } catch (err) {
      options.error.value = toErrorMessage(err, '保存失败修复策略失败');
    } finally {
      options.loading.value = false;
    }
  };

  return {
    saveRuntimeConfig,
    saveTaskFailurePolicies
  };
};
