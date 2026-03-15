<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="project-detail-shell" compact>
      <template #rail>
        <section class="panel project-hero-panel" v-if="project">
          <div class="inline-between">
            <div>
              <h2>{{ drama?.name || project.name }}</h2>
              <p class="muted">{{ drama?.description || project.description || '无描述' }}</p>
              <div v-if="drama?.id" style="margin-top: 8px">
                <label>画风：
                  <select v-model="dramaStyle" @change="updateStyle">
                    <option v-for="opt in styleOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </label>
              </div>
            </div>
            <div class="actions">
              <button @click="goProjects">返回项目列表</button>
              <button @click="refreshAll">刷新</button>
            </div>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
          <div v-if="quotaExceededHintVisible" class="actions" style="margin-top: 8px">
            <button @click="goTaskQuotaPanel">前往任务中心调整配额</button>
          </div>
        </section>

        <section id="project-stage-flow" class="panel">
          <h3>主线流程</h3>
          <div class="actions" style="margin-bottom: 8px">
            <label>
              分集作用域
              <select v-model="stageEpisodeScope">
                <option value="">全部分集（批处理）</option>
                <option v-for="item in workflowEpisodes" :key="`scope-${item.episode.id}`" :value="item.episode.id">
                  第 {{ item.episode.orderIndex }} 集 · {{ item.episode.title }}
                </option>
              </select>
            </label>
            <button @click="goEpisodeStudio">进入分集工作台</button>
            <button class="primary" @click="goWorkflowBatchPanel">按集批处理面板</button>
          </div>
          <RouteRestoreHint :text="stageScopeRestoredTip" />
          <div class="stage-rail">
            <article
              v-for="item in stageItems"
              :key="item.key"
              class="stage-card"
              :class="{ active: item.active, done: item.done }">
              <p class="muted">Step {{ item.index }}</p>
              <h4>{{ item.label }}</h4>
              <p class="muted">{{ item.hint }}</p>
              <p v-if="item.blocker" class="stage-blocker">{{ item.blocker }}</p>
              <div class="actions">
                <button :class="item.active ? 'primary' : ''" :disabled="Boolean(item.blocker)" @click="goStageCta(item.key)">
                  {{ item.ctaLabel }}
                </button>
                <button
                  v-if="item.blocker && item.repairable"
                  :disabled="stageRepairing !== null || repairPreparing"
                  @click="openAutoRepairConfirm(item.key)">
                  {{ stageRepairing === item.key || (repairPreparing && repairDraft?.stage === item.key) ? '修复中...' : '自动修复' }}
                </button>
              </div>
            </article>
          </div>
          <p class="muted stage-tip">当前阶段：{{ workflow?.stage.current || '-' }}，下一动作：{{ workflow?.stage.nextAction || '-' }}</p>
          <ConfirmActionPanel
            :visible="repairDraft !== null"
            title="自动修复确认（Dry-Run）"
            :risk-level="repairDraft?.riskLevel"
            :summary="repairDraft?.summary"
            :impact-items="repairDraft?.impactItems || []"
            :actor="repairDraft?.actor || 'operator'"
            :comment="repairDraft?.comment || ''"
            :confirmed="Boolean(repairDraft?.confirmed)"
            :busy="stageRepairing !== null || repairPreparing"
            confirm-text="执行自动修复"
            cancel-text="取消"
            @update:actor="updateRepairDraft('actor', $event)"
            @update:comment="updateRepairDraft('comment', $event)"
            @update:confirmed="updateRepairDraft('confirmed', $event)"
            @confirm="confirmAutoRepair"
            @cancel="cancelAutoRepair" />
        </section>
      </template>

      <section class="panel" v-if="project">
        <div class="inline-between">
          <div>
            <h3>小说导入</h3>
            <p class="muted">粘贴你的小说正文，一键保存后可继续生成大纲和剧本。</p>
          </div>
          <div class="actions">
            <button :disabled="writingLoading" @click="loadWritingWorkspaceFromScreen">
              {{ writingLoading ? '刷新中...' : '刷新文稿' }}
            </button>
          </div>
        </div>
        <p v-if="writingError" class="error">{{ writingError }}</p>
        <p v-else-if="writingNotice" class="muted">{{ writingNotice }}</p>
        <p v-if="writingGenerationSummary" class="muted">{{ writingGenerationSummary }}</p>

      <div class="writing-grid">
        <article class="card writing-form-card">
          <label class="writing-field">
            <span>小说标题</span>
            <input v-model="novelTitle" type="text" placeholder="输入小说标题" />
          </label>
          <label class="writing-field">
            <span>小说正文</span>
            <textarea v-model="novelContent" rows="16" placeholder="把你的小说正文直接粘贴到这里"></textarea>
          </label>
          <div class="actions">
            <button class="primary" :disabled="novelSaving || !canSaveNovel" @click="saveNovelDraft">
              {{ novelSaving ? '保存中...' : '一键保存' }}
            </button>
            <button :disabled="outlineGenerating || !canGenerateOutlines" @click="generateOutlineDrafts">
              {{ outlineGenerating ? '生成中...' : '生成大纲' }}
            </button>
          </div>
        </article>

        <article class="card writing-side-card">
          <div class="writing-meta">
            <article class="card">
              <p class="muted">小说</p>
              <h4>{{ novelRecord ? '已保存' : '未保存' }}</h4>
              <p class="muted">{{ novelRecord?.updatedAt || '尚未入库' }}</p>
            </article>
            <article class="card">
              <p class="muted">大纲</p>
              <h4>{{ outlines.length }}</h4>
              <p class="muted">章节目标 {{ outlineChapterCount }}</p>
            </article>
            <article class="card">
              <p class="muted">剧本</p>
              <h4>{{ scripts.length }}</h4>
              <p class="muted">{{ selectedScript?.title || '尚未生成' }}</p>
            </article>
          </div>
          <label class="writing-field compact">
            <span>章节数</span>
            <input v-model.number="outlineChapterCount" type="number" min="1" max="20" />
          </label>
          <label class="writing-field compact">
            <span>目标大纲</span>
            <select v-model="selectedOutlineId" :disabled="outlines.length === 0 || scriptGenerating">
              <option value="" disabled>{{ outlines.length === 0 ? '先生成大纲' : '选择一个大纲' }}</option>
              <option v-for="item in outlines" :key="item.id" :value="item.id">
                {{ item.title }}
              </option>
            </select>
          </label>
          <div class="actions">
            <button :disabled="outlineGenerating || !canGenerateOutlines" @click="generateOutlineDrafts">
              {{ outlineGenerating ? '生成中...' : '生成/刷新大纲' }}
            </button>
            <button class="primary" :disabled="scriptGenerating || !selectedOutlineId" @click="generateScriptDraft">
              {{ scriptGenerating ? '生成中...' : '生成剧本' }}
            </button>
          </div>
          <div v-if="selectedOutline" class="writing-outline-preview">
            <p class="muted">当前大纲摘要</p>
            <p>{{ selectedOutline.summary }}</p>
          </div>
        </article>
      </div>

      <div class="writing-grid secondary">
        <article class="card">
          <div class="inline-between">
            <h4>大纲列表</h4>
            <p class="muted">共 {{ outlines.length }} 条</p>
          </div>
          <p v-if="outlines.length === 0" class="muted">保存小说后点击“生成大纲”即可得到章节摘要。</p>
          <div v-else class="writing-list">
            <button
              v-for="item in outlines"
              :key="item.id"
              type="button"
              class="writing-list-item"
              :class="{ active: item.id === selectedOutlineId }"
              @click="selectedOutlineId = item.id">
              <div class="inline-between">
                <strong>{{ item.title }}</strong>
                <span class="muted">#{{ item.orderIndex }}</span>
              </div>
              <p class="muted">{{ item.summary }}</p>
            </button>
          </div>
        </article>

        <article class="card">
          <div class="inline-between">
            <h4>剧本预览</h4>
            <label v-if="scripts.length > 1" class="writing-inline-select">
              <span class="muted">选择剧本</span>
              <select v-model="selectedScriptId">
                <option v-for="item in scripts" :key="item.id" :value="item.id">
                  {{ item.title }}
                </option>
              </select>
            </label>
          </div>
          <p v-if="scripts.length === 0" class="muted">先保存小说并生成大纲，再点击“生成剧本”。</p>
          <template v-else>
            <p class="muted">{{ selectedScript?.title }} · {{ selectedScript?.updatedAt }}</p>
            <textarea class="writing-preview" :value="selectedScript?.content || ''" rows="16" readonly></textarea>
          </template>
        </article>
      </div>

        <section class="panel">
          <div class="inline-between">
            <h3>分集驾驶舱</h3>
            <button @click="goWorkflowWorkbench">进入流程工作台</button>
          </div>
          <div v-if="workflowEpisodes.length === 0" class="card">
            <p class="muted">暂无分集，请先在 Workflow 中创建/整理分集。</p>
          </div>
          <div v-else class="episode-grid">
            <article class="card episode-card" v-for="item in workflowEpisodes" :key="item.episode.id">
              <div class="inline-between">
                <h4>第 {{ item.episode.orderIndex }} 集 · {{ item.episode.title }}</h4>
                <span class="tag" :class="`tag-${item.workflow.status}`">{{ statusLabelMap[item.workflow.status] }}</span>
              </div>
              <p class="muted">分镜数：{{ item.storyboardCount }} · 最近流转：{{ item.lastAuditAt || '无' }}</p>
              <div class="actions">
                <button @click="goEpisodeWorkbench(item.episode.id, 'storyboard')">分镜</button>
                <button @click="goEpisodeWorkbench(item.episode.id, 'asset')">资产</button>
                <button class="primary" @click="goEpisodeWorkbench(item.episode.id, 'workflow')">流程</button>
                <button @click="goEpisodeWorkbench(item.episode.id, 'delivery')">交付</button>
              </div>
            </article>
          </div>
        </section>
      </section>

      <template #inspector>
        <section class="panel compact-panel">
          <h3>Drama 摘要</h3>
          <div class="summary-grid">
            <article class="card">
              <p class="muted">制作进度</p>
              <h4>{{ workflow?.stage.progressPercent ?? 0 }}%</h4>
              <p class="muted">主线完成度</p>
            </article>
            <article class="card">
              <p class="muted">分集总数</p>
              <h4>{{ workflowEpisodes.length }}</h4>
              <p class="muted">可追踪 workflow 状态</p>
            </article>
            <article class="card">
              <p class="muted">分镜 / 资产</p>
              <h4>{{ workflow?.counts.storyboard ?? 0 }} / {{ workflow?.counts.asset ?? 0 }}</h4>
              <p class="muted">镜头和素材规模</p>
            </article>
            <article class="card">
              <p class="muted">视频 / 合成</p>
              <h4>{{ workflow?.counts.videoTaskDone ?? 0 }} / {{ workflow?.counts.videoTask ?? 0 }}</h4>
              <p class="muted">合成 {{ workflow?.counts.videoMergeDone ?? 0 }} / {{ workflow?.counts.videoMerge ?? 0 }}</p>
            </article>
            <article class="card">
              <p class="muted">音频任务</p>
              <h4>{{ workflow?.counts.audioTaskDone ?? 0 }} / {{ workflow?.counts.audioTask ?? 0 }}</h4>
              <p class="muted">多模态配音进度</p>
            </article>
            <article class="card">
              <p class="muted">待处理分集</p>
              <h4>{{ pendingEpisodesCount }}</h4>
              <p class="muted">draft / in_review / rejected</p>
            </article>
          </div>
        </section>

        <section class="panel compact-panel">
          <h3>工作台导航</h3>
          <div class="nav-grid">
            <article class="card nav-card">
              <h4>Director Studio</h4>
              <p class="muted">导演视角：分镜编排 + 时间线直控</p>
              <div class="actions">
                <button class="primary" @click="goDirectorStudio">进入</button>
              </div>
            </article>
            <article class="card nav-card">
              <h4>Producer Console</h4>
              <p class="muted">制片视角：流程推进 + 交付收口</p>
              <div class="actions">
                <button class="primary" @click="goProducerConsole">进入</button>
              </div>
            </article>
            <article class="card nav-card">
              <h4>Episode Studio</h4>
              <p class="muted">按集管理（创建分集、状态流转、分工入口）</p>
              <div class="actions">
                <button class="primary" @click="goEpisodeStudio">进入</button>
              </div>
            </article>
            <article class="card nav-card">
              <h4>Storyboard Workbench</h4>
              <p class="muted">分镜创作、提示词、时间线入口</p>
              <div class="actions">
                <button class="primary" @click="goStoryboardWorkbench">进入</button>
              </div>
            </article>
            <article class="card nav-card">
              <h4>Asset Workbench</h4>
              <p class="muted">域对象、角色库、资产治理入口</p>
              <div class="actions">
                <button class="primary" @click="goAssetWorkbench">进入</button>
              </div>
            </article>
            <article class="card nav-card">
              <h4>Review Workbench</h4>
              <p class="muted">审核流、任务中心、交付入口</p>
              <div class="actions">
                <button class="primary" @click="goReviewWorkbench">进入</button>
              </div>
            </article>
            <article class="card nav-card">
              <h4>Production Workbench</h4>
              <p class="muted">按角色分工（编剧/导演/资产/后期/交付）的生产工作台</p>
              <div class="actions">
                <button class="primary" @click="goProductionWorkbench">进入</button>
              </div>
            </article>
          </div>
        </section>

        <section class="panel compact-panel">
          <h3>项目摘要</h3>
          <div class="summary-grid">
            <article class="card">
              <p class="muted">项目阶段</p>
              <h4>{{ workflow?.stage.current || '-' }}</h4>
              <p class="muted">next: {{ workflow?.stage.nextAction || '-' }}</p>
            </article>
            <article class="card">
              <p class="muted">进度</p>
              <h4>{{ workflow?.stage.progressPercent ?? 0 }}%</h4>
              <p class="muted">视频任务完成 {{ workflow?.counts.videoTaskDone ?? 0 }} / {{ workflow?.counts.videoTask ?? 0 }}</p>
            </article>
            <article class="card">
              <p class="muted">分镜 / 资产</p>
              <h4>{{ workflow?.counts.storyboard ?? 0 }} / {{ workflow?.counts.asset ?? 0 }}</h4>
              <p class="muted">音频任务 {{ workflow?.counts.audioTaskDone ?? 0 }} / {{ workflow?.counts.audioTask ?? 0 }}</p>
            </article>
          </div>
        </section>
      </template>
    </DesktopWorkbenchShell>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import DesktopWorkbenchShell from '@/components/DesktopWorkbenchShell.vue';
import ConfirmActionPanel from '@/components/ConfirmActionPanel.vue';
import RouteRestoreHint from '@/components/RouteRestoreHint.vue';
import { clearToken } from '@/api/client';
import {
  getDramaDomain,
  updateDramaStyle,
} from '@/api/domain-context';
import {
  getDramaWorkflowEpisodes,
  getDramaWorkflowSummary,
  getProjectWorkflowEpisodes
} from '@/api/project-workflow';
import {
  getProjectWorkflow
} from '@/api/projects';
import {
  createEpisodesVideoTasksBatch,
  createDramaEpisodesVideoTasksBatch,
  generateDramaEpisodesAssetsBatch,
  generateDramaStoryboards,
  generateEpisodesAssetsBatch,
  generateStoryboards,
  precheckDramaEpisodesAssetsBatch,
  precheckDramaEpisodesVideoTasksBatch,
  precheckEpisodesAssetsBatch,
  precheckEpisodesVideoTasksBatch
} from '@/api/workflow-ops';
import {
  generateDramaOutlines,
  generateDramaScript,
  getDramaNovel,
  getDramaOutlines,
  getDramaScripts,
  generateOutlines as generateProjectOutlines,
  generateScript as generateProjectScript,
  getNovel as getProjectNovel,
  getOutlines as getProjectOutlines,
  getScripts,
  saveDramaNovel,
  saveNovel as saveProjectNovel
} from '@/api/studio';
import { getProject } from '@/api/timeline-editor';
import {
  DramaDomain,
  Novel,
  Outline,
  Project,
  ProjectWorkflowSummary,
  ScriptDoc,
  StudioTextGenerationMeta,
  WorkflowEpisodeListItem
} from '@/types/models';
import {
  buildDramaFallbackMessage,
  buildDramaScopedPath,
  buildDramaScopedQuery,
  resolveDramaIdForNavigation,
  resolveProjectIdFromRouteContext
} from '@/utils/route-context';
import { isVideoTaskQuotaExceededError } from '@/utils/errors';
import { buildRouteRestoreTip, replaceQueryIfChanged, toSingleQuery, useRouteRestoreContext } from '@/composables/useRouteRestoreContext';

const route = useRoute();
const router = useRouter();
const routeProjectId = computed(() => String(route.params.id || ''));
const projectId = computed(() => project.value?.id || routeProjectId.value);
const resolvedDramaId = computed(() => {
  const query = toSingleQuery(route.query);
  if (drama.value?.id) {
    return drama.value.id;
  }
  const routeDramaId = route.params.dramaId;
  if (typeof routeDramaId === 'string') {
    return routeDramaId;
  }
  if (query.dramaId) {
    return query.dramaId;
  }
  return '';
});

const project = ref<Project | null>(null);
const workflow = ref<ProjectWorkflowSummary | null>(null);
const drama = ref<DramaDomain | null>(null);
const dramaStyle = ref('');
const styleOptions = [
  { value: '', label: '无风格' },
  { value: 'cinematic', label: '电影感' },
  { value: 'anime', label: '动漫风' },
  { value: 'realistic', label: '写实风' },
  { value: 'illustration', label: '插画风' },
  { value: '水墨风', label: '水墨风' },
  { value: '赛博朋克', label: '赛博朋克' },
  { value: '水彩风', label: '水彩风' },
  { value: '油画风', label: '油画风' },
  { value: '迪士尼风', label: '迪士尼风' },
];
const workflowEpisodes = ref<WorkflowEpisodeListItem[]>([]);
const stageEpisodeScope = ref('');
const {
  restoreTip: stageScopeRestoredTip,
  markRestored: markStageScopeRestored,
  clearRestored: clearStageScopeRestored,
  runRestoreScroll: runStageScopeRestoreScroll
} = useRouteRestoreContext();
const error = ref('');
const quotaExceededHintVisible = ref(false);
const novelRecord = ref<Novel | null>(null);
const outlines = ref<Outline[]>([]);
const scripts = ref<ScriptDoc[]>([]);
const novelTitle = ref('');
const novelContent = ref('');
const selectedOutlineId = ref('');
const selectedScriptId = ref('');
const outlineChapterCount = ref(6);
const writingLoading = ref(false);
const writingError = ref('');
const writingNotice = ref('');
const novelSaving = ref(false);
const outlineGenerating = ref(false);
const scriptGenerating = ref(false);
const writingGeneration = ref<StudioTextGenerationMeta | null>(null);
const writingGenerationAction = ref<'outline' | 'script' | ''>('');
const stageRepairing = ref<null | ProjectWorkflowSummary['stage']['current']>(null);
const repairPreparing = ref(false);
const repairDraft = ref<{
  stage: ProjectWorkflowSummary['stage']['current'];
  actor: string;
  comment: string;
  confirmed: boolean;
  episodeIds?: string[];
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
  impactItems: string[];
} | null>(null);

const statusLabelMap: Record<WorkflowEpisodeListItem['workflow']['status'], string> = {
  draft: '草稿',
  in_review: '审核中',
  approved: '已通过',
  rejected: '已驳回'
};

const pendingEpisodesCount = computed(
  () => workflowEpisodes.value.filter((item) => item.workflow.status !== 'approved').length
);
const defaultNovelTitle = computed(() => (drama.value?.name || project.value?.name || '未命名小说').trim());
const canSaveNovel = computed(() => novelTitle.value.trim().length > 0 && novelContent.value.trim().length > 0);
const canGenerateOutlines = computed(() => canSaveNovel.value || Boolean(novelRecord.value));
const selectedOutline = computed<Outline | null>(
  () => outlines.value.find((item) => item.id === selectedOutlineId.value) ?? outlines.value[0] ?? null
);
const selectedScript = computed<ScriptDoc | null>(
  () => scripts.value.find((item) => item.id === selectedScriptId.value) ?? scripts.value[0] ?? null
);
const isNovelDirty = computed(() => {
  const savedTitle = novelRecord.value?.title ?? defaultNovelTitle.value;
  const savedContent = novelRecord.value?.content ?? '';
  return novelTitle.value.trim() !== savedTitle || novelContent.value.trim() !== savedContent;
});
const writingGenerationSummary = computed(() => {
  if (!writingGeneration.value || !writingGenerationAction.value) {
    return '';
  }
  const actionLabel = writingGenerationAction.value === 'outline' ? '生成大纲' : '生成剧本';
  if (!writingGeneration.value.usedConfiguredModel) {
    return `本次${actionLabel}未命中已配置 text 模型，当前结果可能来自 fallback/mock`;
  }
  const label = writingGeneration.value.modelLabel || writingGeneration.value.model || '未命名模型';
  const providerLabel = [writingGeneration.value.manufacturer, writingGeneration.value.provider].filter(Boolean).join(' / ');
  return providerLabel ? `本次${actionLabel}已调用模型：${label}（${providerLabel}）` : `本次${actionLabel}已调用模型：${label}`;
});

const stageOrder: Array<ProjectWorkflowSummary['stage']['current']> = ['writing', 'storyboard', 'asset', 'video', 'merge', 'done'];
const stageLabels: Record<ProjectWorkflowSummary['stage']['current'], string> = {
  writing: '分镜脚本',
  storyboard: '镜头分镜',
  asset: '角色资产',
  video: '视频任务',
  merge: '视频合成',
  done: '交付完成'
};
const stageHints: Record<ProjectWorkflowSummary['stage']['current'], string> = {
  writing: '小说/大纲/剧本准备',
  storyboard: '分镜拆解与镜头提示词',
  asset: '角色/场景/道具治理',
  video: '按镜头并行出片',
  merge: '时间线编排与合成',
  done: '交付包与验签'
};

const stageItems = computed(() => {
  const current = workflow.value?.stage.current ?? 'writing';
  const currentIndex = stageOrder.indexOf(current);
  const counts = workflow.value?.counts ?? {
    novel: 0,
    outline: 0,
    script: 0,
    storyboard: 0,
    asset: 0,
    videoTask: 0,
    videoTaskDone: 0,
    audioTask: 0,
    audioTaskDone: 0,
    videoMerge: 0,
    videoMergeDone: 0
  };
  const ctaLabelMap: Record<ProjectWorkflowSummary['stage']['current'], string> = {
    writing: '去脚本/分镜',
    storyboard: '去分镜工作台',
    asset: '去资产工作台',
    video: '去流程任务页',
    merge: '去时间线合成',
    done: '去交付页面'
  };
  const blockerMap: Record<ProjectWorkflowSummary['stage']['current'], string | null> = {
    writing:
      counts.novel > 0 && counts.outline > 0 && counts.script > 0
        ? null
        : `前置不足：小说(${counts.novel})/大纲(${counts.outline})/剧本(${counts.script})`,
    storyboard: counts.script > 0 ? null : '前置不足：需要先有剧本',
    asset: counts.storyboard > 0 ? null : '前置不足：需要先生成分镜',
    video: counts.storyboard > 0 && counts.asset > 0 ? null : `前置不足：分镜(${counts.storyboard})/资产(${counts.asset})`,
    merge: counts.videoTaskDone > 0 ? null : '前置不足：至少 1 条视频任务完成',
    done: counts.videoMergeDone > 0 ? null : '前置不足：至少 1 条合成任务完成'
  };
  return stageOrder.map((key, idx) => ({
    key,
    index: idx + 1,
    label: stageLabels[key],
    hint: stageHints[key],
    ctaLabel: ctaLabelMap[key],
    blocker: blockerMap[key],
    repairable: key === 'storyboard' || key === 'asset' || key === 'video',
    active: idx === currentIndex,
    done: idx < currentIndex
  }));
});

const goProjects = () => {
  void router.push('/dramas');
};

const logout = () => {
  clearToken();
  void router.replace('/login');
};

const buildPath = (projectPath: string, dramaPath: string): string =>
  buildDramaScopedPath({ dramaId: resolvedDramaId.value, projectPath, dramaPath });
const buildQuery = (extra?: Record<string, string | undefined>): Record<string, string> =>
  buildDramaScopedQuery(resolvedDramaId.value, extra);

const goStoryboardWorkbench = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/storyboard-workbench`, `/dramas/${resolvedDramaId.value}/storyboard-workbench`),
    query: buildQuery()
  });
};

const goAssetWorkbench = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/asset-workbench`, `/dramas/${resolvedDramaId.value}/asset-workbench`),
    query: buildQuery()
  });
};

const goReviewWorkbench = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/review-workbench`, `/dramas/${resolvedDramaId.value}/review-workbench`),
    query: buildQuery()
  });
};

const goWorkflowWorkbench = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/workflow`, `/dramas/${resolvedDramaId.value}/workflow`),
    query: buildQuery()
  });
};

const goEpisodeStudio = async (): Promise<void> => {
  const currentProjectId = projectId.value;
  if (!currentProjectId) {
    error.value = '无法解析项目上下文';
    return;
  }
  try {
    const dramaId = await resolveDramaIdForNavigation({
      preferredDramaId: resolvedDramaId.value,
      projectId: currentProjectId,
      fallbackName: project.value?.name || 'Untitled Drama',
      fallbackDescription: project.value?.description || undefined
    });
    if (dramaId) {
      error.value = '';
      await router.push(`/dramas/${dramaId}/episodes`);
      return;
    }
    error.value = buildDramaFallbackMessage('已回退项目分集入口');
  } catch (err) {
    error.value = buildDramaFallbackMessage('已回退项目分集入口', err);
  }
  await router.push(`/projects/${currentProjectId}/episodes`);
};

const goDirectorStudio = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/director/planning`, `/dramas/${resolvedDramaId.value}/director/planning`),
    query: buildQuery()
  });
};

const goProducerConsole = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/producer/planning`, `/dramas/${resolvedDramaId.value}/producer/planning`),
    query: buildQuery()
  });
};

const goProductionWorkbench = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/production`, `/dramas/${resolvedDramaId.value}/production`),
    query: buildQuery()
  });
};

const goEpisodeWorkbench = (
  episodeId: string,
  target: 'storyboard' | 'asset' | 'workflow' | 'delivery'
): void => {
  const pathMap: Record<typeof target, string> = {
    storyboard: buildPath(`/projects/${projectId.value}/storyboard-workbench`, `/dramas/${resolvedDramaId.value}/storyboard-workbench`),
    asset: buildPath(`/projects/${projectId.value}/asset-workbench`, `/dramas/${resolvedDramaId.value}/asset-workbench`),
    workflow: buildPath(`/projects/${projectId.value}/workflow`, `/dramas/${resolvedDramaId.value}/workflow`),
    delivery: buildPath(`/projects/${projectId.value}/delivery`, `/dramas/${resolvedDramaId.value}/delivery`)
  };
  void router.push({
    path: pathMap[target],
    query: buildQuery({ episodeId })
  });
};

const getScopedEpisodeIds = (): string[] => {
  if (stageEpisodeScope.value) {
    return [stageEpisodeScope.value];
  }
  return workflowEpisodes.value.map((item) => item.episode.id);
};

const resolveStageEpisodeId = (): string | null => {
  if (stageEpisodeScope.value) {
    return stageEpisodeScope.value;
  }
  return workflowEpisodes.value[0]?.episode.id || null;
};

const syncStageScopeQuery = async (): Promise<void> => {
  const nextQuery = toSingleQuery(route.query);
  if (stageEpisodeScope.value) {
    nextQuery.stageEpisodeId = stageEpisodeScope.value;
    nextQuery.episodeId = stageEpisodeScope.value;
  } else {
    delete nextQuery.stageEpisodeId;
  }
  await replaceQueryIfChanged({
    route,
    router,
    nextQuery,
    hash: route.hash
  });
};

const restoreStageScopeFromQuery = (): void => {
  const query = toSingleQuery(route.query);
  const stageScopeRaw = query.stageEpisodeId || '';
  const episodeScopeRaw = query.episodeId || '';
  const restoredScope = stageScopeRaw || episodeScopeRaw;
  if (restoredScope) {
    stageEpisodeScope.value = restoredScope;
    markStageScopeRestored(buildRouteRestoreTip('episode_scope'), 'project-stage-flow');
  } else {
    clearStageScopeRestored();
  }
};

const goWorkflowBatchPanel = (): void => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/workflow`, `/dramas/${resolvedDramaId.value}/workflow`),
    query: buildQuery({
      episodeScope: stageEpisodeScope.value ? 'single' : 'batch',
      episodeId: stageEpisodeScope.value || undefined
    })
  });
};

const goStageCta = (stage: ProjectWorkflowSummary['stage']['current']): void => {
  const stageItem = stageItems.value.find((item) => item.key === stage);
  if (stageItem?.blocker) {
    error.value = stageItem.blocker;
    return;
  }
  const selectedEpisodeId = resolveStageEpisodeId();
  if ((stage === 'asset' || stage === 'video' || stage === 'merge' || stage === 'done') && !selectedEpisodeId) {
    error.value = '请先选择目标分集';
    return;
  }
  if (stage === 'writing' || stage === 'storyboard') {
    void router.push({
      path: buildPath(`/projects/${projectId.value}/storyboard-workbench`, `/dramas/${resolvedDramaId.value}/storyboard-workbench`),
      query: buildQuery({ episodeId: selectedEpisodeId || undefined })
    });
    return;
  }
  if (stage === 'asset') {
    void router.push({
      path: buildPath(`/projects/${projectId.value}/asset-workbench`, `/dramas/${resolvedDramaId.value}/asset-workbench`),
      query: buildQuery({ episodeId: selectedEpisodeId || undefined })
    });
    return;
  }
  if (stage === 'video') {
    void router.push({
      path: buildPath(`/projects/${projectId.value}/workflow`, `/dramas/${resolvedDramaId.value}/workflow`),
      query: buildQuery({ episodeId: selectedEpisodeId || undefined })
    });
    return;
  }
  if (stage === 'merge') {
    void router.push({
      path: buildPath(`/projects/${projectId.value}/timeline`, `/dramas/${resolvedDramaId.value}/timeline`),
      query: buildQuery({ episodeId: selectedEpisodeId || undefined })
    });
    return;
  }
  void router.push({
    path: buildPath(`/projects/${projectId.value}/delivery`, `/dramas/${resolvedDramaId.value}/delivery`),
    query: buildQuery({ episodeId: selectedEpisodeId || undefined })
  });
};

const openAutoRepairConfirm = async (stage: ProjectWorkflowSummary['stage']['current']): Promise<void> => {
  if (repairPreparing.value || stageRepairing.value) {
    return;
  }
  repairPreparing.value = true;
  error.value = '';
  try {
    if (stage === 'storyboard') {
      const scripts = resolvedDramaId.value ? await getDramaScripts(resolvedDramaId.value) : await getScripts(projectId.value);
      const scopedEpisodeIdSet = new Set(getScopedEpisodeIds());
      const missingEpisodes = workflowEpisodes.value.filter((item) => item.storyboardCount <= 0 && scopedEpisodeIdSet.has(item.episode.id));
      const episodeIds = missingEpisodes.map((item) => item.episode.id);
      repairDraft.value = {
        stage,
        actor: 'operator',
        comment: 'auto repair storyboards by scripts',
        confirmed: false,
        episodeIds,
        riskLevel: scripts.length > 30 ? 'high' : scripts.length > 10 ? 'medium' : 'low',
        summary: `预计按 ${scripts.length} 个剧本补分镜，目标分集 ${episodeIds.length} 个`,
        impactItems: [
          `剧本数：${scripts.length}`,
          `缺分镜分集：${episodeIds.length}`,
          `若剧本未绑定分集，将按脚本全量补分镜`
        ]
      };
      return;
    }
    if (stage === 'asset') {
      const episodeIds = getScopedEpisodeIds();
      const precheck = resolvedDramaId.value
        ? await precheckDramaEpisodesAssetsBatch(resolvedDramaId.value, { episodeIds })
        : await precheckEpisodesAssetsBatch(projectId.value, { episodeIds });
      repairDraft.value = {
        stage,
        actor: 'operator',
        comment: 'auto repair assets by precheck result',
        confirmed: false,
        episodeIds: precheck.episodes.map((item) => item.episodeId),
        riskLevel: precheck.summary.totalCreatable > 200 ? 'high' : precheck.summary.totalCreatable > 60 ? 'medium' : 'low',
        summary: `预计创建资产 ${precheck.summary.totalCreatable} 条，冲突 ${precheck.summary.totalConflicts} 条`,
        impactItems: [
          `分集数：${precheck.summary.totalEpisodes}`,
          `分镜总数：${precheck.summary.totalStoryboards}`,
          `可创建：${precheck.summary.totalCreatable}`,
          `冲突跳过：${precheck.summary.totalConflicts}`
        ]
      };
      return;
    }
    if (stage === 'video') {
      const episodeIds = getScopedEpisodeIds();
      const precheck = resolvedDramaId.value
        ? await precheckDramaEpisodesVideoTasksBatch(resolvedDramaId.value, { episodeIds })
        : await precheckEpisodesVideoTasksBatch(projectId.value, { episodeIds });
      repairDraft.value = {
        stage,
        actor: 'operator',
        comment: 'auto repair video tasks by precheck result',
        confirmed: false,
        episodeIds: precheck.episodes.map((item) => item.episodeId),
        riskLevel: precheck.summary.totalCreatable > 200 ? 'high' : precheck.summary.totalCreatable > 60 ? 'medium' : 'low',
        summary: `预计创建视频任务 ${precheck.summary.totalCreatable} 条，冲突 ${precheck.summary.totalConflicts} 条`,
        impactItems: [
          `分集数：${precheck.summary.totalEpisodes}`,
          `分镜总数：${precheck.summary.totalStoryboards}`,
          `可创建：${precheck.summary.totalCreatable}`,
          `冲突跳过：${precheck.summary.totalConflicts}`
        ]
      };
      return;
    }
    error.value = '该阶段暂不支持自动修复';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '自动修复预检查失败';
  } finally {
    repairPreparing.value = false;
  }
};

const cancelAutoRepair = (): void => {
  repairDraft.value = null;
};

const updateRepairDraft = (key: 'actor' | 'comment' | 'confirmed', value: string | boolean): void => {
  if (!repairDraft.value) {
    return;
  }
  if (key === 'actor' && typeof value === 'string') {
    repairDraft.value.actor = value;
    return;
  }
  if (key === 'comment' && typeof value === 'string') {
    repairDraft.value.comment = value;
    return;
  }
  if (key === 'confirmed' && typeof value === 'boolean') {
    repairDraft.value.confirmed = value;
  }
};

const confirmAutoRepair = async (): Promise<void> => {
  const draft = repairDraft.value;
  if (!draft || !draft.confirmed || stageRepairing.value) {
    return;
  }
  stageRepairing.value = draft.stage;
  error.value = '';
  quotaExceededHintVisible.value = false;
  try {
    if (draft.stage === 'storyboard') {
      const scripts = resolvedDramaId.value ? await getDramaScripts(resolvedDramaId.value) : await getScripts(projectId.value);
      if (scripts.length === 0) {
        throw new Error('没有可用剧本，无法自动补分镜');
      }
      const targetEpisodeSet = new Set((draft.episodeIds ?? []).filter((id) => id));
      const candidateScripts = targetEpisodeSet.size > 0
        ? scripts.filter((item) => item.episodeId && targetEpisodeSet.has(item.episodeId))
        : scripts;
      let generated = 0;
      for (const script of candidateScripts.length > 0 ? candidateScripts : scripts) {
        const rows = resolvedDramaId.value
          ? await generateDramaStoryboards(resolvedDramaId.value, { scriptId: script.id })
          : await generateStoryboards(projectId.value, { scriptId: script.id });
        generated += rows.length;
      }
      if (generated <= 0) {
        throw new Error('自动补分镜未生成新内容，请检查模型与脚本');
      }
    } else if (draft.stage === 'asset') {
      const payload = {
        episodeIds: draft.episodeIds && draft.episodeIds.length > 0 ? draft.episodeIds : undefined
      };
      if (resolvedDramaId.value) {
        await generateDramaEpisodesAssetsBatch(resolvedDramaId.value, payload);
      } else {
        await generateEpisodesAssetsBatch(projectId.value, payload);
      }
    } else if (draft.stage === 'video') {
      const payload = {
        episodeIds: draft.episodeIds && draft.episodeIds.length > 0 ? draft.episodeIds : undefined,
        priority: 'medium' as const,
        mode: 'reference' as const
      };
      if (resolvedDramaId.value) {
        await createDramaEpisodesVideoTasksBatch(resolvedDramaId.value, payload);
      } else {
        await createEpisodesVideoTasksBatch(projectId.value, payload);
      }
    }
    repairDraft.value = null;
    await refreshAll();
  } catch (err) {
    quotaExceededHintVisible.value = isVideoTaskQuotaExceededError(err);
    error.value = err instanceof Error ? err.message : '自动修复失败';
  } finally {
    stageRepairing.value = null;
  }
};

const goTaskQuotaPanel = async (): Promise<void> => {
  const dramaScopeId = resolvedDramaId.value;
  const targetPath = dramaScopeId ? `/dramas/${dramaScopeId}/tasks` : '/tasks';
  await router.push({
    path: targetPath,
    hash: '#task-slo-quota',
    query: {
      ...(dramaScopeId ? { dramaId: dramaScopeId } : {}),
      ...(projectId.value ? { taskQuotaProjectId: projectId.value } : {})
    }
  });
};

const isNovelMissingError = (err: unknown): boolean =>
  err instanceof Error && err.message.includes('Novel not found');

const syncWritingSelections = (): void => {
  if (!outlines.value.some((item) => item.id === selectedOutlineId.value)) {
    selectedOutlineId.value = outlines.value[0]?.id || '';
  }
  if (!scripts.value.some((item) => item.id === selectedScriptId.value)) {
    selectedScriptId.value = scripts.value[0]?.id || '';
  }
};

const applyNovelRecord = (value: Novel | null): void => {
  novelRecord.value = value;
  novelTitle.value = value?.title || defaultNovelTitle.value;
  novelContent.value = value?.content || '';
};

const loadWritingWorkspace = async (scopedProjectId = projectId.value, dramaScopeId = resolvedDramaId.value): Promise<void> => {
  if (!scopedProjectId) {
    return;
  }
  writingLoading.value = true;
  writingError.value = '';
  const [novelResult, outlinesResult, scriptsResult] = await Promise.allSettled([
    dramaScopeId ? getDramaNovel(dramaScopeId) : getProjectNovel(scopedProjectId),
    dramaScopeId ? getDramaOutlines(dramaScopeId) : getProjectOutlines(scopedProjectId),
    dramaScopeId ? getDramaScripts(dramaScopeId) : getScripts(scopedProjectId)
  ]);

  if (novelResult.status === 'fulfilled') {
    applyNovelRecord(novelResult.value);
  } else if (isNovelMissingError(novelResult.reason)) {
    applyNovelRecord(null);
  } else {
    writingError.value = novelResult.reason instanceof Error ? novelResult.reason.message : '加载小说失败';
  }

  if (outlinesResult.status === 'fulfilled') {
    outlines.value = outlinesResult.value;
  } else {
    outlines.value = [];
    writingError.value ||= outlinesResult.reason instanceof Error ? outlinesResult.reason.message : '加载大纲失败';
  }

  if (scriptsResult.status === 'fulfilled') {
    scripts.value = scriptsResult.value;
  } else {
    scripts.value = [];
    writingError.value ||= scriptsResult.reason instanceof Error ? scriptsResult.reason.message : '加载剧本失败';
  }

  syncWritingSelections();
  writingLoading.value = false;
};

const loadWritingWorkspaceFromScreen = (): void => {
  writingNotice.value = '';
  void loadWritingWorkspace();
};

const persistNovelDraft = async (): Promise<boolean> => {
  if (!canSaveNovel.value) {
    writingError.value = '请先填写小说标题和正文';
    return false;
  }
  if (novelRecord.value && !isNovelDirty.value) {
    return true;
  }
  const payload = {
    title: novelTitle.value.trim(),
    content: novelContent.value.trim()
  };
  const saved = resolvedDramaId.value
    ? await saveDramaNovel(resolvedDramaId.value, payload)
    : await saveProjectNovel(projectId.value, payload);
  applyNovelRecord(saved);
  return true;
};

const saveNovelDraft = async (): Promise<void> => {
  if (novelSaving.value) {
    return;
  }
  novelSaving.value = true;
  writingError.value = '';
  writingNotice.value = '';
  try {
    const saved = await persistNovelDraft();
    if (!saved) {
      return;
    }
    await refreshAll();
    writingNotice.value = '小说已保存';
  } catch (err) {
    writingError.value = err instanceof Error ? err.message : '保存小说失败';
  } finally {
    novelSaving.value = false;
  }
};

const generateOutlineDrafts = async (): Promise<void> => {
  if (outlineGenerating.value) {
    return;
  }
  outlineGenerating.value = true;
  writingError.value = '';
  writingNotice.value = '';
  writingGeneration.value = null;
  writingGenerationAction.value = '';
  try {
    const saved = await persistNovelDraft();
    if (!saved) {
      return;
    }
    const payload = {
      chapterCount: Math.max(1, Math.min(20, Math.floor(outlineChapterCount.value || 6)))
    };
    const generated = resolvedDramaId.value
      ? await generateDramaOutlines(resolvedDramaId.value, payload)
      : await generateProjectOutlines(projectId.value, payload);
    outlines.value = generated.items;
    selectedOutlineId.value = generated.items[0]?.id || '';
    writingGeneration.value = generated.generation;
    writingGenerationAction.value = 'outline';
    await refreshAll();
    writingNotice.value = generated.items.length > 0 ? `已生成 ${generated.items.length} 条大纲` : '当前小说未生成大纲';
  } catch (err) {
    writingError.value = err instanceof Error ? err.message : '生成大纲失败';
  } finally {
    outlineGenerating.value = false;
  }
};

const generateScriptDraft = async (): Promise<void> => {
  if (scriptGenerating.value || !selectedOutlineId.value) {
    return;
  }
  scriptGenerating.value = true;
  writingError.value = '';
  writingNotice.value = '';
  writingGeneration.value = null;
  writingGenerationAction.value = '';
  try {
    const saved = await persistNovelDraft();
    if (!saved) {
      return;
    }
    const generated = resolvedDramaId.value
      ? await generateDramaScript(resolvedDramaId.value, { outlineId: selectedOutlineId.value })
      : await generateProjectScript(projectId.value, { outlineId: selectedOutlineId.value });
    selectedScriptId.value = generated.script.id;
    writingGeneration.value = generated.generation;
    writingGenerationAction.value = 'script';
    await refreshAll();
    writingNotice.value = `已生成剧本：${generated.script.title}`;
  } catch (err) {
    writingError.value = err instanceof Error ? err.message : '生成剧本失败';
  } finally {
    scriptGenerating.value = false;
  }
};

const refreshAll = async (): Promise<void> => {
  try {
    const dramaScopeId = resolvedDramaId.value;
    const scopedProjectId = await resolveProjectIdFromRouteContext({
      currentProjectId: projectId.value,
      routeProjectId: routeProjectId.value,
      routeDramaId: dramaScopeId
    });
    if (!scopedProjectId) {
      error.value = '无法解析项目上下文';
      return;
    }
    const [projectData, workflowData, episodesData] = await Promise.all([
      getProject(scopedProjectId),
      dramaScopeId ? getDramaWorkflowSummary(dramaScopeId) : getProjectWorkflow(scopedProjectId),
      dramaScopeId ? getDramaWorkflowEpisodes(dramaScopeId, { page: 1, pageSize: 200 }) : getProjectWorkflowEpisodes(scopedProjectId, { page: 1, pageSize: 200 })
    ]);
    const dramaData = await getDramaDomain(scopedProjectId).catch(() => null);
    project.value = projectData;
    workflow.value = workflowData;
    workflowEpisodes.value = episodesData.items
      .slice()
      .sort((a, b) => a.episode.orderIndex - b.episode.orderIndex || a.episode.title.localeCompare(b.episode.title));
    if (!stageEpisodeScope.value && workflowEpisodes.value.length > 0) {
      stageEpisodeScope.value = workflowEpisodes.value[0].episode.id;
    }
    if (stageEpisodeScope.value && !workflowEpisodes.value.some((item) => item.episode.id === stageEpisodeScope.value)) {
      stageEpisodeScope.value = workflowEpisodes.value[0]?.episode.id || '';
    }
    runStageScopeRestoreScroll();
    drama.value = dramaData;
    dramaStyle.value = dramaData?.style || '';
    console.log('[DEBUG] Drama loaded, id:', dramaData?.id, 'style:', dramaData?.style);
    await loadWritingWorkspace(scopedProjectId, dramaScopeId);
    if (dramaData?.id && !String(route.params.dramaId || '').trim() && route.path.startsWith('/projects/')) {
      const canonicalPath = route.path.replace(/^\/projects\/[^/]+/, `/dramas/${encodeURIComponent(dramaData.id)}`);
      if (canonicalPath !== route.path) {
        const nextQuery: LocationQueryRaw = { ...toSingleQuery(route.query), dramaId: undefined };
        await router.replace({
          path: canonicalPath,
          query: nextQuery,
          hash: route.hash
        });
      }
    }
    error.value = '';
    quotaExceededHintVisible.value = false;
  } catch (err) {
    quotaExceededHintVisible.value = false;
    error.value = err instanceof Error ? err.message : '加载失败';
  }
};

const updateStyle = async (): Promise<void> => {
  console.log('[DEBUG] updateStyle called, drama.id:', drama.value?.id, 'style:', dramaStyle.value);
  if (!drama.value?.id) {
    console.warn('[DEBUG] updateStyle: drama.id is empty, cannot update');
    return;
  }
  try {
    console.log('[DEBUG] Calling updateDramaStyle API with:', drama.value.id, dramaStyle.value);
    const updated = await updateDramaStyle(drama.value.id, dramaStyle.value);
    console.log('[DEBUG] updateDramaStyle result:', updated);
    if (updated) {
      drama.value = updated;
    }
  } catch (err) {
    console.error('[DEBUG] Failed to update drama style:', err);
  }
};

onMounted(() => {
  restoreStageScopeFromQuery();
  void refreshAll();
});

watch(stageEpisodeScope, () => {
  void syncStageScopeQuery();
});
</script>

<style scoped>
.project-detail-shell {
  --rail-width: 336px;
  --inspector-width: 360px;
}

.project-hero-panel {
  background: linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
}

.compact-panel :deep(.card) {
  padding: 12px;
}

.summary-grid,
.nav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.stage-rail {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.stage-card {
  border: 1px solid #dde1ea;
  border-radius: 12px;
  padding: 12px;
}

.stage-card.active {
  border-color: #1f6feb;
  box-shadow: 0 0 0 1px #1f6feb inset;
}

.stage-card.done {
  background: #f0f8ff;
}

.stage-tip {
  margin-top: 10px;
}

.stage-blocker {
  color: #b54708;
  font-size: 12px;
}

.episode-grid {
  display: grid;
  gap: 12px;
}

.episode-card {
  display: grid;
  gap: 10px;
}

.writing-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.9fr);
  gap: 12px;
}

.writing-grid.secondary {
  margin-top: 12px;
}

.writing-form-card,
.writing-side-card {
  display: grid;
  gap: 12px;
}

.writing-field {
  display: grid;
  gap: 6px;
}

.writing-field.compact {
  max-width: 260px;
}

.writing-field input,
.writing-field select,
.writing-field textarea,
.writing-inline-select select,
.writing-preview {
  width: 100%;
  box-sizing: border-box;
}

.writing-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}

.writing-outline-preview {
  padding: 12px;
  border-radius: 10px;
  background: #f8fafc;
}

.writing-list {
  display: grid;
  gap: 8px;
}

.writing-list-item {
  width: 100%;
  text-align: left;
  border: 1px solid #dde1ea;
  border-radius: 10px;
  padding: 10px 12px;
  background: #fff;
  cursor: pointer;
}

.writing-list-item.active {
  border-color: #1f6feb;
  box-shadow: 0 0 0 1px #1f6feb inset;
  background: #f0f7ff;
}

.writing-inline-select {
  display: grid;
  gap: 6px;
}

.writing-preview {
  margin-top: 10px;
}

.nav-card {
  min-height: 140px;
}

.tag {
  display: inline-block;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1;
}

.tag-draft {
  background: #f2f4f8;
  color: #374151;
}

.tag-in_review {
  background: #fff4db;
  color: #9a6700;
}

.tag-approved {
  background: #dcfce7;
  color: #166534;
}

.tag-rejected {
  background: #fee2e2;
  color: #991b1b;
}

@media (max-width: 960px) {
  .writing-grid {
    grid-template-columns: 1fr;
  }
}
</style>
