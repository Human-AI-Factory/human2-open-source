import { ensureDramaDomainByProject, getDramaById } from '@/api/domain-context';

export const resolveProjectIdFromRouteContext = async (input: {
  currentProjectId?: string;
  routeProjectId?: string;
  routeDramaId?: string;
}): Promise<string> => {
  const currentProjectId = input.currentProjectId?.trim() || '';
  if (currentProjectId) {
    return currentProjectId;
  }
  const routeProjectId = input.routeProjectId?.trim() || '';
  if (routeProjectId) {
    return routeProjectId;
  }
  const routeDramaId = input.routeDramaId?.trim() || '';
  if (!routeDramaId) {
    return '';
  }
  const drama = await getDramaById(routeDramaId).catch(() => null);
  return drama?.projectId || '';
};

export const ensureDramaIdFromProjectContext = async (input: {
  projectId?: string;
  fallbackName?: string;
  fallbackDescription?: string;
}): Promise<string> => {
  const projectId = input.projectId?.trim() || '';
  if (!projectId) {
    return '';
  }
  const drama = await ensureDramaDomainByProject(projectId, {
    name: input.fallbackName || 'Untitled Drama',
    description: input.fallbackDescription
  }).catch(() => null);
  return drama?.id || '';
};

export const resolveDramaIdForNavigation = async (input: {
  preferredDramaId?: string;
  projectId?: string;
  fallbackName?: string;
  fallbackDescription?: string;
}): Promise<string> => {
  const preferredDramaId = input.preferredDramaId?.trim() || '';
  if (preferredDramaId) {
    return preferredDramaId;
  }
  return ensureDramaIdFromProjectContext({
    projectId: input.projectId,
    fallbackName: input.fallbackName,
    fallbackDescription: input.fallbackDescription
  });
};

export const buildDramaFallbackMessage = (fallbackText: string, err?: unknown): string => {
  if (!err) {
    return fallbackText;
  }
  if (err instanceof Error && err.message.trim()) {
    return `${err.message}，${fallbackText}`;
  }
  return `解析 Drama 上下文失败，${fallbackText}`;
};

export const buildDramaScopedPath = (input: {
  dramaId?: string;
  projectPath: string;
  dramaPath: string;
}): string => {
  const dramaId = input.dramaId?.trim() || '';
  return dramaId ? input.dramaPath : input.projectPath;
};

export const buildDramaScopedQuery = (
  dramaId?: string,
  extra?: Record<string, string | undefined>
): Record<string, string> => {
  const query: Record<string, string> = {};
  const scopedDramaId = dramaId?.trim() || '';
  if (scopedDramaId) {
    query.dramaId = scopedDramaId;
  }
  if (!extra) {
    return query;
  }
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === 'string' && value.length > 0) {
      query[key] = value;
    }
  }
  return query;
};
