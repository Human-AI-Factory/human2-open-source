<template>
  <AppShell fullWidth showLogout @logout="logout">
    <DesktopWorkbenchShell>
      <template #rail>
        <section class="panel">
          <div class="inline-between">
            <div>
              <h2>Asset Workbench</h2>
              <p class="muted">域对象与角色库治理入口</p>
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
              <p class="muted">资产总数</p>
              <h4>{{ assets.length }}</h4>
            </article>
            <article class="card">
              <p class="muted">character</p>
              <h4>{{ characterCount }}</h4>
            </article>
            <article class="card">
              <p class="muted">scene</p>
              <h4>{{ sceneCount }}</h4>
            </article>
            <article class="card">
              <p class="muted">prop</p>
              <h4>{{ propCount }}</h4>
            </article>
          </div>
        </section>

        <section class="panel">
          <h3>入口</h3>
          <div class="actions">
            <button class="primary" @click="goDomainEntities">Domain Entity Workbench</button>
            <button class="primary" @click="goLibrary">Library Workbench</button>
          </div>
        </section>
      </template>

      <section class="panel">
        <h3>对象化上传（批量 + 重试）</h3>
        <div class="actions">
          <select v-model="typeFilter">
            <option value="">全部类型</option>
            <option value="character">character</option>
            <option value="scene">scene</option>
            <option value="prop">prop</option>
          </select>
          <input v-model="q" placeholder="搜索资产名/分镜ID" />
          <label class="check-inline"><input type="checkbox" :checked="isAllVisibleSelected" @change="toggleSelectVisible(($event.target as HTMLInputElement).checked)" /> 全选当前筛选</label>
          <button @click="triggerBatchFilePicker">选择批量文件</button>
          <input ref="batchFileInputRef" class="hidden-input" type="file" accept="image/*" multiple @change="onBatchFileChange" />
          <button class="primary" :disabled="selectedAssetIds.length === 0 || batchFiles.length === 0 || loading" @click="runBatchUpload">
            批量上传（{{ selectedAssetIds.length }}）
          </button>
          <button :disabled="failedAssetIds.length === 0 || loading" @click="retryFailedUploads">重试失败（{{ failedAssetIds.length }}）</button>
        </div>
        <p class="muted">已选批量文件：{{ batchFiles.length }} 个</p>

        <!-- 剧本资产（DomainEntity）- 从剧本分析提取的角色和场景 -->
        <div v-if="episodeId && (episodeDomainEntities.characters.length > 0 || episodeDomainEntities.scenes.length > 0)" class="domain-entities-section">
          <h3>📋 剧本资产（从剧本自动提取）</h3>
          <div class="domain-entities-grid">
            <!-- 角色 -->
            <div v-if="episodeDomainEntities.characters.length > 0" class="domain-entity-group">
              <h4>🎭 角色 ({{ episodeDomainEntities.characters.length }})</h4>
              <div class="domain-entity-list">
                <div v-for="char in episodeDomainEntities.characters" :key="char.id" class="domain-entity-card">
                  <img v-if="char.imageUrl" :src="char.imageUrl" :alt="char.name" class="entity-thumb" />
                  <div v-else class="entity-thumb-placeholder">🎭</div>
                  <div class="entity-info">
                    <strong>{{ char.name }}</strong>
                    <p class="muted">{{ char.prompt?.slice(0, 50) }}...</p>
                  </div>
                </div>
              </div>
            </div>
            <!-- 场景 -->
            <div v-if="episodeDomainEntities.scenes.length > 0" class="domain-entity-group">
              <h4>🏞️ 场景 ({{ episodeDomainEntities.scenes.length }})</h4>
              <div class="domain-entity-list">
                <div v-for="scene in episodeDomainEntities.scenes" :key="scene.id" class="domain-entity-card">
                  <img v-if="scene.imageUrl" :src="scene.imageUrl" :alt="scene.name" class="entity-thumb" />
                  <div v-else class="entity-thumb-placeholder">🏞️</div>
                  <div class="entity-info">
                    <strong>{{ scene.name }}</strong>
                    <p class="muted">{{ scene.prompt?.slice(0, 50) }}...</p>
                  </div>
                </div>
              </div>
            </div>
            <!-- 道具 -->
            <div v-if="episodeDomainEntities.props.length > 0" class="domain-entity-group">
              <h4>🎫 道具 ({{ episodeDomainEntities.props.length }})</h4>
              <div class="entity-list">
                <div v-for="prop in episodeDomainEntities.props" :key="prop.id" class="domain-entity-card">
                  <div class="entity-info">
                    <strong>{{ prop.name }}</strong>
                    <p class="muted">{{ prop.prompt?.slice(0, 50) }}...</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 无剧本资产提示 -->
        <div v-else-if="episodeId" class="empty-domain-entities">
          <p>暂无剧本资产</p>
          <p class="muted">请先生成分镜，系统会自动从剧本中提取角色和场景</p>
        </div>

        <div class="list" v-if="filteredAssets.length > 0">
          <article
            class="card asset-card"
            :class="{
              'route-focus': focusedStoryboardId && item.storyboardId === focusedStoryboardId,
              'asset-card--active': activeAsset?.id === item.id
            }"
            :id="`asset-card-${item.id}`"
            v-for="item in filteredAssets"
            :key="item.id"
            @click="selectAsset(item.id)">
          <div>
            <h4>[{{ item.type }}] {{ item.name }}</h4>
            <p class="muted">
              assetId={{ item.id }} / storyboardId={{ item.storyboardId }} / {{ item.scope === 'base' ? '主资产' : '镜头变体' }}
            </p>
            <p class="muted">
              共享范围：{{ item.shareScope === 'shared' ? '共用库' : '项目私有' }}
              <span v-if="item.baseAssetId"> / baseAssetId={{ item.baseAssetId }}</span>
            </p>
            <p v-if="item.statePrompt" class="muted">状态描述：{{ item.statePrompt }}</p>
            <img v-if="item.imageUrl" class="asset-thumb" :src="item.imageUrl" :alt="item.name" />
            <div v-if="item.type === 'character'" class="voice-profile">
              <p class="muted">人物音色绑定：{{ item.voiceProfile?.voice ? `${item.voiceProfile.voice}${item.voiceProfile.provider ? ' (' + item.voiceProfile.provider + ')' : ''}` : '未绑定' }}</p>
              <div class="voice-binding-row">
                <select v-model="selectedVoiceModel[item.id]" @change="onVoiceModelChange(item.id)">
                  <option value="">选择音色厂商</option>
                  <option v-for="model in audioModels" :key="model.id" :value="model.id">
                    {{ model.name }}
                  </option>
                </select>
                <select v-model="voiceDrafts[item.id]" :disabled="!selectedVoiceModel[item.id]">
                  <option value="">选择音色</option>
                  <option v-for="voice in (availableVoices[selectedVoiceModel[item.id]]?.voices || [])" :key="voice" :value="voice">
                    {{ voice }}
                  </option>
                </select>
                <button :disabled="voiceSavingAssetId === item.id || loading || !voiceDrafts[item.id]" @click="saveVoiceProfile(item)">
                  {{ voiceSavingAssetId === item.id ? '保存中...' : '保存音色' }}
                </button>
              </div>
              <p v-if="selectedVoiceModel[item.id] && availableVoices[selectedVoiceModel[item.id]]?.voiceCloning" class="muted voice-cloning-note">
                此厂商支持语音克隆，可上传音频样本生成自定义音色
              </p>
              <p v-else-if="selectedVoiceModel[item.id] && !availableVoices[selectedVoiceModel[item.id]]?.voiceCloning" class="muted voice-cloning-note">
                此厂商不支持语音克隆，仅可使用预设音色
              </p>
            </div>
            <p class="muted" v-if="uploadState[item.id]">
              状态：{{ uploadState[item.id].status }}<span v-if="uploadState[item.id].message"> / {{ uploadState[item.id].message }}</span>
            </p>
          </div>
          <div class="actions">
            <label class="check-inline">
              <input type="checkbox" :checked="selectedAssetIds.includes(item.id)" @change="toggleSelectAsset(item.id, ($event.target as HTMLInputElement).checked)" />
              选中
            </label>
            <input type="file" accept="image/*" @change="onRowFileChange(item.id, $event)" />
            <button :disabled="!rowFiles[item.id] || loading" @click="uploadSingle(item.id)">上传此项</button>
            <button :disabled="!rowFiles[item.id] || loading" @click="openCropForAsset(item.id)">裁剪后上传</button>
            <button :disabled="uploadState[item.id]?.status !== 'failed' || loading" @click="retrySingle(item.id)">重试</button>
            <button class="danger" :disabled="loading" @click="deleteAssetById(item.id)">删除</button>
          </div>
          </article>
        </div>
        <p class="muted" v-else>暂无匹配资产</p>
      </section>

      <template #inspector>
        <section class="panel">
          <h3>当前资产</h3>
          <template v-if="activeAsset">
            <p class="muted">类型：{{ activeAsset.type }}</p>
            <p class="muted">层级：{{ activeAsset.scope === 'base' ? '主资产' : '镜头变体' }}</p>
            <p class="muted">共享：{{ activeAsset.shareScope === 'shared' ? '共用库' : '项目私有' }}</p>
            <p class="muted">storyboardId：{{ activeAsset.storyboardId }}</p>
            <p v-if="activeAsset.baseAssetId" class="muted">baseAssetId：{{ activeAsset.baseAssetId }}</p>
            <h4>{{ activeAsset.name }}</h4>
            <img v-if="activeAsset.imageUrl" class="asset-thumb inspector-asset-thumb" :src="activeAsset.imageUrl" :alt="activeAsset.name" />
            <p class="muted" v-else>暂无图片</p>
            <p v-if="activeAsset.statePrompt" class="muted">{{ activeAsset.statePrompt }}</p>
            <p class="muted" v-if="activeAsset.type === 'character'">音色：{{ activeAsset.voiceProfile?.voice || '未绑定' }}</p>
          </template>
          <p v-else class="muted">当前没有可检视资产</p>
        </section>

        <section class="panel">
          <h3>批处理状态</h3>
          <p class="muted">当前筛选：{{ typeFilter || '全部' }}</p>
          <p class="muted">已选资产：{{ selectedAssetIds.length }}</p>
          <p class="muted">批量文件：{{ batchFiles.length }}</p>
          <p class="muted">失败待重试：{{ failedAssetIds.length }}</p>
        </section>
      </template>
    </DesktopWorkbenchShell>
    <ImageCropModal
      :visible="cropModalVisible"
      :file="cropModalFile"
      :submitting="loading"
      title="裁剪资产图片"
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
import { getAssets, getDramaAssets, getEpisodeAssets, getEpisodeDomainEntities, updateAsset, updateDramaAsset, deleteAsset, deleteDramaAsset } from '@/api/assets';
import { getModelConfigs, getModelVoices } from '@/api/settings-admin';
import { clearToken } from '@/api/client';
import {
  uploadDramaCharacterImage,
  uploadDramaPropImage,
  uploadDramaSceneImage,
  uploadProjectCharacterImage,
  uploadProjectPropImage,
  uploadProjectSceneImage
} from '@/api/media-upload';
import { toSingleQuery } from '@/composables/useRouteRestoreContext';
import { Asset } from '@/types/models';
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

const episodeId = computed(() => {
  return toSingleQuery(route.query).episodeId || '';
});

const assets = ref<Asset[]>([]);

interface DomainEntityItem {
  id: string;
  name: string;
  prompt: string;
  imageUrl?: string | null;
}

const episodeDomainEntities = ref<{
  characters: DomainEntityItem[];
  scenes: DomainEntityItem[];
  props: DomainEntityItem[];
}>({
  characters: [],
  scenes: [],
  props: []
});
const error = ref('');
const loading = ref(false);

const typeFilter = ref<'' | 'character' | 'scene' | 'prop'>('');
const q = ref('');
const focusedStoryboardId = ref('');

const selectedAssetIds = ref<string[]>([]);
const rowFiles = ref<Record<string, File>>({});
const batchFiles = ref<File[]>([]);
const batchFileInputRef = ref<HTMLInputElement | null>(null);
const uploadState = ref<Record<string, { status: 'idle' | 'uploading' | 'done' | 'failed'; message?: string }>>({});
const voiceDrafts = ref<Record<string, string>>({});
const voiceSavingAssetId = ref('');
// Audio model voices
const audioModels = ref<Array<{ id: string; name: string; manufacturer: string }>>([]);
const selectedVoiceModel = ref<Record<string, string>>({});
const availableVoices = ref<Record<string, { voices: string[]; voiceCloning: boolean; voiceCloningNote: string | null }>>({});
const voiceLoading = ref(false);
const cropModalVisible = ref(false);
const cropModalFile = ref<File | null>(null);
const cropModalAssetId = ref('');
const selectedAssetId = ref('');

const characterCount = computed(() => assets.value.filter((item) => item.type === 'character').length);
const sceneCount = computed(() => assets.value.filter((item) => item.type === 'scene').length);
const propCount = computed(() => assets.value.filter((item) => item.type === 'prop').length);

const filteredAssets = computed(() => {
  const keyword = q.value.trim().toLowerCase();
  return assets.value.filter((item) => {
    if (typeFilter.value && item.type !== typeFilter.value) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    return `${item.name} ${item.storyboardId}`.toLowerCase().includes(keyword);
  });
});

const isAllVisibleSelected = computed(
  () => filteredAssets.value.length > 0 && filteredAssets.value.every((item) => selectedAssetIds.value.includes(item.id))
);

const failedAssetIds = computed(() =>
  Object.entries(uploadState.value)
    .filter(([, state]) => state.status === 'failed')
    .map(([assetId]) => assetId)
);
const activeAsset = computed(() => {
  const activeId = selectedAssetId.value;
  if (activeId) {
    const matched = assets.value.find((item) => item.id === activeId);
    if (matched) {
      return matched;
    }
  }
  return filteredAssets.value[0] || null;
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

const goDomainEntities = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/domain-entities`, `/dramas/${dramaId.value}/domain-entities`),
    query: buildQuery()
  });
};

const goLibrary = () => {
  void router.push({
    path: buildPath(`/projects/${projectId.value}/library-workbench`, `/dramas/${dramaId.value}/library-workbench`),
    query: buildQuery()
  });
};

const refreshAll = async (): Promise<void> => {
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
    // Priority: episodeId > dramaId > project
    if (episodeId.value) {
      assets.value = await getEpisodeAssets(projectId.value, episodeId.value);
      // Load domain entities (script-level assets)
      const domainEntities = await getEpisodeDomainEntities(projectId.value, episodeId.value);
      episodeDomainEntities.value = domainEntities;
    } else if (dramaId.value) {
      assets.value = await getDramaAssets(dramaId.value);
    } else {
      assets.value = await getAssets(projectId.value);
    }
    voiceDrafts.value = Object.fromEntries(
      assets.value
        .filter((item) => item.type === 'character')
        .map((item) => [item.id, item.voiceProfile?.voice ?? ''])
    );
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
  if (!q.value.trim()) {
    q.value = storyboardId;
  }
  const first = assets.value.find((item) => item.storyboardId === storyboardId);
  if (!first) {
    return;
  }
  selectedAssetId.value = first.id;
  window.setTimeout(() => {
    const target = document.getElementById(`asset-card-${first.id}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 80);
};

const selectAsset = (assetId: string): void => {
  selectedAssetId.value = assetId;
};

const toggleSelectAsset = (assetId: string, checked: boolean): void => {
  const set = new Set(selectedAssetIds.value);
  if (checked) {
    set.add(assetId);
  } else {
    set.delete(assetId);
  }
  selectedAssetIds.value = [...set];
};

const toggleSelectVisible = (checked: boolean): void => {
  selectedAssetIds.value = checked ? filteredAssets.value.map((item) => item.id) : [];
};

const onRowFileChange = (assetId: string, event: Event): void => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  rowFiles.value = { ...rowFiles.value, [assetId]: file };
};

const openCropForAsset = (assetId: string): void => {
  const file = rowFiles.value[assetId];
  if (!file) {
    return;
  }
  cropModalAssetId.value = assetId;
  cropModalFile.value = file;
  cropModalVisible.value = true;
};

const closeCropModal = (): void => {
  cropModalVisible.value = false;
  cropModalFile.value = null;
  cropModalAssetId.value = '';
};

const onCropConfirm = async (file: File): Promise<void> => {
  const assetId = cropModalAssetId.value;
  if (!assetId) {
    closeCropModal();
    return;
  }
  rowFiles.value = { ...rowFiles.value, [assetId]: file };
  closeCropModal();
  await uploadSingle(assetId);
};

const triggerBatchFilePicker = (): void => {
  batchFileInputRef.value?.click();
};

const onBatchFileChange = (event: Event): void => {
  const input = event.target as HTMLInputElement;
  batchFiles.value = input.files ? Array.from(input.files) : [];
};

const uploadByType = async (asset: Asset, file: File): Promise<Asset> => {
  if (dramaId.value) {
    if (asset.type === 'character') {
      const output = await uploadDramaCharacterImage(dramaId.value, asset.id, file);
      return output.asset;
    }
    if (asset.type === 'scene') {
      const output = await uploadDramaSceneImage(dramaId.value, asset.id, file);
      return output.asset;
    }
    const output = await uploadDramaPropImage(dramaId.value, asset.id, file);
    return output.asset;
  }
  if (asset.type === 'character') {
    const output = await uploadProjectCharacterImage(projectId.value, asset.id, file);
    return output.asset;
  }
  if (asset.type === 'scene') {
    const output = await uploadProjectSceneImage(projectId.value, asset.id, file);
    return output.asset;
  }
  const output = await uploadProjectPropImage(projectId.value, asset.id, file);
  return output.asset;
};

const applyUpdatedAsset = (updated: Asset): void => {
  assets.value = assets.value.map((item) => (item.id === updated.id ? updated : item));
  if (updated.type === 'character') {
    voiceDrafts.value = { ...voiceDrafts.value, [updated.id]: updated.voiceProfile?.voice ?? '' };
  }
};

const onVoiceModelChange = (assetId: string): void => {
  // Clear selected voice when model changes
  voiceDrafts.value[assetId] = '';
};

const saveVoiceProfile = async (asset: Asset): Promise<void> => {
  if (asset.type !== 'character') {
    return;
  }
  const voice = voiceDrafts.value[asset.id]?.trim() ?? '';
  const providerId = selectedVoiceModel.value[asset.id];
  const provider = providerId ? audioModels.value.find(m => m.id === providerId)?.manufacturer : undefined;
  voiceSavingAssetId.value = asset.id;
  loading.value = true;
  try {
    const updated = dramaId.value
      ? await updateDramaAsset(dramaId.value, asset.id, {
          voiceProfile: voice ? { voice, provider } : null,
        })
      : await updateAsset(projectId.value, asset.id, {
          voiceProfile: voice ? { voice } : null,
        });
    applyUpdatedAsset(updated);
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存音色失败';
  } finally {
    voiceSavingAssetId.value = '';
    loading.value = false;
  }
};

const uploadSingle = async (assetId: string): Promise<void> => {
  const target = assets.value.find((item) => item.id === assetId);
  const file = rowFiles.value[assetId];
  if (!target || !file) {
    return;
  }
  loading.value = true;
  uploadState.value = { ...uploadState.value, [assetId]: { status: 'uploading' } };
  try {
    const updated = await uploadByType(target, file);
    applyUpdatedAsset(updated);
    uploadState.value = { ...uploadState.value, [assetId]: { status: 'done' } };
    error.value = '';
  } catch (err) {
    const message = err instanceof Error ? err.message : '上传失败';
    uploadState.value = { ...uploadState.value, [assetId]: { status: 'failed', message } };
    error.value = message;
  } finally {
    loading.value = false;
  }
};

const retrySingle = async (assetId: string): Promise<void> => {
  await uploadSingle(assetId);
};

const runBatchUpload = async (): Promise<void> => {
  if (selectedAssetIds.value.length === 0 || batchFiles.value.length === 0) {
    return;
  }
  loading.value = true;
  try {
    const candidates = assets.value.filter((item) => selectedAssetIds.value.includes(item.id));
    let index = 0;
    for (const asset of candidates) {
      const file = batchFiles.value[index] || batchFiles.value[batchFiles.value.length - 1];
      index += 1;
      uploadState.value = { ...uploadState.value, [asset.id]: { status: 'uploading' } };
      try {
        const updated = await uploadByType(asset, file);
        applyUpdatedAsset(updated);
        uploadState.value = { ...uploadState.value, [asset.id]: { status: 'done' } };
      } catch (err) {
        const message = err instanceof Error ? err.message : '上传失败';
        uploadState.value = { ...uploadState.value, [asset.id]: { status: 'failed', message } };
      }
    }
    error.value = '';
  } finally {
    loading.value = false;
  }
};

const retryFailedUploads = async (): Promise<void> => {
  if (failedAssetIds.value.length === 0) {
    return;
  }
  loading.value = true;
  try {
    for (const assetId of failedAssetIds.value) {
      const asset = assets.value.find((item) => item.id === assetId);
      if (!asset) {
        continue;
      }
      const fallbackFile = rowFiles.value[assetId] || batchFiles.value[0];
      if (!fallbackFile) {
        continue;
      }
      uploadState.value = { ...uploadState.value, [asset.id]: { status: 'uploading' } };
      try {
        const updated = await uploadByType(asset, fallbackFile);
        applyUpdatedAsset(updated);
        uploadState.value = { ...uploadState.value, [asset.id]: { status: 'done' } };
      } catch (err) {
        const message = err instanceof Error ? err.message : '上传失败';
        uploadState.value = { ...uploadState.value, [asset.id]: { status: 'failed', message } };
      }
    }
  } finally {
    loading.value = false;
  }
};

const deleteAssetById = async (assetId: string): Promise<void> => {
  if (!confirm('确定要删除这个资产吗？此操作不可撤销。')) {
    return;
  }
  loading.value = true;
  try {
    if (dramaId.value) {
      await deleteDramaAsset(dramaId.value, assetId);
    } else {
      await deleteAsset(projectId.value, assetId);
    }
    // Remove from local state
    assets.value = assets.value.filter((item) => item.id !== assetId);
    // Clear selection if deleted asset was selected
    if (selectedAssetId.value === assetId) {
      selectedAssetId.value = '';
    }
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除资产失败';
  } finally {
    loading.value = false;
  }
};

// Load audio models and their voices
const loadAudioModels = async (): Promise<void> => {
  try {
    const models = await getModelConfigs('audio');
    audioModels.value = models.filter(m => m.enabled).map(m => ({
      id: m.id,
      name: m.name,
      manufacturer: m.manufacturer
    }));

    // Load voices for each enabled audio model
    for (const model of models.filter(m => m.enabled)) {
      try {
        const voices = await getModelVoices(model.id);
        availableVoices.value[model.id] = {
          voices: voices.voices || [],
          voiceCloning: voices.voiceCloning || false,
          voiceCloningNote: voices.voiceCloningNote || null
        };
      } catch {
        // Skip if can't get voices
      }
    }
  } catch (err) {
    console.error('Failed to load audio models:', err);
  }
};

onMounted(() => {
  void refreshAll().then(() => {
    applyRouteStoryboardScope();
  });
  void loadAudioModels();
});
</script>

<style scoped>
/* 剧本资产区域样式 */
.domain-entities-section {
  margin: 16px 0;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.domain-entities-section h3 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: #333;
}

.domain-entities-grid {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.domain-entity-group {
  flex: 1;
  min-width: 200px;
}

.domain-entity-group h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #666;
}

.domain-entity-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.domain-entity-card {
  display: flex;
  gap: 8px;
  padding: 8px;
  background: white;
  border-radius: 6px;
  border: 1px solid #dee2e6;
  align-items: center;
}

.entity-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 4px;
}

.entity-thumb-placeholder {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  background: #e9ecef;
  border-radius: 4px;
}

.entity-info {
  flex: 1;
  min-width: 0;
}

.entity-info strong {
  font-size: 13px;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entity-info p {
  margin: 0;
  font-size: 11px;
}

.empty-domain-entities {
  margin: 16px 0;
  padding: 24px;
  text-align: center;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px dashed #dee2e6;
}

.empty-domain-entities p {
  margin: 4px 0;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.hidden-input {
  display: none;
}

.asset-thumb {
  width: 160px;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border: 1px solid #d6deef;
  border-radius: 8px;
  margin-top: 8px;
  background: #f5f8ff;
}

.asset-card {
  cursor: pointer;
}

.asset-card--active {
  border-color: #2f6fec;
  box-shadow: 0 0 0 2px rgba(47, 111, 236, 0.2);
}

.inspector-asset-thumb {
  width: 100%;
  margin-top: 12px;
}

.route-focus {
  border-color: #2f6fec;
  box-shadow: 0 0 0 2px rgba(47, 111, 236, 0.2);
}

.voice-profile {
  margin-top: 10px;
}

.voice-binding-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.voice-binding-row select {
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  font-size: 13px;
  min-width: 120px;
}

.voice-binding-row input {
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
  min-width: 120px;
}

.voice-cloning-note {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

button.danger {
  background-color: #fee2e2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

button.danger:hover:not(:disabled) {
  background-color: #fecaca;
}
</style>
