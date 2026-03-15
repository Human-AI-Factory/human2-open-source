<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell>
      <template #rail>
        <section class="panel">
          <div class="inline-between">
            <div>
              <h2>交付工作台</h2>
              <p class="muted">{{ project?.name || '加载中...' }}</p>
            </div>
            <div class="actions">
              <button @click="goProject">返回项目</button>
              <button @click="loadAll">刷新</button>
            </div>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
        </section>

        <section class="panel sticky-summary">
          <div class="inline-between">
            <h3>交付上下文（可分享）</h3>
            <div class="actions">
              <button @click="copyShareLink">复制当前链接</button>
            </div>
          </div>
          <p class="muted">
            episode={{ episodeId || '-' }} · version={{ compareCurrentVersionId || '-' }} · previousVersion={{ comparePreviousVersionId || '-' }} · compare={{ compareEnabled ? 'on' : 'off' }}
          </p>
          <p class="muted">
            <span v-if="compareAt">最近对比：{{ compareAt }}</span>
            <span v-if="shareTip"> · {{ shareTip }}</span>
          </p>
          <RouteRestoreHint :text="restoredTip" />
        </section>

        <section class="panel">
          <h3>交付对象</h3>
          <div class="form">
            <label>
              分集
              <select v-model="episodeId" @change="onEpisodeChange">
                <option value="">请选择分集</option>
                <option v-for="ep in episodes" :key="ep.id" :value="ep.id">{{ ep.orderIndex }} · {{ ep.title }} · {{ ep.status }}</option>
              </select>
            </label>
            <label>
              操作者
              <input v-model="actor" placeholder="operator" />
            </label>
            <label>
              备注
              <input v-model="comment" placeholder="交付说明（可选）" />
            </label>
          </div>
          <div class="actions" style="margin-top: 8px">
            <button :disabled="loading || !episodeId" @click="approveReview">审核通过（ready）</button>
            <button class="primary" :disabled="loading || !episodeId" @click="finalizeDelivery">终版交付（published）</button>
            <button :disabled="loading || !episodeId" @click="loadDownload">获取下载链接</button>
          </div>
        </section>
      </template>

      <section class="panel" v-if="latestEpisodeMerge?.status === 'failed'">
        <h3>最近一次合成失败</h3>
        <p class="muted">merge={{ latestEpisodeMerge.id }} / updated={{ new Date(latestEpisodeMerge.updatedAt).toLocaleString() }}</p>
        <p class="error">errorCode={{ latestEpisodeMerge.errorCode || 'MERGE_FAILED' }}</p>
        <p class="error">{{ summarizeMergeError(latestEpisodeMerge.error) }}</p>
        <details v-if="latestEpisodeMerge.error" class="merge-error-detail">
          <summary>查看完整错误</summary>
          <pre>{{ latestEpisodeMerge.error }}</pre>
        </details>
      </section>

      <section class="panel" v-if="deliveryResult">
        <h3>交付结果</h3>
        <p class="muted">episode={{ deliveryResult.episode.id }} / status={{ deliveryResult.episode.status }}</p>
        <p class="muted">merge={{ deliveryResult.latestMergeId || '-' }}</p>
        <p class="muted">download={{ deliveryResult.downloadUrl || '-' }}</p>
        <p class="muted">actor={{ deliveryResult.actor }} / comment={{ deliveryResult.comment || '-' }}</p>
      </section>

      <section class="panel" v-if="downloadResult">
        <h3>下载入口</h3>
        <p class="muted">mergeId={{ downloadResult.mergeId }}</p>
        <div class="actions">
          <button :disabled="loading" @click="openMergeFile(downloadResult.mergeId)">打开成片（鉴权）</button>
          <a :href="downloadResult.url" target="_blank" rel="noreferrer">原始下载地址</a>
        </div>
      </section>

      <section class="panel">
        <h3>版本列表（按分集匹配）</h3>
        <div class="timeline" v-if="episodeMerges.length > 0">
          <article class="timeline-item" v-for="item in episodeMerges" :key="item.id">
            <p class="timeline-time">{{ new Date(item.updatedAt).toLocaleString() }}</p>
            <p class="muted">merge={{ item.id }} / status={{ item.status }}</p>
            <p class="muted">title={{ item.title }}</p>
            <p class="muted" v-if="item.resultUrl">result={{ item.resultUrl }}</p>
            <div class="actions" v-if="item.status === 'done'">
              <button :disabled="loading" @click="openMergeFile(item.id)">打开成片（鉴权）</button>
            </div>
            <p class="error" v-if="item.errorCode">errorCode={{ item.errorCode }}</p>
            <p class="error" v-if="item.error">{{ summarizeMergeError(item.error) }}</p>
            <details v-if="item.error" class="merge-error-detail">
              <summary>查看完整错误</summary>
              <pre>{{ item.error }}</pre>
            </details>
          </article>
        </div>
        <p class="muted" v-else>当前分集暂无合成版本</p>
      </section>

      <template #inspector>
        <section class="panel">
          <h3>交付版本记录</h3>
          <div class="actions">
            <button :disabled="loading || !episodeId" @click="loadDeliveryVersions">刷新交付版本</button>
          </div>
          <div class="timeline" v-if="deliveryVersions.length > 0">
            <article class="timeline-item" v-for="item in deliveryVersions" :key="item.id">
              <p class="timeline-time">{{ new Date(item.createdAt).toLocaleString() }}</p>
              <p class="muted">version={{ item.id }} / actor={{ item.actor }} / status={{ item.status }}</p>
              <p class="muted">merge={{ item.mergeId || '-' }}</p>
              <p class="muted">comment={{ item.comment || '-' }}</p>
              <div class="actions">
                <button :class="{ primary: compareCurrentVersionId === item.id }" @click="compareCurrentVersionId = item.id">设为当前版</button>
                <button :class="{ primary: comparePreviousVersionId === item.id }" @click="comparePreviousVersionId = item.id">设为对比版</button>
              </div>
            </article>
          </div>
          <p class="muted" v-else>当前分集暂无交付版本记录</p>
        </section>

        <section class="panel">
          <h3>版本对比（当前版 vs 上一版）</h3>
          <div class="actions">
            <button :disabled="loading || !episodeId || !compareCurrentVersionId" @click="runVersionCompare">执行对比</button>
            <button :disabled="loading || !episodeId || !compareCurrentVersionId" @click="exportCompareJson">导出对比 JSON</button>
            <button :disabled="loading || !episodeId || !compareCurrentVersionId" @click="exportCompareCsv">导出对比 CSV</button>
          </div>
          <div class="panel" v-if="compareResult" style="margin-top: 8px">
            <p class="muted">current={{ compareResult.current.id }} / previous={{ compareResult.previous.id }}</p>
            <p class="muted">
              changed: merge={{ compareResult.changed.mergeId ? 'yes' : 'no' }} / url={{ compareResult.changed.downloadUrl ? 'yes' : 'no' }} /
              actor={{ compareResult.changed.actor ? 'yes' : 'no' }} / comment={{ compareResult.changed.comment ? 'yes' : 'no' }}
            </p>
            <p class="muted">
              clips: {{ compareResult.metrics.currentClipCount }} vs {{ compareResult.metrics.previousClipCount }} /
              duration: {{ compareResult.metrics.currentDurationSec.toFixed(2) }}s vs {{ compareResult.metrics.previousDurationSec.toFixed(2) }}s
            </p>
          </div>
          <p class="muted" v-else>暂无对比结果</p>
        </section>

        <section class="panel">
          <h3>交付包下载</h3>
          <div class="actions">
            <button :disabled="loading || !episodeId" @click="downloadDeliveryPackage">下载交付包（JSON）</button>
            <label class="check-inline">
              <input v-model="packageZipIncludeMedia" type="checkbox" />
              ZIP 包含成片文件
            </label>
            <button :disabled="loading || !episodeId" @click="downloadDeliveryPackageZipFile">下载外发包（ZIP）</button>
          </div>
          <div class="actions" style="margin-top: 8px">
            <input type="file" accept=".zip,application/zip" @change="onVerifyZipFileChange" />
            <button :disabled="loading || !episodeId || !verifyZipFile" @click="verifyDeliveryZipFile">校验 ZIP 完整性</button>
          </div>
          <p class="muted" v-if="packageResult">
            exportedAt={{ packageResult.exportedAt }} / version={{ packageResult.version.id }} / merge={{ packageResult.merge?.id || '-' }} / assets={{
              packageResult.assetsSnapshot.length
            }}
          </p>
          <p class="muted" v-if="packageResult?.manifestVersion">
            manifest={{ packageResult.manifestVersion }} / hash={{ packageResult.reproducibility?.contentHash?.slice(0, 16) || '-' }} /
            artifact={{ packageResult.artifact?.exists ? `${packageResult.artifact.sizeBytes ?? 0} bytes` : 'missing' }}
          </p>
          <p class="muted" v-if="packageResult?.lineage">
            lineage: versions={{ packageResult.lineage.versionCount }} / previous={{ packageResult.lineage.previousVersionId || '-' }}
          </p>
          <div class="panel" v-if="verifyResult" style="margin-top: 8px">
            <p class="muted">
              verify: ok={{ verifyResult.ok ? 'yes' : 'no' }} / signature={{ verifyResult.signatureValid ? 'valid' : 'invalid' }} /
              checksums={{ verifyResult.checksumsValid ? 'valid' : 'invalid' }} / files={{ verifyResult.checkedFiles }}
            </p>
            <p class="muted">message={{ verifyResult.message }}</p>
            <p class="muted" v-if="verifyResult.missingFiles.length > 0">missing: {{ verifyResult.missingFiles.slice(0, 6).join(', ') }}</p>
            <p class="muted" v-if="verifyResult.mismatchedFiles.length > 0">
              mismatched: {{ verifyResult.mismatchedFiles.slice(0, 4).map((item) => item.path).join(', ') }}
            </p>
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
  compareDramaEpisodeDeliveryVersions,
  compareEpisodeDeliveryVersions,
  downloadDramaEpisodeDeliveryPackageZip,
  downloadDramaVideoMergeFile,
  approveDramaEpisodeWorkflow,
  approveEpisodeWorkflow,
  downloadEpisodeDeliveryPackageZip,
  downloadVideoMergeFile,
  finalizeDramaEpisodeDelivery,
  finalizeEpisodeDelivery,
  getDramaEpisodeDeliveryCompareReport,
  getDramaEpisodeDeliveryCompareReportCsv,
  getDramaEpisodeDeliveryPackage,
  getDramaEpisodeDeliveryDownload,
  getDramaEpisodeDeliveryVersions,
  getEpisodeDeliveryCompareReport,
  getEpisodeDeliveryCompareReportCsv,
  getEpisodeDeliveryPackage,
  verifyDramaEpisodeDeliveryPackageZip,
  verifyEpisodeDeliveryPackageZip,
  getEpisodeDeliveryDownload,
  getEpisodeDeliveryVersions,
  getDramaVideoMerges,
  getVideoMerges
} from '@/api/delivery';
import { getDramaStoryboards, getProject, getStoryboards } from '@/api/timeline-editor';
import {
  EpisodeDeliveryCompareResult,
  EpisodeDeliveryPackage,
  EpisodeDeliveryPackageVerifyResult,
  EpisodeDeliveryVersionEntry,
  EpisodeDomain,
  Project,
  Storyboard,
  VideoMerge
} from '@/types/models';
import { buildDramaScopedPath, buildDramaScopedQuery, resolveProjectIdFromRouteContext } from '@/utils/route-context';
import { buildRouteRestoreTip, replaceQueryIfChanged, toSingleQuery, useRouteRestoreContext } from '@/composables/useRouteRestoreContext';

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
const storyboards = ref<Storyboard[]>([]);
const merges = ref<VideoMerge[]>([]);
const episodeId = ref('');
const actor = ref('operator');
const comment = ref('');
const deliveryResult = ref<{
  episode: { id: string; status: 'published' };
  latestMergeId: string | null;
  downloadUrl: string | null;
  actor: string;
  comment: string;
} | null>(null);
const downloadResult = ref<{ mergeId: string; url: string } | null>(null);
const deliveryVersions = ref<EpisodeDeliveryVersionEntry[]>([]);
const compareCurrentVersionId = ref('');
const comparePreviousVersionId = ref('');
const compareResult = ref<EpisodeDeliveryCompareResult | null>(null);
const compareEnabled = ref(false);
const compareAutoRestorePending = ref(false);
const packageResult = ref<EpisodeDeliveryPackage | null>(null);
const packageZipIncludeMedia = ref(false);
const verifyZipFile = ref<File | null>(null);
const verifyResult = ref<EpisodeDeliveryPackageVerifyResult | null>(null);
const compareAt = ref('');
const shareTip = ref('');
const loading = ref(false);
const error = ref('');
const managedQueryKeys = ['episodeId', 'versionId', 'previousVersionId', 'compare', 'compareAt'] as const;
const {
  restoreTip: restoredTip,
  markRestored: markRouteRestored
} = useRouteRestoreContext();

const storyboardIdSetByEpisode = computed(() => {
  const map: Record<string, Set<string>> = {};
  for (const sb of storyboards.value) {
    if (!sb.episodeId) {
      continue;
    }
    if (!map[sb.episodeId]) {
      map[sb.episodeId] = new Set<string>();
    }
    map[sb.episodeId].add(sb.id);
  }
  return map;
});

const episodeMerges = computed(() => {
  const id = episodeId.value;
  if (!id) {
    return [];
  }
  const ids = storyboardIdSetByEpisode.value[id] ?? new Set<string>();
  return merges.value
    .filter((item) => item.clips.some((clip) => ids.has(clip.storyboardId)))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
});

const latestEpisodeMerge = computed(() => episodeMerges.value[0] ?? null);

const summarizeMergeError = (value: string | null): string => {
  if (!value) {
    return '未知合成错误';
  }
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !line.startsWith('ffmpeg version') &&
        !line.startsWith('built with') &&
        !line.startsWith('configuration:') &&
        !line.startsWith('libav') &&
        !line.startsWith('libswscale') &&
        !line.startsWith('libswresample') &&
        !line.startsWith('Metadata:') &&
        !line.startsWith('Duration:') &&
        !line.startsWith('Input #') &&
        !line.startsWith('Stream #') &&
        !line.startsWith('handler_name') &&
        !line.startsWith('vendor_id')
    );
  const preferred =
    lines.find((line) => /error|failed|invalid|not found|no such|unsupported|forbidden|denied/i.test(line)) || lines[0];
  return preferred || value.trim() || '未知合成错误';
};

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

const restoreFromQuery = (): void => {
  const query = toSingleQuery(route.query);
  const queryEpisodeId = query.episodeId || '';
  const queryCurrentVersionId = query.versionId || query.currentVersionId || '';
  const queryPreviousVersionId = query.previousVersionId || '';
  const queryCompare = query.compare || '';
  const queryCompareAt = query.compareAt || '';
  episodeId.value = queryEpisodeId;
  compareCurrentVersionId.value = queryCurrentVersionId;
  comparePreviousVersionId.value = queryPreviousVersionId;
  compareEnabled.value = queryCompare === '1' || queryCompare.toLowerCase() === 'true';
  compareAutoRestorePending.value = compareEnabled.value;
  compareAt.value = queryCompareAt;
  if (queryEpisodeId || queryCurrentVersionId || queryPreviousVersionId || queryCompareAt || compareEnabled.value) {
    markRouteRestored(buildRouteRestoreTip('episode_version'));
  }
};

const syncQuery = async (): Promise<void> => {
  const nextQuery = toSingleQuery(route.query);
  const payload: Record<string, string | undefined> = {
    episodeId: episodeId.value || undefined,
    versionId: compareCurrentVersionId.value || undefined,
    previousVersionId: comparePreviousVersionId.value || undefined,
    compare: compareEnabled.value ? '1' : undefined,
    compareAt: compareAt.value || undefined
  };
  for (const key of managedQueryKeys) {
    const value = payload[key];
    if (value) {
      nextQuery[key] = value;
    } else {
      delete nextQuery[key];
    }
  }
  await replaceQueryIfChanged({ route, router, nextQuery });
};

const loadDownload = async (): Promise<void> => {
  if (!episodeId.value) {
    error.value = '请先选择分集';
    return;
  }
  loading.value = true;
  try {
    downloadResult.value = hasDramaScopedApi.value
      ? await getDramaEpisodeDeliveryDownload(dramaId.value, episodeId.value)
      : await getEpisodeDeliveryDownload(projectId.value, episodeId.value);
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '拉取下载地址失败';
  } finally {
    loading.value = false;
  }
};

const openMergeFile = async (mergeId: string): Promise<void> => {
  if (!mergeId) {
    error.value = '缺少 mergeId';
    return;
  }
  loading.value = true;
  try {
    const output = hasDramaScopedApi.value
      ? await downloadDramaVideoMergeFile(dramaId.value, mergeId)
      : await downloadVideoMergeFile(projectId.value, mergeId);
    const objectUrl = URL.createObjectURL(output.blob);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '打开成片失败';
  } finally {
    loading.value = false;
  }
};

const loadEpisodes = async (): Promise<EpisodeDomain[]> =>
  hasDramaScopedApi.value ? getEpisodeDomainsByDrama(dramaId.value) : getEpisodeDomains(projectId.value);

const approveReview = async (): Promise<void> => {
  if (!episodeId.value) {
    error.value = '请先选择分集';
    return;
  }
  loading.value = true;
  try {
    if (hasDramaScopedApi.value) {
      await approveDramaEpisodeWorkflow(dramaId.value, episodeId.value);
    } else {
      await approveEpisodeWorkflow(projectId.value, episodeId.value);
    }
    episodes.value = await loadEpisodes();
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '审核通过失败';
  } finally {
    loading.value = false;
  }
};

const finalizeDelivery = async (): Promise<void> => {
  if (!episodeId.value) {
    error.value = '请先选择分集';
    return;
  }
  loading.value = true;
  try {
    const payload = {
      actor: actor.value.trim() || undefined,
      comment: comment.value.trim() || undefined
    };
    deliveryResult.value = hasDramaScopedApi.value
      ? await finalizeDramaEpisodeDelivery(dramaId.value, episodeId.value, payload)
      : await finalizeEpisodeDelivery(projectId.value, episodeId.value, payload);
    episodes.value = await loadEpisodes();
    await loadDownload();
    await loadDeliveryVersions();
    if (compareCurrentVersionId.value) {
      await runVersionCompare();
    }
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '交付失败';
  } finally {
    loading.value = false;
  }
};

const onEpisodeChange = (): void => {
  deliveryResult.value = null;
  downloadResult.value = null;
  compareResult.value = null;
  packageResult.value = null;
  void loadDeliveryVersions();
};

const loadDeliveryVersions = async (): Promise<void> => {
  if (!episodeId.value) {
    deliveryVersions.value = [];
    compareCurrentVersionId.value = '';
    comparePreviousVersionId.value = '';
    compareResult.value = null;
    return;
  }
  deliveryVersions.value = hasDramaScopedApi.value
    ? await getDramaEpisodeDeliveryVersions(dramaId.value, episodeId.value, { limit: 50 })
    : await getEpisodeDeliveryVersions(projectId.value, episodeId.value, { limit: 50 });
  if (!deliveryVersions.value.some((item) => item.id === compareCurrentVersionId.value)) {
    compareCurrentVersionId.value = deliveryVersions.value[0]?.id || '';
  }
  if (!deliveryVersions.value.some((item) => item.id === comparePreviousVersionId.value)) {
    comparePreviousVersionId.value = deliveryVersions.value[1]?.id || '';
  }
};

const runVersionCompare = async (): Promise<void> => {
  if (!episodeId.value || !compareCurrentVersionId.value) {
    error.value = '请先选择分集和当前版本';
    return;
  }
  loading.value = true;
  try {
    const payload = {
      currentVersionId: compareCurrentVersionId.value,
      previousVersionId: comparePreviousVersionId.value || undefined
    };
    compareResult.value = hasDramaScopedApi.value
      ? await compareDramaEpisodeDeliveryVersions(dramaId.value, episodeId.value, payload)
      : await compareEpisodeDeliveryVersions(projectId.value, episodeId.value, payload);
    compareEnabled.value = true;
    compareAutoRestorePending.value = false;
    compareAt.value = new Date().toISOString();
    await syncQuery();
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '版本对比失败';
  } finally {
    loading.value = false;
  }
};

const exportCompareJson = async (): Promise<void> => {
  if (!episodeId.value || !compareCurrentVersionId.value) {
    error.value = '请先选择分集和当前版本';
    return;
  }
  loading.value = true;
  try {
    const payload = {
      currentVersionId: compareCurrentVersionId.value,
      previousVersionId: comparePreviousVersionId.value || undefined
    };
    const report = hasDramaScopedApi.value
      ? await getDramaEpisodeDeliveryCompareReport(dramaId.value, episodeId.value, payload)
      : await getEpisodeDeliveryCompareReport(projectId.value, episodeId.value, payload);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `episode-delivery-compare-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '导出 JSON 失败';
  } finally {
    loading.value = false;
  }
};

const exportCompareCsv = async (): Promise<void> => {
  if (!episodeId.value || !compareCurrentVersionId.value) {
    error.value = '请先选择分集和当前版本';
    return;
  }
  loading.value = true;
  try {
    const payload = {
      currentVersionId: compareCurrentVersionId.value,
      previousVersionId: comparePreviousVersionId.value || undefined
    };
    const csv = hasDramaScopedApi.value
      ? await getDramaEpisodeDeliveryCompareReportCsv(dramaId.value, episodeId.value, payload)
      : await getEpisodeDeliveryCompareReportCsv(projectId.value, episodeId.value, payload);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `episode-delivery-compare-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '导出 CSV 失败';
  } finally {
    loading.value = false;
  }
};

const downloadDeliveryPackage = async (): Promise<void> => {
  if (!episodeId.value) {
    error.value = '请先选择分集';
    return;
  }
  loading.value = true;
  try {
    const payload = {
      versionId: compareCurrentVersionId.value || undefined
    };
    const pkg = hasDramaScopedApi.value
      ? await getDramaEpisodeDeliveryPackage(dramaId.value, episodeId.value, payload)
      : await getEpisodeDeliveryPackage(projectId.value, episodeId.value, payload);
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `episode-delivery-package-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    packageResult.value = pkg;
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '下载交付包失败';
  } finally {
    loading.value = false;
  }
};

const downloadDeliveryPackageZipFile = async (): Promise<void> => {
  if (!episodeId.value) {
    error.value = '请先选择分集';
    return;
  }
  loading.value = true;
  try {
    const payload = {
      versionId: compareCurrentVersionId.value || undefined,
      includeMedia: packageZipIncludeMedia.value
    };
    const output = hasDramaScopedApi.value
      ? await downloadDramaEpisodeDeliveryPackageZip(dramaId.value, episodeId.value, payload)
      : await downloadEpisodeDeliveryPackageZip(projectId.value, episodeId.value, payload);
    const url = URL.createObjectURL(output.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = output.filename;
    link.click();
    URL.revokeObjectURL(url);
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '下载交付 ZIP 失败';
  } finally {
    loading.value = false;
  }
};

const onVerifyZipFileChange = (event: Event): void => {
  const input = event.target as HTMLInputElement;
  verifyZipFile.value = input.files && input.files.length > 0 ? input.files[0] : null;
};

const verifyDeliveryZipFile = async (): Promise<void> => {
  if (!episodeId.value || !verifyZipFile.value) {
    error.value = '请先选择分集和 ZIP 文件';
    return;
  }
  loading.value = true;
  try {
    const payload = { file: verifyZipFile.value };
    verifyResult.value = hasDramaScopedApi.value
      ? await verifyDramaEpisodeDeliveryPackageZip(dramaId.value, episodeId.value, payload)
      : await verifyEpisodeDeliveryPackageZip(projectId.value, episodeId.value, payload);
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '校验 ZIP 失败';
  } finally {
    loading.value = false;
  }
};

const loadAll = async (): Promise<void> => {
  projectId.value = await resolveProjectIdFromRouteContext({
    currentProjectId: projectId.value,
    routeProjectId: routeProjectId.value,
    routeDramaId: routeDramaId.value
  });
  if (!projectId.value) {
    error.value = '无法解析项目上下文';
    return;
  }
  try {
    const [projectData, episodeList, storyboardList, mergeList] = await Promise.all([
      getProject(projectId.value),
      loadEpisodes(),
      hasDramaScopedApi.value ? getDramaStoryboards(dramaId.value) : getStoryboards(projectId.value),
      hasDramaScopedApi.value ? getDramaVideoMerges(dramaId.value) : getVideoMerges(projectId.value)
    ]);
    project.value = projectData;
    episodes.value = episodeList;
    storyboards.value = storyboardList;
    merges.value = mergeList;
    if (episodeId.value && !episodeList.some((item) => item.id === episodeId.value)) {
      episodeId.value = '';
    }
    if (!episodeId.value && episodeList.length > 0) {
      episodeId.value = episodeList[0].id;
    }
    await loadDeliveryVersions();
    if (compareAutoRestorePending.value && episodeId.value && compareCurrentVersionId.value) {
      await runVersionCompare();
    }
    await syncQuery();
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  }
};

const copyShareLink = async (): Promise<void> => {
  shareTip.value = '';
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(window.location.href);
      shareTip.value = '已复制分享链接';
      return;
    }
    shareTip.value = '当前环境不支持复制';
  } catch {
    shareTip.value = '复制失败';
  }
};

watch(
  () => [episodeId.value, compareCurrentVersionId.value, comparePreviousVersionId.value, compareAt.value],
  () => {
    void syncQuery();
  }
);

onMounted(() => {
  restoreFromQuery();
  void loadAll();
});
</script>

<style scoped>
.sticky-summary {
  position: sticky;
  top: 12px;
  z-index: 3;
  border: 1px solid #bdd5ff;
  background: linear-gradient(135deg, #f7fbff, #eef6ff);
}

.merge-error-detail {
  margin-top: 8px;
}

.merge-error-detail pre {
  margin: 8px 0 0;
  padding: 10px 12px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 10px;
  background: #10151d;
  color: #f5f7fb;
}

</style>
