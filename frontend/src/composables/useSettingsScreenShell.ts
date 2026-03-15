import { onMounted } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';
import { clearToken } from '@/api/client';

type UseSettingsScreenShellOptions = {
  route: RouteLocationNormalizedLoaded;
  router: Router;
  applyRouteLogFilters: () => void;
  loadAll: () => Promise<void>;
  runRouteRestoreScroll: () => void;
};

export const useSettingsScreenShell = (options: UseSettingsScreenShellOptions) => {
  const goHome = async (): Promise<void> => {
    await options.router.push('/dramas');
  };

  const logout = async (): Promise<void> => {
    clearToken();
    await options.router.push('/login');
  };

  onMounted(async () => {
    options.applyRouteLogFilters();
    await options.loadAll();
    options.runRouteRestoreScroll();
    if (options.route.hash === '#auto-repair-logs') {
      const element = document.getElementById('auto-repair-logs');
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  return {
    goHome,
    logout
  };
};
