<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell class="domain-entity-shell" compact>
      <template #rail>
    <section class="panel">
      <div class="inline-between">
        <div>
          <h2>角色/场景/道具工作台（Canonical）</h2>
          <p class="muted">{{ project?.name || '加载中...' }}</p>
        </div>
        <div class="actions">
          <button @click="goProject">返回项目</button>
          <button @click="loadAll">刷新</button>
        </div>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <section class="panel">
      <h3>审计概览</h3>
      <div class="stats-grid">
        <article class="card">
          <h4>总记录</h4>
          <p class="muted">{{ auditStats?.total ?? 0 }}</p>
        </article>
        <article class="card">
          <h4>近 24h</h4>
          <p class="muted">{{ auditStats?.recent24h ?? 0 }}</p>
          <button @click="applyRecent24hFilter">查看近24h</button>
        </article>
        <article class="card">
          <h4>Top Actions</h4>
          <div class="actions">
            <button
              v-for="row in (auditStats?.byAction ?? []).slice(0, 4)"
              :key="row.action"
              @click="applyQuickActionFilter(row.action)"
            >
              {{ row.action }} ({{ row.count }})
            </button>
          </div>
        </article>
        <article class="card">
          <h4>Target Types</h4>
          <div class="actions">
            <button
              v-for="row in (auditStats?.byTargetType ?? [])"
              :key="row.targetType"
              @click="applyQuickTargetTypeFilter(row.targetType)"
            >
              {{ row.targetType }} ({{ row.count }})
            </button>
          </div>
        </article>
        <article class="card">
          <h4>Top Actors</h4>
          <div class="actions">
            <button
              v-for="row in (auditStats?.byActor ?? [])"
              :key="row.actor"
              @click="applyQuickActorFilter(row.actor)"
            >
              {{ row.actor }} ({{ row.count }})
            </button>
          </div>
        </article>
      </div>
    </section>

    <section class="panel">
      <h3>筛选</h3>
      <div class="actions">
        <select v-model="typeFilter">
          <option value="">全部类型</option>
          <option value="character">character</option>
          <option value="scene">scene</option>
          <option value="prop">prop</option>
        </select>
        <select v-model="episodeFilter">
          <option value="">全部分集</option>
          <option v-for="ep in episodes" :key="ep.id" :value="ep.id">
            {{ ep.orderIndex }} · {{ ep.title }}
          </option>
        </select>
        <input v-model="query" placeholder="搜索名称/提示词" />
        <button @click="runWorkbenchQuery">查询</button>
      </div>
    </section>

    <section class="panel">
      <h3>跨集复用策略面板</h3>
      <div class="actions">
        <label class="check-inline">
          <input v-model="useProjectPolicy" type="checkbox" />
          使用项目默认策略
        </label>
        <select v-model="applyEpisodeId">
          <option value="">选择目标分集</option>
          <option v-for="ep in episodes" :key="ep.id" :value="ep.id">
            {{ ep.orderIndex }} · {{ ep.title }}
          </option>
        </select>
        <select v-model="applyMode">
          <option value="missing_only">missing_only（仅缺失）</option>
          <option value="all">all（全量）</option>
        </select>
        <select v-model="conflictStrategy" :disabled="useProjectPolicy">
          <option value="skip">冲突策略: skip</option>
          <option value="overwrite_prompt">冲突策略: overwrite_prompt</option>
          <option value="overwrite_all">冲突策略: overwrite_all</option>
          <option value="rename">冲突策略: rename</option>
        </select>
        <select v-model="priority" :disabled="useProjectPolicy">
          <option value="entity_first">优先级: entity_first</option>
          <option value="existing_first">优先级: existing_first</option>
        </select>
        <input v-model="renameSuffix" :disabled="useProjectPolicy" placeholder="rename 后缀（可选）" />
        <input v-model="actor" placeholder="操作人（审计）" />
        <button :disabled="loading" @click="saveDomainApplyPolicy">保存为项目默认策略</button>
      </div>
      <p class="muted" v-if="domainApplyPolicy">策略更新：{{ domainApplyPolicy.updatedAt }} / {{ domainApplyPolicy.updatedBy }}</p>
      <div class="list compact-list">
        <article class="card" v-for="status in ['draft', 'in_review', 'approved']" :key="status">
          <div>
            <strong>{{ status }}</strong>
          </div>
          <div class="list compact-list">
            <article class="card" v-for="entityType in ['character', 'scene', 'prop']" :key="`${status}-${entityType}`">
              <div class="actions">
                <span>{{ entityType }}</span>
                <label class="check-inline">
                  <input v-model="statusTypeStrategies[status as 'draft' | 'in_review' | 'approved'][entityType as 'character' | 'scene' | 'prop'].enabled" type="checkbox" />
                  启用
                </label>
                <select
                  v-model="statusTypeStrategies[status as 'draft' | 'in_review' | 'approved'][entityType as 'character' | 'scene' | 'prop'].conflictStrategy"
                  :disabled="!statusTypeStrategies[status as 'draft' | 'in_review' | 'approved'][entityType as 'character' | 'scene' | 'prop'].enabled">
                  <option value="skip">skip</option>
                  <option value="overwrite_prompt">overwrite_prompt</option>
                  <option value="overwrite_all">overwrite_all</option>
                  <option value="rename">rename</option>
                </select>
                <select
                  v-model="statusTypeStrategies[status as 'draft' | 'in_review' | 'approved'][entityType as 'character' | 'scene' | 'prop'].priority"
                  :disabled="!statusTypeStrategies[status as 'draft' | 'in_review' | 'approved'][entityType as 'character' | 'scene' | 'prop'].enabled">
                  <option value="entity_first">entity_first</option>
                  <option value="existing_first">existing_first</option>
                </select>
                <input
                  v-model="statusTypeStrategies[status as 'draft' | 'in_review' | 'approved'][entityType as 'character' | 'scene' | 'prop'].renameSuffix"
                  :disabled="!statusTypeStrategies[status as 'draft' | 'in_review' | 'approved'][entityType as 'character' | 'scene' | 'prop'].enabled"
                  placeholder="renameSuffix" />
              </div>
            </article>
          </div>
        </article>
      </div>
      <textarea v-model="note" rows="2" placeholder="操作备注（审计）"></textarea>
    </section>

      </template>

    <section class="panel">
      <h3>实体主数据与回收站</h3>
      <div class="actions">
        <button @click="loadCanonicalEntities">刷新主数据</button>
        <span class="muted">active={{ activeCanonicalEntities.length }} / deleted={{ deletedCanonicalEntities.length }}</span>
      </div>
      <div class="actions">
        <label class="check-inline">
          <input :checked="isAllActiveSelected" type="checkbox" @change="toggleSelectAllActive($event)" />
          全选 active
        </label>
        <select v-model="batchLifecycleMode">
          <option value="auto_recommend">批量模式：auto_recommend</option>
          <option value="manual">批量模式：manual</option>
        </select>
        <select v-model="batchLifecycleTargetStatus" :disabled="batchLifecycleMode !== 'manual'">
          <option value="draft">draft</option>
          <option value="in_review">in_review</option>
          <option value="approved">approved</option>
          <option value="archived">archived</option>
        </select>
        <label>
          char
          <select v-model="batchLifecycleTargetByType.character" :disabled="batchLifecycleMode !== 'manual'">
            <option value="draft">draft</option>
            <option value="in_review">in_review</option>
            <option value="approved">approved</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <label>
          scene
          <select v-model="batchLifecycleTargetByType.scene" :disabled="batchLifecycleMode !== 'manual'">
            <option value="draft">draft</option>
            <option value="in_review">in_review</option>
            <option value="approved">approved</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <label>
          prop
          <select v-model="batchLifecycleTargetByType.prop" :disabled="batchLifecycleMode !== 'manual'">
            <option value="draft">draft</option>
            <option value="in_review">in_review</option>
            <option value="approved">approved</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <button :disabled="batchSelectedEntityIds.length === 0 || loading" @click="loadLifecycleRecommendations">推荐预览</button>
        <button class="primary" :disabled="batchSelectedEntityIds.length === 0 || loading" @click="runBatchLifecycleTransition">
          批量流转（{{ batchSelectedEntityIds.length }}）
        </button>
        <button :disabled="batchLifecycleTypeStats.length === 0" @click="exportBatchLifecycleStatsCsv">导出统计 CSV</button>
      </div>
      <p class="muted" v-if="lastBatchLifecycleResult">
        batch-result: opId={{ lastBatchLifecycleResult.opId }} · at={{ lastBatchLifecycleResult.executedAt }} · actor={{ lastBatchLifecycleResult.actor }}
        · updated={{ lastBatchLifecycleResult.updated.length }} / rejected={{ lastBatchLifecycleResult.rejected.length }}
      </p>
      <div class="list compact-list" v-if="batchLifecycleTypeStats.length > 0">
        <article class="card" v-for="row in batchLifecycleTypeStats" :key="`batch-type-${row.type}`">
          <h4>{{ row.type }}</h4>
          <p class="muted">
            success={{ row.success }} / rejected={{ row.rejected }} / successRate={{ row.successRate.toFixed(1) }}%
          </p>
          <p class="muted">
            reasons:
            not_found={{ row.reasonBreakdown.not_found }},
            deleted={{ row.reasonBreakdown.deleted }},
            invalid_transition={{ row.reasonBreakdown.invalid_transition }},
            entity_in_use={{ row.reasonBreakdown.entity_in_use }},
            no_recommendation={{ row.reasonBreakdown.no_recommendation }}
          </p>
        </article>
      </div>
      <div class="list" v-if="activeCanonicalEntities.length > 0">
        <article class="card" v-for="entity in activeCanonicalEntities" :key="`active-${entity.id}`">
          <label class="check-inline">
            <input :checked="batchSelectedEntityIds.includes(entity.id)" type="checkbox" @change="toggleBatchEntity(entity.id, $event)" />
            选中
          </label>
          <h4>[{{ entity.type }}] {{ entity.name }}</h4>
          <p class="muted">id={{ entity.id }} · lifecycle={{ entity.lifecycleStatus }}</p>
          <p class="muted">{{ entity.prompt }}</p>
          <p v-if="lifecycleRecommendations[entity.id]" class="muted">
            推荐状态: {{ lifecycleRecommendations[entity.id].recommendedStatus }} · reason={{ lifecycleRecommendations[entity.id].reason }}
          </p>
          <div class="actions">
            <select v-model="lifecycleTargetByEntity[entity.id]">
              <option value="">流转到...</option>
              <option value="draft">draft</option>
              <option value="in_review">in_review</option>
              <option value="approved">approved</option>
              <option value="archived">archived</option>
            </select>
            <button
              :disabled="!lifecycleTargetByEntity[entity.id] || loading"
              @click="transitionEntityLifecycle(entity.id)"
            >
              生命周期流转
            </button>
            <button
              :disabled="!lifecycleTargetByEntity[entity.id] || loading"
              @click="checkEntityLifecycle(entity.id)"
            >
              预检查
            </button>
            <select v-model="mergeTargetByEntity[entity.id]">
              <option value="">选择合并目标（同类型）</option>
              <option
                v-for="target in getMergeTargetOptions(entity)"
                :key="`${entity.id}-${target.id}`"
                :value="target.id"
              >
                {{ target.name }} · {{ target.id.slice(0, 8) }}
              </option>
            </select>
            <button
              :disabled="!mergeTargetByEntity[entity.id] || loading"
              @click="mergeEntity(entity.id)"
            >
              合并到目标
            </button>
          </div>
          <p v-if="lifecycleCheckByEntity[entity.id]" class="muted">
            lifecycle-check: allowed={{ lifecycleCheckByEntity[entity.id].allowed ? 'yes' : 'no' }}
            · reason={{ lifecycleCheckByEntity[entity.id].reason }}
            · refs(ep={{ lifecycleCheckByEntity[entity.id].reference.episodeRelationCount }}, sb={{ lifecycleCheckByEntity[entity.id].reference.storyboardRelationCount }})
          </p>
        </article>
      </div>
      <p v-else class="muted">
        暂无可用主实体
        <button @click="showCreateDialog = true">+ 创建实体</button>
      </p>

      <h4>回收站</h4>
      <div class="list" v-if="deletedCanonicalEntities.length > 0">
        <article class="card" v-for="entity in deletedCanonicalEntities" :key="`deleted-${entity.id}`">
          <h4>[{{ entity.type }}] {{ entity.name }}</h4>
          <p class="muted">deletedAt={{ entity.deletedAt }} / mergedInto={{ entity.mergedIntoEntityId || '-' }}</p>
          <div class="actions">
            <button :disabled="loading" @click="restoreEntity(entity.id)">恢复实体</button>
          </div>
        </article>
      </div>
      <p v-else class="muted">回收站为空</p>
    </section>

    <section class="panel">
      <h3>实体冲突概览</h3>
      <div class="actions">
        <button @click="loadConflictSummary">刷新冲突</button>
        <span class="muted">名称冲突组={{ conflictSummary.byName.length }} / 指纹冲突组={{ conflictSummary.byPromptFingerprint.length }}</span>
      </div>
      <div class="list">
        <article class="card" v-for="group in conflictSummary.byName" :key="`name-${group.type}-${group.key}`">
          <h4>[name][{{ group.type }}] {{ group.key }} · {{ group.count }} 个实体</h4>
          <div class="actions">
            <select v-model="conflictMergeTargetByGroup[`name:${group.type}:${group.key}`]">
              <option value="">选择目标实体</option>
              <option v-for="entity in getConflictGroupEntities(group.entityIds)" :key="`target-${entity.id}`" :value="entity.id">
                {{ entity.name }} · {{ entity.id.slice(0, 8) }}
              </option>
            </select>
          </div>
          <div class="actions">
            <button
              v-for="entity in getConflictGroupEntities(group.entityIds)"
              :key="`merge-name-${group.key}-${entity.id}`"
              :disabled="loading || !conflictMergeTargetByGroup[`name:${group.type}:${group.key}`] || conflictMergeTargetByGroup[`name:${group.type}:${group.key}`] === entity.id"
              @click="mergeConflictEntity(`name:${group.type}:${group.key}`, entity.id)"
            >
              合并 {{ entity.name }} -> 目标
            </button>
          </div>
        </article>
      </div>
      <div class="list">
        <article class="card" v-for="group in conflictSummary.byPromptFingerprint" :key="`fp-${group.type}-${group.fingerprint}`">
          <h4>[fingerprint][{{ group.type }}] {{ group.fingerprint }} · {{ group.count }} 个实体</h4>
          <div class="actions">
            <select v-model="conflictMergeTargetByGroup[`fp:${group.type}:${group.fingerprint}`]">
              <option value="">选择目标实体</option>
              <option v-for="entity in getConflictGroupEntities(group.entityIds)" :key="`target-fp-${entity.id}`" :value="entity.id">
                {{ entity.name }} · {{ entity.id.slice(0, 8) }}
              </option>
            </select>
          </div>
          <div class="actions">
            <button
              v-for="entity in getConflictGroupEntities(group.entityIds)"
              :key="`merge-fp-${group.fingerprint}-${entity.id}`"
              :disabled="loading || !conflictMergeTargetByGroup[`fp:${group.type}:${group.fingerprint}`] || conflictMergeTargetByGroup[`fp:${group.type}:${group.fingerprint}`] === entity.id"
              @click="mergeConflictEntity(`fp:${group.type}:${group.fingerprint}`, entity.id)"
            >
              合并 {{ entity.name }} -> 目标
            </button>
          </div>
        </article>
      </div>
      <p v-if="conflictSummary.byName.length === 0 && conflictSummary.byPromptFingerprint.length === 0" class="muted">
        暂无冲突组
      </p>
    </section>

    <section class="panel">
      <h3>实体聚合视图</h3>
      <div class="list" v-if="items.length > 0">
        <article class="card" v-for="item in items" :key="item.entityId">
          <div>
            <h4>[{{ item.type }}] {{ item.name }}</h4>
            <p class="muted">appearances={{ item.appearances }} / episodes={{ item.episodeIds.length }} / storyboards={{ item.storyboardIds.length }}</p>
            <p class="muted">{{ item.prompt }}</p>
          </div>
          <div class="actions">
            <button :disabled="!applyEpisodeId || loading || isEntityArchived(item.entityId)" @click="previewEntity(item.entityId)">预检查</button>
            <button class="primary" :disabled="!applyEpisodeId || loading || isEntityArchived(item.entityId)" @click="applyEntity(item.entityId)">执行投放</button>
          </div>
          <p class="muted" v-if="isEntityArchived(item.entityId)">该实体已归档，不能继续投放。</p>
          <div v-if="previewByEntity[item.entityId]" class="preview">
            <p class="muted">
              预检查: create={{ previewByEntity[item.entityId].createCount }},
              update={{ previewByEntity[item.entityId].updateCount }},
              skip={{ previewByEntity[item.entityId].skipCount }}
            </p>
            <ul>
              <li v-for="row in previewByEntity[item.entityId].items.slice(0, 6)" :key="`${item.entityId}-${row.storyboardId}`">
                {{ row.storyboardTitle }} · {{ row.action }} · {{ row.reason }}
              </li>
            </ul>
          </div>
        </article>
      </div>
      <p class="muted" v-else>暂无匹配实体</p>
    </section>

      <template #inspector>
    <section class="panel">
      <h3>审计日志（实体/关系）</h3>
      <div class="actions">
        <input v-model="auditActor" placeholder="按 actor 检索" />
        <input v-model="auditAction" placeholder="按 action 检索" />
        <select v-model="auditTargetType">
          <option value="">全部 targetType</option>
          <option value="domain_entity">domain_entity</option>
          <option value="episode_relation">episode_relation</option>
          <option value="storyboard_relation">storyboard_relation</option>
          <option value="apply">apply</option>
        </select>
        <input v-model="auditStartAt" type="datetime-local" />
        <input v-model="auditEndAt" type="datetime-local" />
        <button @click="runAuditQuery">查询日志</button>
        <button @click="exportAudits">导出 CSV</button>
        <button @click="resetAuditFilters">重置筛选</button>
      </div>
      <div class="list" v-if="audits.length > 0">
        <article class="card" v-for="audit in audits" :key="audit.id">
          <h4>#{{ audit.id }} · {{ audit.action }}</h4>
          <p class="muted">{{ audit.createdAt }} · {{ audit.actor }} · {{ audit.targetType }} · {{ audit.targetId }}</p>
          <pre>{{ JSON.stringify(audit.details, null, 2) }}</pre>
        </article>
      </div>
      <p v-else class="muted">暂无审计记录</p>
      <div class="pagination">
        <button :disabled="auditPage <= 1" @click="changeAuditPage(auditPage - 1)">上一页</button>
        <span>第 {{ auditPage }} 页 / 共 {{ auditPageCount }} 页（{{ auditTotal }} 条）</span>
        <button :disabled="auditPage >= auditPageCount" @click="changeAuditPage(auditPage + 1)">下一页</button>
      </div>
    </section>
      </template>
    </DesktopWorkbenchShell>

    <!-- Create Entity Dialog -->
    <div v-if="showCreateDialog" class="dialog-overlay" @click.self="showCreateDialog = false">
      <div class="dialog">
        <h3>创建实体</h3>
        <div class="form-group">
          <label>类型</label>
          <select v-model="createForm.type">
            <option value="character">角色</option>
            <option value="scene">场景</option>
            <option value="prop">道具</option>
          </select>
        </div>
        <div class="form-group">
          <label>名称</label>
          <input v-model="createForm.name" placeholder="例如：小蝌蚪妈妈" />
        </div>
        <div class="form-group">
          <label>描述（Prompt）</label>
          <textarea v-model="createForm.prompt" placeholder="描述这个角色/场景/道具的特征" rows="4"></textarea>
        </div>
        <div class="dialog-actions">
          <button @click="showCreateDialog = false">取消</button>
          <button :disabled="createLoading || !createForm.name || !createForm.prompt" @click="createEntity">
            {{ createLoading ? '创建中...' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import DesktopWorkbenchShell from '@/components/DesktopWorkbenchShell.vue';
import { clearToken } from '@/api/client';
import { toSingleQuery } from '@/composables/useRouteRestoreContext';
import {
  getEpisodeDomains,
  getEpisodeDomainsByDrama
} from '@/api/domain-context';
import {
  applyCanonicalDomainEntityToEpisode,
  exportDomainEntityAuditsCsv,
  getDomainApplyPolicy,
  getCanonicalDomainEntities,
  restoreCanonicalDomainEntity,
  mergeCanonicalDomainEntity,
  getCanonicalDomainEntityLifecycleRecommendations,
  batchTransitionCanonicalDomainEntityLifecycle,
  getCanonicalDomainEntityLifecycleCheck,
  transitionCanonicalDomainEntityLifecycle,
  getDomainEntityConflicts,
  getDomainEntityAuditStats,
  getCanonicalDomainEntityWorkbench,
  getDomainEntityAudits,
  previewCanonicalDomainEntityApply,
  updateDomainApplyPolicy,
  createCanonicalDomainEntity
} from '@/api/domain-entities';
import { getProject } from '@/api/timeline-editor';
import {
  DomainEntityApplyPreviewResult,
  DomainEntityAudit,
  DomainEntityAuditStats,
  CanonicalDomainEntity,
  DomainEntityConflictSummary,
  DomainEntityLifecycleCheckResult,
  DomainEntityLifecycleRecommendation,
  DomainEntityLifecycleBatchTransitionResult,
  DomainApplyPolicy,
  DomainEntityWorkbenchItem,
  EpisodeDomain,
  Project
} from '@/types/models';
import { buildDramaScopedPath, buildDramaScopedQuery, resolveProjectIdFromRouteContext } from '@/utils/route-context';

const route = useRoute();
const router = useRouter();
const routeProjectId = computed(() => String(route.params.id || ''));
const routeDramaId = computed(() => String(route.params.dramaId || ''));
const projectId = ref('');
const dramaId = computed(() => {
  if (routeDramaId.value) {
    return routeDramaId.value;
  }
  return toSingleQuery(route.query).dramaId || '';
});

const project = ref<Project | null>(null);
const episodes = ref<EpisodeDomain[]>([]);
const items = ref<DomainEntityWorkbenchItem[]>([]);
const canonicalEntities = ref<CanonicalDomainEntity[]>([]);
const audits = ref<DomainEntityAudit[]>([]);
const auditStats = ref<DomainEntityAuditStats | null>(null);
const previewByEntity = ref<Record<string, DomainEntityApplyPreviewResult>>({});
const domainApplyPolicy = ref<DomainApplyPolicy | null>(null);
const conflictSummary = ref<DomainEntityConflictSummary>({ byName: [], byPromptFingerprint: [] });
const conflictMergeTargetByGroup = ref<Record<string, string>>({});
const lifecycleTargetByEntity = ref<Record<string, 'draft' | 'in_review' | 'approved' | 'archived' | ''>>({});
const lifecycleCheckByEntity = ref<Record<string, DomainEntityLifecycleCheckResult>>({});
const batchLifecycleMode = ref<'manual' | 'auto_recommend'>('auto_recommend');
const batchLifecycleTargetStatus = ref<'draft' | 'in_review' | 'approved' | 'archived'>('in_review');
const batchLifecycleTargetByType = ref<Record<'character' | 'scene' | 'prop', 'draft' | 'in_review' | 'approved' | 'archived'>>({
  character: 'in_review',
  scene: 'in_review',
  prop: 'in_review'
});
const batchSelectedEntityIds = ref<string[]>([]);
const lifecycleRecommendations = ref<Record<string, DomainEntityLifecycleRecommendation>>({});
const lastBatchLifecycleResult = ref<DomainEntityLifecycleBatchTransitionResult | null>(null);
const error = ref('');
const loading = ref(false);

// Create entity dialog state
const showCreateDialog = ref(false);
const createForm = ref({
  type: 'character' as 'character' | 'scene' | 'prop',
  name: '',
  prompt: ''
});
const createLoading = ref(false);

const typeFilter = ref<'' | 'character' | 'scene' | 'prop'>('');
const episodeFilter = ref('');
const query = ref('');
const applyEpisodeId = ref('');
const applyMode = ref<'missing_only' | 'all'>('missing_only');
const conflictStrategy = ref<'skip' | 'overwrite_prompt' | 'overwrite_all' | 'rename'>('skip');
const priority = ref<'entity_first' | 'existing_first'>('entity_first');
const renameSuffix = ref('');
const useProjectPolicy = ref(true);
type PolicyCell = {
  enabled: boolean;
  conflictStrategy: 'skip' | 'overwrite_prompt' | 'overwrite_all' | 'rename';
  priority: 'entity_first' | 'existing_first';
  renameSuffix: string;
};
const createEmptyPolicyCell = (): PolicyCell => ({
  enabled: false,
  conflictStrategy: 'skip',
  priority: 'entity_first',
  renameSuffix: ''
});
const statusTypeStrategies = ref<
  Record<'draft' | 'in_review' | 'approved', Record<'character' | 'scene' | 'prop', PolicyCell>>
>({
  draft: {
    character: createEmptyPolicyCell(),
    scene: createEmptyPolicyCell(),
    prop: createEmptyPolicyCell()
  },
  in_review: {
    character: { enabled: true, conflictStrategy: 'overwrite_prompt', priority: 'entity_first', renameSuffix: '' },
    scene: { enabled: true, conflictStrategy: 'overwrite_prompt', priority: 'entity_first', renameSuffix: '' },
    prop: { enabled: true, conflictStrategy: 'overwrite_prompt', priority: 'entity_first', renameSuffix: '' }
  },
  approved: {
    character: { enabled: true, conflictStrategy: 'rename', priority: 'entity_first', renameSuffix: '(approved copy)' },
    scene: { enabled: true, conflictStrategy: 'rename', priority: 'entity_first', renameSuffix: '(approved copy)' },
    prop: { enabled: true, conflictStrategy: 'rename', priority: 'entity_first', renameSuffix: '(approved copy)' }
  }
});
const actor = ref('operator');
const note = ref('');
const mergeTargetByEntity = ref<Record<string, string>>({});

const auditActor = ref('');
const auditAction = ref('');
const auditTargetType = ref<'' | 'domain_entity' | 'episode_relation' | 'storyboard_relation' | 'apply'>('');
const auditStartAt = ref('');
const auditEndAt = ref('');
const auditPage = ref(1);
const auditPageSize = ref(20);
const auditTotal = ref(0);
const auditPageCount = computed(() => Math.max(1, Math.ceil(auditTotal.value / auditPageSize.value)));
const activeCanonicalEntities = computed(() => canonicalEntities.value.filter((item) => !item.deletedAt));
const deletedCanonicalEntities = computed(() => canonicalEntities.value.filter((item) => Boolean(item.deletedAt)));
const canonicalEntityById = computed(() => new Map(canonicalEntities.value.map((item) => [item.id, item])));
const isEntityArchived = (entityId: string): boolean => canonicalEntityById.value.get(entityId)?.lifecycleStatus === 'archived';
const isAllActiveSelected = computed(
  () => activeCanonicalEntities.value.length > 0 && batchSelectedEntityIds.value.length === activeCanonicalEntities.value.length
);
const batchLifecycleTypeStats = computed(() => {
  if (!lastBatchLifecycleResult.value) {
    return [];
  }
  type EntityType = 'character' | 'scene' | 'prop';
  const initReasonBreakdown = () => ({
    not_found: 0,
    deleted: 0,
    invalid_transition: 0,
    entity_in_use: 0,
    no_recommendation: 0
  });
  const stats: Record<
    EntityType,
    {
      type: EntityType;
      success: number;
      rejected: number;
      successRate: number;
      reasonBreakdown: ReturnType<typeof initReasonBreakdown>;
    }
  > = {
    character: { type: 'character', success: 0, rejected: 0, successRate: 0, reasonBreakdown: initReasonBreakdown() },
    scene: { type: 'scene', success: 0, rejected: 0, successRate: 0, reasonBreakdown: initReasonBreakdown() },
    prop: { type: 'prop', success: 0, rejected: 0, successRate: 0, reasonBreakdown: initReasonBreakdown() }
  };
  for (const item of lastBatchLifecycleResult.value.updated) {
    const type = canonicalEntityById.value.get(item.entityId)?.type;
    if (!type) {
      continue;
    }
    stats[type].success += 1;
  }
  for (const item of lastBatchLifecycleResult.value.rejected) {
    const type = canonicalEntityById.value.get(item.entityId)?.type;
    if (!type) {
      continue;
    }
    stats[type].rejected += 1;
    stats[type].reasonBreakdown[item.reason] += 1;
  }
  return (Object.values(stats) as Array<(typeof stats)[EntityType]>).map((row) => {
    const total = row.success + row.rejected;
    return {
      ...row,
      successRate: total > 0 ? (row.success / total) * 100 : 0
    };
  });
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

const loadWorkbench = async (): Promise<void> => {
  items.value = await getCanonicalDomainEntityWorkbench(projectId.value, {
    type: typeFilter.value || undefined,
    episodeId: episodeFilter.value || undefined,
    q: query.value.trim() || undefined
  });
};

const loadDomainApplyPolicy = async (): Promise<void> => {
  domainApplyPolicy.value = await getDomainApplyPolicy(projectId.value);
  if (!domainApplyPolicy.value) {
    return;
  }
  const byStatus = domainApplyPolicy.value.byStatus ?? {};
  const applyStatusType = (status: 'draft' | 'in_review' | 'approved', type: 'character' | 'scene' | 'prop'): void => {
    const source = byStatus[status]?.[type] ?? {};
    statusTypeStrategies.value[status][type] = {
      enabled: Object.keys(source).length > 0,
      conflictStrategy: source.conflictStrategy ?? 'skip',
      priority: source.priority ?? 'entity_first',
      renameSuffix: source.renameSuffix ?? ''
    };
  };
  (['draft', 'in_review', 'approved'] as const).forEach((status) => {
    (['character', 'scene', 'prop'] as const).forEach((type) => {
      applyStatusType(status, type);
    });
  });
  if (useProjectPolicy.value) {
    applyMode.value = domainApplyPolicy.value.defaultMode;
    conflictStrategy.value = domainApplyPolicy.value.byType.character.conflictStrategy;
    priority.value = domainApplyPolicy.value.byType.character.priority;
    renameSuffix.value = domainApplyPolicy.value.byType.character.renameSuffix;
  }
};

const saveDomainApplyPolicy = async (): Promise<void> => {
  loading.value = true;
  try {
    const byStatus: Record<string, Record<string, Record<string, unknown>>> = {};
    (['draft', 'in_review', 'approved'] as const).forEach((status) => {
      const typeNode: Record<string, Record<string, unknown>> = {};
      (['character', 'scene', 'prop'] as const).forEach((type) => {
        const item = statusTypeStrategies.value[status][type];
        if (!item.enabled) {
          return;
        }
        typeNode[type] = {
          conflictStrategy: item.conflictStrategy,
          priority: item.priority,
          renameSuffix: item.renameSuffix.trim()
        };
      });
      if (Object.keys(typeNode).length > 0) {
        byStatus[status] = typeNode;
      }
    });
    domainApplyPolicy.value = await updateDomainApplyPolicy(projectId.value, {
      defaultMode: applyMode.value,
      byType: {
        character: {
          conflictStrategy: conflictStrategy.value,
          priority: priority.value,
          renameSuffix: renameSuffix.value.trim()
        },
        scene: {
          conflictStrategy: conflictStrategy.value,
          priority: priority.value,
          renameSuffix: renameSuffix.value.trim()
        },
        prop: {
          conflictStrategy: conflictStrategy.value,
          priority: priority.value,
          renameSuffix: renameSuffix.value.trim()
        }
      },
      byStatus,
      actor: actor.value.trim() || 'operator'
    });
    error.value = `已保存默认策略（${domainApplyPolicy.value.updatedAt}）`;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存默认策略失败';
  } finally {
    loading.value = false;
  }
};

const loadCanonicalEntities = async (): Promise<void> => {
  canonicalEntities.value = await getCanonicalDomainEntities(projectId.value, {
    includeDeleted: true
  });
  const activeIdSet = new Set(canonicalEntities.value.filter((item) => !item.deletedAt).map((item) => item.id));
  batchSelectedEntityIds.value = batchSelectedEntityIds.value.filter((id) => activeIdSet.has(id));
};

const getMergeTargetOptions = (source: CanonicalDomainEntity): CanonicalDomainEntity[] =>
  activeCanonicalEntities.value.filter((item) => item.type === source.type && item.id !== source.id);

const toggleBatchEntity = (entityId: string, event: Event): void => {
  const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
  if (checked) {
    batchSelectedEntityIds.value = [...new Set([...batchSelectedEntityIds.value, entityId])];
    return;
  }
  batchSelectedEntityIds.value = batchSelectedEntityIds.value.filter((item) => item !== entityId);
};

const toggleSelectAllActive = (event: Event): void => {
  const checked = (event.target as HTMLInputElement | null)?.checked ?? false;
  batchSelectedEntityIds.value = checked ? activeCanonicalEntities.value.map((item) => item.id) : [];
};

const getConflictGroupEntities = (entityIds: string[]): CanonicalDomainEntity[] => {
  const idSet = new Set(entityIds);
  return activeCanonicalEntities.value.filter((item) => idSet.has(item.id));
};

const loadConflictSummary = async (): Promise<void> => {
  conflictSummary.value = await getDomainEntityConflicts(projectId.value, {
    type: typeFilter.value || undefined
  });
};

const runWorkbenchQuery = async (): Promise<void> => {
  await Promise.all([loadWorkbench(), loadConflictSummary()]);
};

const loadAudits = async (): Promise<void> => {
  const page = await getDomainEntityAudits(projectId.value, {
    actor: auditActor.value.trim() || undefined,
    action: auditAction.value.trim() || undefined,
    targetType: auditTargetType.value || undefined,
    startAt: auditStartAt.value ? new Date(auditStartAt.value).toISOString() : undefined,
    endAt: auditEndAt.value ? new Date(auditEndAt.value).toISOString() : undefined,
    page: auditPage.value,
    pageSize: auditPageSize.value
  });
  audits.value = page.items;
  auditTotal.value = page.total;
  auditPage.value = page.page;
  auditPageSize.value = page.pageSize;
};

const loadAuditStats = async (): Promise<void> => {
  auditStats.value = await getDomainEntityAuditStats(projectId.value, {
    actor: auditActor.value.trim() || undefined,
    startAt: auditStartAt.value ? new Date(auditStartAt.value).toISOString() : undefined,
    endAt: auditEndAt.value ? new Date(auditEndAt.value).toISOString() : undefined
  });
};

const changeAuditPage = async (next: number): Promise<void> => {
  auditPage.value = Math.max(1, next);
  await loadAudits();
};

const runAuditQuery = async (): Promise<void> => {
  auditPage.value = 1;
  await Promise.all([loadAudits(), loadAuditStats()]);
};

const applyQuickActionFilter = async (action: string): Promise<void> => {
  auditAction.value = action;
  auditPage.value = 1;
  await Promise.all([loadAudits(), loadAuditStats()]);
};

const applyQuickTargetTypeFilter = async (
  targetType: 'domain_entity' | 'episode_relation' | 'storyboard_relation' | 'apply'
): Promise<void> => {
  auditTargetType.value = targetType;
  auditPage.value = 1;
  await Promise.all([loadAudits(), loadAuditStats()]);
};

const applyQuickActorFilter = async (actorValue: string): Promise<void> => {
  auditActor.value = actorValue;
  auditPage.value = 1;
  await Promise.all([loadAudits(), loadAuditStats()]);
};

const applyRecent24hFilter = async (): Promise<void> => {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  auditStartAt.value = start.toISOString().slice(0, 16);
  auditEndAt.value = now.toISOString().slice(0, 16);
  auditPage.value = 1;
  await Promise.all([loadAudits(), loadAuditStats()]);
};

const resetAuditFilters = async (): Promise<void> => {
  auditActor.value = '';
  auditAction.value = '';
  auditTargetType.value = '';
  auditStartAt.value = '';
  auditEndAt.value = '';
  auditPage.value = 1;
  await Promise.all([loadAudits(), loadAuditStats()]);
};

const exportAudits = async (): Promise<void> => {
  const csv = await exportDomainEntityAuditsCsv(projectId.value, {
    actor: auditActor.value.trim() || undefined,
    action: auditAction.value.trim() || undefined,
    targetType: auditTargetType.value || undefined,
    startAt: auditStartAt.value ? new Date(auditStartAt.value).toISOString() : undefined,
    endAt: auditEndAt.value ? new Date(auditEndAt.value).toISOString() : undefined
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `domain-entity-audits-${projectId.value}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const exportBatchLifecycleStatsCsv = (): void => {
  const result = lastBatchLifecycleResult.value;
  if (batchLifecycleTypeStats.value.length === 0 || !result) {
    return;
  }
  const header = [
    'batch_op_id',
    'executed_at',
    'actor',
    'type',
    'success',
    'rejected',
    'success_rate_percent',
    'reason_not_found',
    'reason_deleted',
    'reason_invalid_transition',
    'reason_entity_in_use',
    'reason_no_recommendation'
  ];
  const rows = batchLifecycleTypeStats.value.map((row) =>
    [
      result.opId,
      result.executedAt,
      result.actor,
      row.type,
      String(row.success),
      String(row.rejected),
      row.successRate.toFixed(2),
      String(row.reasonBreakdown.not_found),
      String(row.reasonBreakdown.deleted),
      String(row.reasonBreakdown.invalid_transition),
      String(row.reasonBreakdown.entity_in_use),
      String(row.reasonBreakdown.no_recommendation)
    ].join(',')
  );
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `domain-lifecycle-batch-stats-${projectId.value}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const restoreEntity = async (entityId: string): Promise<void> => {
  loading.value = true;
  try {
    await restoreCanonicalDomainEntity(projectId.value, entityId, {
      actor: actor.value.trim() || 'operator'
    });
    await Promise.all([loadCanonicalEntities(), loadWorkbench(), loadAudits(), loadAuditStats()]);
    error.value = `已恢复实体 ${entityId}`;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '恢复失败';
  } finally {
    loading.value = false;
  }
};

const mergeEntity = async (sourceEntityId: string): Promise<void> => {
  const targetEntityId = mergeTargetByEntity.value[sourceEntityId];
  if (!targetEntityId) {
    error.value = '请先选择合并目标';
    return;
  }
  loading.value = true;
  try {
    await mergeCanonicalDomainEntity(projectId.value, sourceEntityId, {
      targetEntityId,
      actor: actor.value.trim() || 'operator',
      note: note.value.trim() || undefined
    });
    mergeTargetByEntity.value = {
      ...mergeTargetByEntity.value,
      [sourceEntityId]: ''
    };
    await Promise.all([loadCanonicalEntities(), loadWorkbench(), loadAudits(), loadAuditStats()]);
    error.value = `已合并 ${sourceEntityId} -> ${targetEntityId}`;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '合并失败';
  } finally {
    loading.value = false;
  }
};

const mergeConflictEntity = async (groupKey: string, sourceEntityId: string): Promise<void> => {
  const targetEntityId = conflictMergeTargetByGroup.value[groupKey];
  if (!targetEntityId || targetEntityId === sourceEntityId) {
    error.value = '请选择有效的冲突合并目标';
    return;
  }
  mergeTargetByEntity.value = {
    ...mergeTargetByEntity.value,
    [sourceEntityId]: targetEntityId
  };
  await mergeEntity(sourceEntityId);
  await loadConflictSummary();
};

const checkEntityLifecycle = async (entityId: string): Promise<void> => {
  const toStatus = lifecycleTargetByEntity.value[entityId];
  if (!toStatus) {
    error.value = '请先选择目标生命周期状态';
    return;
  }
  const check = await getCanonicalDomainEntityLifecycleCheck(projectId.value, entityId, { toStatus });
  lifecycleCheckByEntity.value = {
    ...lifecycleCheckByEntity.value,
    [entityId]: check
  };
  if (!check.allowed) {
    error.value = `生命周期预检查未通过：${check.reason}`;
  }
};

const transitionEntityLifecycle = async (entityId: string): Promise<void> => {
  const toStatus = lifecycleTargetByEntity.value[entityId];
  if (!toStatus) {
    error.value = '请先选择目标生命周期状态';
    return;
  }
  loading.value = true;
  try {
    const result = await transitionCanonicalDomainEntityLifecycle(projectId.value, entityId, {
      toStatus,
      actor: actor.value.trim() || 'operator',
      note: note.value.trim() || undefined
    });
    lifecycleCheckByEntity.value = {
      ...lifecycleCheckByEntity.value,
      [entityId]: result.check
    };
    lifecycleTargetByEntity.value = {
      ...lifecycleTargetByEntity.value,
      [entityId]: ''
    };
    await Promise.all([loadCanonicalEntities(), loadWorkbench(), loadAudits(), loadAuditStats()]);
    error.value = `生命周期已流转：${result.check.fromStatus} -> ${result.check.toStatus}`;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '生命周期流转失败';
  } finally {
    loading.value = false;
  }
};

const loadLifecycleRecommendations = async (): Promise<void> => {
  if (batchSelectedEntityIds.value.length === 0) {
    error.value = '请先选择要批量处理的实体';
    return;
  }
  const result = await getCanonicalDomainEntityLifecycleRecommendations(projectId.value, {
    entityIds: batchSelectedEntityIds.value
  });
  lifecycleRecommendations.value = result.items.reduce<Record<string, DomainEntityLifecycleRecommendation>>((acc, item) => {
    acc[item.entityId] = item;
    return acc;
  }, {});
};

const runBatchLifecycleTransition = async (): Promise<void> => {
  if (batchSelectedEntityIds.value.length === 0) {
    error.value = '请先选择要批量处理的实体';
    return;
  }
  loading.value = true;
  try {
    const selectedTypes = new Set(
      batchSelectedEntityIds.value
        .map((id) => canonicalEntityById.value.get(id)?.type)
        .filter((value): value is 'character' | 'scene' | 'prop' => Boolean(value))
    );
    const toStatusByType =
      batchLifecycleMode.value === 'manual'
        ? {
            ...(selectedTypes.has('character') ? { character: batchLifecycleTargetByType.value.character } : {}),
            ...(selectedTypes.has('scene') ? { scene: batchLifecycleTargetByType.value.scene } : {}),
            ...(selectedTypes.has('prop') ? { prop: batchLifecycleTargetByType.value.prop } : {})
          }
        : undefined;
    const result = await batchTransitionCanonicalDomainEntityLifecycle(projectId.value, {
      entityIds: batchSelectedEntityIds.value,
      autoRecommend: batchLifecycleMode.value === 'auto_recommend',
      ...(batchLifecycleMode.value === 'manual' ? { toStatus: batchLifecycleTargetStatus.value, toStatusByType } : {}),
      actor: actor.value.trim() || 'operator',
      note: note.value.trim() || undefined
    });
    lastBatchLifecycleResult.value = result;
    await Promise.all([loadCanonicalEntities(), loadWorkbench(), loadAudits(), loadAuditStats(), loadLifecycleRecommendations()]);
    error.value = `批量流转完成：updated=${result.updated.length}, rejected=${result.rejected.length}`;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '批量流转失败';
  } finally {
    loading.value = false;
  }
};

const previewEntity = async (entityId: string): Promise<void> => {
  if (!applyEpisodeId.value) {
    error.value = '请先选择目标分集';
    return;
  }
  const preview = await previewCanonicalDomainEntityApply(projectId.value, entityId, {
    episodeId: applyEpisodeId.value,
    mode: applyMode.value,
    ...(useProjectPolicy.value
      ? {}
      : {
          conflictStrategy: conflictStrategy.value,
          priority: priority.value,
          renameSuffix: renameSuffix.value.trim() || undefined
        })
  });
  previewByEntity.value = {
    ...previewByEntity.value,
    [entityId]: preview
  };
};

const applyEntity = async (entityId: string): Promise<void> => {
  if (!applyEpisodeId.value) {
    error.value = '请先选择目标分集';
    return;
  }
  loading.value = true;
  try {
    const result = await applyCanonicalDomainEntityToEpisode(projectId.value, entityId, {
      episodeId: applyEpisodeId.value,
      mode: applyMode.value,
      ...(useProjectPolicy.value
        ? {}
        : {
            conflictStrategy: conflictStrategy.value,
            priority: priority.value,
            renameSuffix: renameSuffix.value.trim() || undefined
          }),
      actor: actor.value.trim() || 'operator',
      note: note.value.trim() || undefined
    });
    error.value = `执行完成: created=${result.created.length}, updated=${result.updated.length}, skipped=${result.skippedStoryboardIds.length}`;
    await Promise.all([loadWorkbench(), loadAudits(), previewEntity(entityId)]);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '投放失败';
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
    const [projectData, episodeList] = await Promise.all([
      getProject(projectId.value),
      dramaId.value ? getEpisodeDomainsByDrama(dramaId.value) : getEpisodeDomains(projectId.value)
    ]);
    project.value = projectData;
    episodes.value = episodeList;
    if (!applyEpisodeId.value && episodeList.length > 0) {
      applyEpisodeId.value = episodeList[0].id;
    }
    await Promise.all([
      loadWorkbench(),
      loadCanonicalEntities(),
      loadConflictSummary(),
      loadAudits(),
      loadAuditStats(),
      loadDomainApplyPolicy()
    ]);
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  }
};

const createEntity = async (): Promise<void> => {
  if (!projectId.value || !createForm.value.name || !createForm.value.prompt) {
    error.value = '请填写名称和描述';
    return;
  }
  createLoading.value = true;
  try {
    await createCanonicalDomainEntity(projectId.value, {
      type: createForm.value.type,
      name: createForm.value.name,
      prompt: createForm.value.prompt
    });
    showCreateDialog.value = false;
    createForm.value = { type: 'character', name: '', prompt: '' };
    await loadCanonicalEntities();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '创建失败';
  } finally {
    createLoading.value = false;
  }
};

onMounted(() => {
  void loadAll();
});

watch(useProjectPolicy, (enabled) => {
  if (!enabled || !domainApplyPolicy.value) {
    return;
  }
  applyMode.value = domainApplyPolicy.value.defaultMode;
  conflictStrategy.value = domainApplyPolicy.value.byType.character.conflictStrategy;
  priority.value = domainApplyPolicy.value.byType.character.priority;
  renameSuffix.value = domainApplyPolicy.value.byType.character.renameSuffix;
});
</script>

<style scoped>
.domain-entity-shell {
  --rail-width: 360px;
  --inspector-width: 360px;
}

textarea {
  width: 100%;
  margin-top: 8px;
}

.preview {
  margin-top: 8px;
}

pre {
  white-space: pre-wrap;
  word-break: break-word;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: var(--bg-primary, #fff);
  border-radius: 8px;
  padding: 24px;
  width: 400px;
  max-width: 90vw;
}

.dialog h3 {
  margin: 0 0 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
