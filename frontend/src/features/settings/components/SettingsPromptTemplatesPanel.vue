<template>
  <section class="panel prompt-desk">
    <aside class="prompt-desk__sidebar">
      <div class="prompt-desk__sidebar-head">
        <h4>模板列表</h4>
        <p class="muted">点击左侧切换，右侧始终保留大编辑区。</p>
      </div>
      <div class="prompt-desk__sidebar-list">
        <button
          v-for="prompt in prompts"
          :key="prompt.id"
          class="prompt-desk__nav-item"
          :class="{ 'prompt-desk__nav-item--active': prompt.id === activePrompt?.id }"
          type="button"
          @click="selectedPromptId = prompt.id"
        >
          <div class="prompt-desk__nav-copy">
            <strong>{{ prompt.title }}</strong>
            <span>{{ prompt.key }}</span>
          </div>
          <span v-if="isPromptDirty(prompt)" class="prompt-desk__dirty-indicator">未保存</span>
        </button>
      </div>
    </aside>

    <div v-if="activePrompt" class="prompt-desk__workspace" :class="{ 'prompt-desk__workspace--with-history': currentVersionsVisible }">
      <div class="prompt-desk__editor">
        <div class="prompt-desk__editor-head">
          <div>
            <div class="prompt-desk__eyebrow">Prompt Editor</div>
            <h4>{{ activePrompt.title }}</h4>
            <p class="muted">Key: {{ activePrompt.key }}</p>
          </div>
          <div class="actions prompt-desk__editor-actions">
            <button type="button" @click="emit('toggle-versions', activePrompt.id)">
              {{ currentVersionsVisible ? '收起历史版本' : '查看历史版本' }}
            </button>
            <button class="primary" type="button" @click="emit('save-prompt', activePrompt.id)">保存当前模板</button>
          </div>
        </div>

        <textarea
          v-model="promptDrafts[activePrompt.id]"
          class="prompt-desk__textarea"
          spellcheck="false"
        />

        <div class="prompt-desk__editor-footer">
          <span class="muted">编辑区高度会贴合剩余空间，减少无意义滚动。</span>
          <button class="primary" type="button" @click="emit('save-prompt', activePrompt.id)">保存</button>
        </div>
      </div>

      <aside v-if="currentVersionsVisible" class="prompt-desk__history">
        <div class="prompt-desk__history-head">
          <h5>最近 30 条版本</h5>
          <small class="muted">{{ currentVersions.length }} 条记录</small>
        </div>
        <div v-if="currentVersions.length" class="prompt-desk__history-list">
          <article class="prompt-desk__history-item" v-for="item in currentVersions" :key="item.id">
            <div class="prompt-desk__history-copy">
              <p class="muted">{{ new Date(item.createdAt).toLocaleString() }}</p>
              <p>{{ item.content.slice(0, 180) }}</p>
            </div>
            <button type="button" @click="emit('restore-version', activePrompt.id, item.content)">回填</button>
          </article>
        </div>
        <p v-else class="muted">暂无历史版本</p>
      </aside>
    </div>

    <div v-else class="prompt-desk__empty">
      <p class="muted">当前没有可编辑的 Prompt 模板。</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PromptTemplate, PromptTemplateVersion } from '@/types/models';

const props = defineProps<{
  prompts: PromptTemplate[];
  promptDrafts: Record<string, string>;
  promptVersions: Record<string, PromptTemplateVersion[]>;
  versionVisible: Record<string, boolean>;
}>();

const emit = defineEmits<{
  (e: 'save-prompt', promptId: string): void;
  (e: 'toggle-versions', promptId: string): void;
  (e: 'restore-version', promptId: string, content: string): void;
}>();

const selectedPromptId = ref('');

watch(
  () => props.prompts,
  (prompts) => {
    if (!prompts.length) {
      selectedPromptId.value = '';
      return;
    }
    if (!prompts.some((prompt) => prompt.id === selectedPromptId.value)) {
      selectedPromptId.value = prompts[0]?.id ?? '';
    }
  },
  { immediate: true }
);

const activePrompt = computed(() => props.prompts.find((prompt) => prompt.id === selectedPromptId.value) ?? null);

const currentVersionsVisible = computed(() => (activePrompt.value ? Boolean(props.versionVisible[activePrompt.value.id]) : false));

const currentVersions = computed(() => (activePrompt.value ? props.promptVersions[activePrompt.value.id] ?? [] : []));

const isPromptDirty = (prompt: PromptTemplate): boolean => (props.promptDrafts[prompt.id] ?? prompt.content) !== prompt.content;
</script>

<style scoped>
.prompt-desk {
  margin: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;
  min-height: clamp(480px, 60vh, 760px);
}

.prompt-desk__sidebar {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
}

.prompt-desk__sidebar-head {
  display: grid;
  gap: 4px;
}

.prompt-desk__sidebar-list {
  min-height: 0;
  overflow-y: auto;
  display: grid;
  gap: 8px;
  padding-right: 4px;
}

.prompt-desk__nav-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(215, 223, 235, 0.95);
  background: linear-gradient(180deg, #fff, #f8fbff);
  text-align: left;
}

.prompt-desk__nav-item--active {
  border-color: rgba(14, 91, 216, 0.4);
  box-shadow: 0 10px 24px rgba(13, 30, 64, 0.08);
}

.prompt-desk__nav-copy {
  display: grid;
  gap: 3px;
}

.prompt-desk__nav-copy span {
  color: var(--ink-2);
  font-size: 12px;
}

.prompt-desk__dirty-indicator {
  flex: none;
  font-size: 11px;
  color: #8a4b00;
  background: #fff1d6;
  border: 1px solid rgba(196, 140, 34, 0.25);
  border-radius: 999px;
  padding: 2px 8px;
}

.prompt-desk__workspace {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.prompt-desk__workspace--with-history {
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 14px;
}

.prompt-desk__editor,
.prompt-desk__history {
  min-height: 0;
  border-radius: 16px;
  border: 1px solid rgba(215, 223, 235, 0.94);
  background: rgba(255, 255, 255, 0.96);
}

.prompt-desk__editor {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
}

.prompt-desk__editor-head,
.prompt-desk__editor-footer,
.prompt-desk__history-head {
  padding: 14px 16px;
}

.prompt-desk__editor-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 14px;
  border-bottom: 1px solid rgba(225, 231, 240, 0.9);
}

.prompt-desk__eyebrow {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--ink-2);
}

.prompt-desk__editor-actions {
  justify-content: flex-end;
}

.prompt-desk__textarea {
  width: 100%;
  min-height: 0;
  height: 100%;
  resize: none;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 16px;
  font-family: 'SFMono-Regular', 'Menlo', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.65;
}

.prompt-desk__editor-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  border-top: 1px solid rgba(225, 231, 240, 0.9);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), #fff);
}

.prompt-desk__history {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.prompt-desk__history-list {
  min-height: 0;
  overflow-y: auto;
  display: grid;
  gap: 10px;
  padding: 0 14px 14px;
}

.prompt-desk__history-item {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(220, 227, 237, 0.94);
  background: linear-gradient(180deg, #fff, #f8fbff);
}

.prompt-desk__history-copy {
  display: grid;
  gap: 6px;
}

.prompt-desk__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
}

@media (max-width: 1080px) {
  .prompt-desk,
  .prompt-desk__workspace--with-history {
    grid-template-columns: 1fr;
  }

  .prompt-desk__sidebar {
    grid-template-rows: auto;
  }

  .prompt-desk__sidebar-list {
    overflow: visible;
  }
}

@media (max-width: 760px) {
  .prompt-desk__editor-head,
  .prompt-desk__editor-footer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
