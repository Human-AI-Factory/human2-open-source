import { computed, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toSingleQuery } from '@/composables/useRouteRestoreContext';
import type { EpisodeDomain, TimelineClip } from '@/types/models';
import { buildDramaScopedPath, buildDramaScopedQuery } from '@/utils/route-context';

type UseTimelineRouteScopeOptions = {
  projectId: Ref<string>;
  selectedEpisodeId: Ref<string>;
  episodes: Ref<EpisodeDomain[]>;
  clips: Ref<TimelineClip[]>;
  selectedClip: Ref<{ storyboardId?: string | null } | null>;
  selectedClipIndex: Ref<number>;
  selectedClipIndices: Ref<number[]>;
  batchToolRestoredTip: Ref<string>;
  focusSelectedClipPlayhead: () => void;
};

export const useTimelineRouteScope = (options: UseTimelineRouteScopeOptions) => {
  const route = useRoute();
  const router = useRouter();
  const routeProjectId = computed(() => String(route.params.id || ''));
  const routeDramaId = computed(() => String(route.params.dramaId || ''));
  const dramaId = computed(() => {
    if (routeDramaId.value) {
      return routeDramaId.value;
    }
    return toSingleQuery(route.query).dramaId || '';
  });
  const hasDramaScopedApi = computed(() => Boolean(dramaId.value));

  const buildPath = (projectPath: string, dramaPath: string): string =>
    buildDramaScopedPath({ dramaId: dramaId.value, projectPath, dramaPath });
  const buildScopedQuery = (extra?: Record<string, string | undefined>): Record<string, string> =>
    buildDramaScopedQuery(dramaId.value, extra);

  const goProject = (): void => {
    void router.push({
      path: buildPath(`/projects/${options.projectId.value}`, `/dramas/${dramaId.value}`),
      query: buildScopedQuery()
    });
  };

  const getScopeQuery = (): Record<string, string> =>
    buildScopedQuery({
      episodeId: options.selectedEpisodeId.value || undefined
    });

  const getSelectedStoryboardScope = (): string | undefined => {
    const value = options.selectedClip.value?.storyboardId;
    return typeof value === 'string' && value.trim() ? value : undefined;
  };

  const goStoryboardWorkbench = (): void => {
    void router.push({
      path: buildPath(`/projects/${options.projectId.value}/storyboard-workbench`, `/dramas/${dramaId.value}/storyboard-workbench`),
      query: {
        ...getScopeQuery(),
        storyboardId: getSelectedStoryboardScope()
      }
    });
  };

  const goFramePromptWorkbench = (): void => {
    void router.push({
      path: buildPath(`/projects/${options.projectId.value}/frame-prompts`, `/dramas/${dramaId.value}/frame-prompts`),
      query: {
        ...getScopeQuery(),
        storyboardId: getSelectedStoryboardScope()
      }
    });
  };

  const goAssetWorkbench = (): void => {
    void router.push({
      path: buildPath(`/projects/${options.projectId.value}/asset-workbench`, `/dramas/${dramaId.value}/asset-workbench`),
      query: {
        ...getScopeQuery(),
        storyboardId: getSelectedStoryboardScope()
      }
    });
  };

  const applyRouteEpisodePreset = (): void => {
    const query = toSingleQuery(route.query);
    const episodeId = query.episodeId;
    if (typeof episodeId === 'string' && episodeId.trim()) {
      const exists = options.episodes.value.some((item) => item.id === episodeId);
      if (exists) {
        options.selectedEpisodeId.value = episodeId;
      }
    }
    const timelineTool = query.timelineTool;
    if (timelineTool === 'batch') {
      options.batchToolRestoredTip.value = '已从分享链接恢复：批处理工具定位';
      window.setTimeout(() => {
        const target = document.getElementById('timeline-batch-tools');
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    } else {
      options.batchToolRestoredTip.value = '';
    }
  };

  const applyRouteStoryboardPreset = (): void => {
    const storyboardId = toSingleQuery(route.query).storyboardId;
    if (typeof storyboardId !== 'string' || !storyboardId.trim()) {
      return;
    }
    const idx = options.clips.value.findIndex((item) => item.storyboardId === storyboardId);
    if (idx < 0) {
      return;
    }
    options.selectedClipIndex.value = idx;
    options.selectedClipIndices.value = [idx];
    options.focusSelectedClipPlayhead();
  };

  return {
    applyRouteEpisodePreset,
    applyRouteStoryboardPreset,
    buildPath,
    buildScopedQuery,
    dramaId,
    goAssetWorkbench,
    goFramePromptWorkbench,
    goProject,
    goStoryboardWorkbench,
    hasDramaScopedApi,
    route,
    routeDramaId,
    routeProjectId,
    router
  };
};
