import { computed, ref, watch, type Ref } from 'vue';

type SavedMacroCommand = { id: string; name: string; commands: string[] };

type UseTimelineMacrosOptions = {
  globalMacroStorageKey: string;
  quickCommandFeedback: Ref<string>;
  pushCommandHistory: (action: string, detail?: string, command?: string) => void;
  executeQuickCommand: (command: string, options?: { fromReplay?: boolean }) => boolean;
};

export const useTimelineMacros = (options: UseTimelineMacrosOptions) => {
  const macroImportInputRef = ref<HTMLInputElement | null>(null);
  const macroName = ref('');
  const macroCommandText = ref('');
  const selectedMacroId = ref('');
  const savedMacros = ref<SavedMacroCommand[]>([]);
  const globalMacros = ref<SavedMacroCommand[]>([]);
  const selectedGlobalMacroId = ref('');
  const globalMacroNameDraft = ref('');

  const selectedMacro = computed(() => savedMacros.value.find((item) => item.id === selectedMacroId.value) || null);
  const selectedGlobalMacro = computed(() => globalMacros.value.find((item) => item.id === selectedGlobalMacroId.value) || null);

  const loadGlobalMacros = (): void => {
    try {
      const raw = localStorage.getItem(options.globalMacroStorageKey);
      if (!raw) {
        globalMacros.value = [];
        return;
      }
      const parsed = JSON.parse(raw) as Array<{ name?: unknown; commands?: unknown }>;
      if (!Array.isArray(parsed)) {
        globalMacros.value = [];
        return;
      }
      globalMacros.value = parsed
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const name = typeof item.name === 'string' ? item.name.trim() : '';
          const commands = Array.isArray(item.commands)
            ? item.commands.map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : '')).filter(Boolean)
            : [];
          return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            commands,
          };
        })
        .filter((item) => item.name && item.commands.length > 0)
        .slice(0, 200);
    } catch {
      globalMacros.value = [];
    }
  };

  const persistGlobalMacros = (): void => {
    try {
      localStorage.setItem(
        options.globalMacroStorageKey,
        JSON.stringify(globalMacros.value.map((item) => ({ name: item.name, commands: item.commands })))
      );
    } catch {
      // ignore storage errors
    }
  };

  const triggerMacroImport = (): void => {
    macroImportInputRef.value?.click();
  };

  const parseImportedMacros = (raw: unknown): SavedMacroCommand[] => {
    const source = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && Array.isArray((raw as { macros?: unknown }).macros)
        ? (raw as { macros: unknown[] }).macros
        : [];
    const imported: SavedMacroCommand[] = [];
    for (const item of source) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const name = typeof (item as { name?: unknown }).name === 'string' ? (item as { name: string }).name.trim() : '';
      const commandsRaw = (item as { commands?: unknown }).commands;
      const commands = Array.isArray(commandsRaw)
        ? commandsRaw.map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : '')).filter(Boolean)
        : [];
      if (!name || commands.length === 0) {
        continue;
      }
      imported.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        commands,
      });
    }
    return imported;
  };

  const handleMacroImportFileChange = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }
    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as unknown;
      const imported = parseImportedMacros(parsed);
      if (imported.length === 0) {
        options.quickCommandFeedback.value = '导入失败：未解析到有效宏命令';
        return;
      }
      savedMacros.value = [...imported, ...savedMacros.value].slice(0, 50);
      selectedMacroId.value = imported[0].id;
      options.pushCommandHistory('import-macro', `导入 ${imported.length} 条宏命令`);
      options.quickCommandFeedback.value = `已导入 ${imported.length} 条宏命令`;
    } catch {
      options.quickCommandFeedback.value = '导入失败：JSON 格式错误';
    } finally {
      if (input) {
        input.value = '';
      }
    }
  };

  const exportMacroCommands = (): void => {
    const payload = {
      exportedAt: new Date().toISOString(),
      macros: savedMacros.value.map((item) => ({ name: item.name, commands: item.commands })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `timeline-macros-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    options.pushCommandHistory('export-macro', `导出 ${savedMacros.value.length} 条宏命令`);
    options.quickCommandFeedback.value = '宏命令 JSON 已导出';
  };

  const loadSelectedMacroToDraft = (): void => {
    const macro = selectedMacro.value;
    if (!macro) {
      return;
    }
    macroName.value = macro.name;
    macroCommandText.value = macro.commands.join(';');
    options.quickCommandFeedback.value = `已载入宏命令：${macro.name}`;
  };

  const saveMacroCommand = (): void => {
    const name = macroName.value.trim();
    const parsed = macroCommandText.value
      .split(';')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    if (!name || parsed.length === 0) {
      options.quickCommandFeedback.value = '宏命令名称和命令序列不能为空';
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    savedMacros.value = [{ id, name, commands: parsed }, ...savedMacros.value].slice(0, 20);
    selectedMacroId.value = id;
    options.pushCommandHistory('save-macro', `${name} (${parsed.join(';')})`);
    options.quickCommandFeedback.value = `已保存宏命令：${name}`;
  };

  const saveSelectedMacroToGlobal = (): void => {
    const macro = selectedMacro.value;
    if (!macro) {
      return;
    }
    const name = globalMacroNameDraft.value.trim() || macro.name;
    const item: SavedMacroCommand = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      commands: [...macro.commands],
    };
    globalMacros.value = [item, ...globalMacros.value].slice(0, 200);
    selectedGlobalMacroId.value = item.id;
    persistGlobalMacros();
    options.quickCommandFeedback.value = `已存入全局宏库：${name}`;
  };

  const renameSelectedMacro = (): void => {
    const macro = selectedMacro.value;
    const nextName = macroName.value.trim();
    if (!macro || !nextName) {
      options.quickCommandFeedback.value = '重命名失败：请先选择宏并填写名称';
      return;
    }
    savedMacros.value = savedMacros.value.map((item) => (item.id === macro.id ? { ...item, name: nextName } : item));
    options.pushCommandHistory('rename-macro', `${macro.name} -> ${nextName}`);
    options.quickCommandFeedback.value = `已重命名为：${nextName}`;
  };

  const overwriteSelectedMacroCommands = (): void => {
    const macro = selectedMacro.value;
    const parsed = macroCommandText.value
      .split(';')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    if (!macro || parsed.length === 0) {
      options.quickCommandFeedback.value = '覆盖失败：请先选择宏并填写命令序列';
      return;
    }
    savedMacros.value = savedMacros.value.map((item) => (item.id === macro.id ? { ...item, commands: parsed } : item));
    options.pushCommandHistory('overwrite-macro', `${macro.name} (${parsed.join(';')})`);
    options.quickCommandFeedback.value = `已覆盖宏命令：${macro.name}`;
  };

  const deleteSelectedMacro = (): void => {
    const macro = selectedMacro.value;
    if (!macro) {
      return;
    }
    savedMacros.value = savedMacros.value.filter((item) => item.id !== macro.id);
    selectedMacroId.value = savedMacros.value[0]?.id || '';
    options.pushCommandHistory('delete-macro', macro.name);
    options.quickCommandFeedback.value = `已删除宏命令：${macro.name}`;
  };

  const importSelectedGlobalMacroToLocal = (): void => {
    const macro = selectedGlobalMacro.value;
    if (!macro) {
      return;
    }
    const localMacro: SavedMacroCommand = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: macro.name,
      commands: [...macro.commands],
    };
    savedMacros.value = [localMacro, ...savedMacros.value].slice(0, 50);
    selectedMacroId.value = localMacro.id;
    options.quickCommandFeedback.value = `已导入到当前项目：${macro.name}`;
  };

  const renameSelectedGlobalMacro = (): void => {
    const macro = selectedGlobalMacro.value;
    if (!macro) {
      return;
    }
    const nextName = window.prompt('请输入新的全局宏名称', macro.name)?.trim();
    if (!nextName) {
      return;
    }
    globalMacros.value = globalMacros.value.map((item) => (item.id === macro.id ? { ...item, name: nextName } : item));
    persistGlobalMacros();
    options.quickCommandFeedback.value = `已重命名全局宏：${nextName}`;
  };

  const deleteSelectedGlobalMacro = (): void => {
    const macro = selectedGlobalMacro.value;
    if (!macro) {
      return;
    }
    globalMacros.value = globalMacros.value.filter((item) => item.id !== macro.id);
    selectedGlobalMacroId.value = globalMacros.value[0]?.id || '';
    persistGlobalMacros();
    options.quickCommandFeedback.value = `已删除全局宏：${macro.name}`;
  };

  const runSelectedGlobalMacro = (): void => {
    const macro = selectedGlobalMacro.value;
    if (!macro) {
      return;
    }
    for (const command of macro.commands) {
      options.executeQuickCommand(command, { fromReplay: true });
    }
    options.pushCommandHistory('run-global-macro', macro.name, macro.commands.join(';'));
    options.quickCommandFeedback.value = `已执行全局宏：${macro.name}`;
  };

  const runSelectedMacro = (): void => {
    const macro = selectedMacro.value;
    if (!macro) {
      return;
    }
    for (const command of macro.commands) {
      options.executeQuickCommand(command, { fromReplay: true });
    }
    options.pushCommandHistory('run-macro', macro.name, macro.commands.join(';'));
    options.quickCommandFeedback.value = `已执行宏命令：${macro.name}`;
  };

  watch(selectedMacroId, (value) => {
    if (!value) {
      return;
    }
    const macro = savedMacros.value.find((item) => item.id === value);
    if (!macro) {
      return;
    }
    macroName.value = macro.name;
    macroCommandText.value = macro.commands.join(';');
  });

  return {
    deleteSelectedGlobalMacro,
    deleteSelectedMacro,
    exportMacroCommands,
    globalMacroNameDraft,
    globalMacros,
    handleMacroImportFileChange,
    importSelectedGlobalMacroToLocal,
    loadGlobalMacros,
    loadSelectedMacroToDraft,
    macroCommandText,
    macroImportInputRef,
    macroName,
    overwriteSelectedMacroCommands,
    renameSelectedGlobalMacro,
    renameSelectedMacro,
    runSelectedGlobalMacro,
    runSelectedMacro,
    saveMacroCommand,
    saveSelectedMacroToGlobal,
    savedMacros,
    selectedGlobalMacroId,
    selectedMacroId,
    triggerMacroImport,
  };
};
