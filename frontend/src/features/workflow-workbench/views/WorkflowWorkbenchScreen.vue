<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell>
      <template #rail>
        <section id="workflow-scope-panel" class="panel">
          <div class="inline-between">
            <div>
              <h2>Workflow 专页</h2>
              <p class="muted">{{ project?.name || '加载中...' }}</p>
            </div>
            <div class="actions">
              <button @click="goProject">返回项目</button>
              <button @click="goFramePromptWorkbench">Frame Prompt 专页</button>
              <button @click="loadAll">刷新</button>
            </div>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
          <div v-if="quotaExceededHintVisible" class="actions" style="margin-top: 8px">
            <button @click="goTaskQuotaPanel">前往任务中心调整配额</button>
          </div>
        </section>

        <section id="workflow-review-board" class="panel">
          <h3>Episode Scope 模式</h3>
          <div class="actions">
            <button :class="workflowMode === 'single' ? 'primary' : ''" @click="workflowMode = 'single'">单集模式</button>
            <button :class="workflowMode === 'batch' ? 'primary' : ''" @click="workflowMode = 'batch'">批处理模式</button>
            <select v-model="workflowScopeEpisodeId" :disabled="workflowMode !== 'single'">
              <option value="">选择分集</option>
              <option v-for="ep in episodes" :key="`scope-${ep.id}`" :value="ep.id">
                {{ ep.orderIndex }} · {{ ep.title }}
              </option>
            </select>
            <button class="primary" @click="applyWorkflowScopeMode">应用作用域</button>
          </div>
          <p class="muted">
            当前模式：
            <strong>{{ workflowMode === 'single' ? '单集' : '批处理' }}</strong>
            <span v-if="workflowMode === 'single' && workflowScopeEpisodeId"> · {{ episodeTitleMap.get(workflowScopeEpisodeId) || workflowScopeEpisodeId }}</span>
          </p>
          <RouteRestoreHint :text="workflowRouteRestoredTip" />
        </section>

        <section class="panel">
          <h3>审核看板</h3>
          <div class="actions">
            <select v-model="workflowStatusFilter">
              <option value="">全部状态</option>
              <option value="draft">draft</option>
              <option value="in_review">in_review</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
            </select>
            <input v-model="workflowQuery" placeholder="搜索 Episode 标题/ID" />
            <button @click="workflowPage = 1; loadWorkflowBoard()">查询</button>
            <label class="check-inline">
              <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll(($event.target as HTMLInputElement).checked)" />
              全选当前页
            </label>
          </div>
          <div class="list" v-if="workflowItems.length > 0">
            <article class="card" v-for="item in workflowItems" :key="item.episode.id">
              <div>
                <h4>{{ item.episode.orderIndex }} · {{ item.episode.title }}</h4>
                <p class="muted">审核：{{ item.workflow.status }} / 分镜：{{ item.storyboardCount }} / 最近审计：{{ item.lastAuditAt || '无' }}</p>
              </div>
              <label class="check-inline">
                <input
                  type="checkbox"
                  :checked="selectedEpisodeIds.includes(item.episode.id)"
                  @change="toggleSelectEpisode(item.episode.id, ($event.target as HTMLInputElement).checked)" />
                选择
              </label>
            </article>
          </div>
          <p class="muted" v-else>暂无数据</p>
          <div class="actions">
            <select v-model="batchToStatus">
              <option value="in_review">in_review</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="draft">draft</option>
            </select>
            <input v-model="batchActor" placeholder="操作者（默认 operator）" />
            <input v-model="batchComment" placeholder="批量备注（可选）" />
            <button class="primary" :disabled="loading || selectedEpisodeIds.length === 0" @click="openBatchTransitionConfirm">
              批量流转（{{ selectedEpisodeIds.length }}）
            </button>
          </div>
          <ConfirmActionPanel
            :visible="Boolean(batchTransitionDraft)"
            title="批量流转确认"
            :risk-level="batchTransitionRiskLevel"
            :summary="batchTransitionSummary"
            :impact-items="batchTransitionImpactItems"
            :actor="batchTransitionDraft?.actor || ''"
            :comment="batchTransitionDraft?.comment || ''"
            :confirmed="Boolean(batchTransitionDraft?.confirmed)"
            :busy="loading"
            confirm-text="确认流转"
            @update:actor="(value) => updateBatchTransitionDraft('actor', value)"
            @update:comment="(value) => updateBatchTransitionDraft('comment', value)"
            @update:confirmed="(value) => updateBatchTransitionDraft('confirmed', value)"
            @confirm="confirmBatchTransition"
            @cancel="cancelBatchTransition" />
          <div class="actions">
            <button :disabled="workflowPage <= 1" @click="workflowPage -= 1; loadWorkflowBoard()">上一页</button>
            <p class="muted">第 {{ workflowPage }} / {{ workflowTotalPages }} 页（{{ workflowTotal }} 条）</p>
            <button :disabled="workflowPage >= workflowTotalPages" @click="workflowPage += 1; loadWorkflowBoard()">下一页</button>
          </div>
        </section>
      </template>

      <section class="panel">
        <div class="inline-between">
          <div>
            <h3>结构化分镜流水线</h3>
            <p class="muted">当前作用域：{{ stageTargetEpisodeLabel }}</p>
          </div>
          <div class="actions">
            <button :disabled="loading" @click="loadAll">刷新阶段数据</button>
          </div>
        </div>
        <div class="workflow-stage-grid">
          <article class="workflow-stage-card">
            <p class="workflow-stage-index">Stage 1</p>
            <h4>规划分镜</h4>
            <p class="muted">先按剧本生成结构化分镜草稿，明确角色/场景/道具引用，不直接出图。</p>
            <div class="workflow-stage-metrics">
              <div>
                <span class="metric-label">有剧本分集</span>
                <strong>{{ stageEpisodesWithScriptsCount }}</strong>
              </div>
              <div>
                <span class="metric-label">已规划分镜</span>
                <strong>{{ stagePlannedStoryboards.length }}</strong>
              </div>
              <div>
                <span class="metric-label">待补规划</span>
                <strong>{{ stageEpisodesNeedingPlanCount }}</strong>
              </div>
            </div>
            <button class="primary" :disabled="loading || stageEpisodesWithScriptsCount === 0" @click="openPlanStoryboardsConfirm">
              规划分镜（结构化）
            </button>
          </article>
          <article class="workflow-stage-card">
            <p class="workflow-stage-index">Stage 2</p>
            <h4>生成资产</h4>
            <p class="muted">按实体正向生成角色/场景/道具资产，让一致性先固定，再往下游传播。</p>
            <div class="workflow-stage-metrics">
              <div>
                <span class="metric-label">已规划分镜</span>
                <strong>{{ stagePlannedStoryboards.length }}</strong>
              </div>
              <div>
                <span class="metric-label">已生成资产</span>
                <strong>{{ stageScopedAssetCount }}</strong>
              </div>
              <div>
                <span class="metric-label">已覆盖分镜</span>
                <strong>{{ stageStoryboardAssetCoveredCount }}</strong>
              </div>
              <div>
                <span class="metric-label">待补分镜</span>
                <strong>{{ stageStoryboardsNeedingAssetsCount }}</strong>
              </div>
            </div>
            <div class="button-group-vertical">
              <button class="primary" :disabled="loading || stageScopedStoryboards.length === 0" @click="runProjectAssets">
                生成项目资产（角色/场景主资产）
              </button>
              <button class="primary" :disabled="loading || stageScopedStoryboards.length === 0" @click="runStoryboardAssets">
                生成分镜资产（镜头变体）
              </button>
            </div>
          </article>
          <article class="workflow-stage-card">
            <p class="workflow-stage-index">Stage 3</p>
            <h4>渲染分镜图</h4>
            <p class="muted">使用结构化 plan + 资产约束去渲染最终分镜图，不再直接拿剧本文本硬出图。</p>
            <div class="workflow-stage-metrics">
              <div>
                <span class="metric-label">可渲染分镜</span>
                <strong>{{ stagePlannedStoryboards.length }}</strong>
              </div>
              <div>
                <span class="metric-label">已渲染分镜</span>
                <strong>{{ stageRenderedStoryboards.length }}</strong>
              </div>
              <div>
                <span class="metric-label">待补渲染</span>
                <strong>{{ stageEpisodesNeedingRenderCount }}</strong>
              </div>
            </div>
            <button class="primary" :disabled="loading || stagePlannedStoryboards.length === 0" @click="openRenderStoryboardImagesConfirm">
              渲染分镜图
            </button>
          </article>
        </div>
        <div class="summary-grid">
          <article class="summary-card">
            <p class="summary-label">作用域分集</p>
            <p class="summary-value">{{ stageTargetEpisodeIds.length }}</p>
          </article>
          <article class="summary-card">
            <p class="summary-label">作用域剧本</p>
            <p class="summary-value">{{ stageScopedScripts.length }}</p>
          </article>
          <article class="summary-card">
            <p class="summary-label">作用域分镜</p>
            <p class="summary-value">{{ stageScopedStoryboards.length }}</p>
          </article>
          <article class="summary-card">
            <p class="summary-label">资产覆盖率</p>
            <p class="summary-value">{{ stageAssetCoverageLabel }}</p>
          </article>
        </div>
        <p class="muted" v-if="storyboardStageMessage">{{ storyboardStageMessage }}</p>
        <ConfirmActionPanel
          :visible="Boolean(planStoryboardDraft)"
          title="结构化分镜规划确认"
          :risk-level="planStoryboardRiskLevel"
          :summary="planStoryboardSummary"
          :impact-items="planStoryboardImpactItems"
          :actor="planStoryboardDraft?.actor || ''"
          :comment="planStoryboardDraft?.comment || ''"
          :confirmed="Boolean(planStoryboardDraft?.confirmed)"
          :busy="loading"
          confirm-text="确认规划"
          @update:actor="(value) => updatePlanStoryboardDraft('actor', value)"
          @update:comment="(value) => updatePlanStoryboardDraft('comment', value)"
          @update:confirmed="(value) => updatePlanStoryboardDraft('confirmed', value)"
          @confirm="confirmPlanStoryboards"
          @cancel="cancelPlanStoryboards" />
        <ConfirmActionPanel
          :visible="Boolean(renderStoryboardDraft)"
          title="分镜图渲染确认"
          :risk-level="renderStoryboardRiskLevel"
          :summary="renderStoryboardSummary"
          :impact-items="renderStoryboardImpactItems"
          :actor="renderStoryboardDraft?.actor || ''"
          :comment="renderStoryboardDraft?.comment || ''"
          :confirmed="Boolean(renderStoryboardDraft?.confirmed)"
          :busy="loading"
          confirm-text="确认渲染"
          @update:actor="(value) => updateRenderStoryboardDraft('actor', value)"
          @update:comment="(value) => updateRenderStoryboardDraft('comment', value)"
          @update:confirmed="(value) => updateRenderStoryboardDraft('confirmed', value)"
          @confirm="confirmRenderStoryboardImages"
          @cancel="cancelRenderStoryboardImages" />
      </section>

      <section class="panel">
        <h3>分集批处理（预估 + 执行）</h3>
        <div class="batch-sticky-summary" v-if="batchPrecheckRows.length > 0">
          <div class="summary-grid">
            <article class="summary-card">
              <p class="summary-label">预估分集</p>
              <p class="summary-value">{{ batchPrecheckSummary.episodes }}</p>
            </article>
            <article class="summary-card">
              <p class="summary-label">可建资产</p>
              <p class="summary-value">{{ batchPrecheckSummary.assetCreatable }}</p>
              <p class="muted">冲突 {{ batchPrecheckSummary.assetConflicts }}</p>
            </article>
            <article class="summary-card">
              <p class="summary-label">可建任务</p>
              <p class="summary-value">{{ batchPrecheckSummary.videoCreatable }}</p>
              <p class="muted">冲突 {{ batchPrecheckSummary.videoConflicts }}</p>
            </article>
            <article class="summary-card">
              <p class="summary-label">高风险集</p>
              <p class="summary-value">{{ batchPrecheckSummary.highRisk }}</p>
            </article>
          </div>
        </div>
        <div class="actions">
          <label class="check-inline">
            <input type="checkbox" :checked="isAllEpisodesBatchSelected" @change="toggleSelectAllEpisodes(($event.target as HTMLInputElement).checked)" />
            全选分集
          </label>
          <select v-model="videoTaskPriority">
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
          <select v-model="videoDuration">
            <option v-for="d in videoDurationOptions" :key="d" :value="d">{{ d }}秒</option>
          </select>
          <select v-model="precheckRiskFilter">
            <option value="all">全部风险</option>
            <option value="high">仅 high</option>
            <option value="medium">仅 medium</option>
            <option value="low">仅 low</option>
            <option value="conflict_only">仅冲突集</option>
          </select>
          <select v-model="precheckSortBy">
            <option value="risk_desc">按风险降序</option>
            <option value="episode_order">按分集顺序</option>
            <option value="asset_conflict_desc">按资产冲突数</option>
            <option value="video_conflict_desc">按任务冲突数</option>
          </select>
          <button @click="runBatchPrecheck">执行预检查</button>
          <button :disabled="batchPrecheckRows.length === 0" @click="exportBatchPrecheckReport">导出预检查报告</button>
          <button :disabled="batchPrecheckRows.length === 0" @click="exportBatchPrecheckCsv">导出 CSV</button>
        </div>
        <div class="summary-grid">
          <article class="summary-card">
            <p class="summary-label">预估分集</p>
            <p class="summary-value">{{ batchPrecheckSummary.episodes }}</p>
          </article>
          <article class="summary-card">
            <p class="summary-label">可建资产</p>
            <p class="summary-value">{{ batchPrecheckSummary.assetCreatable }}</p>
            <p class="muted">冲突 {{ batchPrecheckSummary.assetConflicts }}</p>
          </article>
          <article class="summary-card">
            <p class="summary-label">可建任务</p>
            <p class="summary-value">{{ batchPrecheckSummary.videoCreatable }}</p>
            <p class="muted">冲突 {{ batchPrecheckSummary.videoConflicts }}</p>
          </article>
          <article class="summary-card">
            <p class="summary-label">高风险集</p>
            <p class="summary-value">{{ batchPrecheckSummary.highRisk }}</p>
          </article>
        </div>
        <div class="conflict-bars" v-if="precheckConflictStats.max > 0">
          <article class="conflict-bar-card">
            <p class="summary-label">资产冲突占比</p>
            <div class="bar-track"><span class="bar-fill asset" :style="{ width: `${precheckConflictStats.assetPct}%` }"></span></div>
            <p class="muted">{{ precheckConflictStats.asset }} / {{ precheckConflictStats.total }}</p>
          </article>
          <article class="conflict-bar-card">
            <p class="summary-label">任务冲突占比</p>
            <div class="bar-track"><span class="bar-fill video" :style="{ width: `${precheckConflictStats.videoPct}%` }"></span></div>
            <p class="muted">{{ precheckConflictStats.video }} / {{ precheckConflictStats.total }}</p>
          </article>
          <article class="conflict-bar-card">
            <p class="summary-label">高风险分集占比</p>
            <div class="bar-track"><span class="bar-fill risk" :style="{ width: `${precheckConflictStats.highRiskPct}%` }"></span></div>
            <p class="muted">{{ precheckConflictStats.highRisk }} / {{ Math.max(1, precheckConflictStats.episodes) }}</p>
          </article>
        </div>
        <div class="conflict-dimensions" v-if="precheckConflictByStoryboard.length > 0 || precheckConflictByResourceType.total > 0">
          <article class="conflict-dimension-card" v-if="precheckConflictByStoryboard.length > 0">
            <h4>冲突来源（按分镜）</h4>
            <div class="list compact-list">
              <article class="card" v-for="row in precheckConflictByStoryboard" :key="row.title">
                <div class="inline-between">
                  <strong>{{ row.title }}</strong>
                  <span class="muted">total {{ row.total }}</span>
                </div>
                <p class="muted">资产 {{ row.assetConflicts }} / 任务 {{ row.videoConflicts }}</p>
              </article>
            </div>
          </article>
          <article class="conflict-dimension-card" v-if="precheckConflictByResourceType.total > 0">
            <h4>冲突来源（按资源类型）</h4>
            <div class="list compact-list">
              <article class="card" v-for="row in precheckConflictByResourceType.rows" :key="row.type">
                <div class="inline-between">
                  <strong>{{ row.type }}</strong>
                  <span class="muted">{{ row.pct }}%</span>
                </div>
                <p class="muted">冲突相关资产 {{ row.count }} / 总 {{ precheckConflictByResourceType.total }}</p>
              </article>
            </div>
          </article>
        </div>
        <div class="list" v-if="batchPrecheckRows.length > 0">
          <article class="card" v-for="row in batchPrecheckRows" :key="row.episodeId">
            <div>
              <h4>
                {{ row.orderIndex }} · {{ row.title }}
                <span class="risk-chip" :class="`risk-${row.riskLevel}`">{{ row.riskLevel }}</span>
              </h4>
              <p class="muted">分镜总数 {{ row.storyboardCount }}</p>
              <p class="muted">
                资产可建 {{ row.assetCreatableCount }} / 冲突 {{ row.assetConflictCount }}
              </p>
              <p class="muted">
                任务可建 {{ row.videoCreatableCount }} / 冲突 {{ row.videoConflictCount }}
              </p>
              <p class="muted" v-if="row.assetConflictTitles.length > 0">资产冲突：{{ row.assetConflictTitles.slice(0, 4).join('，') }}<span v-if="row.assetConflictTitles.length > 4"> ...</span></p>
              <p class="muted" v-if="row.videoConflictTitles.length > 0">任务冲突：{{ row.videoConflictTitles.slice(0, 4).join('，') }}<span v-if="row.videoConflictTitles.length > 4"> ...</span></p>
            </div>
            <label class="check-inline">
              <input
                type="checkbox"
                :checked="episodeBatchIds.includes(row.episodeId)"
                @change="toggleEpisodeBatch(row.episodeId, ($event.target as HTMLInputElement).checked)" />
              参与批处理
            </label>
          </article>
        </div>
        <p class="muted" v-else>当前筛选下暂无预检查数据</p>
        <div class="actions">
          <button class="primary" :disabled="loading" @click="runBatchAssets">批量生成资产</button>
          <button class="primary" :disabled="loading" @click="runBatchVideoTasks">批量创建视频任务</button>
        </div>
      </section>

      <section class="panel">
        <h3>音频任务编排（动态能力）</h3>
        <p class="muted">单条入口用于补充旁白/环境说明；角色对白请优先使用“批量生成对白任务”。</p>
        <div class="form">
          <label>
            分镜
            <select v-model="audioStoryboardId">
              <option value="">选择分镜</option>
              <option v-for="item in storyboards" :key="item.id" :value="item.id">
                {{ item.title }}
              </option>
            </select>
          </label>
          <label>
            音频模型
            <select v-model="audioModelId">
              <option value="">选择模型</option>
              <option v-for="item in audioModels" :key="item.id" :value="item.id">
                {{ item.name }} · {{ item.manufacturer }}
              </option>
            </select>
          </label>
          <label>
            优先级
            <select v-model="audioPriority">
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label>
            音色
            <select v-if="audioVoiceOptions.length > 0" v-model="audioVoice">
              <option value="">默认</option>
              <option v-for="item in audioVoiceOptions" :key="item" :value="item">{{ item }}</option>
            </select>
            <input v-else v-model="audioVoice" placeholder="voice（可选）" />
          </label>
          <label>
            语速
            <select v-if="audioSpeedOptions.length > 0" v-model="audioSpeedText">
              <option value="">默认</option>
              <option v-for="item in audioSpeedOptions" :key="item" :value="String(item)">{{ item }}</option>
            </select>
            <input v-else v-model="audioSpeedText" type="number" step="0.05" min="0.25" max="4" placeholder="speed（可选）" />
          </label>
          <label>
            情绪
            <select v-if="audioEmotionOptions.length > 0" v-model="audioEmotion">
              <option value="">默认</option>
              <option v-for="item in audioEmotionOptions" :key="item" :value="item">{{ item }}</option>
            </select>
            <input v-else v-model="audioEmotion" placeholder="emotion（可选）" />
          </label>
          <label>
            格式
            <select v-if="audioFormatOptions.length > 0" v-model="audioFormat">
              <option value="">默认</option>
              <option v-for="item in audioFormatOptions" :key="item" :value="item">{{ item }}</option>
            </select>
            <select v-else v-model="audioFormat">
              <option value="">默认</option>
              <option value="mp3">mp3</option>
              <option value="wav">wav</option>
              <option value="aac">aac</option>
              <option value="flac">flac</option>
              <option value="ogg">ogg</option>
            </select>
          </label>
        </div>
        <label>
          providerOptions（JSON，可选）
          <textarea v-model="audioProviderOptionsText" rows="4" placeholder='如 {"language":"zh","sampleRate":24000}' />
        </label>
        <p class="muted" v-if="audioProviderOptionKeys.length > 0">可用 providerOptions 字段：{{ audioProviderOptionKeys.join(', ') }}</p>
        <div class="actions">
          <button :disabled="loading || !audioStoryboardId || !audioModelId" @click="createWorkflowAudioTask">创建旁白任务</button>
          <button class="primary" :disabled="loading || !audioModelId" @click="createWorkflowDialogueTasks">批量生成对白任务</button>
        </div>
        <p class="muted" v-if="audioOpsMessage">{{ audioOpsMessage }}</p>
      </section>

      <section class="panel">
        <h3>Frame Prompt 批处理（Workflow 联动）</h3>
        <div class="actions">
          <label class="check-inline"><input type="checkbox" v-model="frameWorkflowStatuses.draft" /> draft</label>
          <label class="check-inline"><input type="checkbox" v-model="frameWorkflowStatuses.in_review" /> in_review</label>
          <label class="check-inline"><input type="checkbox" v-model="frameWorkflowStatuses.rejected" /> rejected</label>
          <label class="check-inline"><input type="checkbox" v-model="frameWorkflowStatuses.approved" /> approved</label>
        </div>
        <div class="form">
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
            回写策略
            <select v-model="frameSaveAs">
              <option value="none">none</option>
              <option value="replace_storyboard_prompt">replace_storyboard_prompt</option>
            </select>
          </label>
          <label>
            每集上限
            <input v-model.number="frameLimitPerEpisode" type="number" min="1" max="200" />
          </label>
          <label class="check-inline">
            <input v-model="frameAutoTransition" type="checkbox" />
            自动流转到 in_review
          </label>
        </div>
        <div class="actions" style="margin-top: 8px">
          <button :disabled="loading" @click="runFramePromptPrecheck">预检查（有分镜且未 approved）</button>
          <button class="primary" :disabled="loading || framePrecheck.eligibleEpisodeIds.length === 0" @click="runFramePromptWorkflowBatch">
            执行批处理
          </button>
          <button :disabled="loading || noStoryboardEpisodeIds.length === 0" @click="openRepairNoStoryboardsConfirm">
            修复 no_storyboards（按剧本生成）
          </button>
          <button :disabled="loading || structuredStoryboardEpisodeIds.length === 0" @click="openRebuildStructuredStoryboardsConfirm">
            按剧本重建现有分镜（结构化）
          </button>
          <button :disabled="loading || approvedSkippedEpisodeIds.length === 0" @click="reopenApprovedEpisodesToInReview">
            处理 approved（回退到 in_review）
          </button>
          <select v-model="framePrecheckViewMode">
            <option value="all">显示全部</option>
            <option value="eligible">仅可处理</option>
            <option value="skipped">仅跳过</option>
          </select>
          <button :disabled="framePrecheckRows.length === 0" @click="exportFramePrecheckJson">导出预检查 JSON</button>
        </div>
        <p class="muted">
          预检查：匹配 {{ framePrecheck.matched }} 集；可处理 {{ framePrecheck.eligibleEpisodeIds.length }} 集；跳过 {{ framePrecheck.skippedEpisodeIds.length }} 集
        </p>
        <div class="list" v-if="filteredFramePrecheckRows.length > 0">
          <article class="card" v-for="row in filteredFramePrecheckRows" :key="row.episodeId">
            <div>
              <h4>{{ row.orderIndex }} · {{ row.title }}</h4>
              <p class="muted">status={{ row.status }} / storyboardCount={{ row.storyboardCount }}</p>
              <p class="muted">
                预检查：{{ row.eligible ? '可处理' : `跳过（${row.reason || 'unknown'}）` }}
              </p>
            </div>
          </article>
        </div>
        <p class="muted" v-if="frameBatchResult">
          已处理 {{ frameBatchResult.episodesProcessed }} 集 / 生成 {{ frameBatchResult.generatedTotal }} 条 / 回写 {{ frameBatchResult.updatedStoryboardPrompts }} 条 / 自动流转 {{ frameBatchResult.transitionedEpisodeIds.length }} 集
        </p>
        <p class="muted" v-if="frameOpsMessage">{{ frameOpsMessage }}</p>
        <ConfirmActionPanel
          :visible="Boolean(repairNoStoryboardDraft)"
          title="no_storyboards 修复确认"
          risk-level="medium"
          :summary="repairNoStoryboardSummary"
          :impact-items="repairNoStoryboardImpactItems"
          :actor="repairNoStoryboardDraft?.actor || ''"
          :comment="repairNoStoryboardDraft?.comment || ''"
          :confirmed="Boolean(repairNoStoryboardDraft?.confirmed)"
          :busy="loading"
          confirm-text="确认修复"
          @update:actor="(value) => updateRepairNoStoryboardDraft('actor', value)"
          @update:comment="(value) => updateRepairNoStoryboardDraft('comment', value)"
          @update:confirmed="(value) => updateRepairNoStoryboardDraft('confirmed', value)"
          @confirm="confirmRepairNoStoryboards"
          @cancel="cancelRepairNoStoryboards" />
        <ConfirmActionPanel
          :visible="Boolean(rebuildStructuredStoryboardDraft)"
          title="结构化分镜重建确认"
          risk-level="high"
          :summary="rebuildStructuredStoryboardSummary"
          :impact-items="rebuildStructuredStoryboardImpactItems"
          :actor="rebuildStructuredStoryboardDraft?.actor || ''"
          :comment="rebuildStructuredStoryboardDraft?.comment || ''"
          :confirmed="Boolean(rebuildStructuredStoryboardDraft?.confirmed)"
          :busy="loading"
          confirm-text="确认重建"
          @update:actor="(value) => updateRebuildStructuredStoryboardDraft('actor', value)"
          @update:comment="(value) => updateRebuildStructuredStoryboardDraft('comment', value)"
          @update:confirmed="(value) => updateRebuildStructuredStoryboardDraft('confirmed', value)"
          @confirm="confirmRebuildStructuredStoryboards"
          @cancel="cancelRebuildStructuredStoryboards" />
        <ConfirmActionPanel
          :visible="Boolean(approvedRollbackDraft)"
          title="approved 回退确认"
          risk-level="high"
          :summary="approvedRollbackSummary"
          :impact-items="approvedRollbackImpactItems"
          :actor="approvedRollbackDraft?.actor || ''"
          :comment="approvedRollbackDraft?.comment || ''"
          :confirmed="Boolean(approvedRollbackDraft?.confirmed)"
          :busy="loading"
          confirm-text="确认回退"
          @update:actor="(value) => updateApprovedRollbackDraft('actor', value)"
          @update:comment="(value) => updateApprovedRollbackDraft('comment', value)"
          @update:confirmed="(value) => updateApprovedRollbackDraft('confirmed', value)"
          @confirm="confirmApprovedRollback"
          @cancel="cancelApprovedRollback" />
      </section>

      <template #inspector>
        <section class="panel">
          <h3>批量流转撤销（Undo Window）</h3>
          <div class="actions">
            <button :disabled="loading || undoStack.length === 0" @click="undoLatest">撤销最近一次</button>
            <button @click="loadUndoStack">刷新撤销栈</button>
          </div>
          <div class="list" v-if="undoStack.length > 0">
            <article class="card" v-for="item in undoStack" :key="item.id">
              <div>
                <p class="muted">{{ item.createdAt }} · 到期 {{ item.expiresAt }}</p>
                <p>to={{ item.toStatus }} / affected={{ item.affectedEpisodes }} / actor={{ item.actor }} <span v-if="item.expired">（已过期）</span></p>
                <p class="muted" v-if="item.comment">{{ item.comment }}</p>
              </div>
              <button :disabled="loading || item.expired" @click="undoById(item.id)">撤销此条</button>
            </article>
          </div>
          <p class="muted" v-else>暂无可撤销记录</p>
        </section>

        <section class="panel">
          <h3>角色库批量投放</h3>
          <div class="actions">
            <select v-model="resourceId">
              <option value="">选择资源</option>
              <option v-for="item in resources" :key="item.id" :value="item.id">
                {{ item.type }} · {{ item.name }}
              </option>
            </select>
            <select v-model="targetEpisodeId">
              <option value="">选择分集</option>
              <option v-for="ep in episodes" :key="ep.id" :value="ep.id">
                {{ ep.orderIndex }} · {{ ep.title }}
              </option>
            </select>
            <select v-model="applyMode">
              <option value="missing_only">missing_only（仅缺失）</option>
              <option value="all">all（全量）</option>
            </select>
            <button class="primary" :disabled="loading" @click="applyResourceToEpisode">执行投放</button>
          </div>
        </section>

        <section class="panel">
          <h3>操作日志（预估 vs 实际）</h3>
          <div class="actions">
            <select v-model="workflowOpActionFilter">
              <option value="">全部操作</option>
              <option v-for="name in workflowOpActionOptions" :key="name" :value="name">{{ name }}</option>
            </select>
            <input v-model="workflowOpTimeFrom" type="datetime-local" />
            <input v-model="workflowOpTimeTo" type="datetime-local" />
            <button :disabled="filteredWorkflowOpLogs.length === 0" @click="exportWorkflowOpLogs">导出当前筛选</button>
            <button :disabled="workflowOpLogs.length === 0" @click="clearWorkflowOpLogs">清空</button>
          </div>
          <div class="list" v-if="filteredWorkflowOpLogs.length > 0">
            <article class="card" v-for="item in filteredWorkflowOpLogs" :key="item.id">
              <div>
                <h4>{{ item.action }}</h4>
                <p class="muted">{{ formatWorkflowOpLogTime(item.time) }}</p>
                <p class="muted">预估：{{ item.estimated }}</p>
                <p class="muted">实际：{{ item.actual }}</p>
                <p class="muted" v-if="item.note">{{ item.note }}</p>
              </div>
            </article>
          </div>
          <p class="muted" v-else>暂无日志</p>
        </section>
      </template>
    </DesktopWorkbenchShell>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import ConfirmActionPanel from '@/components/ConfirmActionPanel.vue';
import DesktopWorkbenchShell from '@/components/DesktopWorkbenchShell.vue';
import RouteRestoreHint from '@/components/RouteRestoreHint.vue';
import { clearToken } from '@/api/client';
import { getModelConfigs, getModelCapabilities } from '@/api/settings-admin';
import { generateEpisodesAssetsBatch, generateDramaEpisodesAssetsBatch } from '@/api/workflow-ops';
import {
  Asset,
  EpisodeDomain,
  EpisodeWorkflowStatus,
  Project,
  ProjectFramePromptByWorkflowResult,
  ScriptDoc,
  Storyboard,
  WorkflowEpisodeListItem,
  WorkflowTransitionUndoEntry
} from '@/types/models';
import type { ModelConfig } from '@/types/models';
import type { WorkflowOpLogEntry } from '@/types/models';
import { toSingleQuery, useRouteRestoreContext } from '@/composables/useRouteRestoreContext';
import { useWorkflowWorkbenchDerivedState } from '@/composables/useWorkflowWorkbenchDerivedState';
import { useWorkflowWorkbenchExports } from '@/composables/useWorkflowWorkbenchExports';
import { useWorkflowFramePromptOps } from '@/composables/useWorkflowFramePromptOps';
import { useWorkflowStoryboardStageOps } from '@/composables/useWorkflowStoryboardStageOps';
import { useWorkflowAudioTaskOps } from '@/composables/useWorkflowAudioTaskOps';
import { useWorkflowBatchOps } from '@/composables/useWorkflowBatchOps';
import { useWorkflowWorkbenchDataAccess } from '@/composables/useWorkflowWorkbenchDataAccess';
import { useWorkflowWorkbenchRouteScope } from '@/composables/useWorkflowWorkbenchRouteScope';

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
const episodes = ref<EpisodeDomain[]>([]);
const scripts = ref<ScriptDoc[]>([]);
const storyboards = ref<Storyboard[]>([]);
const assets = ref<Asset[]>([]);
const resources = ref<Array<{ id: string; type: 'character' | 'scene' | 'prop'; name: string }>>([]);
const loading = ref(false);
const error = ref('');
const quotaExceededHintVisible = ref(false);

const workflowStatusFilter = ref<'' | 'draft' | 'in_review' | 'approved' | 'rejected'>('');
const workflowQuery = ref('');
const workflowMode = ref<'single' | 'batch'>('batch');
const workflowScopeEpisodeId = ref('');
const {
  restoreTip: workflowRouteRestoredTip,
  markRestored: markWorkflowRouteRestored,
  clearRestored: clearWorkflowRouteRestored,
  runRestoreScroll: runWorkflowRouteRestoreScroll
} = useRouteRestoreContext();
const syncingScopeQuery = ref(false);
const workflowPage = ref(1);
const workflowPageSize = 20;
const workflowItems = ref<WorkflowEpisodeListItem[]>([]);
const workflowTotal = ref(0);
const selectedEpisodeIds = ref<string[]>([]);
const batchToStatus = ref<'draft' | 'in_review' | 'approved' | 'rejected'>('in_review');
const batchActor = ref('operator');
const batchComment = ref('');
const batchTransitionDraft = ref<{
  episodeIds: string[];
  toStatus: 'draft' | 'in_review' | 'approved' | 'rejected';
  actor: string;
  comment: string;
  confirmed: boolean;
} | null>(null);
const workflowOpLogs = ref<WorkflowOpLogEntry[]>([]);
const workflowOpActionFilter = ref('');
const workflowOpTimeFrom = ref('');
const workflowOpTimeTo = ref('');

const undoStack = ref<WorkflowTransitionUndoEntry[]>([]);

const episodeBatchIds = ref<string[]>([]);
const videoTaskPriority = ref<'low' | 'medium' | 'high'>('medium');
const videoDuration = ref<number>(5);
const videoModelCapabilities = ref<{ durations: number[] } | null>(null);

const videoDurationOptions = computed(() => {
  if (videoModelCapabilities.value?.durations) {
    return videoModelCapabilities.value.durations;
  }
  return [3, 4, 5, 6, 8, 10];
});

const loadVideoModelCapabilities = async (): Promise<void> => {
  try {
    const models = await getModelConfigs('video');
    const defaultModel = models.find(m => m.isDefault) || models[0];
    if (defaultModel) {
      const caps = await getModelCapabilities(defaultModel.id);
      if (caps && caps.video && Array.isArray((caps.video as Record<string, unknown>).durations)) {
        videoModelCapabilities.value = { durations: (caps.video as Record<string, unknown>).durations as number[] };
        if (videoModelCapabilities.value.durations.length > 0) {
          videoDuration.value = videoModelCapabilities.value.durations[0];
        }
      }
    }
  } catch (e) {
    console.error('Failed to load video model capabilities:', e);
  }
};
const assetPrecheckByEpisode = ref<Record<string, { creatableStoryboardIds: string[]; conflictStoryboardIds: string[] }>>({});
const videoPrecheckByEpisode = ref<Record<string, { creatableStoryboardIds: string[]; conflictStoryboardIds: string[] }>>({});
const precheckRiskFilter = ref<'all' | 'high' | 'medium' | 'low' | 'conflict_only'>('all');
const precheckSortBy = ref<'episode_order' | 'risk_desc' | 'asset_conflict_desc' | 'video_conflict_desc'>('risk_desc');
const frameWorkflowStatuses = ref<Record<EpisodeWorkflowStatus, boolean>>({
  draft: true,
  in_review: true,
  rejected: true,
  approved: false
});
const frameType = ref<'opening' | 'middle' | 'ending' | 'action' | 'emotion'>('opening');
const frameSaveAs = ref<'none' | 'replace_storyboard_prompt'>('none');
const frameLimitPerEpisode = ref(20);
const frameAutoTransition = ref(true);
const framePrecheck = ref<{ matched: number; eligibleEpisodeIds: string[]; skippedEpisodeIds: string[] }>({
  matched: 0,
  eligibleEpisodeIds: [],
  skippedEpisodeIds: []
});
const framePrecheckRows = ref<
  Array<{
    episodeId: string;
    orderIndex: number;
    title: string;
    status: EpisodeWorkflowStatus;
    storyboardCount: number;
    eligible: boolean;
    reason: 'no_storyboards' | 'approved' | null;
  }>
>([]);
const framePrecheckViewMode = ref<'all' | 'eligible' | 'skipped'>('all');
const frameBatchResult = ref<ProjectFramePromptByWorkflowResult | null>(null);
const frameOpsMessage = ref('');
const repairNoStoryboardDraft = ref<{
  episodeIds: string[];
  actor: string;
  comment: string;
  confirmed: boolean;
} | null>(null);
const rebuildStructuredStoryboardDraft = ref<{
  episodeIds: string[];
  actor: string;
  comment: string;
  confirmed: boolean;
} | null>(null);
const planStoryboardDraft = ref<{
  episodeIds: string[];
  actor: string;
  comment: string;
  confirmed: boolean;
} | null>(null);
const renderStoryboardDraft = ref<{
  episodeIds: string[];
  actor: string;
  comment: string;
  confirmed: boolean;
} | null>(null);
const approvedRollbackDraft = ref<{
  episodeIds: string[];
  actor: string;
  comment: string;
  confirmed: boolean;
} | null>(null);

const resourceId = ref('');
const targetEpisodeId = ref('');
const applyMode = ref<'missing_only' | 'all'>('missing_only');
const audioModels = ref<ModelConfig[]>([]);
const audioStoryboardId = ref('');
const audioModelId = ref('');
const audioPriority = ref<'low' | 'medium' | 'high'>('medium');
const audioVoice = ref('');
const audioSpeedText = ref('');
const audioEmotion = ref('');
const audioFormat = ref('');
const audioProviderOptionsText = ref('{}');
const audioOpsMessage = ref('');
const storyboardStageMessage = ref('');

const {
  approvedRollbackImpactItems,
  approvedRollbackSummary,
  approvedSkippedEpisodeIds,
  audioEmotionOptions,
  audioFormatOptions,
  audioProviderOptionKeys,
  audioProviderOptionRuleRoot,
  audioSpeedOptions,
  audioVoiceOptions,
  batchPrecheckRows,
  batchPrecheckSummary,
  batchTransitionImpactItems,
  batchTransitionRiskLevel,
  batchTransitionSummary,
  episodeTitleMap,
  filteredFramePrecheckRows,
  filteredWorkflowOpLogs,
  isAllEpisodesBatchSelected,
  isAllSelected,
  noStoryboardEpisodeIds,
  precheckConflictByResourceType,
  precheckConflictByStoryboard,
  precheckConflictStats,
  rebuildStructuredStoryboardImpactItems,
  rebuildStructuredStoryboardSummary,
  repairNoStoryboardImpactItems,
  repairNoStoryboardSummary,
  selectedAudioModel,
  workflowOpActionOptions,
  structuredStoryboardEpisodeIds,
  workflowTotalPages
} = useWorkflowWorkbenchDerivedState({
  workflowTotal,
  workflowPageSize,
  workflowOpLogs,
  workflowOpActionFilter,
  workflowOpTimeFrom,
  workflowOpTimeTo,
  workflowItems,
  selectedEpisodeIds,
  batchTransitionDraft,
  episodes,
  episodeBatchIds,
  framePrecheckRows,
  framePrecheckViewMode,
  repairNoStoryboardDraft,
  rebuildStructuredStoryboardDraft,
  approvedRollbackDraft,
  audioModels,
  audioModelId,
  storyboards,
  assets,
  assetPrecheckByEpisode,
  videoPrecheckByEpisode,
  precheckRiskFilter,
  precheckSortBy
});

const {
  exportBatchPrecheckCsv,
  exportBatchPrecheckReport,
  exportWorkflowOpLogs,
  formatWorkflowOpLogTime,
  persistWorkflowOpLogFilters,
  restoreWorkflowOpLogFilters
} = useWorkflowWorkbenchExports({
  projectId,
  workflowOpActionFilter,
  workflowOpTimeFrom,
  workflowOpTimeTo,
  filteredWorkflowOpLogs,
  precheckRiskFilter,
  precheckSortBy,
  episodeBatchIds,
  batchPrecheckSummary,
  precheckConflictStats,
  batchPrecheckRows
});

const {
  goFramePromptWorkbench,
  goProject,
  loadUndoStack,
  loadWorkflowBoard,
  loadWorkflowOpLogs,
  pushWorkflowOpLog
} = useWorkflowWorkbenchDataAccess({
  router,
  hasDramaScopedApi,
  dramaId,
  projectId,
  workflowStatusFilter,
  workflowQuery,
  workflowPage,
  workflowPageSize,
  workflowItems,
  workflowTotal,
  selectedEpisodeIds,
  workflowOpLogs,
  undoStack
});

const logout = () => {
  clearToken();
  void router.replace('/login');
};

const {
  cancelApprovedRollback,
  cancelRebuildStructuredStoryboards,
  cancelRepairNoStoryboards,
  confirmApprovedRollback,
  confirmRebuildStructuredStoryboards,
  confirmRepairNoStoryboards,
  exportFramePrecheckJson,
  openRebuildStructuredStoryboardsConfirm,
  openRepairNoStoryboardsConfirm,
  reopenApprovedEpisodesToInReview,
  runFramePromptPrecheck,
  runFramePromptWorkflowBatch,
  updateApprovedRollbackDraft,
  updateRebuildStructuredStoryboardDraft,
  updateRepairNoStoryboardDraft
} = useWorkflowFramePromptOps({
  hasDramaScopedApi,
  dramaId,
  projectId,
  loading,
  error,
  frameWorkflowStatuses,
  frameType,
  frameSaveAs,
  frameLimitPerEpisode,
  frameAutoTransition,
  batchActor,
  batchComment,
  framePrecheck,
  framePrecheckRows,
  frameBatchResult,
  frameOpsMessage,
  repairNoStoryboardDraft,
  rebuildStructuredStoryboardDraft,
  approvedRollbackDraft,
  noStoryboardEpisodeIds,
  structuredStoryboardEpisodeIds,
  approvedSkippedEpisodeIds,
  loadWorkflowBoard,
  loadUndoStack,
  pushWorkflowOpLog
});

const {
  createWorkflowAudioTask,
  createWorkflowDialogueTasks,
  ensureAudioDefaults
} = useWorkflowAudioTaskOps({
  hasDramaScopedApi,
  dramaId,
  projectId,
  workflowMode,
  workflowScopeEpisodeId,
  episodeBatchIds,
  selectedEpisodeIds,
  loading,
  error,
  audioModels,
  storyboards,
  audioStoryboardId,
  audioModelId,
  audioPriority,
  audioVoice,
  audioSpeedText,
  audioEmotion,
  audioFormat,
  audioProviderOptionsText,
  audioOpsMessage,
  selectedAudioModel,
  audioVoiceOptions,
  audioSpeedOptions,
  audioEmotionOptions,
  audioFormatOptions,
  audioProviderOptionRuleRoot
});

const {
  applyResourceToEpisode,
  cancelBatchTransition,
  clearWorkflowOpLogs,
  confirmBatchTransition,
  goTaskQuotaPanel,
  openBatchTransitionConfirm,
  runBatchAssets,
  runBatchPrecheck,
  runBatchVideoTasks,
  toggleEpisodeBatch,
  toggleSelectAll,
  toggleSelectAllEpisodes,
  toggleSelectEpisode,
  undoById,
  undoLatest,
  updateBatchTransitionDraft
} = useWorkflowBatchOps({
  router,
  hasDramaScopedApi,
  dramaId,
  projectId,
  loading,
  error,
  quotaExceededHintVisible,
  workflowItems,
  selectedEpisodeIds,
  batchToStatus,
  batchActor,
  batchComment,
  batchTransitionDraft,
  undoStack,
  episodes,
  episodeBatchIds,
  videoTaskPriority,
  videoDuration,
  assetPrecheckByEpisode,
  videoPrecheckByEpisode,
  resourceId,
  targetEpisodeId,
  applyMode,
  loadWorkflowBoard,
  loadUndoStack,
  pushWorkflowOpLog
});

const {
  applyRouteQueryPreset,
  applyWorkflowScopeMode,
  loadAll,
  syncScopeQueryToRoute
} = useWorkflowWorkbenchRouteScope({
  route,
  router,
  routeProjectId,
  routeDramaId,
  dramaId,
  projectId,
  hasDramaScopedApi,
  project,
  episodes,
  scripts,
  storyboards,
  assets,
  resources,
  workflowOpLogs,
  audioModels,
  workflowMode,
  workflowScopeEpisodeId,
  workflowStatusFilter,
  workflowPage,
  workflowQuery,
  syncingScopeQuery,
  episodeBatchIds,
  selectedEpisodeIds,
  targetEpisodeId,
  audioStoryboardId,
  audioModelId,
  quotaExceededHintVisible,
  loading,
  error,
  markWorkflowRouteRestored,
  clearWorkflowRouteRestored,
  runWorkflowRouteRestoreScroll,
  ensureAudioDefaults,
  runBatchPrecheck,
  runFramePromptPrecheck,
  loadWorkflowBoard,
  loadUndoStack,
  loadWorkflowOpLogs
});

const stageTargetEpisodeIds = computed(() =>
  episodeBatchIds.value.length > 0 ? episodeBatchIds.value : episodes.value.map((item) => item.id)
);
const stageTargetEpisodeSet = computed(() => new Set(stageTargetEpisodeIds.value));
const stageTargetEpisodeLabel = computed(() =>
  episodeBatchIds.value.length > 0 ? `已选择 ${episodeBatchIds.value.length} 集` : `全部 ${episodes.value.length} 集`
);
const stageScopedScripts = computed(() =>
  scripts.value.filter((item) => item.episodeId && stageTargetEpisodeSet.value.has(item.episodeId))
);
const stageScopedStoryboards = computed(() =>
  storyboards.value.filter((item) => item.episodeId && stageTargetEpisodeSet.value.has(item.episodeId))
);
const stagePlannedStoryboards = computed(() => stageScopedStoryboards.value.filter((item) => Boolean(item.plan)));
const stageRenderedStoryboards = computed(() =>
  stageScopedStoryboards.value.filter((item) => item.status === 'generated' || Boolean(item.imageUrl))
);
const stageScopedStoryboardIdSet = computed(() => new Set(stageScopedStoryboards.value.map((item) => item.id)));
const stageScopedAssetCount = computed(() =>
  assets.value.filter((item) => stageScopedStoryboardIdSet.value.has(item.storyboardId)).length
);
const stageStoryboardAssetCoveredIds = computed(() => {
  const covered = new Set<string>();
  for (const item of assets.value) {
    if (stageScopedStoryboardIdSet.value.has(item.storyboardId)) {
      covered.add(item.storyboardId);
    }
  }
  return covered;
});
const stageStoryboardAssetCoveredCount = computed(() => stageStoryboardAssetCoveredIds.value.size);
const stageStoryboardsNeedingAssetsCount = computed(() =>
  stageTargetEpisodeIds.value.reduce((sum, episodeId) => {
    const row = assetPrecheckByEpisode.value[episodeId];
    return sum + (row?.creatableStoryboardIds.length ?? 0);
  }, 0)
);
const stageEpisodeRows = computed(() =>
  stageTargetEpisodeIds.value.map((episodeId) => {
    const scriptCount = stageScopedScripts.value.filter((item) => item.episodeId === episodeId).length;
    const episodeStoryboards = stageScopedStoryboards.value.filter((item) => item.episodeId === episodeId);
    const plannedCount = episodeStoryboards.filter((item) => Boolean(item.plan)).length;
    const renderedCount = episodeStoryboards.filter((item) => item.status === 'generated' || Boolean(item.imageUrl)).length;
    const assetCoveredCount = episodeStoryboards.filter((item) => stageStoryboardAssetCoveredIds.value.has(item.id)).length;
    return {
      episodeId,
      scriptCount,
      storyboardCount: episodeStoryboards.length,
      plannedCount,
      renderedCount,
      assetCoveredCount
    };
  })
);
const stageEpisodesWithScriptsCount = computed(() => stageEpisodeRows.value.filter((item) => item.scriptCount > 0).length);
const stageEpisodesNeedingPlanCount = computed(() =>
  stageEpisodeRows.value.filter((item) => item.scriptCount > 0 && item.storyboardCount === 0).length
);
const stageEpisodesNeedingRenderCount = computed(() =>
  stageEpisodeRows.value.filter((item) => item.plannedCount > 0 && item.renderedCount < item.plannedCount).length
);
const stageAssetCoverageLabel = computed(() => `${stageStoryboardAssetCoveredCount.value}/${stageScopedStoryboards.value.length}`);

const planStoryboardTargetScripts = computed(() => {
  const draft = planStoryboardDraft.value;
  if (!draft) {
    return [] as ScriptDoc[];
  }
  const targetSet = new Set(draft.episodeIds);
  return scripts.value.filter((item) => item.episodeId && targetSet.has(item.episodeId));
});
const planStoryboardExistingCount = computed(() => {
  const draft = planStoryboardDraft.value;
  if (!draft) {
    return 0;
  }
  const targetSet = new Set(draft.episodeIds);
  return storyboards.value.filter((item) => item.episodeId && targetSet.has(item.episodeId)).length;
});
const planStoryboardRiskLevel = computed<'low' | 'medium' | 'high'>(() => {
  if (planStoryboardExistingCount.value > 0) {
    return 'high';
  }
  if ((planStoryboardDraft.value?.episodeIds.length ?? 0) >= 4) {
    return 'medium';
  }
  return 'low';
});
const planStoryboardSummary = computed(() => {
  const draft = planStoryboardDraft.value;
  if (!draft) {
    return '';
  }
  return `将为 ${draft.episodeIds.length} 个分集按剧本规划结构化分镜，涉及 ${planStoryboardTargetScripts.value.length} 条剧本。`;
});
const planStoryboardImpactItems = computed(() => {
  const draft = planStoryboardDraft.value;
  if (!draft) {
    return [] as string[];
  }
  return [
    `预计处理分集：${draft.episodeIds.length}`,
    `关联剧本：${planStoryboardTargetScripts.value.length} 条`,
    planStoryboardExistingCount.value > 0
      ? `将替换当前作用域内已有分镜 ${planStoryboardExistingCount.value} 条`
      : '当前无旧分镜，将直接创建结构化分镜草稿',
    '完成后建议继续执行“生成资产（按实体）”和“渲染分镜图”'
  ];
});

const renderStoryboardTargetCount = computed(() => {
  const draft = renderStoryboardDraft.value;
  if (!draft) {
    return 0;
  }
  const targetSet = new Set(draft.episodeIds);
  return storyboards.value.filter((item) => item.episodeId && targetSet.has(item.episodeId) && Boolean(item.plan)).length;
});
const renderStoryboardExistingGeneratedCount = computed(() => {
  const draft = renderStoryboardDraft.value;
  if (!draft) {
    return 0;
  }
  const targetSet = new Set(draft.episodeIds);
  return storyboards.value.filter(
    (item) => item.episodeId && targetSet.has(item.episodeId) && Boolean(item.plan) && (item.status === 'generated' || Boolean(item.imageUrl))
  ).length;
});
const renderStoryboardRiskLevel = computed<'low' | 'medium' | 'high'>(() => {
  if (renderStoryboardExistingGeneratedCount.value > 0) {
    return 'high';
  }
  if ((renderStoryboardDraft.value?.episodeIds.length ?? 0) >= 4) {
    return 'medium';
  }
  return 'low';
});
const renderStoryboardSummary = computed(() => {
  const draft = renderStoryboardDraft.value;
  if (!draft) {
    return '';
  }
  return `将为 ${draft.episodeIds.length} 个分集渲染 ${renderStoryboardTargetCount.value} 条结构化分镜图。`;
});
const renderStoryboardImpactItems = computed(() => {
  const draft = renderStoryboardDraft.value;
  if (!draft) {
    return [] as string[];
  }
  return [
    `预计处理分集：${draft.episodeIds.length}`,
    `可渲染分镜：${renderStoryboardTargetCount.value} 条`,
    renderStoryboardExistingGeneratedCount.value > 0
      ? `将覆盖已有分镜图 ${renderStoryboardExistingGeneratedCount.value} 条`
      : '当前主要是首次渲染，不会覆盖已有图片',
    '渲染会使用结构化 plan 和已绑定资产共同编译最终出图 prompt'
  ];
});

const {
  cancelPlanStoryboards,
  cancelRenderStoryboardImages,
  confirmPlanStoryboards,
  confirmRenderStoryboardImages,
  openPlanStoryboardsConfirm,
  openRenderStoryboardImagesConfirm,
  updatePlanStoryboardDraft,
  updateRenderStoryboardDraft
} = useWorkflowStoryboardStageOps({
  hasDramaScopedApi,
  dramaId,
  projectId,
  loading,
  error,
  batchActor,
  batchComment,
  scripts,
  storyboards,
  targetEpisodeIds: stageTargetEpisodeIds,
  storyboardStageMessage,
  planStoryboardDraft,
  renderStoryboardDraft,
  loadAll,
  pushWorkflowOpLog
});

const runStoryboardStageAssets = async (): Promise<void> => {
  if (stageScopedStoryboards.value.length === 0) {
    storyboardStageMessage.value = '当前作用域没有已规划分镜，无法生成资产';
    return;
  }
  storyboardStageMessage.value = '';
  await runBatchAssets();
  await loadAll();
  const coverageMessage = `已为当前作用域补齐资产，当前资产覆盖 ${stageStoryboardAssetCoveredCount.value}/${stageScopedStoryboards.value.length} 条分镜`;
  storyboardStageMessage.value = error.value ? `${coverageMessage}；${error.value}` : coverageMessage;
};

const runProjectAssets = async (): Promise<void> => {
  if (stageScopedStoryboards.value.length === 0) {
    storyboardStageMessage.value = '当前作用域没有已规划分镜，无法生成项目资产';
    return;
  }
  storyboardStageMessage.value = '';
  loading.value = true;
  try {
    const payload = {
      episodeIds: episodeBatchIds.value.length > 0 ? episodeBatchIds.value : undefined,
      scope: 'base' as const
    };
    const result = hasDramaScopedApi.value
      ? await generateDramaEpisodesAssetsBatch(dramaId.value, payload)
      : await generateEpisodesAssetsBatch(projectId.value, payload);
    const failures = result.episodes.flatMap((item) => item.failures ?? []);
    const failureSummary = failures.length > 0
      ? `部分项目资产生成失败：${failures.slice(0, 3).map((item) => `${item.storyboardTitle}: ${item.message}`).join('；')}${failures.length > 3 ? '；...' : ''}`
      : '';
    await runBatchPrecheck();
    storyboardStageMessage.value = failureSummary || '项目资产（角色/场景主资产）生成完成';
  } catch (err) {
    storyboardStageMessage.value = err instanceof Error ? err.message : '项目资产生成失败';
  } finally {
    loading.value = false;
    await loadAll();
  }
};

const runStoryboardAssets = async (): Promise<void> => {
  if (stageScopedStoryboards.value.length === 0) {
    storyboardStageMessage.value = '当前作用域没有已规划分镜，无法生成分镜资产';
    return;
  }
  storyboardStageMessage.value = '';
  loading.value = true;
  try {
    const payload = {
      episodeIds: episodeBatchIds.value.length > 0 ? episodeBatchIds.value : undefined,
      scope: 'shot' as const
    };
    const result = hasDramaScopedApi.value
      ? await generateDramaEpisodesAssetsBatch(dramaId.value, payload)
      : await generateEpisodesAssetsBatch(projectId.value, payload);
    const failures = result.episodes.flatMap((item) => item.failures ?? []);
    const failureSummary = failures.length > 0
      ? `部分分镜资产生成失败：${failures.slice(0, 3).map((item) => `${item.storyboardTitle}: ${item.message}`).join('；')}${failures.length > 3 ? '；...' : ''}`
      : '';
    await runBatchPrecheck();
    storyboardStageMessage.value = failureSummary || '分镜资产（镜头变体）生成完成';
  } catch (err) {
    storyboardStageMessage.value = err instanceof Error ? err.message : '分镜资产生成失败';
  } finally {
    loading.value = false;
    await loadAll();
  }
};

onMounted(() => {
  restoreWorkflowOpLogFilters();
  void loadAll();
  void loadVideoModelCapabilities();
});

watch([workflowOpActionFilter, workflowOpTimeFrom, workflowOpTimeTo], () => {
  persistWorkflowOpLogFilters();
});

watch(
  () => route.query,
  () => {
    applyRouteQueryPreset();
  }
);

watch([workflowMode, workflowScopeEpisodeId], () => {
  void syncScopeQueryToRoute();
});
</script>

<style scoped>
.button-group-vertical {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.button-group-vertical button {
  width: 100%;
}

.batch-sticky-summary {
  position: sticky;
  top: var(--space-3);
  z-index: 5;
  background: var(--surface-canvas);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
  box-shadow: var(--shadow-sm);
}

.workflow-stage-grid {
  display: grid;
  gap: var(--space-5);
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: var(--space-5) 0;
}

.workflow-stage-card {
  display: grid;
  gap: var(--space-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-panel-soft);
  padding: var(--space-6);
}

.workflow-stage-index {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.workflow-stage-metrics {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.workflow-stage-metrics > div {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-canvas);
  padding: var(--space-3);
}

.metric-label {
  display: block;
  color: var(--ink-2);
  font-size: var(--text-xs);
  margin-bottom: var(--space-1);
}

.risk-chip {
  margin-left: var(--space-3);
  border-radius: var(--radius-pill);
  padding: 2px var(--space-3);
  font-size: var(--text-2xs);
  text-transform: uppercase;
  border: 1px solid var(--status-neutral-border);
}

.risk-high {
  color: var(--status-danger-ink);
  border-color: var(--status-danger-border);
  background: var(--status-danger-bg);
}

.risk-medium {
  color: var(--status-warning-ink);
  border-color: var(--status-warning-border);
  background: var(--status-warning-bg);
}

.risk-low {
  color: var(--status-success-ink);
  border-color: var(--status-success-border);
  background: var(--status-success-bg);
}

.conflict-bars {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: var(--space-4);
}

.conflict-bar-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-canvas);
  padding: var(--space-4);
}

.bar-track {
  height: 10px;
  border-radius: var(--radius-pill);
  background: var(--status-neutral-bg);
  overflow: hidden;
  margin: var(--space-2) 0;
}

.bar-fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
}

.bar-fill.asset {
  background: linear-gradient(90deg, var(--meter-brand-start), var(--meter-brand-end));
}

.bar-fill.video {
  background: linear-gradient(90deg, var(--meter-warn-start), var(--meter-warn-end));
}

.bar-fill.risk {
  background: linear-gradient(90deg, var(--meter-danger-start), var(--meter-danger-end));
}

.conflict-dimensions {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: var(--space-4);
}

.conflict-dimension-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--card-soft);
  padding: var(--space-4);
}

@media (max-width: 980px) {
  .workflow-stage-grid {
    grid-template-columns: 1fr;
  }
  .workflow-stage-metrics {
    grid-template-columns: 1fr;
  }
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .conflict-bars {
    grid-template-columns: 1fr;
  }
  .conflict-dimensions {
    grid-template-columns: 1fr;
  }
}
</style>
