<template>
  <AppShell fullWidth showLogout @logout="logout">
    <div class="settings-page">
    <section class="panel settings-hero">
      <div class="settings-hero__copy">
        <div class="settings-hero__eyebrow">Studio Control Deck</div>
        <div class="inline-between settings-hero__headline">
          <div>
            <h2>设置中心</h2>
            <p class="muted settings-hero__subtitle">
              用桌面工作台的方式管理模型、Prompt、日志和运维，不再把所有功能平铺成后台长表单。
            </p>
          </div>
          <div class="actions">
            <button @click="goHome">返回项目页</button>
            <button @click="openImportDrawer">导入 API 示例</button>
            <button class="primary" @click="openCreateDrawer">新增模型</button>
            <button class="primary" @click="loadAll">刷新</button>
          </div>
        </div>
        <RouteRestoreHint :text="routeRestoredTip" />
        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <div class="settings-hero__stats">
        <article class="settings-stat-card">
          <span>已启用模型</span>
          <strong>{{ enabledModelCount }}</strong>
          <small>text {{ modelTypeStats.text }} · image {{ modelTypeStats.image }} · video {{ modelTypeStats.video }} · audio {{ modelTypeStats.audio }}</small>
        </article>
        <article class="settings-stat-card">
          <span>默认模型</span>
          <strong>{{ defaultModelCount }}</strong>
          <small>{{ defaultModelLabels.length ? defaultModelLabels.join(' · ') : '尚未指定' }}</small>
        </article>
        <article class="settings-stat-card">
          <span>Prompt 模板</span>
          <strong>{{ prompts.length }}</strong>
          <small>{{ promptVersions.length }} 条版本记录</small>
        </article>
        <article class="settings-stat-card">
          <span>工作区状态</span>
          <strong>{{ opsSummary ? 'online' : 'idle' }}</strong>
          <small>当前页聚合策略、模型、日志与运维操作</small>
        </article>
      </div>
    </section>

    <div class="settings-workbench">
      <aside class="panel settings-rail">
        <div class="settings-rail__title">工作台导航</div>
        <button class="settings-rail__button" type="button" @click="scrollToSection('runtime')">Runtime / 策略</button>
        <button class="settings-rail__button" type="button" @click="scrollToSection('models')">模型库</button>
        <button class="settings-rail__button" type="button" @click="scrollToSection('prompts')">Prompt 模板</button>
        <button class="settings-rail__button" type="button" @click="scrollToSection('ops')">运维 / 备份</button>
        <button class="settings-rail__button" type="button" @click="scrollToSection('logs')">日志 / 故障</button>
        <div class="settings-rail__divider"></div>
        <div class="settings-rail__mini-actions">
          <button type="button" @click="openImportDrawer">导入示例</button>
          <button type="button" @click="openCreateDrawer">新增模型</button>
          <button type="button" @click="scrollToSection('logs')">排查错误</button>
        </div>
      </aside>

      <div class="settings-content">
        <div class="panel settings-toolbar">
          <div class="settings-toolbar__sections">
            <button type="button" @click="scrollToSection('runtime')">Runtime</button>
            <button type="button" @click="scrollToSection('models')">模型库</button>
            <button type="button" @click="scrollToSection('prompts')">Prompt</button>
            <button type="button" @click="scrollToSection('ops')">运维</button>
            <button type="button" @click="scrollToSection('logs')">日志</button>
          </div>
          <div class="settings-toolbar__actions">
            <button type="button" @click="openImportDrawer">导入示例</button>
            <button type="button" @click="setInspectorTab('prompt')">查看模板快照</button>
            <button class="primary" type="button" @click="loadAll">刷新数据</button>
          </div>
        </div>

        <section ref="runtimeSectionRef" class="settings-section">
          <div class="settings-section__head">
            <div>
              <div class="settings-section__eyebrow">01 · Runtime</div>
              <h3>任务策略与运行边界</h3>
              <p class="muted">保留原有策略编辑能力，但把它放到桌面端首屏控制区。</p>
            </div>
          </div>
          <SettingsTaskPolicyPanel
            :loading="loading"
            :runtime-config="runtimeConfig"
            :task-failure-policies="taskFailurePolicies"
            :task-failure-policy-auto-apply="taskFailurePolicyAutoApply"
            :task-failure-policy-max-auto-apply-per-task="taskFailurePolicyMaxAutoApplyPerTask"
            @save-runtime-config="saveRuntimeConfig"
            @save-task-failure-policies="saveTaskFailurePolicies"
            @update:task-failure-policy-auto-apply="taskFailurePolicyAutoApply = $event"
            @update:task-failure-policy-max-auto-apply-per-task="taskFailurePolicyMaxAutoApplyPerTask = $event"
          />
        </section>

        <section ref="modelsSectionRef" class="settings-section">
          <div class="settings-section__head">
            <div>
              <div class="settings-section__eyebrow">02 · Model Hub</div>
              <h3>模型库与示例导入</h3>
              <p class="muted">中间主区只保留目录和高频操作；检视、导入和提示信息放进整页右侧栏。</p>
            </div>
            <div class="actions">
              <button type="button" @click="openImportDrawer">从 API 示例导入</button>
              <button class="primary" type="button" @click="openCreateDrawer">新增模型配置</button>
            </div>
          </div>

          <div class="settings-model-grid">
            <div class="panel settings-model-catalog">
              <div class="settings-model-catalog__header">
                <div>
                  <h4>模型目录</h4>
                  <p class="muted">目录保持高密度，编辑和说明不再挤在同一列里。</p>
                </div>
              </div>

              <div class="settings-model-catalog__tools">
                <input v-model="modelSearchQuery" placeholder="搜索名称 / 模型 / endpoint" />
                <div class="settings-model-catalog__filters">
                  <button
                    type="button"
                    class="summary-tag"
                    :class="{ 'summary-tag--active': modelTypeFilter === 'all' }"
                    @click="modelTypeFilter = 'all'"
                  >
                    全部 {{ modelConfigs.length }}
                  </button>
                  <button
                    type="button"
                    class="summary-tag"
                    :class="{ 'summary-tag--active': modelTypeFilter === 'text' }"
                    @click="modelTypeFilter = 'text'"
                  >
                    text {{ modelTypeStats.text }}
                  </button>
                  <button
                    type="button"
                    class="summary-tag"
                    :class="{ 'summary-tag--active': modelTypeFilter === 'image' }"
                    @click="modelTypeFilter = 'image'"
                  >
                    image {{ modelTypeStats.image }}
                  </button>
                  <button
                    type="button"
                    class="summary-tag"
                    :class="{ 'summary-tag--active': modelTypeFilter === 'video' }"
                    @click="modelTypeFilter = 'video'"
                  >
                    video {{ modelTypeStats.video }}
                  </button>
                  <button
                    type="button"
                    class="summary-tag"
                    :class="{ 'summary-tag--active': modelTypeFilter === 'audio' }"
                    @click="modelTypeFilter = 'audio'"
                  >
                    audio {{ modelTypeStats.audio }}
                  </button>
                </div>
              </div>

              <div class="list settings-model-catalog__list">
                <article
                  class="card settings-model-card"
                  :class="{ 'settings-model-card--selected': editingModel?.id === model.id }"
                  v-for="model in filteredModelConfigs"
                  :key="model.id"
                  @click="handleSelectModel(model)"
                >
                  <div class="settings-model-card__copy">
                    <div class="settings-model-card__title-row">
                      <h3>{{ model.name }}</h3>
                      <div class="settings-model-card__badges">
                        <span class="summary-tag">{{ model.type }}</span>
                        <span class="summary-tag" v-if="model.isDefault">default</span>
                        <span class="summary-tag" v-if="!model.enabled">disabled</span>
                      </div>
                    </div>
                    <p class="muted">厂商：{{ model.manufacturer }} · 服务商：{{ model.provider }}</p>
                    <p class="muted">模型：{{ model.model }} · 鉴权：{{ model.authType }}</p>
                    <p class="muted settings-model-card__endpoint">{{ model.endpoint }}</p>
                    <div v-if="capabilitySummary(model).length" class="summary-tags">
                      <span class="summary-tag" v-for="item in capabilitySummary(model)" :key="`${model.id}-${item}`">{{ item }}</span>
                    </div>
                  </div>
                  <div class="actions settings-model-card__actions">
                    <button type="button" @click="openEditDrawer(model)">编辑</button>
                    <button type="button" @click="testSavedModelConnectionById(model)" :disabled="savedModelConnectionLoadingId === model.id">
                      {{ savedModelConnectionLoadingId === model.id ? '测试中...' : '测试连接' }}
                    </button>
                    <button type="button" @click="setDefault(model.id)">设为默认</button>
                    <button type="button" @click="toggleEnabled(model.id, !model.enabled)">{{ model.enabled ? '禁用' : '启用' }}</button>
                    <button class="danger" type="button" @click="handleRemoveModel(model.id)">删除</button>
                  </div>
                  <SettingsModelConnectionResult
                    :loading="savedModelConnectionLoadingId === model.id"
                    :result="savedModelConnectionResults[model.id] ?? null"
                  />
                </article>
              </div>
            </div>
          </div>
        </section>

        <section ref="promptsSectionRef" class="settings-section">
          <div class="settings-section__head">
            <div>
              <div class="settings-section__eyebrow">03 · Prompt Desk</div>
              <h3>Prompt 模板</h3>
              <p class="muted">用折叠工作台承接模板编辑，减少滚动长度。</p>
            </div>
          </div>
          <details class="settings-disclosure" open>
            <summary>
              <span>展开 Prompt 模板工作台</span>
              <small>{{ prompts.length }} 条模板 · {{ promptVersions.length }} 条版本记录</small>
            </summary>
            <div class="settings-disclosure__body">
              <SettingsPromptTemplatesPanel
                :prompts="prompts"
                :prompt-drafts="promptDrafts"
                :prompt-versions="promptVersions"
                :version-visible="versionVisible"
                @save-prompt="savePrompt"
                @toggle-versions="toggleVersions"
                @restore-version="restoreVersion"
              />
            </div>
          </details>
        </section>

        <div class="settings-secondary-grid">
          <section ref="opsSectionRef" class="settings-section">
            <div class="settings-section__head">
              <div>
                <div class="settings-section__eyebrow">04 · Operations</div>
                <h3>运维、备份与迁移</h3>
              </div>
            </div>
            <details class="settings-disclosure">
              <summary>
                <span>展开运维面板</span>
                <small>备份、迁移、错误统计和业务恢复</small>
              </summary>
              <div class="settings-disclosure__body">
                <SettingsOpsPanel
                  :ops-loading="opsLoading"
                  :ops-summary="opsSummary"
                  :migration-current-version="migrationCurrentVersion"
                  :migration-target-version="migrationTargetVersion"
                  :migration-snapshots="migrationSnapshots"
                  :merge-error-stats="mergeErrorStats"
                  :merge-error-project-id="mergeErrorProjectId"
                  :merge-error-limit="mergeErrorLimit"
                  @clear-all-business-data="clearAllBusinessData"
                  @clear-provider-log-history="clearProviderLogHistory"
                  @download-business-backup="downloadBusinessBackup"
                  @download-migration-snapshot="downloadMigrationSnapshot"
                  @go-to-project-merge-error="goToProjectMergeError"
                  @load-merge-error-stats="loadMergeErrorStats"
                  @load-ops-panel="loadOpsPanel"
                  @restore-latest-migration-backup="restoreLatestMigrationBackup"
                  @restore-migration-backup-by-file="restoreMigrationBackupByFile"
                  @trigger-import-backup="triggerImportBackup"
                  @update:merge-error-project-id="mergeErrorProjectId = $event"
                  @update:merge-error-limit="mergeErrorLimit = $event"
                />
              </div>
            </details>
          </section>

          <section ref="logsSectionRef" class="settings-section">
            <div class="settings-section__head">
              <div>
                <div class="settings-section__eyebrow">05 · Logs</div>
                <h3>日志与故障排查</h3>
              </div>
            </div>
            <details class="settings-disclosure">
              <summary>
                <span>展开日志工作台</span>
                <small>provider logs、auto repair、排错链接和导出</small>
              </summary>
              <div class="settings-disclosure__body">
                <SettingsLogsPanel
                  :auto-repair-logs="autoRepairLogs"
                  :auto-repair-log-stats="autoRepairLogStats"
                  :auto-repair-log-outcome="autoRepairLogOutcome"
                  :auto-repair-log-action="autoRepairLogAction"
                  :auto-repair-log-project-id="autoRepairLogProjectId"
                  :auto-repair-log-task-id="autoRepairLogTaskId"
                  :auto-repair-log-error-code="autoRepairLogErrorCode"
                  :auto-repair-log-keyword="autoRepairLogKeyword"
                  :auto-repair-log-limit="autoRepairLogLimit"
                  :filtered-provider-logs="filteredProviderLogs"
                  :ops-loading="opsLoading"
                  :provider-log-stats="providerLogStats"
                  :provider-log-outcome="providerLogOutcome"
                  :provider-log-task-type="providerLogTaskType"
                  :provider-log-provider="providerLogProvider"
                  :provider-log-keyword="providerLogKeyword"
                  :provider-log-limit="providerLogLimit"
                  @clear-auto-repair-log-history="clearAutoRepairLogHistory"
                  @copy-auto-repair-log-context="copyAutoRepairLogContext"
                  @copy-auto-repair-troubleshoot-link="copyAutoRepairTroubleshootLink"
                  @copy-provider-log-context="copyProviderLogContext"
                  @copy-task-center-troubleshoot-link="copyTaskCenterTroubleshootLink"
                  @export-auto-repair-logs-as-json="exportAutoRepairLogsAsJson"
                  @export-provider-logs-as-json="exportProviderLogsAsJson"
                  @go-task-center-for-task="goTaskCenterForTask"
                  @load-auto-repair-logs="loadAutoRepairLogs"
                  @load-provider-logs="loadProviderLogs"
                  @update:auto-repair-log-action="autoRepairLogAction = $event"
                  @update:auto-repair-log-error-code="autoRepairLogErrorCode = $event"
                  @update:auto-repair-log-keyword="autoRepairLogKeyword = $event"
                  @update:auto-repair-log-limit="autoRepairLogLimit = $event"
                  @update:auto-repair-log-outcome="autoRepairLogOutcome = $event"
                  @update:auto-repair-log-project-id="autoRepairLogProjectId = $event"
                  @update:auto-repair-log-task-id="autoRepairLogTaskId = $event"
                  @update:provider-log-keyword="providerLogKeyword = $event"
                  @update:provider-log-limit="providerLogLimit = $event"
                  @update:provider-log-outcome="providerLogOutcome = $event"
                  @update:provider-log-provider="providerLogProvider = $event"
                  @update:provider-log-task-type="providerLogTaskType = $event"
                />
              </div>
            </details>
          </section>
        </div>
      </div>

      <aside class="settings-sidecar">
        <section class="panel settings-sidecar__shell">
          <div class="settings-sidecar__tabbar">
            <button type="button" :class="{ 'settings-sidecar__tab--active': inspectorTab === 'model' }" @click="setInspectorTab('model')">模型</button>
            <button type="button" :class="{ 'settings-sidecar__tab--active': inspectorTab === 'import' }" @click="setInspectorTab('import')">导入</button>
            <button type="button" :class="{ 'settings-sidecar__tab--active': inspectorTab === 'prompt' }" @click="setInspectorTab('prompt')">Prompt</button>
            <button type="button" :class="{ 'settings-sidecar__tab--active': inspectorTab === 'runtime' }" @click="setInspectorTab('runtime')">概览</button>
          </div>

          <section v-if="inspectorTab === 'model'" class="settings-model-inspector">
            <div class="settings-model-inspector__head">
              <div class="settings-section__eyebrow">Right Inspector</div>
              <h4>{{ editingModel ? editingModel.name : '模型检视区' }}</h4>
            </div>
            <template v-if="editingModel">
              <p class="muted">左侧选中模型后，这里展示详情与编辑入口。</p>
              <div class="settings-model-inspector__facts">
                <div><span>类型</span><strong>{{ editingModel.type }}</strong></div>
                <div><span>厂商</span><strong>{{ editingModel.manufacturer }}</strong></div>
                <div><span>模型</span><strong>{{ editingModel.model }}</strong></div>
                <div><span>鉴权</span><strong>{{ editingModel.authType }}</strong></div>
              </div>
              <div class="actions">
                <button type="button" @click="activeDrawer = 'edit'">打开编辑抽屉</button>
                <button type="button" @click="handleCancelEditModel">取消选中</button>
              </div>
            </template>
            <template v-else>
              <p class="muted">当前没有锁定模型。先在中间目录点击一条模型，右侧就会切成详情面板。</p>
            </template>
          </section>

          <section v-else-if="inspectorTab === 'import'" class="settings-sidecar__panel">
            <div class="settings-section__eyebrow">Quick Import</div>
            <h4>导入与新增捷径</h4>
            <p class="muted">把 API 示例粘进抽屉，或直接新建模型，不再下翻页面寻找表单。</p>
            <div class="actions">
              <button type="button" @click="openImportDrawer">打开导入器</button>
              <button class="primary" type="button" @click="openCreateDrawer">新增模型</button>
            </div>
            <div v-if="modelExampleImportWarnings.length" class="settings-import-warnings">
              <h5>最近一次导入提醒</h5>
              <p class="muted">{{ modelExampleImportWarnings.join('；') }}</p>
            </div>
          </section>

          <section v-else-if="inspectorTab === 'prompt'" class="settings-sidecar__panel">
            <div class="settings-section__eyebrow">Prompt Snapshot</div>
            <h4>模板快照</h4>
            <div class="settings-sidecar__prompt-list">
              <article class="settings-sidecar__prompt-item" v-for="prompt in prompts" :key="prompt.id">
                <strong>{{ prompt.title }}</strong>
                <span>{{ prompt.key }}</span>
              </article>
            </div>
            <div class="actions">
              <button type="button" @click="scrollToSection('prompts')">定位到 Prompt 工作台</button>
            </div>
          </section>

          <section v-else class="settings-sidecar__panel">
            <div class="settings-section__eyebrow">Runtime Snapshot</div>
            <h4>工作区概览</h4>
            <div class="settings-sidecar__facts">
              <div><span>启用模型</span><strong>{{ enabledModelCount }}</strong></div>
              <div><span>默认模型</span><strong>{{ defaultModelCount }}</strong></div>
              <div><span>Prompt 模板</span><strong>{{ prompts.length }}</strong></div>
              <div><span>日志命中</span><strong>{{ filteredProviderLogs.length }}</strong></div>
            </div>
          </section>
        </section>
      </aside>
    </div>
    </div>

    <div v-if="activeDrawer" class="settings-drawer-backdrop" @click.self="closeDrawer">
      <aside class="settings-drawer panel">
        <div class="settings-drawer__header">
          <div>
            <div class="settings-section__eyebrow">
              {{
                activeDrawer === 'import'
                  ? 'API Example Import'
                  : activeDrawer === 'create'
                    ? 'Create Model'
                    : 'Edit Model'
              }}
            </div>
            <h3>
              {{
                activeDrawer === 'import'
                  ? '从 API 示例自动导入'
                  : activeDrawer === 'create'
                    ? '新增模型配置'
                    : '编辑模型配置'
              }}
            </h3>
            <p class="muted">
              {{
                activeDrawer === 'import'
                  ? '支持直接粘贴 curl、Python requests 或 Python OpenAI SDK 示例，并自动回填模型表单。'
                  : activeDrawer === 'create'
                    ? '先选类型和厂商模板，再补真实模型、API Key 和端点；原始字段收进高级设置。'
                    : '编辑页也按同一套厂商模板目录工作，低频原始字段折叠到高级设置。'
              }}
            </p>
          </div>
          <button type="button" @click="closeDrawer">关闭</button>
        </div>

        <div v-if="activeDrawer === 'import'" class="settings-drawer__body">
          <div class="panel settings-import-panel">
            <textarea
              v-model="modelExampleImportText"
              rows="12"
              placeholder="粘贴带真实 token 和真实 model 的 curl / requests 示例"
            />
            <div class="actions">
              <button type="button" @click="handleImportModelExample" :disabled="modelExampleImportLoading">
                {{ modelExampleImportLoading ? '解析中...' : '解析到新增表单' }}
              </button>
              <button type="button" @click="modelExampleImportText = ''">清空</button>
            </div>
            <p v-if="modelExampleImportWarnings.length" class="muted">
              {{ modelExampleImportWarnings.join('；') }}
            </p>
          </div>
        </div>

        <form v-else-if="activeDrawer === 'create'" class="form settings-drawer__body" @submit.prevent="handleCreateModel">
          <section class="settings-template-step">
            <div class="settings-template-step__head">
              <div>
                <div class="settings-section__eyebrow">Step 01</div>
                <h4>选择能力类型</h4>
                <p class="muted">先确定模型承担的是文本、图像、视频还是语音能力。</p>
              </div>
              <span class="summary-tag">后台模板 {{ createProviderTemplates.length }}</span>
            </div>
            <div class="settings-template-type-grid">
              <button
                v-for="type in MODEL_TYPE_ORDER"
                :key="`create-${type}`"
                type="button"
                class="settings-template-type-card"
                :class="{ 'settings-template-type-card--active': newModel.type === type }"
                @click="chooseDraftType('new', type)"
              >
                <strong>{{ MODEL_TYPE_LABELS[type] }}</strong>
                <span>{{ MODEL_TYPE_DESCRIPTIONS[type] }}</span>
              </button>
            </div>
          </section>

          <section class="settings-template-step">
            <div class="settings-template-step__head">
              <div>
                <div class="settings-section__eyebrow">Step 02</div>
                <h4>选择厂商模板</h4>
                <p class="muted">这里直接读后台模板目录，不再手填厂商与能力 JSON。</p>
              </div>
            </div>
            <div class="settings-template-vendor-grid">
              <button
                v-for="template in createProviderTemplates"
                :key="`create-template-${template.type}-${template.manufacturer}`"
                type="button"
                class="settings-template-card"
                :class="{ 'settings-template-card--active': selectedCreateTemplate?.manufacturer === template.manufacturer }"
                @click="applyTemplateToDraft('new', template)"
              >
                <div class="settings-template-card__head">
                  <strong>{{ template.label }}</strong>
                  <span class="summary-tag">{{ template.provider }}</span>
                </div>
                <p class="muted">{{ template.description }}</p>
                <div class="summary-tags">
                  <span class="summary-tag" v-for="tag in template.tags.slice(0, 4)" :key="`create-${template.manufacturer}-${tag}`">
                    {{ tag }}
                  </span>
                </div>
              </button>
            </div>
          </section>

          <section v-if="selectedCreateTemplate" class="settings-template-step">
            <div class="settings-template-step__head">
              <div>
                <div class="settings-section__eyebrow">Step 03</div>
                <h4>能力模板预览</h4>
                <p class="muted">模板已经自动回填到表单，下面只需要补真实模型、密钥和端点。</p>
              </div>
              <button type="button" @click="applyTemplateToDraft('new', selectedCreateTemplate)">重新应用模板</button>
            </div>
            <div class="settings-template-preview">
              <div class="settings-template-preview__facts">
                <div><span>厂商</span><strong>{{ selectedCreateTemplate.label }}</strong></div>
                <div><span>接入层</span><strong>{{ selectedCreateTemplate.provider }}</strong></div>
                <div><span>鉴权</span><strong>{{ selectedCreateTemplate.authType }}</strong></div>
                <div><span>默认端点</span><strong>{{ selectedCreateTemplate.endpointTemplates.submit || '未提供' }}</strong></div>
              </div>
              <div class="summary-tags" v-if="selectedCreateTemplateSummary.length || selectedCreateTemplate.aliases.length">
                <span class="summary-tag" v-for="item in selectedCreateTemplateSummary" :key="`create-summary-${item}`">{{ item }}</span>
                <span class="summary-tag" v-for="alias in selectedCreateTemplate.aliases" :key="`create-alias-${alias}`">alias: {{ alias }}</span>
              </div>
            </div>
          </section>

          <section class="settings-template-step">
            <div class="settings-template-step__head">
              <div>
                <div class="settings-section__eyebrow">Step 04</div>
                <h4>填写凭据与真实模型</h4>
                <p class="muted">主流程只保留高频字段。原始 provider/manufacturer/capabilities 编辑器收进高级设置。</p>
              </div>
              <button type="button" @click="testNewModelConnection" :disabled="newModelConnectionLoading">
                {{ newModelConnectionLoading ? '测试中...' : '测试连接' }}
              </button>
            </div>
            <div class="settings-template-form-grid">
              <label class="settings-template-field">
                <span>模型名称</span>
                <input v-model="newModel.name" placeholder="展示名称，如 Vidu 视频生产版" />
              </label>
              <label class="settings-template-field">
                <span>真实模型名</span>
                <input v-model="newModel.model" :placeholder="templateModelPlaceholder(selectedCreateTemplate)" />
              </label>
              <label class="settings-template-field settings-template-field--wide">
                <span>API Key</span>
                <input v-model="newModel.apiKey" placeholder="填写真实 API Key / Token" />
              </label>
              <label class="settings-template-field settings-template-field--wide">
                <span>主接口地址</span>
                <input v-model="newModel.endpoint" placeholder="接口地址" />
              </label>
            </div>
            <div class="settings-template-inline-facts">
              <span class="summary-tag">provider: {{ newModel.provider || '未选' }}</span>
              <span class="summary-tag">manufacturer: {{ newModel.manufacturer || '未选' }}</span>
              <span class="summary-tag">auth: {{ newModel.authType }}</span>
            </div>
            <label><input v-model="newModel.isDefault" type="checkbox" /> 设为默认</label>
          </section>

          <details class="settings-disclosure settings-drawer__advanced">
            <summary>
              <span>高级设置</span>
              <small>原始字段、能力 JSON、多端点与 providerOptions 规则树</small>
            </summary>
            <div class="settings-disclosure__body settings-drawer__advanced-body">
              <div class="settings-drawer__toolbar">
                <button type="button" @click="applyCapabilityPreset()">应用能力预置</button>
                <button type="button" @click="fillDefaultEndpoints()">填充默认端点模板</button>
                <button type="button" @click="syncProviderOptionRulesFromCapabilities('new')">从能力JSON读取规则</button>
                <button type="button" @click="persistProviderOptionRulesToCapabilities('new')">写回能力JSON</button>
              </div>
              <div class="settings-template-form-grid">
                <label class="settings-template-field">
                  <span>类型</span>
                  <select v-model="newModel.type">
                    <option value="text">text</option>
                    <option value="image">image</option>
                    <option value="video">video</option>
                    <option value="audio">audio</option>
                  </select>
                </label>
                <label class="settings-template-field">
                  <span>provider</span>
                  <input v-model="newModel.provider" placeholder="服务商（如 http/openai/mock）" />
                </label>
                <label class="settings-template-field">
                  <span>manufacturer</span>
                  <input v-model="newModel.manufacturer" placeholder="厂商（如 openai/gemini/vidu）" />
                </label>
                <label class="settings-template-field">
                  <span>鉴权</span>
                  <select v-model="newModel.authType">
                    <option value="bearer">bearer</option>
                    <option value="api_key">api_key</option>
                    <option value="none">none</option>
                  </select>
                </label>
                <label class="settings-template-field settings-template-field--wide">
                  <span>多端点 JSON</span>
                  <textarea v-model="newModel.endpointsText" rows="3" placeholder='{"submit":"...","query":"..."}' />
                </label>
                <label class="settings-template-field settings-template-field--wide">
                  <span>能力 JSON</span>
                  <textarea v-model="newModel.capabilitiesText" rows="4" placeholder='{"video":{"modes":["text"],"durations":[5]}}' />
                </label>
                <label class="settings-template-field">
                  <span>优先级</span>
                  <input v-model.number="newModel.priority" type="number" min="0" max="100000" placeholder="优先级" />
                </label>
                <label class="settings-template-field">
                  <span>限流阈值 / 分钟</span>
                  <input v-model.number="newModel.rateLimit" type="number" min="0" max="100000" placeholder="限流阈值" />
                </label>
              </div>
              <div class="panel settings-template-rule-panel">
                <h4>providerOptions 规则编辑器</h4>
                <div class="actions">
                  <button type="button" @click="addProviderOptionRule('new')">新增规则</button>
                  <button type="button" @click="exportProviderOptionRulesTemplate('new')">导出规则模板</button>
                  <button type="button" @click="triggerImportProviderOptionRulesTemplate('new')">导入规则模板</button>
                </div>
                <ProviderOptionRuleTree
                  :rules="newProviderOptionRules"
                  :search-query="newProviderRuleSearchQuery"
                  :clipboard-node="newProviderRuleClipboard"
                  @change="persistProviderOptionRulesToCapabilities('new')"
                  @copy-node="copyProviderOptionRuleNode('new', $event)"
                  @search-query-update="updateProviderOptionRuleSearchQuery('new', $event)"
                />
                <input
                  ref="newProviderRulesTemplateInput"
                  type="file"
                  accept="application/json"
                  style="display: none"
                  @change="handleImportProviderOptionRulesTemplate('new', $event)"
                />
              </div>
            </div>
          </details>

          <SettingsModelConnectionResult :loading="newModelConnectionLoading" :result="newModelConnectionResult" />
          <div class="actions settings-drawer__footer">
            <button type="button" @click="closeDrawer">取消</button>
            <button class="primary" :disabled="loading">{{ loading ? '提交中...' : '新增模型配置' }}</button>
          </div>
        </form>

        <form v-else-if="activeDrawer === 'edit' && editingModel" class="form settings-drawer__body" @submit.prevent="handleSaveEditModel">
          <section class="settings-template-step">
            <div class="settings-template-step__head">
              <div>
                <div class="settings-section__eyebrow">Step 01</div>
                <h4>调整能力类型</h4>
                <p class="muted">编辑时也按同一套模板目录来切换类型和厂商。</p>
              </div>
              <span class="summary-tag">当前 {{ editingModel.name }}</span>
            </div>
            <div class="settings-template-type-grid">
              <button
                v-for="type in MODEL_TYPE_ORDER"
                :key="`edit-${type}`"
                type="button"
                class="settings-template-type-card"
                :class="{ 'settings-template-type-card--active': editingModel.type === type }"
                @click="chooseDraftType('edit', type)"
              >
                <strong>{{ MODEL_TYPE_LABELS[type] }}</strong>
                <span>{{ MODEL_TYPE_DESCRIPTIONS[type] }}</span>
              </button>
            </div>
          </section>

          <section class="settings-template-step">
            <div class="settings-template-step__head">
              <div>
                <div class="settings-section__eyebrow">Step 02</div>
                <h4>切换厂商模板</h4>
                <p class="muted">切换模板会重置 endpoint 与能力默认值，但不会覆盖你已填的 API Key。</p>
              </div>
            </div>
            <div class="settings-template-vendor-grid">
              <button
                v-for="template in editProviderTemplates"
                :key="`edit-template-${template.type}-${template.manufacturer}`"
                type="button"
                class="settings-template-card"
                :class="{ 'settings-template-card--active': selectedEditTemplate?.manufacturer === template.manufacturer }"
                @click="applyTemplateToDraft('edit', template)"
              >
                <div class="settings-template-card__head">
                  <strong>{{ template.label }}</strong>
                  <span class="summary-tag">{{ template.provider }}</span>
                </div>
                <p class="muted">{{ template.description }}</p>
                <div class="summary-tags">
                  <span class="summary-tag" v-for="tag in template.tags.slice(0, 4)" :key="`edit-${template.manufacturer}-${tag}`">
                    {{ tag }}
                  </span>
                </div>
              </button>
            </div>
          </section>

          <section v-if="selectedEditTemplate" class="settings-template-step">
            <div class="settings-template-step__head">
              <div>
                <div class="settings-section__eyebrow">Step 03</div>
                <h4>模板预览</h4>
                <p class="muted">编辑模板时会使用相同的后台模板目录与预置能力。</p>
              </div>
              <button type="button" @click="applyTemplateToDraft('edit', selectedEditTemplate)">重新应用模板</button>
            </div>
            <div class="settings-template-preview">
              <div class="settings-template-preview__facts">
                <div><span>厂商</span><strong>{{ selectedEditTemplate.label }}</strong></div>
                <div><span>接入层</span><strong>{{ selectedEditTemplate.provider }}</strong></div>
                <div><span>鉴权</span><strong>{{ selectedEditTemplate.authType }}</strong></div>
                <div><span>默认端点</span><strong>{{ selectedEditTemplate.endpointTemplates.submit || '未提供' }}</strong></div>
              </div>
              <div class="summary-tags" v-if="selectedEditTemplateSummary.length || selectedEditTemplate.aliases.length">
                <span class="summary-tag" v-for="item in selectedEditTemplateSummary" :key="`edit-summary-${item}`">{{ item }}</span>
                <span class="summary-tag" v-for="alias in selectedEditTemplate.aliases" :key="`edit-alias-${alias}`">alias: {{ alias }}</span>
              </div>
            </div>
          </section>

          <section class="settings-template-step">
            <div class="settings-template-step__head">
              <div>
                <div class="settings-section__eyebrow">Step 04</div>
                <h4>更新连接与模型信息</h4>
                <p class="muted">保留高频可改字段，低频原始字段继续收进高级设置。</p>
              </div>
              <button type="button" @click="testEditingModelConnection" :disabled="editingModelConnectionLoading">
                {{ editingModelConnectionLoading ? '测试中...' : '测试连接' }}
              </button>
            </div>
            <div class="settings-template-form-grid">
              <label class="settings-template-field">
                <span>模型名称</span>
                <input v-model="editingModel.name" placeholder="模型名称" />
              </label>
              <label class="settings-template-field">
                <span>真实模型名</span>
                <input v-model="editingModel.model" :placeholder="templateModelPlaceholder(selectedEditTemplate)" />
              </label>
              <label class="settings-template-field settings-template-field--wide">
                <span>API Key</span>
                <input v-model="editingModel.apiKey" placeholder="留空表示不修改已有 API Key" />
              </label>
              <label class="settings-template-field settings-template-field--wide">
                <span>主接口地址</span>
                <input v-model="editingModel.endpoint" placeholder="接口地址" />
              </label>
            </div>
            <div class="settings-template-inline-facts">
              <span class="summary-tag">provider: {{ editingModel.provider || '未选' }}</span>
              <span class="summary-tag">manufacturer: {{ editingModel.manufacturer || '未选' }}</span>
              <span class="summary-tag">auth: {{ editingModel.authType }}</span>
            </div>
            <div class="actions">
              <label><input v-model="editingModel.isDefault" type="checkbox" /> 设为默认</label>
              <label><input v-model="editingModel.enabled" type="checkbox" /> 启用</label>
            </div>
          </section>

          <details class="settings-disclosure settings-drawer__advanced">
            <summary>
              <span>高级设置</span>
              <small>保留原有 provider/manufacturer/raw JSON/providerOptions 编辑能力</small>
            </summary>
            <div class="settings-disclosure__body settings-drawer__advanced-body">
              <div class="settings-drawer__toolbar">
                <button type="button" @click="applyCapabilityPreset(editingModel)">应用能力预置</button>
                <button type="button" @click="fillDefaultEndpoints(editingModel)">填充默认端点模板</button>
                <button type="button" @click="syncProviderOptionRulesFromCapabilities('edit')">从能力JSON读取规则</button>
                <button type="button" @click="persistProviderOptionRulesToCapabilities('edit')">写回能力JSON</button>
              </div>
              <div class="settings-template-form-grid">
                <label class="settings-template-field">
                  <span>类型</span>
                  <select v-model="editingModel.type">
                    <option value="text">text</option>
                    <option value="image">image</option>
                    <option value="video">video</option>
                    <option value="audio">audio</option>
                  </select>
                </label>
                <label class="settings-template-field">
                  <span>provider</span>
                  <input v-model="editingModel.provider" placeholder="服务商（如 http/openai/mock）" />
                </label>
                <label class="settings-template-field">
                  <span>manufacturer</span>
                  <input v-model="editingModel.manufacturer" placeholder="厂商（如 atlascloud/apimart/openai/gemini/vidu）" />
                </label>
                <label class="settings-template-field">
                  <span>鉴权</span>
                  <select v-model="editingModel.authType">
                    <option value="bearer">bearer</option>
                    <option value="api_key">api_key</option>
                    <option value="none">none</option>
                  </select>
                </label>
                <label class="settings-template-field settings-template-field--wide">
                  <span>多端点 JSON</span>
                  <textarea v-model="editingModel.endpointsText" rows="3" placeholder='{"submit":"...","query":"..."}' />
                </label>
                <label class="settings-template-field settings-template-field--wide">
                  <span>能力 JSON</span>
                  <textarea v-model="editingModel.capabilitiesText" rows="4" placeholder="能力 JSON，可留空" />
                </label>
                <label class="settings-template-field">
                  <span>优先级</span>
                  <input v-model.number="editingModel.priority" type="number" min="0" max="100000" placeholder="优先级" />
                </label>
                <label class="settings-template-field">
                  <span>限流阈值 / 分钟</span>
                  <input v-model.number="editingModel.rateLimit" type="number" min="0" max="100000" placeholder="限流阈值" />
                </label>
              </div>
              <div class="panel settings-template-rule-panel">
                <h4>providerOptions 规则编辑器</h4>
                <div class="actions">
                  <button type="button" @click="addProviderOptionRule('edit')">新增规则</button>
                  <button type="button" @click="exportProviderOptionRulesTemplate('edit')">导出规则模板</button>
                  <button type="button" @click="triggerImportProviderOptionRulesTemplate('edit')">导入规则模板</button>
                </div>
                <ProviderOptionRuleTree
                  :rules="editProviderOptionRules"
                  :search-query="editProviderRuleSearchQuery"
                  :clipboard-node="editProviderRuleClipboard"
                  @change="persistProviderOptionRulesToCapabilities('edit')"
                  @copy-node="copyProviderOptionRuleNode('edit', $event)"
                  @search-query-update="updateProviderOptionRuleSearchQuery('edit', $event)"
                />
                <input
                  ref="editProviderRulesTemplateInput"
                  type="file"
                  accept="application/json"
                  style="display: none"
                  @change="handleImportProviderOptionRulesTemplate('edit', $event)"
                />
              </div>
            </div>
          </details>

          <SettingsModelConnectionResult :loading="editingModelConnectionLoading" :result="editingModelConnectionResult" />
          <div class="actions settings-drawer__footer">
            <button type="button" @click="handleCancelEditModel">取消编辑</button>
            <button class="primary" :disabled="loading">{{ loading ? '保存中...' : '保存修改' }}</button>
          </div>
        </form>
      </aside>
    </div>

    <input ref="backupFileInput" type="file" accept="application/json" style="display: none" @change="handleImportBackupFile" />
  </AppShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import ProviderOptionRuleTree from '@/components/ProviderOptionRuleTree.vue';
import RouteRestoreHint from '@/components/RouteRestoreHint.vue';
import SettingsLogsPanel from '@/features/settings/components/SettingsLogsPanel.vue';
import SettingsModelConnectionResult from '@/features/settings/components/SettingsModelConnectionResult.vue';
import SettingsOpsPanel from '@/features/settings/components/SettingsOpsPanel.vue';
import SettingsPromptTemplatesPanel from '@/features/settings/components/SettingsPromptTemplatesPanel.vue';
import SettingsTaskPolicyPanel from '@/features/settings/components/SettingsTaskPolicyPanel.vue';
import { toSingleQuery, useRouteRestoreContext } from '@/composables/useRouteRestoreContext';
import { useSettingsDataAccess } from '@/composables/useSettingsDataAccess';
import { useSettingsModelConnectionOps } from '@/composables/useSettingsModelConnectionOps';
import { useSettingsLogOps } from '@/composables/useSettingsLogOps';
import { useSettingsModelConfigOps } from '@/composables/useSettingsModelConfigOps';
import { useSettingsOpsPanel } from '@/composables/useSettingsOpsPanel';
import { useSettingsPromptOps } from '@/composables/useSettingsPromptOps';
import { buildEmptyModelDraft, useSettingsScreenState } from '@/composables/useSettingsScreenState';
import { useSettingsProviderOptionRules } from '@/composables/useSettingsProviderOptionRules';
import { useSettingsRuntimePolicyOps } from '@/composables/useSettingsRuntimePolicyOps';
import { useSettingsScreenShell } from '@/composables/useSettingsScreenShell';
import { importModelConfigExample } from '@/api/settings-admin';
import type { ModelConfig, ProviderTemplateDescriptor } from '@/types/models';
import { toErrorMessage } from '@/utils/errors';

const router = useRouter();
const route = useRoute();
type SettingsSectionKey = 'runtime' | 'models' | 'prompts' | 'ops' | 'logs';
type SettingsDrawerMode = 'import' | 'create' | 'edit' | null;
type ModelTaskType = 'text' | 'image' | 'video' | 'audio';
type ModelFormScope = 'new' | 'edit';

const MODEL_TYPE_ORDER: ModelTaskType[] = ['text', 'image', 'video', 'audio'];
const MODEL_TYPE_LABELS: Record<ModelTaskType, string> = {
  text: 'Text',
  image: 'Image',
  video: 'Video',
  audio: 'Audio'
};
const MODEL_TYPE_DESCRIPTIONS: Record<ModelTaskType, string> = {
  text: '对话、脚本、Prompt 与文本推理模型',
  image: '分镜图、资产图与参考图生成模型',
  video: '文生视频、图生视频与长任务视频模型',
  audio: '配音、旁白与语音合成模型'
};
const MODEL_TYPE_CHINESE: Record<ModelTaskType, string> = {
  text: '文本',
  image: '图像',
  video: '视频',
  audio: '语音'
};

const modelExampleImportText = ref('');
const modelExampleImportLoading = ref(false);
const modelExampleImportWarnings = ref<string[]>([]);
const activeDrawer = ref<SettingsDrawerMode>(null);
const inspectorTab = ref<'model' | 'import' | 'prompt' | 'runtime'>('model');
const modelSearchQuery = ref('');
const modelTypeFilter = ref<'all' | 'text' | 'image' | 'video' | 'audio'>('all');
const runtimeSectionRef = ref<HTMLElement | null>(null);
const modelsSectionRef = ref<HTMLElement | null>(null);
const promptsSectionRef = ref<HTMLElement | null>(null);
const opsSectionRef = ref<HTMLElement | null>(null);
const logsSectionRef = ref<HTMLElement | null>(null);
const scopedDramaId = computed(() => toSingleQuery(route.query).dramaId?.trim() || '');
const {
  autoRepairLogs,
  autoRepairLogAction,
  autoRepairLogErrorCode,
  autoRepairLogKeyword,
  autoRepairLogLimit,
  autoRepairLogOutcome,
  autoRepairLogProjectId,
  autoRepairLogStats,
  autoRepairLogTaskId,
  autoRepairLogTaskIds,
  backupFileInput,
  capabilityPresets,
  editingModel,
  error,
  loading,
  mergeErrorLimit,
  mergeErrorProjectId,
  mergeErrorStats,
  migrationCurrentVersion,
  migrationSnapshots,
  migrationTargetVersion,
  modelConfigs,
  newModel,
  opsLoading,
  opsSummary,
  promptDrafts,
  prompts,
  promptVersions,
  providerTemplates,
  providerLogs,
  providerLogKeyword,
  providerLogLimit,
  providerLogOutcome,
  providerLogProvider,
  providerLogStats,
  providerLogTaskType,
  runtimeConfig,
  taskFailurePolicies,
  taskFailurePolicyAutoApply,
  taskFailurePolicyMaxAutoApplyPerTask,
  versionVisible
} = useSettingsScreenState();
const {
  restoreTip: routeRestoredTip,
  markRestored: markRouteRestored,
  runRestoreScroll: runRouteRestoreScroll
} = useRouteRestoreContext();

const modelTypeStats = computed(() =>
  modelConfigs.value.reduce(
    (acc, model) => {
      acc[model.type] += 1;
      return acc;
    },
    { text: 0, image: 0, video: 0, audio: 0 }
  )
);

const enabledModelCount = computed(() => modelConfigs.value.filter((model) => model.enabled).length);
const defaultModelCount = computed(() => modelConfigs.value.filter((model) => model.isDefault).length);
const defaultModelLabels = computed(() =>
  modelConfigs.value
    .filter((model) => model.isDefault)
    .map((model) => `${model.type}:${model.name}`)
    .slice(0, 4)
);

const filteredModelConfigs = computed(() => {
  const query = modelSearchQuery.value.trim().toLowerCase();
  return modelConfigs.value.filter((model) => {
    if (modelTypeFilter.value !== 'all' && model.type !== modelTypeFilter.value) {
      return false;
    }
    if (!query) {
      return true;
    }
    return [model.name, model.model, model.endpoint, model.manufacturer, model.provider]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query));
  });
});

const findProviderTemplate = (
  type: ModelTaskType,
  manufacturer: string
): ProviderTemplateDescriptor | null => {
  const normalized = manufacturer.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return (
    providerTemplates.value.find(
      (template) =>
        template.type === type &&
        (template.manufacturer.trim().toLowerCase() === normalized ||
          template.aliases.some((alias) => alias.trim().toLowerCase() === normalized))
    ) ?? null
  );
};

const buildTemplateSummary = (template: ProviderTemplateDescriptor): string[] =>
  capabilitySummary({
    id: `${template.type}:${template.manufacturer}`,
    type: template.type,
    name: template.label,
    provider: template.provider,
    manufacturer: template.manufacturer,
    model: '',
    authType: template.authType,
    endpoint: template.endpointTemplates.submit ?? '',
    endpoints: template.endpointTemplates,
    apiKey: '',
    capabilities: template.capabilities,
    priority: 100,
    rateLimit: 0,
    isDefault: false,
    enabled: true,
    createdAt: '',
    updatedAt: ''
  });

const {
  applyRouteLogFilters,
  buildAutoRepairLogQuery,
  buildProviderLogQuery,
  copyAutoRepairLogContext,
  copyAutoRepairTroubleshootLink,
  copyProviderLogContext,
  copyTaskCenterTroubleshootLink,
  exportAutoRepairLogsAsJson,
  exportProviderLogsAsJson,
  filteredProviderLogs,
  goTaskCenterForTask
} = useSettingsLogOps({
  route,
  router,
  scopedDramaId,
  error,
  providerLogs,
  providerLogLimit,
  providerLogOutcome,
  providerLogTaskType,
  providerLogProvider,
  providerLogKeyword,
  autoRepairLogs,
  autoRepairLogLimit,
  autoRepairLogAction,
  autoRepairLogOutcome,
  autoRepairLogProjectId,
  autoRepairLogTaskId,
  autoRepairLogTaskIds,
  autoRepairLogErrorCode,
  autoRepairLogKeyword,
  markRouteRestored
});

const {
  addProviderOptionRule,
  copyProviderOptionRuleNode,
  editProviderOptionRules,
  editProviderRuleClipboard,
  editProviderRuleSearchQuery,
  editProviderRulesTemplateInput,
  exportProviderOptionRulesTemplate,
  handleImportProviderOptionRulesTemplate,
  newProviderOptionRules,
  newProviderRuleClipboard,
  newProviderRuleSearchQuery,
  newProviderRulesTemplateInput,
  persistProviderOptionRulesToCapabilities,
  syncProviderOptionRulesFromCapabilities,
  triggerImportProviderOptionRulesTemplate,
  updateProviderOptionRuleSearchQuery
} = useSettingsProviderOptionRules({
  error,
  newModel,
  editingModel
});
const { loadAll, loadAutoRepairLogs, loadProviderLogs } = useSettingsDataAccess({
  error,
  modelConfigs,
  prompts,
  promptDrafts,
  providerTemplates,
  runtimeConfig,
  taskFailurePolicies,
  taskFailurePolicyAutoApply,
  taskFailurePolicyMaxAutoApplyPerTask,
  capabilityPresets,
  opsSummary,
  mergeErrorStats,
  mergeErrorProjectId,
  mergeErrorLimit,
  providerLogs,
  providerLogStats,
  autoRepairLogs,
  autoRepairLogStats,
  migrationCurrentVersion,
  migrationTargetVersion,
  migrationSnapshots,
  buildProviderLogQuery,
  buildAutoRepairLogQuery
});

const {
  applyCapabilityPreset,
  capabilitySummary,
  cancelEditModel,
  createModel,
  fillDefaultEndpoints,
  removeModel,
  saveEditModel,
  setDefault,
  startEditModel,
  toggleEnabled
} = useSettingsModelConfigOps({
  error,
  loading,
  newModel,
  editingModel,
  capabilityPresets,
  buildEmptyModelDraft,
  loadAll,
  syncProviderOptionRulesFromCapabilities,
  resetNewProviderRuleState: () => {
    newProviderOptionRules.value = [];
    newProviderRuleClipboard.value = null;
    newProviderRuleSearchQuery.value = '';
  },
  resetEditProviderRuleState: () => {
    editProviderOptionRules.value = [];
    editProviderRuleClipboard.value = null;
    editProviderRuleSearchQuery.value = '';
  }
});
const {
  clearEditingModelConnection,
  clearNewModelConnection,
  clearSavedModelConnection,
  editingModelConnectionLoading,
  editingModelConnectionResult,
  newModelConnectionLoading,
  newModelConnectionResult,
  savedModelConnectionLoadingId,
  savedModelConnectionResults,
  testEditingModelConnection,
  testNewModelConnection,
  testSavedModelConnectionById
} = useSettingsModelConnectionOps({
  error,
  newModel,
  editingModel
});

const createProviderTemplates = computed(() =>
  providerTemplates.value.filter((template) => template.type === newModel.value.type)
);
const editProviderTemplates = computed(() => {
  const draft = editingModel.value;
  return draft ? providerTemplates.value.filter((template) => template.type === draft.type) : [];
});
const selectedCreateTemplate = computed(() => findProviderTemplate(newModel.value.type, newModel.value.manufacturer));
const selectedEditTemplate = computed(() =>
  editingModel.value ? findProviderTemplate(editingModel.value.type, editingModel.value.manufacturer) : null
);
const selectedCreateTemplateSummary = computed(() =>
  selectedCreateTemplate.value ? buildTemplateSummary(selectedCreateTemplate.value) : []
);
const selectedEditTemplateSummary = computed(() =>
  selectedEditTemplate.value ? buildTemplateSummary(selectedEditTemplate.value) : []
);

const resetNewDraftState = (): void => {
  newModel.value = buildEmptyModelDraft();
  newProviderOptionRules.value = [];
  newProviderRuleClipboard.value = null;
  newProviderRuleSearchQuery.value = '';
  modelExampleImportWarnings.value = [];
  error.value = '';
};

const applyTemplateToDraft = (scope: ModelFormScope, template: ProviderTemplateDescriptor): void => {
  const draft = scope === 'new' ? newModel.value : editingModel.value;
  if (!draft) {
    return;
  }
  draft.type = template.type;
  draft.provider = template.provider;
  draft.manufacturer = template.manufacturer;
  draft.authType = template.authType;
  draft.endpoint = template.endpointTemplates.submit ?? '';
  draft.endpointsText = JSON.stringify(template.endpointTemplates ?? {}, null, 2);
  draft.capabilitiesText = JSON.stringify(template.capabilities ?? {}, null, 2);
  if (!draft.name.trim()) {
    draft.name = `${template.label} ${MODEL_TYPE_CHINESE[template.type]}模型`;
  }
  syncProviderOptionRulesFromCapabilities(scope);
  if (scope === 'new') {
    clearNewModelConnection();
  } else {
    clearEditingModelConnection();
  }
  error.value = '';
};

const chooseDraftType = (scope: ModelFormScope, type: ModelTaskType): void => {
  const draft = scope === 'new' ? newModel.value : editingModel.value;
  if (!draft || draft.type === type) {
    return;
  }
  draft.type = type;
  const matched = findProviderTemplate(type, draft.manufacturer);
  if (matched) {
    applyTemplateToDraft(scope, matched);
    return;
  }
  draft.provider = '';
  draft.manufacturer = '';
  draft.authType = 'bearer';
  draft.endpoint = '';
  draft.endpointsText = '{}';
  draft.capabilitiesText = '{}';
  if (scope === 'new') {
    newProviderOptionRules.value = [];
    newProviderRuleClipboard.value = null;
    newProviderRuleSearchQuery.value = '';
    clearNewModelConnection();
  } else {
    editProviderOptionRules.value = [];
    editProviderRuleClipboard.value = null;
    editProviderRuleSearchQuery.value = '';
    clearEditingModelConnection();
  }
};

const templateModelPlaceholder = (template: ProviderTemplateDescriptor | null): string =>
  template?.modelPlaceholder || '真实模型名（如 doubao-seedance-1-5-pro）';
const { saveRuntimeConfig, saveTaskFailurePolicies } = useSettingsRuntimePolicyOps({
  error,
  loading,
  runtimeConfig,
  taskFailurePolicies,
  taskFailurePolicyAutoApply,
  taskFailurePolicyMaxAutoApplyPerTask
});
const { restoreVersion, savePrompt, toggleVersions } = useSettingsPromptOps({
  error,
  promptDrafts,
  promptVersions,
  versionVisible,
  loadAll
});
const { goHome, logout } = useSettingsScreenShell({
  route,
  router,
  applyRouteLogFilters,
  loadAll,
  runRouteRestoreScroll
});

const {
  clearAllBusinessData,
  clearAutoRepairLogHistory,
  clearProviderLogHistory,
  downloadBusinessBackup,
  downloadMigrationSnapshot,
  goToProjectMergeError,
  handleImportBackupFile,
  loadMergeErrorStats,
  loadOpsPanel,
  restoreLatestMigrationBackup,
  restoreMigrationBackupByFile,
  triggerImportBackup
} = useSettingsOpsPanel({
  router,
  error,
  opsLoading,
  opsSummary,
  backupFileInput,
  migrationCurrentVersion,
  migrationTargetVersion,
  migrationSnapshots,
  mergeErrorStats,
  mergeErrorProjectId,
  mergeErrorLimit,
  loadAll,
  loadProviderLogs,
  loadAutoRepairLogs
});

const handleCreateModel = async (): Promise<void> => {
  const created = await createModel();
  if (created) {
    resetNewDraftState();
    clearNewModelConnection();
    activeDrawer.value = null;
  }
};

const handleImportModelExample = async (): Promise<void> => {
  const example = modelExampleImportText.value.trim();
  if (!example) {
    error.value = '请先粘贴 API 示例';
    return;
  }
  modelExampleImportLoading.value = true;
  try {
    const imported = await importModelConfigExample({ example });
    newModel.value = {
      ...buildEmptyModelDraft(),
      type: imported.type,
      name: imported.name,
      provider: imported.provider,
      manufacturer: imported.manufacturer,
      model: imported.model,
      authType: imported.authType,
      endpoint: imported.endpoint,
      endpointsText: JSON.stringify(imported.endpoints ?? {}, null, 2),
      capabilitiesText: JSON.stringify(imported.capabilities ?? {}, null, 2),
      apiKey: imported.apiKey,
      priority: imported.priority,
      rateLimit: imported.rateLimit,
      isDefault: imported.isDefault,
      enabled: imported.enabled,
    };
    modelExampleImportWarnings.value = imported.warnings ?? [];
    syncProviderOptionRulesFromCapabilities('new');
    clearNewModelConnection();
    activeDrawer.value = 'create';
    error.value = '';
  } catch (err) {
    error.value = toErrorMessage(err, '示例解析失败');
  } finally {
    modelExampleImportLoading.value = false;
  }
};

const handleSaveEditModel = async (): Promise<void> => {
  const saved = await saveEditModel();
  if (saved) {
    clearEditingModelConnection();
    activeDrawer.value = null;
  }
};

const handleStartEditModel = (model: ModelConfig): void => {
  clearEditingModelConnection();
  startEditModel(model);
};

const handleCancelEditModel = (): void => {
  clearEditingModelConnection();
  cancelEditModel();
  if (activeDrawer.value === 'edit') {
    activeDrawer.value = null;
  }
};

const handleRemoveModel = async (modelId: string): Promise<void> => {
  const removed = await removeModel(modelId);
  if (removed) {
    clearSavedModelConnection(modelId);
    if (editingModel.value?.id === modelId) {
      handleCancelEditModel();
    }
  }
};

const openImportDrawer = (): void => {
  inspectorTab.value = 'import';
  activeDrawer.value = 'import';
};

const openCreateDrawer = (): void => {
  resetNewDraftState();
  clearNewModelConnection();
  inspectorTab.value = 'model';
  activeDrawer.value = 'create';
};

const openEditDrawer = (model: ModelConfig): void => {
  handleStartEditModel(model);
  inspectorTab.value = 'model';
  activeDrawer.value = 'edit';
};

const closeDrawer = (): void => {
  if (activeDrawer.value === 'edit') {
    handleCancelEditModel();
    return;
  }
  activeDrawer.value = null;
};

const setInspectorTab = (tab: 'model' | 'import' | 'prompt' | 'runtime'): void => {
  inspectorTab.value = tab;
};

const handleSelectModel = (model: ModelConfig): void => {
  handleStartEditModel(model);
  inspectorTab.value = 'model';
};

const scrollToSection = (section: SettingsSectionKey): void => {
  const targetMap: Record<SettingsSectionKey, HTMLElement | null> = {
    runtime: runtimeSectionRef.value,
    models: modelsSectionRef.value,
    prompts: promptsSectionRef.value,
    ops: opsSectionRef.value,
    logs: logsSectionRef.value
  };
  targetMap[section]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

</script>

<style scoped>
.settings-hero {
  display: grid;
  gap: 18px;
  background:
    radial-gradient(circle at top right, var(--brand-glow), transparent 28%),
    radial-gradient(circle at bottom left, var(--success-glow), transparent 30%),
    var(--surface-panel-strong);
}

.settings-hero__copy {
  display: grid;
  gap: 12px;
}

.settings-hero__eyebrow,
.settings-section__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--brand);
  font-weight: 700;
}

.settings-hero__headline {
  align-items: start;
}

.settings-hero__subtitle {
  max-width: 760px;
}

.settings-hero__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.settings-stat-card {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  background: var(--surface-glass);
  box-shadow: var(--inset-highlight);
}

.settings-stat-card span,
.settings-stat-card small {
  color: var(--ink-2);
}

.settings-stat-card strong {
  font-size: 28px;
  line-height: 1;
  color: var(--ink-1);
}

.settings-workbench {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 360px;
  gap: 18px;
  align-items: stretch;
  height: clamp(640px, calc(100vh - 286px), 960px);
  min-height: 0;
}

.settings-rail {
  position: sticky;
  top: 88px;
  display: grid;
  gap: 10px;
  align-self: start;
  max-height: calc(100vh - 110px);
  overflow-y: auto;
}

.settings-rail__title {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-2);
  font-weight: 700;
}

.settings-rail__button {
  width: 100%;
  justify-content: flex-start;
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: var(--surface-panel-soft);
}

.settings-rail__divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--status-neutral-border), transparent);
  margin: 4px 0;
}

.settings-rail__mini-actions {
  display: grid;
  gap: 8px;
}

.settings-content {
  display: grid;
  gap: 18px;
  min-height: 0;
  height: calc(100vh - 110px);
  max-height: calc(100vh - 110px);
  overflow-y: auto;
  padding-right: 6px;
}

.settings-toolbar {
  position: sticky;
  top: 0;
  z-index: 6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: var(--surface-panel-strong);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-lg);
}

.settings-toolbar__sections,
.settings-toolbar__actions,
.settings-model-catalog__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.settings-toolbar__sections button {
  min-height: 32px;
  padding: 7px 12px;
  border-radius: 999px;
  background: var(--surface-panel-soft);
}

.settings-sidecar {
  display: grid;
  gap: 16px;
  min-height: 0;
  height: calc(100vh - 110px);
  max-height: calc(100vh - 110px);
  overflow-y: auto;
  padding-right: 4px;
}

.settings-section {
  display: grid;
  gap: 12px;
}

.settings-section__head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 16px;
}

.settings-model-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.settings-model-catalog,
.settings-model-inspector {
  display: grid;
  gap: 14px;
}

.settings-sidecar__panel {
  display: grid;
  gap: 12px;
}

.settings-model-catalog__header {
  display: flex;
  gap: 16px;
  align-items: start;
}

.settings-model-catalog__tools {
  display: grid;
  gap: 10px;
}

.settings-model-catalog__tools input {
  min-height: 40px;
}

.settings-model-catalog__list {
  gap: 12px;
  max-height: 680px;
  overflow-y: auto;
  padding-right: 4px;
}

.settings-model-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  border-radius: 16px;
  padding: 12px;
  cursor: pointer;
}

.settings-model-card--selected {
  border-color: var(--brand-line-strong);
  box-shadow:
    var(--shadow-lg),
    0 0 0 1px var(--brand-tint);
}

.settings-model-card__copy {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.settings-model-card__title-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}

.settings-model-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: end;
}

.settings-model-card__actions {
  flex-wrap: wrap;
  justify-content: end;
  align-items: start;
  align-content: start;
  min-width: 156px;
  gap: 6px;
}

.settings-model-card__actions button {
  position: relative;
  z-index: 1;
}

.settings-model-card__actions button {
  min-height: 30px;
  padding: 6px 10px;
  font-size: 12px;
}

.settings-model-card__endpoint {
  overflow-wrap: anywhere;
}

.settings-model-inspector {
  background: var(--surface-panel-strong);
}

.settings-sidecar__shell {
  position: sticky;
  top: 88px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  min-height: 0;
}

.settings-sidecar__tabbar {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.settings-sidecar__tabbar button {
  min-height: 34px;
  padding: 7px 10px;
  border-radius: var(--radius-md);
  background: var(--surface-panel-soft);
}

.settings-sidecar__tab--active {
  border-color: var(--brand-line);
  background: linear-gradient(180deg, var(--brand-tint-strong), var(--brand-tint));
  color: var(--brand);
}

.settings-model-inspector__head {
  display: grid;
  gap: 6px;
}

.settings-model-inspector__facts {
  display: grid;
  gap: 10px;
}

.settings-model-inspector__facts div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--surface-panel-soft);
  border: 1px solid var(--line);
}

.settings-model-inspector__facts span {
  color: var(--ink-2);
}

.settings-inspector-callout,
.settings-import-warnings {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface-panel-soft);
}

.settings-disclosure {
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  background: var(--surface-panel-translucent);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.settings-disclosure summary {
  list-style: none;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  cursor: pointer;
  font-weight: 600;
}

.settings-disclosure summary::-webkit-details-marker {
  display: none;
}

.settings-disclosure summary small {
  color: var(--ink-2);
  font-weight: 500;
}

.settings-disclosure__body {
  padding: 0 14px 14px;
}

.settings-secondary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.settings-page {
  display: grid;
  gap: 18px;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: calc(100vh - 120px);
}

:deep(.shell-main) {
  max-width: 100%;
  width: 100%;
  margin: 0;
  padding: 20px 24px 18px;
}

.settings-sidecar__prompt-list,
.settings-sidecar__facts {
  display: grid;
  gap: 10px;
}

.settings-sidecar__prompt-item,
.settings-sidecar__facts div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
  background: var(--surface-panel-soft);
}

.settings-sidecar__prompt-item {
  flex-direction: column;
  align-items: start;
}

.settings-sidecar__prompt-item span,
.settings-sidecar__facts span {
  color: var(--ink-2);
  font-size: 12px;
}

.settings-drawer-backdrop {
  position: fixed;
  inset: 0;
  background: var(--surface-backdrop);
  backdrop-filter: blur(8px);
  z-index: 30;
  display: flex;
  justify-content: flex-end;
  padding: 18px;
}

.settings-drawer {
  width: min(820px, calc(100vw - 36px));
  max-height: calc(100vh - 36px);
  margin: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  overflow: hidden;
}

.settings-drawer__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;
}

.settings-drawer__body {
  overflow: auto;
  padding-right: 4px;
}

.settings-drawer__toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.settings-drawer__advanced {
  margin: 0;
}

.settings-drawer__advanced-body {
  display: grid;
  gap: 14px;
}

.settings-template-step {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  background: var(--surface-panel-soft);
  box-shadow: var(--shadow-sm);
}

.settings-template-step__head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: start;
}

.settings-template-type-grid,
.settings-template-vendor-grid,
.settings-template-form-grid {
  display: grid;
  gap: 12px;
}

.settings-template-type-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.settings-template-vendor-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.settings-template-form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.settings-template-type-card,
.settings-template-card {
  display: grid;
  gap: 8px;
  text-align: left;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  background: var(--card);
  box-shadow: var(--shadow-sm);
}

.settings-template-type-card {
  padding: 14px;
}

.settings-template-card {
  padding: 14px;
}

.settings-template-type-card strong,
.settings-template-card strong {
  font-size: var(--text-base);
}

.settings-template-type-card span,
.settings-template-card p {
  color: var(--ink-2);
}

.settings-template-type-card--active,
.settings-template-card--active {
  border-color: var(--brand-line-strong);
  background: linear-gradient(180deg, var(--brand-tint-strong), var(--card));
  box-shadow: var(--selection-shadow-float);
}

.settings-template-card__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.settings-template-preview {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--brand-line);
  background: var(--surface-highlight);
}

.settings-template-preview__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.settings-template-preview__facts div {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
  background: var(--surface-glass);
}

.settings-template-preview__facts span {
  color: var(--ink-2);
  font-size: var(--text-xs);
}

.settings-template-preview__facts strong {
  overflow-wrap: anywhere;
}

.settings-template-field {
  display: grid;
  gap: 6px;
}

.settings-template-field span {
  font-size: var(--text-xs);
  color: var(--ink-2);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
  font-weight: 700;
}

.settings-template-field--wide {
  grid-column: 1 / -1;
}

.settings-template-inline-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.settings-template-rule-panel {
  margin: 0;
}

.settings-drawer__footer {
  justify-content: flex-end;
  position: sticky;
  bottom: 0;
  background: linear-gradient(180deg, transparent, var(--surface-canvas) 28%);
  padding-top: 10px;
}

.settings-import-panel {
  margin: 0;
}

.summary-tags {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.summary-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--status-neutral-border);
  font-size: 12px;
  color: var(--status-neutral-ink);
  background: var(--status-neutral-bg);
}

.summary-tag--active {
  border-color: var(--status-info-border);
  color: var(--status-info-ink);
  background: var(--status-info-bg);
}

@media (max-width: 1180px) {
  .settings-hero__stats,
  .settings-secondary-grid,
  .settings-model-grid {
    grid-template-columns: 1fr;
  }

  .settings-model-inspector,
  .settings-rail {
    position: static;
  }

  .settings-workbench,
  .settings-content,
  .settings-sidecar {
    height: auto;
    max-height: none;
  }

  .settings-content,
  .settings-rail,
  .settings-sidecar,
  .settings-model-catalog__list {
    overflow: visible;
  }

  .settings-workbench {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .settings-sidecar {
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .settings-toolbar,
  .settings-sidecar__shell {
    position: static;
  }
}

@media (max-width: 980px) {
  .settings-workbench {
    grid-template-columns: 1fr;
  }

  .settings-rail {
    order: -1;
    position: static;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .settings-sidecar {
    grid-template-columns: 1fr;
  }

  .settings-sidecar__tabbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .settings-hero__headline,
  .settings-section__head,
  .settings-model-catalog__header,
  .settings-model-card__title-row,
  .settings-drawer__header,
  .settings-toolbar,
  .settings-template-step__head,
  .settings-template-card__head {
    flex-direction: column;
    align-items: stretch;
  }

  .settings-hero__stats,
  .settings-rail {
    grid-template-columns: 1fr;
  }

  .settings-model-card {
    flex-direction: column;
  }

  .settings-model-card__actions {
    justify-content: flex-start;
    min-width: 0;
  }

  .settings-drawer-backdrop {
    padding: 10px;
  }

  .settings-drawer {
    width: 100%;
    max-height: calc(100vh - 20px);
  }

  .settings-toolbar__sections,
  .settings-toolbar__actions,
  .settings-model-catalog__filters,
  .settings-template-inline-facts {
    width: 100%;
  }

  .settings-template-type-grid,
  .settings-template-vendor-grid,
  .settings-template-form-grid,
  .settings-template-preview__facts {
    grid-template-columns: 1fr;
  }
}
</style>
