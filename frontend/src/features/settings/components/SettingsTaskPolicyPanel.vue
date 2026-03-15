<template>
  <section class="panel task-policy-panel">
    <h3>任务调度策略</h3>
    <form class="task-policy-panel__runtime-grid" @submit.prevent="submitRuntimeConfig">
      <label>
        自动重试次数（0-5）
        <input v-model.number="runtimeConfig.videoTaskAutoRetry" type="number" min="0" max="5" />
      </label>
      <label>
        重试间隔毫秒（100-10000）
        <input v-model.number="runtimeConfig.videoTaskRetryDelayMs" type="number" min="100" max="10000" step="100" />
      </label>
      <label>
        前端轮询间隔毫秒（500-10000）
        <input v-model.number="runtimeConfig.videoTaskPollIntervalMs" type="number" min="500" max="10000" step="100" />
      </label>
      <div class="task-policy-panel__runtime-actions">
        <button class="primary" :disabled="loading">{{ loading ? '保存中...' : '保存调度配置' }}</button>
      </div>
    </form>
  </section>

  <section class="panel task-policy-panel">
    <div class="task-policy-panel__head">
      <div>
        <h3>失败修复策略中心</h3>
        <p class="muted">按错误码定义默认修复动作，但压成紧凑行布局，避免巨型表单卡片。</p>
      </div>
      <button class="primary" :disabled="loading" @click="submitTaskFailurePolicies">
        {{ loading ? '保存中...' : '保存失败修复策略' }}
      </button>
    </div>
    <div class="task-policy-panel__meta">
      <label class="check-inline">
        <input v-model="taskFailurePolicyAutoApplyModel" type="checkbox" />
        自动触发失败修复策略
      </label>
      <label>
        每任务自动触发上限（0-3）
        <input v-model.number="taskFailurePolicyMaxAutoApplyPerTaskModel" type="number" min="0" max="3" />
      </label>
    </div>
    <div class="task-policy-panel__policy-list">
      <article class="task-policy-panel__policy-row" v-for="item in taskFailurePolicies" :key="item.errorCode">
        <div class="task-policy-panel__policy-copy">
          <strong>{{ item.errorCode }}</strong>
          <span>项目页可一键按这条策略重试或保守重建。</span>
        </div>
        <div class="task-policy-panel__policy-controls">
          <label>
            动作
            <select v-model="item.action">
              <option value="retry">retry</option>
              <option value="recreate_conservative">recreate_conservative</option>
              <option value="manual">manual</option>
            </select>
          </label>
          <label>
            目标模式
            <select v-model="item.preferredMode">
              <option value="keep">keep</option>
              <option value="text">text</option>
              <option value="singleImage">singleImage</option>
              <option value="startEnd">startEnd</option>
              <option value="multiImage">multiImage</option>
              <option value="reference">reference</option>
            </select>
          </label>
          <label>
            优先级
            <select v-model="item.priority">
              <option value="keep">keep</option>
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
          </label>
          <label class="check-inline">
            <input v-model="item.disableAudio" type="checkbox" />
            保守重建时关闭音频
          </label>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TaskFailurePolicyItem, TaskRuntimeConfig } from '@/types/models';

const props = defineProps<{
  loading: boolean;
  runtimeConfig: TaskRuntimeConfig;
  taskFailurePolicies: TaskFailurePolicyItem[];
  taskFailurePolicyAutoApply: boolean;
  taskFailurePolicyMaxAutoApplyPerTask: number;
}>();

const emit = defineEmits<{
  (e: 'save-runtime-config'): void;
  (e: 'save-task-failure-policies'): void;
  (e: 'update:taskFailurePolicyAutoApply', value: boolean): void;
  (e: 'update:taskFailurePolicyMaxAutoApplyPerTask', value: number): void;
}>();

const taskFailurePolicyAutoApplyModel = computed({
  get: () => props.taskFailurePolicyAutoApply,
  set: (value: boolean) => emit('update:taskFailurePolicyAutoApply', value)
});

const taskFailurePolicyMaxAutoApplyPerTaskModel = computed({
  get: () => props.taskFailurePolicyMaxAutoApplyPerTask,
  set: (value: number) => emit('update:taskFailurePolicyMaxAutoApplyPerTask', Number(value))
});

const submitRuntimeConfig = (): void => {
  emit('save-runtime-config');
};

const submitTaskFailurePolicies = (): void => {
  emit('save-task-failure-policies');
};
</script>

<style scoped>
.task-policy-panel {
  display: grid;
  gap: 14px;
}

.task-policy-panel__runtime-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  gap: 12px;
  align-items: end;
}

.task-policy-panel__runtime-actions {
  display: flex;
  justify-content: flex-end;
}

.task-policy-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 16px;
}

.task-policy-panel__meta {
  display: grid;
  grid-template-columns: 1.1fr 220px;
  gap: 12px;
  align-items: center;
}

.task-policy-panel__policy-list {
  display: grid;
  gap: 10px;
}

.task-policy-panel__policy-row {
  display: grid;
  grid-template-columns: minmax(220px, 0.9fr) minmax(0, 1.6fr);
  gap: 14px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(220, 227, 237, 0.95);
  background: linear-gradient(180deg, #fff, #f8fbff);
}

.task-policy-panel__policy-copy {
  display: grid;
  gap: 4px;
}

.task-policy-panel__policy-copy span {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.5;
}

.task-policy-panel__policy-controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  gap: 10px;
  align-items: center;
}

.task-policy-panel__policy-controls :deep(label),
.task-policy-panel__runtime-grid :deep(label),
.task-policy-panel__meta :deep(label) {
  margin: 0;
}

@media (max-width: 1180px) {
  .task-policy-panel__runtime-grid,
  .task-policy-panel__policy-row,
  .task-policy-panel__policy-controls,
  .task-policy-panel__meta {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .task-policy-panel__head {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
