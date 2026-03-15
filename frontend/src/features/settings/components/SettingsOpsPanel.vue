<template>
  <section class="panel">
    <div class="inline-between">
      <h3>运营运维</h3>
      <div class="actions">
        <button @click="emit('load-ops-panel')">刷新概览</button>
        <button :disabled="opsLoading" @click="emit('restore-latest-migration-backup')">
          {{ opsLoading ? '处理中...' : '回滚最近迁移快照' }}
        </button>
        <button :disabled="opsLoading" @click="emit('download-business-backup')">
          {{ opsLoading ? '处理中...' : '导出业务备份' }}
        </button>
        <button :disabled="opsLoading" @click="emit('trigger-import-backup')">
          {{ opsLoading ? '处理中...' : '导入业务备份' }}
        </button>
        <button :disabled="opsLoading" @click="emit('clear-provider-log-history')">
          {{ opsLoading ? '处理中...' : '清空 Provider 日志' }}
        </button>
        <button class="danger" :disabled="opsLoading" @click="emit('clear-all-business-data')">
          {{ opsLoading ? '处理中...' : '清空业务数据' }}
        </button>
      </div>
    </div>
    <p class="muted" v-if="opsSummary">当前时间：{{ new Date(opsSummary.now).toLocaleString() }} / 运行时长：{{ opsSummary.uptimeSec }}s</p>
    <p class="muted">Schema 版本：{{ migrationCurrentVersion }} / 目标 {{ migrationTargetVersion }}</p>
    <div class="list" v-if="migrationSnapshots.length">
      <article class="card" v-for="item in migrationSnapshots" :key="item.fileName">
        <div>
          <h4>{{ item.fileName }}</h4>
          <p class="muted">时间：{{ new Date(item.createdAt).toLocaleString() }} / 大小：{{ Math.max(1, Math.round(item.size / 1024)) }} KB</p>
        </div>
        <div class="actions">
          <button :disabled="opsLoading" @click="emit('download-migration-snapshot', item.fileName)">下载</button>
          <button :disabled="opsLoading" @click="emit('restore-migration-backup-by-file', item.fileName)">按此回滚</button>
        </div>
      </article>
    </div>
    <div class="ops-grid" v-if="opsSummary">
      <article class="card">
        <h3>运行环境</h3>
        <p class="muted">NODE_ENV：{{ opsSummary.env.nodeEnv }}</p>
        <p class="muted">AI_PROVIDER：{{ opsSummary.env.aiProvider }}</p>
        <p class="muted">并发上限：{{ opsSummary.env.videoMaxConcurrent }}</p>
      </article>
      <article class="card">
        <h3>业务数据</h3>
        <p class="muted">项目：{{ opsSummary.data.projectCount }} / 看板任务：{{ opsSummary.data.taskCount }}</p>
        <p class="muted">小说：{{ opsSummary.data.novelCount }} / 大纲：{{ opsSummary.data.outlineCount }} / 剧本：{{ opsSummary.data.scriptCount }}</p>
        <p class="muted">分镜：{{ opsSummary.data.storyboardCount }} / 资产：{{ opsSummary.data.assetCount }}</p>
        <p class="muted">视频任务：{{ opsSummary.data.videoTaskCount }} / 音频任务：{{ opsSummary.data.audioTaskCount }} / 合成任务：{{ opsSummary.data.videoMergeCount }}</p>
      </article>
      <article class="card">
        <h3>Provider 日志</h3>
        <p class="muted">缓存条数：{{ opsSummary.providerLogs.count }} / 上限：{{ opsSummary.providerLogs.max }}</p>
        <p class="muted">自动修复：{{ opsSummary.autoRepairLogs.count }} / 成功 {{ opsSummary.autoRepairLogs.success }} / 失败 {{ opsSummary.autoRepairLogs.failed }}</p>
      </article>
    </div>
    <div class="panel" style="margin-top: 10px">
      <div class="inline-between">
        <h4>Video Merge 错误码榜单</h4>
        <div class="actions">
          <input v-model="mergeErrorProjectIdModel" placeholder="按项目ID过滤（可选）" />
          <select v-model.number="mergeErrorLimitModel">
            <option :value="5">Top 5</option>
            <option :value="10">Top 10</option>
            <option :value="20">Top 20</option>
          </select>
          <button @click="emit('load-merge-error-stats')">刷新榜单</button>
        </div>
      </div>
      <div class="list" v-if="mergeErrorStats.length > 0">
        <article class="card" v-for="item in mergeErrorStats" :key="item.errorCode">
          <div>
            <h3>{{ item.errorCode }}</h3>
            <p class="muted">次数：{{ item.count }}</p>
            <p class="muted">最近出现：{{ new Date(item.latestAt).toLocaleString() }}</p>
          </div>
          <div class="actions">
            <button :disabled="!mergeErrorProjectId.trim()" @click="emit('go-to-project-merge-error', item.errorCode)">定位到项目合成</button>
          </div>
        </article>
      </div>
      <p class="muted" v-else>暂无 video merge 错误码数据</p>
      <p class="muted" v-if="!mergeErrorProjectId.trim()">提示：填写项目ID后可直接跳到该项目并按错误码过滤合成列表。</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { OpsSummary, VideoMergeErrorStat } from '@/types/models';

type MigrationSnapshot = {
  fileName: string;
  path: string;
  createdAt: string;
  size: number;
};

const props = defineProps<{
  opsLoading: boolean;
  opsSummary: OpsSummary | null;
  migrationCurrentVersion: number;
  migrationTargetVersion: number;
  migrationSnapshots: MigrationSnapshot[];
  mergeErrorStats: VideoMergeErrorStat[];
  mergeErrorProjectId: string;
  mergeErrorLimit: number;
}>();

const emit = defineEmits<{
  (e: 'clear-all-business-data'): void;
  (e: 'clear-provider-log-history'): void;
  (e: 'download-business-backup'): void;
  (e: 'download-migration-snapshot', fileName: string): void;
  (e: 'go-to-project-merge-error', errorCode: string): void;
  (e: 'load-merge-error-stats'): void;
  (e: 'load-ops-panel'): void;
  (e: 'restore-latest-migration-backup'): void;
  (e: 'restore-migration-backup-by-file', fileName: string): void;
  (e: 'trigger-import-backup'): void;
  (e: 'update:mergeErrorLimit', value: number): void;
  (e: 'update:mergeErrorProjectId', value: string): void;
}>();

const mergeErrorProjectIdModel = computed({
  get: () => props.mergeErrorProjectId,
  set: (value: string) => emit('update:mergeErrorProjectId', value)
});

const mergeErrorLimitModel = computed({
  get: () => props.mergeErrorLimit,
  set: (value: number) => emit('update:mergeErrorLimit', Number(value))
});
</script>
