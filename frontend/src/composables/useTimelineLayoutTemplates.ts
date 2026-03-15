import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue';
import {
  deleteTeamWorkspaceLayoutTemplate,
  getTeamWorkspaceLayoutTemplates,
  saveTeamWorkspaceLayoutTemplate,
} from '@/api/timeline-editor';
import type { TeamWorkspaceLayoutTemplate } from '@/types/models';

type LayoutTemplateUiPrefs = Record<string, unknown>;

type WorkspaceLayoutTemplate = {
  id: string;
  name: string;
  scope: 'personal' | 'team';
  contextScope: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
  updatedByRole?: string;
  readOnly?: boolean;
  uiPrefs: LayoutTemplateUiPrefs;
};

type UseTimelineLayoutTemplatesOptions = {
  workspaceScopeToken: ComputedRef<string>;
  workspaceLayoutTemplatesStorageKey: string;
  buildCurrentUiPrefs: () => LayoutTemplateUiPrefs;
  applyUiPrefs: (prefs: LayoutTemplateUiPrefs) => void;
  persistUiPrefs: () => void;
  quickCommandFeedback: Ref<string>;
};

export const useTimelineLayoutTemplates = (options: UseTimelineLayoutTemplatesOptions) => {
  const highlightedTemplateId = ref('');
  const layoutTemplateName = ref('');
  const layoutTemplateScope = ref<'personal' | 'team'>('personal');
  const personalLayoutTemplates = ref<WorkspaceLayoutTemplate[]>([]);
  const teamLayoutTemplates = ref<WorkspaceLayoutTemplate[]>([]);
  let templateHighlightTimer: number | null = null;

  const layoutTemplates = computed(() =>
    [...personalLayoutTemplates.value, ...teamLayoutTemplates.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  );

  const latestTeamTemplateAudit = computed(() => {
    if (teamLayoutTemplates.value.length === 0) {
      return null;
    }
    const [latest] = [...teamLayoutTemplates.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return latest ?? null;
  });

  const loadPersonalLayoutTemplates = (): void => {
    try {
      const raw = localStorage.getItem(options.workspaceLayoutTemplatesStorageKey);
      if (!raw) {
        personalLayoutTemplates.value = [];
        return;
      }
      const parsed = JSON.parse(raw) as WorkspaceLayoutTemplate[];
      if (!Array.isArray(parsed)) {
        personalLayoutTemplates.value = [];
        return;
      }
      personalLayoutTemplates.value = parsed
        .filter((item) => item && item.scope === 'personal' && item.contextScope === options.workspaceScopeToken.value)
        .slice(0, 40);
    } catch {
      personalLayoutTemplates.value = [];
    }
  };

  const persistPersonalLayoutTemplates = (): void => {
    try {
      const raw = localStorage.getItem(options.workspaceLayoutTemplatesStorageKey);
      const existing = raw ? (JSON.parse(raw) as WorkspaceLayoutTemplate[]) : [];
      const survivors = Array.isArray(existing)
        ? existing.filter((item) => item.contextScope !== options.workspaceScopeToken.value)
        : [];
      localStorage.setItem(
        options.workspaceLayoutTemplatesStorageKey,
        JSON.stringify([...survivors, ...personalLayoutTemplates.value].slice(0, 120))
      );
    } catch {
      // ignore storage errors
    }
  };

  const loadTeamLayoutTemplates = async (): Promise<void> => {
    try {
      const list = await getTeamWorkspaceLayoutTemplates(options.workspaceScopeToken.value);
      teamLayoutTemplates.value = list.slice(0, 40).map((item: TeamWorkspaceLayoutTemplate, idx) => ({
        id: `team-${item.name}-${idx}`,
        name: item.name,
        scope: 'team',
        contextScope: item.contextScope,
        createdAt: item.updatedAt,
        updatedAt: item.updatedAt,
        updatedBy: item.updatedBy,
        updatedByRole: item.updatedByRole,
        readOnly: Boolean(item.readOnly),
        uiPrefs: item.uiPrefs as LayoutTemplateUiPrefs,
      }));
    } catch {
      teamLayoutTemplates.value = [];
    }
  };

  const saveCurrentLayoutTemplate = async (): Promise<void> => {
    const name = layoutTemplateName.value.trim();
    if (!name) {
      options.quickCommandFeedback.value = '请输入布局模板名称';
      return;
    }
    const now = new Date().toISOString();
    const nextItem: WorkspaceLayoutTemplate = {
      id: `${layoutTemplateScope.value}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      scope: layoutTemplateScope.value,
      contextScope: options.workspaceScopeToken.value,
      createdAt: now,
      updatedAt: now,
      uiPrefs: options.buildCurrentUiPrefs(),
    };
    if (layoutTemplateScope.value === 'team') {
      try {
        await saveTeamWorkspaceLayoutTemplate(options.workspaceScopeToken.value, name, nextItem.uiPrefs);
        await loadTeamLayoutTemplates();
      } catch {
        options.quickCommandFeedback.value = '团队模板保存失败';
        return;
      }
    } else {
      personalLayoutTemplates.value = [nextItem, ...personalLayoutTemplates.value].slice(0, 40);
      persistPersonalLayoutTemplates();
    }
    options.quickCommandFeedback.value = `已保存布局模板：${name}`;
  };

  const focusTemplateCard = (id: string): void => {
    if (!id) {
      return;
    }
    highlightedTemplateId.value = id;
    if (templateHighlightTimer !== null) {
      window.clearTimeout(templateHighlightTimer);
    }
    templateHighlightTimer = window.setTimeout(() => {
      highlightedTemplateId.value = '';
    }, 2200);
    if (typeof document !== 'undefined') {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('.template-card'));
      const target = nodes.find((node) => node.dataset.templateId === id);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const applyLayoutTemplate = (id: string): void => {
    const tpl = layoutTemplates.value.find((item) => item.id === id);
    if (!tpl) {
      return;
    }
    options.applyUiPrefs(tpl.uiPrefs);
    options.persistUiPrefs();
    options.quickCommandFeedback.value = `已应用布局模板：${tpl.name}`;
  };

  const renameLayoutTemplate = async (id: string): Promise<void> => {
    const tpl = layoutTemplates.value.find((item) => item.id === id);
    if (!tpl) {
      return;
    }
    if (tpl.scope === 'team' && tpl.readOnly) {
      options.quickCommandFeedback.value = '团队模板为只读，请使用 Fork 到个人';
      return;
    }
    const next = window.prompt('请输入新模板名', tpl.name)?.trim();
    if (!next) {
      return;
    }
    if (tpl.scope === 'team') {
      try {
        await saveTeamWorkspaceLayoutTemplate(options.workspaceScopeToken.value, next, tpl.uiPrefs);
        await loadTeamLayoutTemplates();
        options.quickCommandFeedback.value = `已重命名团队模板：${next}`;
      } catch {
        options.quickCommandFeedback.value = '团队模板重命名失败';
      }
      return;
    }
    personalLayoutTemplates.value = personalLayoutTemplates.value.map((item) =>
      item.id === id ? { ...item, name: next, updatedAt: new Date().toISOString() } : item
    );
    persistPersonalLayoutTemplates();
  };

  const deleteLayoutTemplate = async (id: string): Promise<void> => {
    const target = layoutTemplates.value.find((item) => item.id === id);
    if (!target) {
      return;
    }
    if (target.scope === 'team' && target.readOnly) {
      options.quickCommandFeedback.value = '团队模板为只读，请使用 Fork 到个人';
      return;
    }
    if (target.scope === 'team') {
      try {
        await deleteTeamWorkspaceLayoutTemplate(options.workspaceScopeToken.value, target.name);
        await loadTeamLayoutTemplates();
        options.quickCommandFeedback.value = `已删除团队模板：${target.name}`;
      } catch {
        options.quickCommandFeedback.value = '团队模板删除失败';
      }
      return;
    }
    personalLayoutTemplates.value = personalLayoutTemplates.value.filter((item) => item.id !== id);
    persistPersonalLayoutTemplates();
  };

  const forkTeamTemplateToPersonal = (id: string): void => {
    const tpl = layoutTemplates.value.find((item) => item.id === id);
    if (!tpl || tpl.scope !== 'team') {
      return;
    }
    const baseName = tpl.name.trim() || 'team-template';
    const forkName = `${baseName}-fork`;
    const now = new Date().toISOString();
    const forked: WorkspaceLayoutTemplate = {
      id: `personal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: forkName,
      scope: 'personal',
      contextScope: options.workspaceScopeToken.value,
      createdAt: now,
      updatedAt: now,
      uiPrefs: tpl.uiPrefs,
    };
    personalLayoutTemplates.value = [forked, ...personalLayoutTemplates.value].slice(0, 40);
    persistPersonalLayoutTemplates();
    options.quickCommandFeedback.value = `已 Fork 团队模板到个人：${forkName}`;
  };

  onBeforeUnmount(() => {
    if (templateHighlightTimer !== null) {
      window.clearTimeout(templateHighlightTimer);
    }
  });

  return {
    applyLayoutTemplate,
    deleteLayoutTemplate,
    focusTemplateCard,
    forkTeamTemplateToPersonal,
    highlightedTemplateId,
    latestTeamTemplateAudit,
    layoutTemplateName,
    layoutTemplateScope,
    layoutTemplates,
    loadPersonalLayoutTemplates,
    loadTeamLayoutTemplates,
    renameLayoutTemplate,
    saveCurrentLayoutTemplate,
  };
};
