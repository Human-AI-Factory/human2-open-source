import { ref } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';

type SingleQuery = Record<string, string>;

export type RouteRestoreContextKind =
  | 'scope_filter'
  | 'episode_version'
  | 'episode_scope'
  | 'storyboard_scope'
  | 'logs_filter';

const routeRestoreTipMap: Record<RouteRestoreContextKind, string> = {
  scope_filter: '页面上下文（作用域/筛选）',
  episode_version: '页面上下文（分集/版本）',
  episode_scope: '分集作用域',
  storyboard_scope: '分镜作用域',
  logs_filter: '日志筛选'
};

export const buildRouteRestoreTip = (kind: RouteRestoreContextKind): string => `已从分享链接恢复${routeRestoreTipMap[kind]}`;

export const toSingleQuery = (query: RouteLocationNormalizedLoaded['query']): SingleQuery => {
  const next: SingleQuery = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      next[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      next[key] = value[0];
    }
  }
  return next;
};

const toComparable = (query: SingleQuery): string =>
  JSON.stringify(Object.entries(query).sort((a, b) => a[0].localeCompare(b[0])));

export const replaceQueryIfChanged = async (input: {
  route: RouteLocationNormalizedLoaded;
  router: Router;
  nextQuery: SingleQuery;
  hash?: string;
}): Promise<void> => {
  const current = toSingleQuery(input.route.query);
  if (toComparable(current) === toComparable(input.nextQuery)) {
    return;
  }
  await input.router.replace({
    path: input.route.path,
    query: input.nextQuery,
    hash: input.hash ?? input.route.hash
  });
};

export const useRouteRestoreContext = () => {
  const restoreTip = ref('');
  const pendingScrollTargetId = ref('');
  const scrollDone = ref(false);

  const markRestored = (tip: string, targetId?: string): void => {
    restoreTip.value = tip;
    if (targetId && !scrollDone.value) {
      pendingScrollTargetId.value = targetId;
    }
  };

  const clearRestored = (): void => {
    restoreTip.value = '';
    pendingScrollTargetId.value = '';
    scrollDone.value = false;
  };

  const runRestoreScroll = (delayMs = 80): void => {
    if (!pendingScrollTargetId.value || scrollDone.value) {
      return;
    }
    const targetId = pendingScrollTargetId.value;
    pendingScrollTargetId.value = '';
    scrollDone.value = true;
    window.setTimeout(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, delayMs);
  };

  return {
    restoreTip,
    markRestored,
    clearRestored,
    runRestoreScroll
  };
};
