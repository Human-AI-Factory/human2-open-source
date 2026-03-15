<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="frame-prompt-shell" compact>
      <template #rail>
        <section class="panel">
          <div class="inline-between">
            <div>
              <h2>Frame Prompt 专页</h2>
              <p class="muted">{{ project?.name || '加载中...' }}</p>
            </div>
            <div class="actions">
              <button @click="goProject">返回项目</button>
              <button @click="loadAll">刷新</button>
            </div>
          </div>
          <RouteRestoreHint :text="routeRestoredTip" />
          <p v-if="error" class="error">{{ error }}</p>
        </section>

        <section id="frame-prompt-params" class="panel">
          <div class="inline-between">
            <h3>参数</h3>
            <button class="primary" :disabled="loading || !storyboardId" @click="generatePrompt">
              {{ loading ? '生成中...' : '生成' }}
            </button>
          </div>
          <div class="form">
            <label>
              分镜
              <select v-model="storyboardId">
                <option value="">请选择分镜</option>
                <option v-for="item in storyboards" :key="item.id" :value="item.id">{{ item.title }}</option>
              </select>
            </label>
            <p v-if="routeStoryboardMatched && selectedStoryboardTitle" class="muted route-focus-pill">
              已从分享链接定位分镜：{{ selectedStoryboardTitle }}
            </p>
            <label>
              帧类型
              <select v-model="frameType">
                <option value="opening">opening</option>
                <option value="middle">middle</option>
                <option value="ending">ending</option>
                <option value="action">action</option>
                <option value="emotion">emotion</option>
              </select>
            </label>
            <label>
              风格
              <input v-model="style" placeholder="电影感" />
            </label>
            <label>
              镜头景别
              <select v-model="shotSize">
                <option value="ecu">ecu</option>
                <option value="cu">cu</option>
                <option value="mcu">mcu</option>
                <option value="ms">ms</option>
                <option value="mls">mls</option>
                <option value="ls">ls</option>
                <option value="els">els</option>
              </select>
            </label>
            <label>
              机位运动
              <select v-model="cameraMove">
                <option value="static">static</option>
                <option value="pan">pan</option>
                <option value="tilt">tilt</option>
                <option value="dolly">dolly</option>
                <option value="truck">truck</option>
                <option value="handheld">handheld</option>
              </select>
            </label>
            <label>
              光线
              <input v-model="lighting" placeholder="自然光" />
            </label>
            <label>
              情绪
              <input v-model="mood" placeholder="克制" />
            </label>
            <label>
              补充指令
              <input v-model="instruction" placeholder="可选" />
            </label>
          </div>
        </section>

        <section class="panel">
          <h3>当前聚焦</h3>
          <p class="muted">分镜总数：{{ storyboards.length }}</p>
          <p class="muted">当前选择：{{ selectedStoryboardTitle || '未选择分镜' }}</p>
          <p class="muted">历史记录：{{ historyItems.length }} / 回滚审计：{{ rollbackAudits.length }}</p>
        </section>
      </template>

      <main>
        <section class="panel" v-if="result">
          <h3>生成结果</h3>
          <p class="muted">type={{ result.frameType }} / style={{ result.style }} / shot={{ result.shotSize }} / move={{ result.cameraMove }}</p>
          <textarea :value="result.prompt" rows="14" readonly></textarea>
        </section>

        <section class="panel">
          <div class="inline-between">
            <h3>历史记录</h3>
            <button :disabled="loading || !storyboardId" @click="loadHistory">刷新历史</button>
          </div>
          <div class="form history-filter-grid">
            <label>
              帧类型筛选
              <select v-model="historyFilterFrameType">
                <option value="">全部</option>
                <option value="opening">opening</option>
                <option value="middle">middle</option>
                <option value="ending">ending</option>
                <option value="action">action</option>
                <option value="emotion">emotion</option>
              </select>
            </label>
            <label>
              来源筛选
              <select v-model="historyFilterSource">
                <option value="">全部</option>
                <option value="single">single</option>
                <option value="episode_batch">episode_batch</option>
                <option value="workflow_batch">workflow_batch</option>
                <option value="rollback">rollback</option>
              </select>
            </label>
            <label>
              开始时间
              <input v-model="historyFilterStartAt" type="datetime-local" />
            </label>
            <label>
              结束时间
              <input v-model="historyFilterEndAt" type="datetime-local" />
            </label>
          </div>
          <div class="actions" style="margin-top: 8px">
            <button :disabled="loading || !storyboardId" @click="loadHistory">应用筛选</button>
          </div>
          <p class="muted" v-if="historyItems.length === 0">暂无历史记录</p>
          <div class="list" v-else>
            <article class="card" v-for="item in historyItems" :key="item.id">
              <div>
                <h4>{{ new Date(item.createdAt).toLocaleString() }}</h4>
                <p class="muted">source={{ item.source }} / type={{ item.frameType }} / shot={{ item.shotSize }} / move={{ item.cameraMove }}</p>
                <textarea :value="item.prompt" rows="5" readonly></textarea>
              </div>
              <div class="actions history-actions">
                <input v-model="rollbackActor" placeholder="操作者（可选）" />
                <input v-model="rollbackComment" placeholder="回滚备注（可选）" />
                <button :disabled="loading" @click="rollbackToHistory(item.id)">回滚到此版本</button>
              </div>
            </article>
          </div>
        </section>
      </main>

      <template #inspector>
        <section class="panel">
          <h3>按集批量生成</h3>
          <div class="form">
            <label>
              分集
              <select v-model="batchEpisodeId">
                <option value="">请选择分集</option>
                <option v-for="ep in episodes" :key="ep.id" :value="ep.id">{{ ep.orderIndex }} · {{ ep.title }}</option>
              </select>
            </label>
            <label>
              回写策略
              <select v-model="batchSaveAs">
                <option value="none">none（不回写）</option>
                <option value="replace_storyboard_prompt">replace_storyboard_prompt（覆盖分镜提示词）</option>
              </select>
            </label>
            <label>
              最大生成条数
              <input v-model.number="batchLimit" type="number" min="1" max="200" />
            </label>
          </div>
          <div class="actions" style="margin-top: 8px">
            <button class="primary" :disabled="loading || !batchEpisodeId" @click="runBatchGenerate">
              {{ loading ? '处理中...' : '按集批量生成' }}
            </button>
          </div>
          <div class="panel nested-panel" v-if="batchResult">
            <p class="muted">
              total={{ batchResult.total }} / generated={{ batchResult.generated }} / updated={{ batchResult.updatedStoryboardPrompts }}
            </p>
          </div>
        </section>

        <section class="panel">
          <h3>按 Workflow 状态批量</h3>
          <div class="actions compact-checks">
            <label class="check-inline"><input type="checkbox" v-model="workflowStatuses.draft" /> draft</label>
            <label class="check-inline"><input type="checkbox" v-model="workflowStatuses.in_review" /> in_review</label>
            <label class="check-inline"><input type="checkbox" v-model="workflowStatuses.rejected" /> rejected</label>
            <label class="check-inline"><input type="checkbox" v-model="workflowStatuses.approved" /> approved</label>
          </div>
          <div class="form">
            <label>
              每集上限
              <input v-model.number="workflowLimitPerEpisode" type="number" min="1" max="200" />
            </label>
            <label>
              自动流转到 in_review
              <input v-model="workflowAutoTransition" type="checkbox" />
            </label>
            <label>
              操作者
              <input v-model="workflowActor" placeholder="operator" />
            </label>
            <label>
              审计备注
              <input v-model="workflowComment" placeholder="可选" />
            </label>
          </div>
          <div class="actions" style="margin-top: 8px">
            <button class="primary" :disabled="loading" @click="runWorkflowBatchGenerate">
              {{ loading ? '处理中...' : '按状态批量生成' }}
            </button>
          </div>
          <div class="panel nested-panel" v-if="workflowBatchResult">
            <p class="muted">
              matched={{ workflowBatchResult.episodesMatched }} / processed={{ workflowBatchResult.episodesProcessed }} / generated={{
                workflowBatchResult.generatedTotal
              }}
            </p>
            <p class="muted">
              updated={{ workflowBatchResult.updatedStoryboardPrompts }} / transitioned={{ workflowBatchResult.transitionedEpisodeIds.length }} / transitionSkipped={{
                workflowBatchResult.skippedTransitionEpisodeIds.length
              }}
            </p>
          </div>
        </section>

        <section class="panel">
          <div class="inline-between">
            <h3>回滚审计</h3>
            <button :disabled="loading || !storyboardId" @click="loadRollbackAudits">刷新审计</button>
          </div>
          <div class="form">
            <label>
              actor 筛选
              <input v-model="rollbackAuditActorFilter" placeholder="operator" />
            </label>
            <label>
              开始时间
              <input v-model="rollbackAuditStartAt" type="datetime-local" />
            </label>
            <label>
              结束时间
              <input v-model="rollbackAuditEndAt" type="datetime-local" />
            </label>
          </div>
          <div class="actions" style="margin-top: 8px">
            <button :disabled="loading || !storyboardId" @click="loadRollbackAudits">应用筛选</button>
            <button :disabled="rollbackAudits.length === 0" @click="exportRollbackAuditsCsv">导出 CSV</button>
          </div>
          <p class="muted" v-if="rollbackAudits.length === 0">暂无回滚审计</p>
          <div class="timeline" v-else>
            <article class="timeline-item" v-for="audit in rollbackAudits" :key="audit.id">
              <p class="timeline-time">{{ new Date(audit.createdAt).toLocaleString() }}</p>
              <p class="muted">actor={{ audit.actor }} / historyId={{ audit.historyId }}</p>
              <p class="muted" v-if="audit.comment">comment={{ audit.comment }}</p>
              <p class="muted">{{ audit.restoredPrompt }}</p>
            </article>
          </div>
        </section>
      </template>
    </DesktopWorkbenchShell>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import DesktopWorkbenchShell from '@/components/DesktopWorkbenchShell.vue';
import RouteRestoreHint from '@/components/RouteRestoreHint.vue';
import { clearToken } from '@/api/client';
import {
  getEpisodeDomains,
  getEpisodeDomainsByDrama,
} from '@/api/domain-context';
import {
  generateDramaEpisodeFramePromptsBatch,
  generateDramaFramePromptsByWorkflow,
  generateDramaStoryboardFramePrompt,
  generateEpisodeFramePromptsBatch,
  generateProjectFramePromptsByWorkflow,
  generateStoryboardFramePrompt,
  getDramaStoryboardFramePromptHistory,
  getDramaStoryboardFramePromptRollbackAudits,
  getStoryboardFramePromptRollbackAudits,
  getStoryboardFramePromptHistory,
  rollbackDramaStoryboardFramePrompt,
  rollbackStoryboardFramePrompt
} from '@/api/frame-prompts';
import { getDramaStoryboards, getProject, getStoryboards } from '@/api/timeline-editor';
import { buildDramaScopedPath, buildDramaScopedQuery, resolveProjectIdFromRouteContext } from '@/utils/route-context';
import { buildRouteRestoreTip, toSingleQuery, useRouteRestoreContext } from '@/composables/useRouteRestoreContext';
import {
  EpisodeDomain,
  EpisodeFramePromptBatchResult,
  EpisodeWorkflowStatus,
  FramePromptHistoryEntry,
  FramePromptRollbackAuditEntry,
  FramePromptResult,
  Project,
  ProjectFramePromptByWorkflowResult,
  Storyboard
} from '@/types/models';

const route = useRoute();
const router = useRouter();
const routeProjectId = computed(() => String(route.params.id || ''));
const routeDramaId = computed(() => String(route.params.dramaId || ''));
const projectId = ref('');
const dramaId = computed(() => {
  const query = toSingleQuery(route.query);
  if (routeDramaId.value) {
    return routeDramaId.value;
  }
  return query.dramaId || '';
});
const hasDramaScopedApi = computed(() => Boolean(dramaId.value));

const project = ref<Project | null>(null);
const storyboards = ref<Storyboard[]>([]);
const episodes = ref<EpisodeDomain[]>([]);
const storyboardId = ref('');
const frameType = ref<'opening' | 'middle' | 'ending' | 'action' | 'emotion'>('opening');
const style = ref('电影感');
const shotSize = ref<'ecu' | 'cu' | 'mcu' | 'ms' | 'mls' | 'ls' | 'els'>('ms');
const cameraMove = ref<'static' | 'pan' | 'tilt' | 'dolly' | 'truck' | 'handheld'>('static');
const lighting = ref('自然光');
const mood = ref('克制');
const instruction = ref('');
const result = ref<FramePromptResult | null>(null);
const historyItems = ref<FramePromptHistoryEntry[]>([]);
const rollbackAudits = ref<FramePromptRollbackAuditEntry[]>([]);
const rollbackActor = ref('operator');
const rollbackComment = ref('');
const historyFilterFrameType = ref<'' | 'opening' | 'middle' | 'ending' | 'action' | 'emotion'>('');
const historyFilterSource = ref<'' | 'single' | 'episode_batch' | 'workflow_batch' | 'rollback'>('');
const historyFilterStartAt = ref('');
const historyFilterEndAt = ref('');
const rollbackAuditActorFilter = ref('');
const rollbackAuditStartAt = ref('');
const rollbackAuditEndAt = ref('');
const batchEpisodeId = ref('');
const batchSaveAs = ref<'none' | 'replace_storyboard_prompt'>('none');
const batchLimit = ref(30);
const batchResult = ref<EpisodeFramePromptBatchResult | null>(null);
const workflowStatuses = ref<Record<EpisodeWorkflowStatus, boolean>>({
  draft: true,
  in_review: true,
  rejected: false,
  approved: false
});
const workflowLimitPerEpisode = ref(20);
const workflowAutoTransition = ref(true);
const workflowActor = ref('operator');
const workflowComment = ref('');
const workflowBatchResult = ref<ProjectFramePromptByWorkflowResult | null>(null);
const loading = ref(false);
const error = ref('');
const routeStoryboardMatched = ref(false);
const {
  restoreTip: routeRestoredTip,
  markRestored: markRouteRestored,
  runRestoreScroll: runRouteRestoreScroll
} = useRouteRestoreContext();

const selectedStoryboardTitle = computed(() => {
  if (!storyboardId.value) {
    return '';
  }
  return storyboards.value.find((item) => item.id === storyboardId.value)?.title || storyboardId.value;
});

const buildPath = (projectPath: string, dramaPath: string): string =>
  buildDramaScopedPath({ dramaId: dramaId.value, projectPath, dramaPath });
const buildQuery = (): Record<string, string> => buildDramaScopedQuery(dramaId.value);

const goProject = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}`, `/dramas/${dramaId.value}`),
    query: buildQuery()
  });
};

const logout = () => {
  clearToken();
  void router.replace('/login');
};

const generatePrompt = async (): Promise<void> => {
  if (!storyboardId.value) {
    error.value = '请先选择分镜';
    return;
  }
  loading.value = true;
  try {
    const payload = {
      frameType: frameType.value,
      style: style.value.trim() || undefined,
      shotSize: shotSize.value,
      cameraMove: cameraMove.value,
      lighting: lighting.value.trim() || undefined,
      mood: mood.value.trim() || undefined,
      instruction: instruction.value.trim() || undefined
    };
    result.value = hasDramaScopedApi.value
      ? await generateDramaStoryboardFramePrompt(dramaId.value, storyboardId.value, payload)
      : await generateStoryboardFramePrompt(projectId.value, storyboardId.value, payload);
    await loadHistory();
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '生成失败';
  } finally {
    loading.value = false;
  }
};

const runBatchGenerate = async (): Promise<void> => {
  if (!batchEpisodeId.value) {
    error.value = '请先选择分集';
    return;
  }
  loading.value = true;
  try {
    const payload = {
      frameType: frameType.value,
      style: style.value.trim() || undefined,
      shotSize: shotSize.value,
      cameraMove: cameraMove.value,
      lighting: lighting.value.trim() || undefined,
      mood: mood.value.trim() || undefined,
      instruction: instruction.value.trim() || undefined,
      saveAs: batchSaveAs.value,
      limit: Math.max(1, Math.min(200, Math.floor(batchLimit.value || 30)))
    };
    batchResult.value = hasDramaScopedApi.value
      ? await generateDramaEpisodeFramePromptsBatch(dramaId.value, batchEpisodeId.value, payload)
      : await generateEpisodeFramePromptsBatch(projectId.value, batchEpisodeId.value, payload);
    error.value = '';
    if (batchSaveAs.value === 'replace_storyboard_prompt') {
      storyboards.value = hasDramaScopedApi.value ? await getDramaStoryboards(dramaId.value) : await getStoryboards(projectId.value);
    }
    await loadHistory();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '批量生成失败';
  } finally {
    loading.value = false;
  }
};

const runWorkflowBatchGenerate = async (): Promise<void> => {
  const statuses = (Object.keys(workflowStatuses.value) as EpisodeWorkflowStatus[]).filter((key) => workflowStatuses.value[key]);
  if (statuses.length === 0) {
    error.value = '请至少选择一个 workflow 状态';
    return;
  }
  loading.value = true;
  try {
    const payload = {
      statuses,
      frameType: frameType.value,
      style: style.value.trim() || undefined,
      shotSize: shotSize.value,
      cameraMove: cameraMove.value,
      lighting: lighting.value.trim() || undefined,
      mood: mood.value.trim() || undefined,
      instruction: instruction.value.trim() || undefined,
      saveAs: batchSaveAs.value,
      limitPerEpisode: Math.max(1, Math.min(200, Math.floor(workflowLimitPerEpisode.value || 20))),
      autoTransitionToInReview: workflowAutoTransition.value,
      actor: workflowActor.value.trim() || 'operator',
      comment: workflowComment.value.trim() || undefined
    };
    workflowBatchResult.value = hasDramaScopedApi.value
      ? await generateDramaFramePromptsByWorkflow(dramaId.value, payload)
      : await generateProjectFramePromptsByWorkflow(projectId.value, payload);
    error.value = '';
    if (batchSaveAs.value === 'replace_storyboard_prompt') {
      storyboards.value = hasDramaScopedApi.value ? await getDramaStoryboards(dramaId.value) : await getStoryboards(projectId.value);
    }
    await loadHistory();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '按状态批量生成失败';
  } finally {
    loading.value = false;
  }
};

const loadHistory = async (): Promise<void> => {
  if (!storyboardId.value) {
    historyItems.value = [];
    return;
  }
  const query = {
    limit: 50,
    frameType: historyFilterFrameType.value || undefined,
    source: historyFilterSource.value || undefined,
    startAt: historyFilterStartAt.value ? new Date(historyFilterStartAt.value).toISOString() : undefined,
    endAt: historyFilterEndAt.value ? new Date(historyFilterEndAt.value).toISOString() : undefined
  };
  historyItems.value = hasDramaScopedApi.value
    ? await getDramaStoryboardFramePromptHistory(dramaId.value, storyboardId.value, query)
    : await getStoryboardFramePromptHistory(projectId.value, storyboardId.value, query);
};

const loadRollbackAudits = async (): Promise<void> => {
  if (!storyboardId.value) {
    rollbackAudits.value = [];
    return;
  }
  const query = {
    limit: 50,
    actor: rollbackAuditActorFilter.value.trim() || undefined,
    startAt: rollbackAuditStartAt.value ? new Date(rollbackAuditStartAt.value).toISOString() : undefined,
    endAt: rollbackAuditEndAt.value ? new Date(rollbackAuditEndAt.value).toISOString() : undefined
  };
  rollbackAudits.value = hasDramaScopedApi.value
    ? await getDramaStoryboardFramePromptRollbackAudits(dramaId.value, storyboardId.value, query)
    : await getStoryboardFramePromptRollbackAudits(projectId.value, storyboardId.value, query);
};

const exportRollbackAuditsCsv = (): void => {
  if (rollbackAudits.value.length === 0) {
    return;
  }
  const escapeCsv = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  const header = ['id', 'createdAt', 'actor', 'historyId', 'comment', 'restoredPrompt'].join(',');
  const lines = rollbackAudits.value.map((item) =>
    [item.id, item.createdAt, item.actor, item.historyId, item.comment, item.restoredPrompt].map((cell) => escapeCsv(cell)).join(',')
  );
  const csv = [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `frame-prompt-rollback-audits-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const rollbackToHistory = async (historyId: string): Promise<void> => {
  if (!storyboardId.value) {
    return;
  }
  loading.value = true;
  try {
    const payload = {
      historyId,
      actor: rollbackActor.value.trim() || undefined,
      comment: rollbackComment.value.trim() || undefined
    };
    const restored = hasDramaScopedApi.value
      ? await rollbackDramaStoryboardFramePrompt(dramaId.value, storyboardId.value, payload)
      : await rollbackStoryboardFramePrompt(projectId.value, storyboardId.value, payload);
    result.value = {
      prompt: restored.restored.prompt,
      frameType: restored.restored.frameType,
      style: restored.restored.style,
      shotSize: restored.restored.shotSize,
      cameraMove: restored.restored.cameraMove,
      lighting: restored.restored.lighting,
      mood: restored.restored.mood
    };
    storyboards.value = hasDramaScopedApi.value ? await getDramaStoryboards(dramaId.value) : await getStoryboards(projectId.value);
    await loadHistory();
    await loadRollbackAudits();
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '回滚失败';
  } finally {
    loading.value = false;
  }
};

const loadAll = async (): Promise<void> => {
  try {
    projectId.value = await resolveProjectIdFromRouteContext({
      currentProjectId: projectId.value,
      routeProjectId: routeProjectId.value,
      routeDramaId: routeDramaId.value
    });
    if (!projectId.value) {
      error.value = '无法解析项目上下文';
      return;
    }
    const [projectData, storyboardList, episodeList] = await Promise.all([
      getProject(projectId.value),
      hasDramaScopedApi.value ? getDramaStoryboards(dramaId.value) : getStoryboards(projectId.value),
      hasDramaScopedApi.value ? getEpisodeDomainsByDrama(dramaId.value) : getEpisodeDomains(projectId.value)
    ]);
    project.value = projectData;
    storyboards.value = storyboardList;
    episodes.value = episodeList;
    routeStoryboardMatched.value = false;
    const routeStoryboardId = toSingleQuery(route.query).storyboardId;
    if (typeof routeStoryboardId === 'string' && routeStoryboardId.trim() && storyboardList.some((item) => item.id === routeStoryboardId)) {
      storyboardId.value = routeStoryboardId;
      routeStoryboardMatched.value = true;
      markRouteRestored(buildRouteRestoreTip('storyboard_scope'), 'frame-prompt-params');
    } else if (!storyboardId.value && storyboardList.length > 0) {
      storyboardId.value = storyboardList[0].id;
    }
    if (!batchEpisodeId.value && episodeList.length > 0) {
      batchEpisodeId.value = episodeList[0].id;
    }
    await loadHistory();
    await loadRollbackAudits();
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  }
};

onMounted(() => {
  void loadAll().then(() => {
    runRouteRestoreScroll();
  });
});

watch(storyboardId, () => {
  void loadHistory();
  void loadRollbackAudits();
});
</script>

<style scoped>
.frame-prompt-shell {
  --rail-width: 316px;
  --inspector-width: 360px;
}

.route-focus-pill {
  margin-top: 2px;
  padding: 6px 10px;
  border: 1px solid #2f6fec;
  border-radius: 8px;
  background: #f4f8ff;
}

.history-filter-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.history-actions {
  align-items: stretch;
}

.compact-checks {
  flex-wrap: wrap;
}

.nested-panel {
  margin-top: 10px;
}

@media (max-width: 980px) {
  .history-filter-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
