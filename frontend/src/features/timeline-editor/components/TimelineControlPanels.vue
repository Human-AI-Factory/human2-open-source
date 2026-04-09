<template>
  <section class="panel">
    <div class="inline-between">
      <div>
        <h2>时间线编辑器</h2>
        <p class="muted">{{ project?.name || '加载中...' }}</p>
      </div>
      <div class="actions">
        <button @click="goProject">返回项目</button>
        <button @click="loadAll">刷新</button>
        <button @click="toggleStudioDenseMode">{{ studioDenseMode ? '标准密度' : '紧凑密度' }}</button>
        <button @click="toggleStudioImmersiveMode">{{ studioImmersiveMode ? '退出沉浸' : '沉浸模式' }}</button>
        <button @click="toggleHotkeyHelp">{{ showHotkeyHelp ? '关闭快捷键' : '快捷键面板' }}</button>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
  </section>

  <section class="panel">
    <h3>作用域</h3>
    <div class="form">
      <label>
        分集
        <select v-model="selectedEpisodeIdModel" @change="loadTimeline">
          <option value="">项目主时间线</option>
          <option v-for="item in episodes" :key="item.id" :value="item.id">
            {{ item.orderIndex }} · {{ item.title }}
          </option>
        </select>
      </label>
      <label>
        标题
        <input v-model="timelineTitleModel" placeholder="时间线标题" />
      </label>
    </div>
    <div class="actions" style="margin-top: 8px">
      <button class="primary" :disabled="loading" @click="saveTimeline">{{ loading ? '保存中...' : '保存时间线' }}</button>
      <button :disabled="loading" @click="createTimelineAudioTasks">{{ loading ? '处理中...' : '批量生成音频任务' }}</button>
      <button :disabled="loading" @click="syncCompletedAudioToTimeline">{{ loading ? '处理中...' : '挂入已完成音频' }}</button>
      <button :disabled="loading" @click="generateSubtitleTrackForTimeline">{{ loading ? '处理中...' : '生成字幕轨' }}</button>
      <button :disabled="loading" @click="createMergeByTimeline">{{ loading ? '处理中...' : '按时间线发起合成' }}</button>
      <button @click="goFramePromptWorkbench">Frame Prompt 工具链</button>
      <button @click="goStoryboardWorkbench">分镜工具链</button>
      <button @click="goAssetWorkbench">资产工具链</button>
    </div>
    <p v-if="desktopIngestStatus" class="muted">{{ desktopIngestStatus }}</p>
    <p v-if="postproductionMessage" class="muted">{{ postproductionMessage }}</p>
  </section>

  <section class="panel command-panel">
    <div class="inline-between">
      <h3>导演工作站命令条</h3>
      <p class="muted">`Cmd/Ctrl + K` 聚焦命令条，输入后回车执行。</p>
    </div>
    <div class="actions">
      <input
        :ref="setQuickCommandInputRef"
        v-model.trim="quickCommandModel"
        class="command-input"
        placeholder="例如：save / merge / play / pause / duplicate / delete / next / prev / focus / reset-keyframe / reset-transition"
        @keydown.enter.prevent="runQuickCommand" />
      <button class="primary" @click="runQuickCommand">执行命令</button>
    </div>
    <div class="actions">
      <input v-model.trim="macroNameModel" placeholder="宏命令名称（例如：导演快修）" />
      <input v-model.trim="macroCommandTextModel" placeholder="命令序列（用 ; 分隔，例如：save;merge）" />
      <button @click="saveMacroCommand">保存宏命令</button>
      <button :disabled="savedMacros.length === 0" @click="exportMacroCommands">导出 JSON</button>
      <button @click="triggerMacroImport">导入 JSON</button>
      <select v-model="selectedMacroIdModel">
        <option value="">选择宏命令</option>
        <option v-for="macro in savedMacros" :key="macro.id" :value="macro.id">{{ macro.name }}</option>
      </select>
      <button :disabled="!selectedMacroId" @click="runSelectedMacro">执行宏</button>
      <button :disabled="!selectedMacroId" @click="loadSelectedMacroToDraft">载入编辑</button>
      <button :disabled="!selectedMacroId" @click="renameSelectedMacro">重命名</button>
      <button :disabled="!selectedMacroId" @click="overwriteSelectedMacroCommands">覆盖命令</button>
      <button class="danger" :disabled="!selectedMacroId" @click="deleteSelectedMacro">删除</button>
      <button :disabled="!selectedMacroId" @click="saveSelectedMacroToGlobal">存入全局宏库</button>
      <input
        :ref="setMacroImportInputRef"
        type="file"
        accept=".json,application/json"
        style="display: none"
        @change="handleMacroImportFileChange" />
    </div>
    <div class="actions">
      <input v-model.trim="globalMacroNameDraftModel" placeholder="全局宏名称（可选）" />
      <select v-model="selectedGlobalMacroIdModel">
        <option value="">全局宏库</option>
        <option v-for="macro in globalMacros" :key="macro.id" :value="macro.id">{{ macro.name }}</option>
      </select>
      <button :disabled="!selectedGlobalMacroId" @click="runSelectedGlobalMacro">执行全局宏</button>
      <button :disabled="!selectedGlobalMacroId" @click="importSelectedGlobalMacroToLocal">导入到当前项目</button>
      <button :disabled="!selectedGlobalMacroId" @click="renameSelectedGlobalMacro">重命名全局宏</button>
      <button class="danger" :disabled="!selectedGlobalMacroId" @click="deleteSelectedGlobalMacro">删除全局宏</button>
      <label class="check-inline">
        <input v-model="timelineSyncEnabledModel" type="checkbox" />
        多窗口同步
      </label>
    </div>
    <p class="muted">当前：{{ selectedClipSummary }}</p>
    <p v-if="quickCommandFeedback" class="muted">{{ quickCommandFeedback }}</p>
  </section>

  <section class="panel">
    <div class="inline-between">
      <h3>本地工作流</h3>
      <p class="muted">布局预设 + 本地草稿 + 快照导入导出</p>
    </div>
    <div class="actions">
      <label>
        工作区预设
        <select v-model="workspacePresetIdModel" @change="applyWorkspacePreset">
          <option value="custom">custom</option>
          <option value="focus">focus</option>
          <option value="review">review</option>
          <option value="cinema">cinema</option>
        </select>
      </label>
      <label class="check-inline">
        <input v-model="autoSaveEnabledModel" type="checkbox" />
        自动本地草稿
      </label>
      <button @click="saveWorkspaceDraftToLocal('manual')">保存草稿</button>
      <button :disabled="!localDraftMeta" @click="restoreWorkspaceDraftFromLocal">恢复草稿</button>
      <button :disabled="!localDraftMeta" @click="clearWorkspaceDraft">清除草稿</button>
      <button :disabled="!localDraftMeta" @click="exportWorkspaceDraft">导出草稿</button>
      <button @click="triggerWorkspaceImport">导入草稿</button>
      <label>
        Dock 停靠
        <select v-model="dockLayoutModeModel">
          <option value="left">左侧</option>
          <option value="right">右侧</option>
          <option value="float">浮动</option>
        </select>
      </label>
      <label>
        属性面板
        <select v-model="clipPanelLayoutModeModel">
          <option value="right">右侧</option>
          <option value="left">左侧</option>
          <option value="float">浮动</option>
        </select>
      </label>
      <input
        :ref="setWorkspaceImportInputRef"
        type="file"
        accept=".json,application/json"
        style="display: none"
        @change="handleWorkspaceImportFileChange" />
    </div>
    <div class="actions" style="margin-top: 8px">
      <input v-model.trim="layoutTemplateNameModel" placeholder="布局模板名称" />
      <label>
        模板类型
        <select v-model="layoutTemplateScopeModel">
          <option value="personal">个人</option>
          <option value="team">团队</option>
        </select>
      </label>
      <button @click="saveCurrentLayoutTemplate">保存模板</button>
    </div>
    <div class="actions" style="margin-top: 8px">
      <label>
        工作区快照槽位
        <select v-model="selectedWorkspaceQuickSlotIdModel">
          <option value="">选择槽位</option>
          <option v-for="slot in workspaceQuickSlots" :key="slot.id" :value="slot.id">{{ slot.name }} · {{ slot.savedAt }}</option>
        </select>
      </label>
      <button @click="saveWorkspaceQuickSlot">保存当前到槽位</button>
      <button :disabled="!selectedWorkspaceQuickSlotId" @click="restoreWorkspaceQuickSlot">恢复槽位</button>
      <button class="danger" :disabled="!selectedWorkspaceQuickSlotId" @click="deleteWorkspaceQuickSlot">删除槽位</button>
    </div>
    <div class="template-list">
      <button
        v-if="latestTeamTemplateAudit"
        type="button"
        class="team-audit-banner"
        @click="focusTemplateCard(latestTeamTemplateAudit.id)">
        团队模板最近修改：{{ latestTeamTemplateAudit.name }} · {{ latestTeamTemplateAudit.updatedBy }} · {{ latestTeamTemplateAudit.updatedAt }}
      </button>
      <article
        v-for="tpl in layoutTemplates"
        :key="tpl.id"
        class="template-card"
        :class="{ highlighted: highlightedTemplateId === tpl.id }"
        :data-template-id="tpl.id">
        <p>{{ tpl.name }} · {{ tpl.scope }}</p>
        <p class="muted">{{ tpl.updatedAt }}<span v-if="tpl.scope === 'team'"> · {{ tpl.updatedBy || 'team' }}</span></p>
        <div class="actions">
          <button @click="applyLayoutTemplate(tpl.id)">应用</button>
          <button v-if="tpl.scope === 'personal' || !tpl.readOnly" @click="renameLayoutTemplate(tpl.id)">重命名</button>
          <button v-if="tpl.scope === 'personal' || !tpl.readOnly" class="danger" @click="deleteLayoutTemplate(tpl.id)">删除</button>
          <button v-if="tpl.scope === 'team'" @click="forkTeamTemplateToPersonal(tpl.id)">Fork到个人</button>
          <span v-if="tpl.scope === 'team' && tpl.readOnly" class="muted">只读</span>
        </div>
      </article>
      <p v-if="layoutTemplates.length === 0" class="muted">暂无布局模板</p>
    </div>
    <p class="muted">
      <span v-if="localDraftMeta">本地草稿：{{ localDraftMeta.savedAt }} · {{ localDraftMeta.size }} bytes</span>
      <span v-else>本地草稿：无</span>
      <span v-if="lastAutoSaveAt"> · 自动保存：{{ lastAutoSaveAt }}</span>
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { EpisodeDomain, Project } from '@/types/models';

type AsyncAction = () => void | Promise<unknown>;
type DraftSaveMode = 'manual' | 'auto';
type DraftSaveSetter = (value: DraftSaveMode) => void;
type InputRefSetter = (element: unknown) => void;
type MacroOption = {
  id: string;
  name: string;
};
type LayoutTemplate = {
  id: string;
  name: string;
  scope: 'personal' | 'team';
  updatedAt: string;
  updatedBy?: string | null;
  readOnly?: boolean;
};
type WorkspaceQuickSlot = {
  id: string;
  name: string;
  savedAt: string;
};
type WorkspaceDraftMeta = {
  savedAt: string;
  size: number;
};
type TeamTemplateAudit = {
  id: string;
  name: string;
  updatedBy?: string | null;
  updatedAt: string;
};

const props = defineProps<{
  project: Project | null;
  error: string;
  studioDenseMode: boolean;
  studioImmersiveMode: boolean;
  showHotkeyHelp: boolean;
  episodes: EpisodeDomain[];
  selectedEpisodeId: string;
  timelineTitle: string;
  loading: boolean;
  desktopIngestStatus: string;
  quickCommand: string;
  quickCommandFeedback: string;
  macroName: string;
  macroCommandText: string;
  savedMacros: MacroOption[];
  selectedMacroId: string;
  globalMacroNameDraft: string;
  selectedGlobalMacroId: string;
  globalMacros: MacroOption[];
  timelineSyncEnabled: boolean;
  selectedClipSummary: string;
  workspacePresetId: 'custom' | 'focus' | 'review' | 'cinema';
  autoSaveEnabled: boolean;
  localDraftMeta: WorkspaceDraftMeta | null;
  dockLayoutMode: 'left' | 'right' | 'float';
  clipPanelLayoutMode: 'left' | 'right' | 'float';
  layoutTemplateName: string;
  layoutTemplateScope: 'personal' | 'team';
  selectedWorkspaceQuickSlotId: string;
  workspaceQuickSlots: WorkspaceQuickSlot[];
  latestTeamTemplateAudit: TeamTemplateAudit | null;
  highlightedTemplateId: string;
  layoutTemplates: LayoutTemplate[];
  lastAutoSaveAt: string;
  setQuickCommandInputRef: InputRefSetter;
  setMacroImportInputRef: InputRefSetter;
  setWorkspaceImportInputRef: InputRefSetter;
  goProject: AsyncAction;
  loadAll: AsyncAction;
  toggleStudioDenseMode: AsyncAction;
  toggleStudioImmersiveMode: AsyncAction;
  toggleHotkeyHelp: AsyncAction;
  loadTimeline: AsyncAction;
  saveTimeline: AsyncAction;
  createTimelineAudioTasks: AsyncAction;
  syncCompletedAudioToTimeline: AsyncAction;
  generateSubtitleTrackForTimeline: AsyncAction;
  createMergeByTimeline: AsyncAction;
  goFramePromptWorkbench: AsyncAction;
  goStoryboardWorkbench: AsyncAction;
  goAssetWorkbench: AsyncAction;
  postproductionMessage: string;
  runQuickCommand: AsyncAction;
  saveMacroCommand: AsyncAction;
  exportMacroCommands: AsyncAction;
  triggerMacroImport: AsyncAction;
  runSelectedMacro: AsyncAction;
  loadSelectedMacroToDraft: AsyncAction;
  renameSelectedMacro: AsyncAction;
  overwriteSelectedMacroCommands: AsyncAction;
  deleteSelectedMacro: AsyncAction;
  saveSelectedMacroToGlobal: AsyncAction;
  handleMacroImportFileChange: (event: Event) => void | Promise<void>;
  runSelectedGlobalMacro: AsyncAction;
  importSelectedGlobalMacroToLocal: AsyncAction;
  renameSelectedGlobalMacro: AsyncAction;
  deleteSelectedGlobalMacro: AsyncAction;
  applyWorkspacePreset: AsyncAction;
  saveWorkspaceDraftToLocal: DraftSaveSetter;
  restoreWorkspaceDraftFromLocal: AsyncAction;
  clearWorkspaceDraft: AsyncAction;
  exportWorkspaceDraft: AsyncAction;
  triggerWorkspaceImport: AsyncAction;
  handleWorkspaceImportFileChange: (event: Event) => void | Promise<void>;
  saveCurrentLayoutTemplate: AsyncAction;
  saveWorkspaceQuickSlot: AsyncAction;
  restoreWorkspaceQuickSlot: AsyncAction;
  deleteWorkspaceQuickSlot: AsyncAction;
  focusTemplateCard: (id: string) => void | Promise<void>;
  applyLayoutTemplate: (id: string) => void | Promise<void>;
  renameLayoutTemplate: (id: string) => void | Promise<void>;
  deleteLayoutTemplate: (id: string) => void | Promise<void>;
  forkTeamTemplateToPersonal: (id: string) => void | Promise<void>;
}>();

const emit = defineEmits<{
  (e: 'update:selectedEpisodeId', value: string): void;
  (e: 'update:timelineTitle', value: string): void;
  (e: 'update:quickCommand', value: string): void;
  (e: 'update:macroName', value: string): void;
  (e: 'update:macroCommandText', value: string): void;
  (e: 'update:selectedMacroId', value: string): void;
  (e: 'update:globalMacroNameDraft', value: string): void;
  (e: 'update:selectedGlobalMacroId', value: string): void;
  (e: 'update:timelineSyncEnabled', value: boolean): void;
  (e: 'update:workspacePresetId', value: 'custom' | 'focus' | 'review' | 'cinema'): void;
  (e: 'update:autoSaveEnabled', value: boolean): void;
  (e: 'update:dockLayoutMode', value: 'left' | 'right' | 'float'): void;
  (e: 'update:clipPanelLayoutMode', value: 'left' | 'right' | 'float'): void;
  (e: 'update:layoutTemplateName', value: string): void;
  (e: 'update:layoutTemplateScope', value: 'personal' | 'team'): void;
  (e: 'update:selectedWorkspaceQuickSlotId', value: string): void;
}>();

const selectedEpisodeIdModel = computed({
  get: () => props.selectedEpisodeId,
  set: (value: string) => emit('update:selectedEpisodeId', value)
});
const timelineTitleModel = computed({
  get: () => props.timelineTitle,
  set: (value: string) => emit('update:timelineTitle', value)
});
const quickCommandModel = computed({
  get: () => props.quickCommand,
  set: (value: string) => emit('update:quickCommand', value)
});
const macroNameModel = computed({
  get: () => props.macroName,
  set: (value: string) => emit('update:macroName', value)
});
const macroCommandTextModel = computed({
  get: () => props.macroCommandText,
  set: (value: string) => emit('update:macroCommandText', value)
});
const selectedMacroIdModel = computed({
  get: () => props.selectedMacroId,
  set: (value: string) => emit('update:selectedMacroId', value)
});
const globalMacroNameDraftModel = computed({
  get: () => props.globalMacroNameDraft,
  set: (value: string) => emit('update:globalMacroNameDraft', value)
});
const selectedGlobalMacroIdModel = computed({
  get: () => props.selectedGlobalMacroId,
  set: (value: string) => emit('update:selectedGlobalMacroId', value)
});
const timelineSyncEnabledModel = computed({
  get: () => props.timelineSyncEnabled,
  set: (value: boolean) => emit('update:timelineSyncEnabled', value)
});
const workspacePresetIdModel = computed({
  get: () => props.workspacePresetId,
  set: (value: 'custom' | 'focus' | 'review' | 'cinema') => emit('update:workspacePresetId', value)
});
const autoSaveEnabledModel = computed({
  get: () => props.autoSaveEnabled,
  set: (value: boolean) => emit('update:autoSaveEnabled', value)
});
const dockLayoutModeModel = computed({
  get: () => props.dockLayoutMode,
  set: (value: 'left' | 'right' | 'float') => emit('update:dockLayoutMode', value)
});
const clipPanelLayoutModeModel = computed({
  get: () => props.clipPanelLayoutMode,
  set: (value: 'left' | 'right' | 'float') => emit('update:clipPanelLayoutMode', value)
});
const layoutTemplateNameModel = computed({
  get: () => props.layoutTemplateName,
  set: (value: string) => emit('update:layoutTemplateName', value)
});
const layoutTemplateScopeModel = computed({
  get: () => props.layoutTemplateScope,
  set: (value: 'personal' | 'team') => emit('update:layoutTemplateScope', value)
});
const selectedWorkspaceQuickSlotIdModel = computed({
  get: () => props.selectedWorkspaceQuickSlotId,
  set: (value: string) => emit('update:selectedWorkspaceQuickSlotId', value)
});
</script>

<style scoped>
.command-panel {
  border: 1px solid var(--line);
  background: var(--surface-spotlight);
}

.command-input {
  min-width: 420px;
  flex: 1;
}

.template-list {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.team-audit-banner {
  position: sticky;
  top: 0;
  z-index: 1;
  border: 1px solid var(--status-info-border);
  border-radius: var(--radius-sm);
  background: var(--status-info-bg);
  padding: 6px 8px;
  color: var(--status-info-ink);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.template-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-canvas);
  padding: 8px;
}

.template-card.highlighted {
  border-color: var(--brand);
  box-shadow: var(--selection-ring-strong);
}

@media (max-width: 980px) {
  .command-input {
    min-width: 100%;
  }
}
</style>
