<template>
  <div class="rule-tree-root" ref="rootEl">
    <div class="rule-toolbar" v-if="depth === 0">
      <input
        v-model="searchPathInput"
        placeholder="搜索字段路径（如 camera.motion.amount）"
        @input="onSearchInput"
        @keydown.enter.prevent="onSearchEnter($event)"
      />
      <div class="actions" v-if="searchMatchCount > 0">
        <button type="button" :disabled="searchMatchCount <= 0" @click="jumpToPrevMatch">上一个</button>
        <button type="button" :disabled="searchMatchCount <= 0" @click="jumpToNextMatch">下一个</button>
      </div>
      <p class="muted match-stat">命中：{{ activeMatchIndex >= 0 ? activeMatchIndex + 1 : 0 }} / {{ searchMatchCount }}</p>
      <p class="error match-tip" v-if="searchQuery.trim().length > 0 && searchMatchCount <= 0">未找到匹配字段路径</p>
    </div>
    <div class="list" v-if="rules.length > 0">
      <article
        class="card"
        v-for="(rule, idx) in rules"
        :key="`${depth}-${idx}-${rule.key}`"
        draggable="true"
        :class="{
          'drag-over': dragOverIndex === idx,
          'search-match': isSearchMatch(fullPath(rule))
        }"
        @dragstart="onDragStart(idx, $event)"
        @dragover.prevent="onDragOver(idx)"
        @dragleave="onDragLeave(idx)"
        @drop.prevent="onDrop(idx)"
        @dragend="onDragEnd"
      >
        <div class="form">
          <input v-model="rule.key" placeholder="字段名（如 camera）" @input="notifyChanged" />
          <select v-model="rule.type" @change="onTypeChanged(rule)">
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
            <option value="object">object</option>
          </select>
          <input v-if="rule.type === 'string' || rule.type === 'number'" v-model="rule.enumText" placeholder="枚举（逗号分隔，可选）" @input="notifyChanged" />
          <input v-if="rule.type === 'string'" v-model="rule.maxLengthText" type="number" min="1" placeholder="maxLength（可选）" @input="notifyChanged" />
          <input v-if="rule.type === 'number'" v-model="rule.minText" type="number" step="0.01" placeholder="min（可选）" @input="notifyChanged" />
          <input v-if="rule.type === 'number'" v-model="rule.maxText" type="number" step="0.01" placeholder="max（可选）" @input="notifyChanged" />
          <label v-if="rule.type === 'number'"><input v-model="rule.integer" type="checkbox" @change="notifyChanged" /> integer</label>
        </div>
        <div class="actions">
          <button type="button" @click="copyRule(rule)">复制节点</button>
          <button type="button" :disabled="!clipboardNode" @click="pasteRule(idx)">粘贴到后面</button>
          <button type="button" v-if="rule.type === 'object'" @click="addRule(rule.children)">新增子字段</button>
          <button type="button" class="danger" @click="removeRule(idx)">删除字段</button>
        </div>
        <div class="rule-children" v-if="rule.type === 'object'">
          <ProviderOptionRuleTree
            :rules="rule.children"
            :depth="depth + 1"
            :parent-path="fullPath(rule)"
            :search-query="searchQuery"
            :clipboard-node="clipboardNode"
            @change="notifyChanged"
            @copy-node="emit('copy-node', $event)"
            @search-query-update="emit('search-query-update', $event)"
          />
          <p class="muted" v-if="rule.children.length === 0">暂无子字段，点击“新增子字段”。</p>
        </div>
      </article>
    </div>
    <p class="muted" v-else>暂无规则，点击“新增规则”开始配置。</p>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

defineOptions({ name: 'ProviderOptionRuleTree' });

type ProviderOptionRuleType = 'string' | 'number' | 'boolean' | 'object';
type ProviderOptionRuleDraft = {
  key: string;
  type: ProviderOptionRuleType;
  enumText: string;
  minText: string;
  maxText: string;
  maxLengthText: string;
  integer: boolean;
  children: ProviderOptionRuleDraft[];
};

const props = withDefaults(
  defineProps<{
    rules: ProviderOptionRuleDraft[];
    depth?: number;
    parentPath?: string;
    searchQuery?: string;
    clipboardNode?: ProviderOptionRuleDraft | null;
  }>(),
  {
    depth: 0,
    parentPath: '',
    searchQuery: '',
    clipboardNode: null
  }
);

const emit = defineEmits<{
  change: [];
  'copy-node': [rule: ProviderOptionRuleDraft];
  'search-query-update': [value: string];
}>();
const dragFromIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const searchPathInput = ref('');
const rootEl = ref<HTMLElement | null>(null);
const searchMatchCount = ref(0);
const activeMatchIndex = ref(-1);

const createEmptyRule = (): ProviderOptionRuleDraft => ({
  key: '',
  type: 'string',
  enumText: '',
  minText: '',
  maxText: '',
  maxLengthText: '',
  integer: false,
  children: []
});

const notifyChanged = (): void => {
  emit('change');
  if (props.depth === 0) {
    void refreshSearchMatches(false);
  }
};

const normalizePath = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, '');

const fullPath = (rule: ProviderOptionRuleDraft): string => {
  const base = props.parentPath?.trim();
  return base ? `${base}.${rule.key.trim()}` : rule.key.trim();
};

const isSearchMatch = (path: string): boolean => {
  const q = normalizePath(props.searchQuery ?? '');
  if (!q) {
    return false;
  }
  return normalizePath(path).includes(q);
};

const onSearchInput = (): void => {
  emit('search-query-update', searchPathInput.value);
};
const onSearchEnter = (event: KeyboardEvent): void => {
  if (event.shiftKey) {
    jumpToPrevMatch();
    return;
  }
  jumpToNextMatch();
};

const collectSearchMatchCards = (): HTMLElement[] => {
  if (!rootEl.value) {
    return [];
  }
  return Array.from(rootEl.value.querySelectorAll('.card.search-match')) as HTMLElement[];
};

const clearActiveSearchMark = (): void => {
  if (!rootEl.value) {
    return;
  }
  const nodes = Array.from(rootEl.value.querySelectorAll('.card.search-active'));
  for (const node of nodes) {
    node.classList.remove('search-active');
  }
};

const renderActiveSearchMark = (cards: HTMLElement[]): void => {
  clearActiveSearchMark();
  if (activeMatchIndex.value < 0 || activeMatchIndex.value >= cards.length) {
    return;
  }
  const activeCard = cards[activeMatchIndex.value];
  activeCard.classList.add('search-active');
  activeCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
};

const refreshSearchMatches = async (resetActive: boolean): Promise<void> => {
  if (props.depth !== 0) {
    return;
  }
  await nextTick();
  const cards = collectSearchMatchCards();
  searchMatchCount.value = cards.length;
  if (cards.length <= 0) {
    activeMatchIndex.value = -1;
    clearActiveSearchMark();
    return;
  }
  if (resetActive || activeMatchIndex.value < 0 || activeMatchIndex.value >= cards.length) {
    activeMatchIndex.value = 0;
  }
  renderActiveSearchMark(cards);
};

const jumpToNextMatch = (): void => {
  if (props.depth !== 0 || searchMatchCount.value <= 0) {
    return;
  }
  const cards = collectSearchMatchCards();
  if (cards.length <= 0) {
    return;
  }
  activeMatchIndex.value = (activeMatchIndex.value + 1 + cards.length) % cards.length;
  renderActiveSearchMark(cards);
};

const jumpToPrevMatch = (): void => {
  if (props.depth !== 0 || searchMatchCount.value <= 0) {
    return;
  }
  const cards = collectSearchMatchCards();
  if (cards.length <= 0) {
    return;
  }
  activeMatchIndex.value = (activeMatchIndex.value - 1 + cards.length) % cards.length;
  renderActiveSearchMark(cards);
};

watch(
  () => props.searchQuery,
  (value) => {
    if ((value ?? '') !== searchPathInput.value) {
      searchPathInput.value = value ?? '';
    }
    void refreshSearchMatches(true);
  },
  { immediate: true }
);

const addRule = (list: ProviderOptionRuleDraft[]): void => {
  list.push(createEmptyRule());
  notifyChanged();
};

const removeRule = (idx: number): void => {
  props.rules.splice(idx, 1);
  notifyChanged();
};

const onTypeChanged = (rule: ProviderOptionRuleDraft): void => {
  if (rule.type !== 'object') {
    rule.children = [];
  }
  notifyChanged();
};

const onDragStart = (idx: number, event: DragEvent): void => {
  dragFromIndex.value = idx;
  dragOverIndex.value = idx;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(idx));
  }
};

const onDragOver = (idx: number): void => {
  dragOverIndex.value = idx;
};

const onDragLeave = (idx: number): void => {
  if (dragOverIndex.value === idx) {
    dragOverIndex.value = null;
  }
};

const onDrop = (idx: number): void => {
  const from = dragFromIndex.value;
  if (from === null || from === idx || from < 0 || from >= props.rules.length || idx < 0 || idx >= props.rules.length) {
    dragFromIndex.value = null;
    dragOverIndex.value = null;
    return;
  }
  const [moved] = props.rules.splice(from, 1);
  props.rules.splice(idx, 0, moved);
  dragFromIndex.value = null;
  dragOverIndex.value = null;
  notifyChanged();
};

const onDragEnd = (): void => {
  dragFromIndex.value = null;
  dragOverIndex.value = null;
};

const cloneRule = (rule: ProviderOptionRuleDraft): ProviderOptionRuleDraft => ({
  key: rule.key,
  type: rule.type,
  enumText: rule.enumText,
  minText: rule.minText,
  maxText: rule.maxText,
  maxLengthText: rule.maxLengthText,
  integer: rule.integer,
  children: rule.children.map((item) => cloneRule(item))
});

const copyRule = (rule: ProviderOptionRuleDraft): void => {
  emit('copy-node', cloneRule(rule));
};

const pasteRule = (idx: number): void => {
  if (!props.clipboardNode) {
    return;
  }
  props.rules.splice(idx + 1, 0, cloneRule(props.clipboardNode));
  notifyChanged();
};
</script>

<style scoped>
.rule-toolbar {
  margin-bottom: 8px;
}

.rule-children {
  margin-top: 8px;
  padding-left: 12px;
  border-left: 2px solid #e2e8f0;
}

.drag-over {
  outline: 2px dashed #3b82f6;
  outline-offset: 2px;
}

.search-match {
  box-shadow: 0 0 0 2px #f59e0b inset;
}

.search-active {
  box-shadow: 0 0 0 2px #f59e0b inset, 0 0 0 3px #0ea5e9;
}

.match-stat {
  margin: 0;
}

.match-tip {
  margin: 0;
}
</style>
