<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell>
      <template #rail>
        <section class="panel">
          <div class="inline-between">
            <div>
              <h2>Storyboard Workbench</h2>
              <p class="muted">分镜相关工作流入口</p>
            </div>
            <div class="actions">
              <button @click="goProject">返回项目</button>
              <button @click="refreshAll">刷新</button>
            </div>
          </div>
          <p v-if="error" class="error">{{ error }}</p>
        </section>

        <section class="panel">
          <h3>摘要</h3>
          <div class="summary-grid">
            <article class="card">
              <p class="muted">分镜总数</p>
              <h4>{{ storyboards.length }}</h4>
            </article>
            <article class="card">
              <p class="muted">草稿</p>
              <h4>{{ draftCount }}</h4>
            </article>
            <article class="card">
              <p class="muted">已生成</p>
              <h4>{{ generatedCount }}</h4>
            </article>
          </div>
        </section>

        <section class="panel">
          <h3>入口</h3>
          <div class="actions">
            <button class="primary" @click="goFramePrompts">Frame Prompt Workbench</button>
            <button class="primary" @click="goTimeline">Timeline Editor</button>
          </div>
        </section>
      </template>

      <section class="panel">
        <h3>分镜列表</h3>
        <div class="storyboard-toolbar">
          <input v-model="q" placeholder="搜索标题/ID" />
          <p class="muted">显示 {{ visibleStoryboards.length }} / {{ filteredStoryboards.length }} 条</p>
        </div>
        <div class="storyboard-grid" v-if="visibleStoryboards.length > 0">
          <article
            class="card storyboard-card"
            :class="{ 'route-focus': focusedStoryboardId === item.id, 'storyboard-card--active': activeStoryboard?.id === item.id }"
            :id="`storyboard-card-${item.id}`"
            v-for="item in visibleStoryboards"
            :key="item.id"
            @click="selectStoryboard(item.id)">
          <div class="storyboard-copy">
            <div class="storyboard-heading">
              <div>
                <p class="storyboard-kicker">{{ item.plan ? '结构化分镜' : '旧分镜' }}</p>
                <h4>{{ item.plan?.shotTitle || item.title }}</h4>
              </div>
              <p class="muted">status={{ item.status }} / script={{ item.scriptId }}</p>
            </div>

            <div v-if="item.plan" class="storyboard-meta-grid">
              <article class="storyboard-meta-card">
                <span>场景</span>
                <strong>{{ item.plan.scene }}</strong>
              </article>
              <article class="storyboard-meta-card">
                <span>时间</span>
                <strong>{{ item.plan.time }}</strong>
              </article>
              <article class="storyboard-meta-card">
                <span>主体</span>
                <strong>{{ item.plan.subject }}</strong>
              </article>
              <article class="storyboard-meta-card">
                <span>构图</span>
                <strong>{{ item.plan.composition }}</strong>
              </article>
            </div>

            <div class="storyboard-detail-grid">
              <article class="storyboard-detail-card">
                <span>动作</span>
                <p>{{ item.plan?.action || item.prompt }}</p>
              </article>
              <article class="storyboard-detail-card">
                <span>光线</span>
                <p>{{ item.plan?.lighting || '暂无结构化光线信息' }}</p>
              </article>
            </div>

            <article class="storyboard-prompt-box">
              <span>出图提示</span>
              <p>{{ item.plan?.finalImagePrompt || item.prompt }}</p>
            </article>
          </div>

          <aside class="storyboard-media">
            <div class="storyboard-preview" :class="{ empty: !item.imageUrl }">
              <img v-if="item.imageUrl" class="storyboard-thumb" :src="item.imageUrl" :alt="item.title" />
              <p v-else class="muted">暂无图片</p>
            </div>
            <div class="storyboard-media-actions">
              <a v-if="item.imageUrl" :href="item.imageUrl" target="_blank" rel="noreferrer">查看原图</a>
              <input type="file" accept="image/*" @change="onRowFileChange(item.id, $event)" />
              <div class="storyboard-action-row">
                <button :disabled="!rowFiles[item.id] || loading" @click="uploadSingle(item.id)">替换图片</button>
                <button :disabled="!rowFiles[item.id] || loading" @click="openCropForStoryboard(item.id)">裁剪后替换</button>
              </div>
            </div>
          </aside>
          </article>
        </div>
        <p class="muted" v-else>暂无分镜</p>
      </section>

      <template #inspector>
        <section class="panel">
          <h3>当前聚焦</h3>
          <template v-if="activeStoryboard">
            <p class="muted">status={{ activeStoryboard.status }} / script={{ activeStoryboard.scriptId }}</p>
            <h4>{{ activeStoryboard.plan?.shotTitle || activeStoryboard.title }}</h4>
            <p class="muted">场景：{{ activeStoryboard.plan?.scene || '未结构化' }}</p>
            <p class="muted">时间：{{ activeStoryboard.plan?.time || '-' }}</p>
            <p class="muted">主体：{{ activeStoryboard.plan?.subject || '-' }}</p>
            <p class="muted">构图：{{ activeStoryboard.plan?.composition || '-' }}</p>
            <div class="storyboard-preview inspector-preview" :class="{ empty: !activeStoryboard.imageUrl }">
              <img v-if="activeStoryboard.imageUrl" class="storyboard-thumb" :src="activeStoryboard.imageUrl" :alt="activeStoryboard.title" />
              <p v-else class="muted">暂无图片</p>
            </div>
          </template>
          <p v-else class="muted">当前没有可检视分镜</p>
        </section>

        <section class="panel">
          <h3>工作区状态</h3>
          <p class="muted">当前检索：{{ q || '全部' }}</p>
          <p class="muted">当前聚焦 ID：{{ activeStoryboard?.id || focusedStoryboardId || '-' }}</p>
          <p class="muted">草稿 / 已生成：{{ draftCount }} / {{ generatedCount }}</p>
        </section>
      </template>
    </DesktopWorkbenchShell>
    <ImageCropModal
      :visible="cropModalVisible"
      :file="cropModalFile"
      :submitting="loading"
      title="裁剪分镜图"
      @close="closeCropModal"
      @confirm="onCropConfirm" />
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import DesktopWorkbenchShell from '@/components/DesktopWorkbenchShell.vue';
import ImageCropModal from '@/components/ImageCropModal.vue';
import { clearToken } from '@/api/client';
import { uploadDramaImage, uploadProjectImage } from '@/api/media-upload';
import { getDramaStoryboards, getStoryboards } from '@/api/timeline-editor';
import { toSingleQuery } from '@/composables/useRouteRestoreContext';
import { Storyboard } from '@/types/models';
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

const storyboards = ref<Storyboard[]>([]);
const q = ref('');
const focusedStoryboardId = ref('');
const rowFiles = ref<Record<string, File>>({});
const loading = ref(false);
const cropModalVisible = ref(false);
const cropModalFile = ref<File | null>(null);
const cropModalStoryboardId = ref('');
const error = ref('');
const selectedStoryboardId = ref('');

const draftCount = computed(() => storyboards.value.filter((item) => item.status === 'draft').length);
const generatedCount = computed(() => storyboards.value.filter((item) => item.status === 'generated').length);
const filteredStoryboards = computed(() => {
  const keyword = q.value.trim().toLowerCase();
  if (!keyword) {
    return storyboards.value;
  }
  return storyboards.value.filter((item) =>
    `${item.id} ${item.title} ${item.plan?.shotTitle || ''} ${item.plan?.scene || ''} ${item.plan?.subject || ''}`
      .toLowerCase()
      .includes(keyword)
  );
});
const visibleStoryboards = computed(() => filteredStoryboards.value.slice(0, 30));
const activeStoryboard = computed(() => {
  const activeId = selectedStoryboardId.value || focusedStoryboardId.value;
  if (activeId) {
    const matched = storyboards.value.find((item) => item.id === activeId);
    if (matched) {
      return matched;
    }
  }
  return visibleStoryboards.value[0] || null;
});

const logout = () => {
  clearToken();
  void router.replace('/login');
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

const goFramePrompts = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/frame-prompts`, `/dramas/${dramaId.value}/frame-prompts`),
    query: buildQuery()
  });
};

const goTimeline = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/timeline`, `/dramas/${dramaId.value}/timeline`),
    query: buildQuery()
  });
};

const onRowFileChange = (storyboardId: string, event: Event): void => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  rowFiles.value = { ...rowFiles.value, [storyboardId]: file };
};

const selectStoryboard = (storyboardId: string): void => {
  selectedStoryboardId.value = storyboardId;
};

const applyUpdatedStoryboard = (updated: Storyboard): void => {
  storyboards.value = storyboards.value.map((item) => (item.id === updated.id ? updated : item));
};

const uploadSingle = async (storyboardId: string): Promise<void> => {
  const file = rowFiles.value[storyboardId];
  if (!file) {
    return;
  }
  loading.value = true;
  try {
    const payload = {
      file,
      purpose: 'storyboard' as const,
      storyboardId
    };
    const output = dramaId.value ? await uploadDramaImage(dramaId.value, payload) : await uploadProjectImage(projectId.value, payload);
    if (output.storyboard) {
      applyUpdatedStoryboard(output.storyboard);
    }
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '上传失败';
  } finally {
    loading.value = false;
  }
};

const openCropForStoryboard = (storyboardId: string): void => {
  const file = rowFiles.value[storyboardId];
  if (!file) {
    return;
  }
  cropModalStoryboardId.value = storyboardId;
  cropModalFile.value = file;
  cropModalVisible.value = true;
};

const closeCropModal = (): void => {
  cropModalVisible.value = false;
  cropModalFile.value = null;
  cropModalStoryboardId.value = '';
};

const onCropConfirm = async (file: File): Promise<void> => {
  const storyboardId = cropModalStoryboardId.value;
  if (!storyboardId) {
    closeCropModal();
    return;
  }
  rowFiles.value = { ...rowFiles.value, [storyboardId]: file };
  closeCropModal();
  await uploadSingle(storyboardId);
};

const refreshAll = async (): Promise<void> => {
  try {
    projectId.value = await resolveProjectIdFromRouteContext({
      currentProjectId: projectId.value,
      routeProjectId: routeProjectId.value,
      routeDramaId: dramaId.value || routeDramaId.value
    });
    if (!projectId.value && !dramaId.value) {
      error.value = '无法解析项目上下文';
      return;
    }
    storyboards.value = dramaId.value ? await getDramaStoryboards(dramaId.value) : await getStoryboards(projectId.value);
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
  }
};

const applyRouteStoryboardScope = (): void => {
  const storyboardId = toSingleQuery(route.query).storyboardId;
  if (typeof storyboardId !== 'string' || !storyboardId.trim()) {
    focusedStoryboardId.value = '';
    return;
  }
  focusedStoryboardId.value = storyboardId;
  selectedStoryboardId.value = storyboardId;
  if (!q.value.trim()) {
    q.value = storyboardId;
  }
  window.setTimeout(() => {
    const target = document.getElementById(`storyboard-card-${storyboardId}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 80);
};

onMounted(async () => {
  await refreshAll();
  applyRouteStoryboardScope();
});
</script>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.storyboard-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.storyboard-toolbar input {
  min-width: 320px;
}

.storyboard-grid {
  display: grid;
  gap: 16px;
}

.storyboard-card {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) 360px;
  gap: 18px;
  align-items: start;
  cursor: pointer;
}

.storyboard-card--active {
  border-color: #2f6fec;
  box-shadow: 0 0 0 2px rgba(47, 111, 236, 0.2);
}

.storyboard-copy {
  min-width: 0;
}

.storyboard-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.storyboard-kicker {
  margin: 0 0 4px;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #2f6fec;
}

.storyboard-heading h4 {
  margin: 0;
}

.storyboard-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.storyboard-meta-card,
.storyboard-detail-card,
.storyboard-prompt-box {
  border: 1px solid #d6deef;
  border-radius: 12px;
  background: linear-gradient(180deg, #fbfcff 0%, #f4f7ff 100%);
}

.storyboard-meta-card {
  padding: 12px 14px;
}

.storyboard-meta-card span,
.storyboard-detail-card span,
.storyboard-prompt-box span {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: #6a7486;
}

.storyboard-meta-card strong {
  display: block;
  font-size: 15px;
  line-height: 1.4;
  color: #132238;
}

.storyboard-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.storyboard-detail-card {
  padding: 12px 14px;
}

.storyboard-detail-card p,
.storyboard-prompt-box p {
  margin: 0;
  line-height: 1.6;
  color: #132238;
}

.storyboard-prompt-box {
  padding: 14px;
}

.storyboard-media {
  display: grid;
  gap: 12px;
}

.storyboard-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  padding: 10px;
  border: 1px solid #d6deef;
  border-radius: 12px;
  background:
    radial-gradient(circle at top, rgba(47, 111, 236, 0.12), transparent 48%),
    linear-gradient(180deg, #f5f8ff 0%, #edf3ff 100%);
}

.storyboard-preview.empty {
  color: #6a7486;
}

.inspector-preview {
  margin-top: 12px;
}

.storyboard-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 8px;
  background: #f5f8ff;
}

.storyboard-media-actions {
  display: grid;
  gap: 10px;
}

.storyboard-media-actions a {
  color: #2f6fec;
  font-weight: 600;
}

.storyboard-action-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.route-focus {
  border-color: #2f6fec;
  box-shadow: 0 0 0 2px rgba(47, 111, 236, 0.2);
}

@media (max-width: 1100px) {
  .storyboard-card {
    grid-template-columns: 1fr;
  }

  .storyboard-media {
    order: -1;
  }
}

@media (max-width: 760px) {
  .storyboard-toolbar,
  .storyboard-heading,
  .storyboard-detail-grid,
  .storyboard-meta-grid,
  .storyboard-action-row {
    grid-template-columns: 1fr;
    display: grid;
  }

  .storyboard-toolbar input {
    min-width: 0;
    width: 100%;
  }
}
</style>
