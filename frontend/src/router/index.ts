import { createRouter, createWebHistory, type LocationQueryRaw } from 'vue-router';
import { getToken } from '@/api/client';
import LoginView from '@/views/LoginView.vue';
const DramaHubView = () => import('@/views/DramaHubView.vue');
const ProjectsView = () => import('@/views/ProjectsView.vue');
const ProjectDetailView = () => import('@/views/ProjectDetailView.vue');
const TaskCenterView = () => import('@/views/TaskCenterView.vue');
const SettingsView = () => import('@/views/SettingsView.vue');
const TimelineEditorView = () => import('@/views/TimelineEditorView.vue');
const WorkflowWorkbenchView = () => import('@/views/WorkflowWorkbenchView.vue');
const DomainEntityWorkbenchView = () => import('@/views/DomainEntityWorkbenchView.vue');
const FramePromptWorkbenchView = () => import('@/views/FramePromptWorkbenchView.vue');
const LibraryWorkbenchView = () => import('@/views/LibraryWorkbenchView.vue');
const DeliveryWorkbenchView = () => import('@/views/DeliveryWorkbenchView.vue');
const StoryboardWorkbenchView = () => import('@/views/StoryboardWorkbenchView.vue');
const AssetWorkbenchView = () => import('@/views/AssetWorkbenchView.vue');
const ReviewWorkbenchView = () => import('@/views/ReviewWorkbenchView.vue');
const ProductionWorkbenchView = () => import('@/views/ProductionWorkbenchView.vue');
const EpisodeStudioView = () => import('@/views/EpisodeStudioView.vue');
const DirectorStudioView = () => import('@/views/DirectorStudioView.vue');
const ProducerConsoleView = () => import('@/views/ProducerConsoleView.vue');
const DirectorPlanningView = () => import('@/views/DirectorPlanningView.vue');
const DirectorExecutionView = () => import('@/views/DirectorExecutionView.vue');
const ProducerPlanningView = () => import('@/views/ProducerPlanningView.vue');
const ProducerDeliveryView = () => import('@/views/ProducerDeliveryView.vue');

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView },
    { path: '/', component: DramaHubView },
    { path: '/dramas', component: DramaHubView },
    { path: '/projects', component: ProjectsView },
    { path: '/projects/:id', component: ProjectDetailView },
    { path: '/dramas/:dramaId', component: ProjectDetailView },
    { path: '/projects/:id/episodes', component: EpisodeStudioView },
    { path: '/dramas/:dramaId/episodes', component: EpisodeStudioView },
    { path: '/projects/:id/storyboard-workbench', component: StoryboardWorkbenchView },
    { path: '/dramas/:dramaId/storyboard-workbench', component: StoryboardWorkbenchView },
    { path: '/projects/:id/asset-workbench', component: AssetWorkbenchView },
    { path: '/dramas/:dramaId/asset-workbench', component: AssetWorkbenchView },
    { path: '/projects/:id/assets', component: AssetWorkbenchView },
    { path: '/dramas/:dramaId/assets', component: AssetWorkbenchView },
    { path: '/projects/:id/review-workbench', component: ReviewWorkbenchView },
    { path: '/dramas/:dramaId/review-workbench', component: ReviewWorkbenchView },
    { path: '/projects/:id/production', component: ProductionWorkbenchView },
    { path: '/dramas/:dramaId/production', component: ProductionWorkbenchView },
    { path: '/projects/:id/director', component: DirectorStudioView },
    { path: '/dramas/:dramaId/director', component: DirectorStudioView },
    { path: '/projects/:id/director/planning', component: DirectorPlanningView },
    { path: '/dramas/:dramaId/director/planning', component: DirectorPlanningView },
    { path: '/projects/:id/director/execution', component: DirectorExecutionView },
    { path: '/dramas/:dramaId/director/execution', component: DirectorExecutionView },
    { path: '/projects/:id/producer', component: ProducerConsoleView },
    { path: '/dramas/:dramaId/producer', component: ProducerConsoleView },
    { path: '/projects/:id/producer/planning', component: ProducerPlanningView },
    { path: '/dramas/:dramaId/producer/planning', component: ProducerPlanningView },
    { path: '/projects/:id/producer/delivery', component: ProducerDeliveryView },
    { path: '/dramas/:dramaId/producer/delivery', component: ProducerDeliveryView },
    { path: '/projects/:id/timeline', component: TimelineEditorView },
    { path: '/dramas/:dramaId/timeline', component: TimelineEditorView },
    { path: '/projects/:id/workflow', component: WorkflowWorkbenchView },
    { path: '/dramas/:dramaId/workflow', component: WorkflowWorkbenchView },
    { path: '/projects/:id/domain-entities', component: DomainEntityWorkbenchView },
    { path: '/dramas/:dramaId/domain-entities', component: DomainEntityWorkbenchView },
    { path: '/projects/:id/frame-prompts', component: FramePromptWorkbenchView },
    { path: '/dramas/:dramaId/frame-prompts', component: FramePromptWorkbenchView },
    { path: '/projects/:id/library-workbench', component: LibraryWorkbenchView },
    { path: '/dramas/:dramaId/library-workbench', component: LibraryWorkbenchView },
    { path: '/projects/:id/delivery', component: DeliveryWorkbenchView },
    { path: '/dramas/:dramaId/delivery', component: DeliveryWorkbenchView },
    { path: '/tasks', component: TaskCenterView },
    { path: '/dramas/:dramaId/tasks', component: TaskCenterView },
    { path: '/settings', component: SettingsView }
  ]
});

router.beforeEach((to) => {
  const scopedDramaId = typeof to.query.dramaId === 'string' ? to.query.dramaId.trim() : '';
  if (scopedDramaId && to.path.startsWith('/projects/')) {
    const canonicalPath = to.path.replace(/^\/projects\/[^/]+/, `/dramas/${encodeURIComponent(scopedDramaId)}`);
    if (canonicalPath !== to.path) {
      const nextQuery: LocationQueryRaw = { ...to.query, dramaId: undefined };
      return {
        path: canonicalPath,
        query: nextQuery,
        hash: to.hash,
        replace: true
      };
    }
  }

  if (to.path === '/login') {
    return true;
  }

  if (!getToken()) {
    return '/login';
  }

  return true;
});

export default router;
