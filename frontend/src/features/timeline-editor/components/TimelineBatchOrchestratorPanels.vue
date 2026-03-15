<template>
  <div v-if="selectedClipCount > 1" class="batch-floating-panel">
    <div class="inline-between">
      <h4>批量属性浮动面板</h4>
      <p class="muted">已选 {{ selectedClipCount }} 个片段</p>
    </div>
    <div class="form">
      <label>
        批量转场类型
        <select v-model="batchPanelTransitionTypeModel">
          <option value="cut">cut</option>
          <option value="fade">fade</option>
          <option value="dissolve">dissolve</option>
          <option value="wipeleft">wipeleft</option>
          <option value="wiperight">wiperight</option>
        </select>
      </label>
      <label>
        批量转场时长(s)
        <input v-model.number="batchPanelTransitionDurationSecModel" type="number" min="0" max="5" step="0.05" />
      </label>
      <label>
        批量音量
        <input v-model.number="batchPanelVolumeModel" type="number" min="0" max="200" step="1" />
      </label>
      <label class="check-inline">
        <input v-model="batchPanelMutedModel" type="checkbox" />
        批量静音
      </label>
    </div>
    <label class="check-inline">
      <input v-model="batchPanelOnlyCurrentRangeModel" type="checkbox" />
      仅作用于当前时间区间（{{ selectionRangeStartSec.toFixed(1) }}s - {{ selectionRangeEndSec.toFixed(1) }}s）
    </label>
    <div class="actions">
      <button @click="applyBatchPanelTransition">应用转场</button>
      <button @click="applyBatchPanelAudio">应用音频</button>
      <button @click="applyBatchPanelDurationScale">应用时长缩放</button>
      <button @click="applyKeyframePresetToSelection">应用关键帧预设</button>
    </div>
    <div v-if="batchPanelPreviewItems.length > 0" class="list compact-list">
      <article v-for="item in batchPanelPreviewItems" :key="`batch-preview-${item.index}`" class="card">
        <p>#{{ item.index + 1 }} · {{ item.title }}</p>
        <p class="muted">{{ item.span }}</p>
      </article>
    </div>
    <p v-else class="muted">当前设置下无受影响片段</p>
  </div>

  <div class="batch-floating-panel">
    <div class="inline-between">
      <h4>批处理动作编排器</h4>
      <p class="muted">面向当前选中（{{ orchestratorTargetCount }}）片段</p>
    </div>
    <div class="actions">
      <label>
        动作类型
        <select v-model="orchestratorDraftActionModel">
          <option value="transitionPreset">转场预设</option>
          <option value="keyframePreset">关键帧预设</option>
          <option value="durationScale">时长缩放</option>
          <option value="audioVolumeMute">音频音量/静音</option>
          <option value="replaceLatestMedia">替换为最新媒体</option>
        </select>
      </label>
      <label v-if="orchestratorDraftActionModel === 'durationScale'">
        缩放因子
        <input v-model.number="orchestratorDraftScaleFactorModel" type="number" min="0.1" max="3" step="0.05" />
      </label>
      <label v-if="orchestratorDraftActionModel === 'audioVolumeMute'">
        音量
        <input v-model.number="orchestratorDraftVolumeModel" type="number" min="0" max="200" step="1" />
      </label>
      <label v-if="orchestratorDraftActionModel === 'audioVolumeMute'" class="check-inline">
        <input v-model="orchestratorDraftMutedModel" type="checkbox" />
        静音
      </label>
      <button @click="addOrchestratorStep">加入步骤</button>
      <button class="primary" :disabled="orchestratorSteps.length === 0 || orchestratorTargetCount === 0" @click="runOrchestrator">执行编排</button>
      <button class="danger" :disabled="orchestratorSteps.length === 0" @click="clearOrchestrator">清空步骤</button>
    </div>
    <div class="actions">
      <label>
        失败回滚策略
        <select v-model="orchestratorRollbackStrategyModel">
          <option value="rollback">失败即回滚（推荐）</option>
          <option value="none">保留已执行结果</option>
        </select>
      </label>
    </div>
    <div class="orchestrator-flow">
      <div class="inline-between">
        <p class="muted">节点流可视化（成功主线 / 失败分支 / 回滚路径）</p>
        <p class="muted">{{ orchestratorExecutionSummary }}</p>
      </div>
      <div v-if="activeOrchestratorTooltipNodeId" class="actions">
        <p class="muted">已固定节点：{{ activeOrchestratorTooltipNodeLabel }}</p>
        <button @click="copyOrchestratorNodeDebug(activeOrchestratorTooltipNodeId)">复制错误详情</button>
        <button @click="clearPinnedOrchestratorNodeTooltip">取消固定</button>
      </div>
      <svg class="orchestrator-flow-canvas" :viewBox="`0 0 ${orchestratorFlowCanvasWidth} ${orchestratorFlowCanvasHeight}`" preserveAspectRatio="xMinYMin meet">
        <g v-for="edge in orchestratorFlowEdges" :key="edge.id">
          <path
            :d="edge.path"
            :class="['flow-edge', edge.type, edge.status]"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round" />
          <text v-if="edge.label && Number.isFinite(edge.labelX) && Number.isFinite(edge.labelY)" class="flow-edge-label" :x="edge.labelX" :y="edge.labelY">
            {{ edge.label }}
          </text>
        </g>
        <g v-for="node in orchestratorFlowNodes" :key="node.id" :transform="`translate(${node.x}, ${node.y})`">
          <rect
            :class="['flow-node', node.kind, node.status, { selected: selectedOrchestratorStepId === node.id, dragging: node.dragging }]"
            :width="node.width"
            :height="node.height"
            rx="12"
            ry="12"
            @pointerdown="onOrchestratorNodePointerDown(node, $event)"
            @click="onOrchestratorNodeClick(node.id)"
            @mouseenter="onOrchestratorNodeHover(node.id)"
            @mouseleave="onOrchestratorNodeHover('')" />
          <text class="flow-node-title" :x="12" :y="22">{{ node.title }}</text>
          <text class="flow-node-subtitle" :x="12" :y="40">{{ node.subtitle }}</text>
          <g v-if="node.retryCount > 0 || node.jumpCount > 0">
            <rect class="flow-node-badge-box" :x="node.width - 62" y="6" width="54" height="16" rx="8" ry="8" />
            <text class="flow-node-badge-text" :x="node.width - 56" y="18">R{{ node.retryCount }} J{{ node.jumpCount }}</text>
          </g>
          <g
            v-if="shouldShowOrchestratorNodeTooltip(node.id) && getOrchestratorNodeTooltipLines(node.id).length > 0"
            class="flow-node-tooltip"
            :transform="`translate(${node.width + 8}, -2)`">
            <rect
              class="flow-node-tooltip-box"
              x="0"
              y="0"
              width="280"
              :height="20 + getOrchestratorNodeTooltipLines(node.id).length * 16"
              rx="8"
              ry="8" />
            <g class="flow-node-tooltip-copy" transform="translate(220, 4)" @click.stop.prevent="onOrchestratorTooltipCopy(node.id)">
              <rect class="flow-node-tooltip-copy-btn" x="0" y="0" width="52" height="16" rx="8" ry="8" />
              <text class="flow-node-tooltip-copy-text" x="14" y="12">复制</text>
            </g>
            <text class="flow-node-tooltip-text" x="10" y="14">
              <tspan v-for="(line, idx) in getOrchestratorNodeTooltipLines(node.id)" :key="`tip-${node.id}-${idx}`" x="10" :dy="idx === 0 ? 0 : 16">
                {{ line }}
              </tspan>
            </text>
          </g>
        </g>
      </svg>
      <div class="orchestrator-legend">
        <span class="badge badge-idle">idle</span>
        <span class="badge badge-running">running</span>
        <span class="badge badge-success">success</span>
        <span class="badge badge-skipped">skipped</span>
        <span class="badge badge-failed">failed</span>
        <span class="badge badge-rolled-back">rolled_back</span>
      </div>
    </div>
    <div v-if="selectedOrchestratorStep" class="orchestrator-inline-editor">
      <div class="inline-between">
        <p class="muted">节点内联编辑：#{{ selectedOrchestratorStepIndex + 1 }} · {{ selectedOrchestratorStep.label }}</p>
        <button class="danger" @click="removeOrchestratorStep(selectedOrchestratorStep.id)">删除节点</button>
      </div>
      <div class="form">
        <label>
          条件分支
          <select v-model="selectedOrchestratorStep.condition" @change="syncSelectedOrchestratorStepMeta">
            <option value="all">全部目标</option>
            <option value="hasMedia">仅已有媒体</option>
            <option value="missingMedia">仅缺媒体</option>
            <option value="durationGt">仅时长大于阈值</option>
          </select>
        </label>
        <label v-if="selectedOrchestratorStep.condition === 'durationGt'">
          时长阈值(s)
          <input v-model.number="selectedOrchestratorStep.durationGtSec" type="number" min="0.1" max="600" step="0.1" @input="syncSelectedOrchestratorStepMeta" />
        </label>
        <label v-if="selectedOrchestratorStep.type === 'durationScale'">
          缩放因子
          <input v-model.number="selectedOrchestratorStep.scaleFactor" type="number" min="0.1" max="3" step="0.05" @input="syncSelectedOrchestratorStepMeta" />
        </label>
        <label v-if="selectedOrchestratorStep.type === 'audioVolumeMute'">
          音量
          <input v-model.number="selectedOrchestratorStep.volume" type="number" min="0" max="200" step="1" @input="syncSelectedOrchestratorStepMeta" />
        </label>
        <label v-if="selectedOrchestratorStep.type === 'audioVolumeMute'" class="check-inline">
          <input v-model="selectedOrchestratorStep.muted" type="checkbox" @change="syncSelectedOrchestratorStepMeta" />
          静音
        </label>
        <label>
          失败分支
          <select v-model="selectedOrchestratorStep.failAction" @change="syncSelectedOrchestratorStepMeta">
            <option value="terminate">终止流程</option>
            <option value="jump">跳转到步骤重试</option>
          </select>
        </label>
        <label v-if="selectedOrchestratorStep.failAction === 'jump'">
          失败跳转目标
          <select v-model="selectedOrchestratorStep.failJumpStepId" @change="syncSelectedOrchestratorStepMeta">
            <option value="">选择步骤</option>
            <option v-for="target in orchestratorJumpTargets" :key="target.id" :value="target.id">
              #{{ target.idx + 1 }} · {{ target.label }}
            </option>
          </select>
        </label>
      </div>
    </div>
    <div v-if="orchestratorSteps.length > 0" class="list compact-list">
      <article v-for="(step, idx) in orchestratorSteps" :key="step.id" class="card">
        <div class="inline-between">
          <p>#{{ idx + 1 }} · {{ step.label }}</p>
          <div class="actions">
            <button @click="onOrchestratorNodeClick(step.id)">定位节点</button>
            <button class="danger" @click="removeOrchestratorStep(step.id)">删除</button>
          </div>
        </div>
        <p class="muted">{{ step.detail }}</p>
      </article>
    </div>
    <p v-else class="muted">暂无编排步骤</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  OrchestratorActionType,
  OrchestratorFlowEdge,
  OrchestratorFlowNode,
  OrchestratorRollbackStrategy,
  OrchestratorStep,
} from '@/composables/useTimelineBatchOrchestrator';

type AsyncAction = () => void | Promise<void>;
type BatchTransitionType = 'cut' | 'fade' | 'dissolve' | 'wipeleft' | 'wiperight';
type BatchPanelPreviewItem = {
  index: number;
  title: string;
  span: string;
};
type OrchestratorJumpTarget = {
  id: string;
  idx: number;
  label: string;
};

const props = defineProps<{
  selectedClipCount: number;
  selectionRangeStartSec: number;
  selectionRangeEndSec: number;
  batchPanelTransitionType: BatchTransitionType;
  batchPanelTransitionDurationSec: number;
  batchPanelVolume: number;
  batchPanelMuted: boolean;
  batchPanelOnlyCurrentRange: boolean;
  batchPanelPreviewItems: BatchPanelPreviewItem[];
  applyBatchPanelTransition: AsyncAction;
  applyBatchPanelAudio: AsyncAction;
  applyBatchPanelDurationScale: AsyncAction;
  applyKeyframePresetToSelection: AsyncAction;
  orchestratorTargetCount: number;
  orchestratorDraftAction: OrchestratorActionType;
  orchestratorDraftScaleFactor: number;
  orchestratorDraftVolume: number;
  orchestratorDraftMuted: boolean;
  orchestratorRollbackStrategy: OrchestratorRollbackStrategy;
  orchestratorExecutionSummary: string;
  activeOrchestratorTooltipNodeId: string;
  activeOrchestratorTooltipNodeLabel: string;
  orchestratorFlowCanvasWidth: number;
  orchestratorFlowCanvasHeight: number;
  orchestratorFlowEdges: OrchestratorFlowEdge[];
  orchestratorFlowNodes: OrchestratorFlowNode[];
  selectedOrchestratorStepId: string;
  selectedOrchestratorStep: OrchestratorStep | null;
  selectedOrchestratorStepIndex: number;
  orchestratorJumpTargets: OrchestratorJumpTarget[];
  orchestratorSteps: OrchestratorStep[];
  addOrchestratorStep: AsyncAction;
  runOrchestrator: AsyncAction;
  clearOrchestrator: AsyncAction;
  copyOrchestratorNodeDebug: (nodeId: string) => void | Promise<void>;
  clearPinnedOrchestratorNodeTooltip: AsyncAction;
  onOrchestratorNodePointerDown: (node: OrchestratorFlowNode, event: PointerEvent) => void | Promise<void>;
  onOrchestratorNodeClick: (nodeId: string) => void | Promise<void>;
  onOrchestratorNodeHover: (nodeId: string) => void | Promise<void>;
  onOrchestratorTooltipCopy: (nodeId: string) => void | Promise<void>;
  getOrchestratorNodeTooltipLines: (nodeId: string) => string[];
  shouldShowOrchestratorNodeTooltip: (nodeId: string) => boolean;
  syncSelectedOrchestratorStepMeta: AsyncAction;
  removeOrchestratorStep: (stepId: string) => void | Promise<void>;
}>();

const emit = defineEmits<{
  (e: 'update:batchPanelTransitionType', value: BatchTransitionType): void;
  (e: 'update:batchPanelTransitionDurationSec', value: number): void;
  (e: 'update:batchPanelVolume', value: number): void;
  (e: 'update:batchPanelMuted', value: boolean): void;
  (e: 'update:batchPanelOnlyCurrentRange', value: boolean): void;
  (e: 'update:orchestratorDraftAction', value: OrchestratorActionType): void;
  (e: 'update:orchestratorDraftScaleFactor', value: number): void;
  (e: 'update:orchestratorDraftVolume', value: number): void;
  (e: 'update:orchestratorDraftMuted', value: boolean): void;
  (e: 'update:orchestratorRollbackStrategy', value: OrchestratorRollbackStrategy): void;
}>();

const batchPanelTransitionTypeModel = computed({
  get: () => props.batchPanelTransitionType,
  set: (value: BatchTransitionType) => emit('update:batchPanelTransitionType', value),
});
const batchPanelTransitionDurationSecModel = computed({
  get: () => props.batchPanelTransitionDurationSec,
  set: (value: number) => emit('update:batchPanelTransitionDurationSec', value),
});
const batchPanelVolumeModel = computed({
  get: () => props.batchPanelVolume,
  set: (value: number) => emit('update:batchPanelVolume', value),
});
const batchPanelMutedModel = computed({
  get: () => props.batchPanelMuted,
  set: (value: boolean) => emit('update:batchPanelMuted', value),
});
const batchPanelOnlyCurrentRangeModel = computed({
  get: () => props.batchPanelOnlyCurrentRange,
  set: (value: boolean) => emit('update:batchPanelOnlyCurrentRange', value),
});
const orchestratorDraftActionModel = computed({
  get: () => props.orchestratorDraftAction,
  set: (value: OrchestratorActionType) => emit('update:orchestratorDraftAction', value),
});
const orchestratorDraftScaleFactorModel = computed({
  get: () => props.orchestratorDraftScaleFactor,
  set: (value: number) => emit('update:orchestratorDraftScaleFactor', value),
});
const orchestratorDraftVolumeModel = computed({
  get: () => props.orchestratorDraftVolume,
  set: (value: number) => emit('update:orchestratorDraftVolume', value),
});
const orchestratorDraftMutedModel = computed({
  get: () => props.orchestratorDraftMuted,
  set: (value: boolean) => emit('update:orchestratorDraftMuted', value),
});
const orchestratorRollbackStrategyModel = computed({
  get: () => props.orchestratorRollbackStrategy,
  set: (value: OrchestratorRollbackStrategy) => emit('update:orchestratorRollbackStrategy', value),
});
</script>

<style scoped>
.batch-floating-panel {
  position: sticky;
  top: 12px;
  z-index: 5;
  border: 1px solid #c7d7f4;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #f6f9ff 100%);
  padding: 10px;
  margin-bottom: 10px;
}

.orchestrator-flow {
  border: 1px solid #d7deea;
  border-radius: 10px;
  background: #ffffff;
  padding: 8px;
  margin-bottom: 8px;
}

.orchestrator-flow-canvas {
  width: 100%;
  min-height: 220px;
  display: block;
  touch-action: none;
}

.flow-edge {
  stroke-width: 2;
  opacity: 0.85;
}

.flow-edge.success {
  stroke: #4b5563;
}

.flow-edge.failure {
  stroke: #ef4444;
  stroke-dasharray: 6 4;
}

.flow-edge.rollback {
  stroke: #f59e0b;
  stroke-dasharray: 4 4;
}

.flow-edge.jump {
  stroke: #7c3aed;
  stroke-dasharray: 3 3;
}

.flow-edge.running {
  stroke: #3b82f6;
}

.flow-edge.success.success {
  stroke: #16a34a;
}

.flow-edge.failure.failed {
  stroke: #dc2626;
}

.flow-edge.rollback.rolled_back {
  stroke: #ca8a04;
}

.flow-edge-label {
  fill: #4c1d95;
  font-size: 10px;
  font-weight: 600;
}

.flow-node {
  fill: #f8fafc;
  stroke: #cbd5e1;
  stroke-width: 1.5;
}

.flow-node.step {
  cursor: grab;
}

.flow-node.step.dragging {
  cursor: grabbing;
  opacity: 0.85;
}

.flow-node.selected {
  stroke: #2563eb;
  stroke-width: 2;
}

.flow-node.start {
  fill: #f0f9ff;
}

.flow-node.success {
  fill: #f0fdf4;
}

.flow-node.failure {
  fill: #fef2f2;
}

.flow-node.running {
  stroke: #3b82f6;
  stroke-width: 2;
}

.flow-node.success.success {
  stroke: #16a34a;
}

.flow-node.failed {
  stroke: #dc2626;
}

.flow-node.skipped {
  stroke: #64748b;
  stroke-dasharray: 4 3;
}

.flow-node.rolled_back {
  stroke: #ca8a04;
}

.flow-node-title {
  fill: #0f172a;
  font-size: 12px;
  font-weight: 600;
}

.flow-node-subtitle {
  fill: #475569;
  font-size: 11px;
}

.flow-node-badge-box {
  fill: #0f172a;
  opacity: 0.88;
}

.flow-node-badge-text {
  fill: #f8fafc;
  font-size: 9px;
  font-weight: 700;
}

.flow-node-tooltip {
  pointer-events: auto;
}

.flow-node-tooltip-box {
  fill: rgba(15, 23, 42, 0.94);
  stroke: rgba(148, 163, 184, 0.85);
  stroke-width: 1;
}

.flow-node-tooltip-text {
  fill: #f8fafc;
  font-size: 10px;
  font-weight: 500;
}

.flow-node-tooltip-copy {
  cursor: pointer;
}

.flow-node-tooltip-copy-btn {
  fill: #1d4ed8;
  opacity: 0.95;
}

.flow-node-tooltip-copy-text {
  fill: #eff6ff;
  font-size: 10px;
  font-weight: 700;
}

.orchestrator-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.orchestrator-inline-editor {
  margin: 8px 0;
  border: 1px solid #d7deea;
  border-radius: 10px;
  background: #f8fbff;
  padding: 8px;
}

.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
}

.badge-idle {
  background: #e2e8f0;
  color: #334155;
}

.badge-running {
  background: #dbeafe;
  color: #1d4ed8;
}

.badge-success {
  background: #dcfce7;
  color: #166534;
}

.badge-skipped {
  background: #e2e8f0;
  color: #475569;
}

.badge-failed {
  background: #fee2e2;
  color: #991b1b;
}

.badge-rolled-back {
  background: #fef3c7;
  color: #92400e;
}
</style>
