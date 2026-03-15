import fs from 'node:fs';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { SqliteStore } from './db/sqlite.js';
import { AuthService } from './modules/auth/auth.service.js';
import { buildAuthRouter } from './modules/auth/auth.routes.js';
import { buildAuthMiddleware } from './middleware/auth.js';
import { ProjectsService } from './modules/projects/projects.service.js';
import { buildProjectsRouter } from './modules/projects/projects.routes.js';
import { buildDashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { StudioService } from './modules/studio/studio.service.js';
import { buildStudioRouter } from './modules/studio/studio.routes.js';
import { PipelineService } from './modules/pipeline/pipeline.service.js';
import { buildPipelineRouter } from './modules/pipeline/pipeline.routes.js';
import { createAiProvider } from './modules/pipeline/providers/factory.js';
import { OrchestrationService } from './modules/orchestration/orchestration.service.js';
import { buildOrchestrationRouter } from './modules/orchestration/orchestration.routes.js';
import { TasksService } from './modules/tasks/tasks.service.js';
import { buildTasksRouter } from './modules/tasks/tasks.routes.js';
import { SettingsService } from './modules/settings/settings.service.js';
import { buildSettingsRouter } from './modules/settings/settings.routes.js';
import { AdminAuditService } from './modules/settings/admin-audit.service.js';
import { ModelConnectionService } from './modules/settings/model-connection.service.js';
import { LibraryService } from './modules/library/library.service.js';
import { buildLibraryRouter } from './modules/library/library.routes.js';
import { createAiModule } from './modules/ai/ai.module.js';
import { DomainService } from './modules/domain/domain.service.js';
import { createDomainModule } from './modules/domain/domain.module.js';
import { createRuntimeModule } from './modules/runtime/runtime.module.js';
import { buildDomainRouter } from './modules/domain/domain.routes.js';
import { env } from './config/env.js';
import { responseEnvelopeMiddleware } from './middleware/response.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { createRequestMetricsCollector } from './middleware/request-metrics.js';
import { BIZ_CODE } from './constants/bizCode.js';

export const sendApiNotFound = (res: Response): Response =>
  res.status(404).json({ message: 'API route not found', bizCode: BIZ_CODE.NOT_FOUND });

export const sendInternalError = (res: Response, err: unknown): Response => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  return res.status(500).json({ message, bizCode: BIZ_CODE.INTERNAL_ERROR });
};

export const buildApp = (dataFile: string, staticDir: string) => {
  const app = express();
  const requestMetrics = createRequestMetricsCollector();
  const store = new SqliteStore(dataFile);
  const aiModule = createAiModule({ store });
  const adminAuditService = new AdminAuditService(store);
  const authService = new AuthService(store, env.jwtSecret, env.jwtExpiresIn);
  const projectsService = new ProjectsService(store);
  const aiProvider = createAiProvider({
    provider: env.aiProvider,
    textEndpoint: env.aiTextEndpoint,
    imageEndpoint: env.aiImageEndpoint,
    videoEndpoint: env.aiVideoEndpoint,
    audioEndpoint: env.aiAudioEndpoint,
    timeoutMs: env.aiTimeoutMs,
    authHeader: env.aiAuthHeader,
    apiKey: env.aiApiKey,
    maxRetries: env.aiMaxRetries,
    retryDelayMs: env.aiRetryDelayMs
  });
  const studioService = new StudioService(store, aiProvider);
  const pipelineService = new PipelineService(store, aiProvider, env.videoMaxConcurrent, {
    ffmpegBin: env.ffmpegBin,
    videoMergeOutputDir: env.videoMergeOutputDir,
    videoMergeEngine: env.videoMergeEngine,
    queueDriver: env.queueDriver,
    queueBackend: env.queueBackend,
    queueRedisUrl: env.queueRedisUrl,
    queueName: env.queueName,
    queueLoopEnabled: env.queueDriver === 'internal' ? env.queueLoopEnabled : false,
    queueLeaseOwnerId: env.queueLeaseOwnerId,
    queueLeaseTtlMs: env.queueLeaseTtlMs,
    failureInjectionEnabled: env.failureInjectionEnabled,
    failureInjectionTaskTypes: env.failureInjectionTaskTypes,
    failureInjectionErrorCodes: env.failureInjectionErrorCodes,
    failureInjectionRatio: env.failureInjectionRatio
  });
  const orchestrationService = new OrchestrationService(studioService, pipelineService);
  const runtimeModule = createRuntimeModule({ store, pipelineService });
  const tasksService = new TasksService(store, pipelineService, runtimeModule);
  const settingsService = new SettingsService(store);
  const modelConnectionService = new ModelConnectionService(store, aiProvider);
  const libraryService = new LibraryService(store);
  const domainModule = createDomainModule({ store });
  const domainService = new DomainService(store, domainModule);

  app.use(cors());
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use(responseEnvelopeMiddleware);
  app.use(requestMetrics.middleware);
  app.use(morgan(':method :url :status :res[content-length] - :response-time ms requestId=:res[x-request-id]'));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'human2-backend' });
  });

  app.get('/api/health/metrics', (_req, res) => {
    res.json(requestMetrics.getSnapshot());
  });

  app.use('/api/auth', buildAuthRouter(authService));
  app.use('/api/projects', buildAuthMiddleware(authService), buildProjectsRouter(projectsService));
  app.use('/api/dashboard', buildAuthMiddleware(authService), buildDashboardRouter(projectsService));
  app.use('/api/studio', buildAuthMiddleware(authService), buildStudioRouter(studioService));
  app.use('/api/pipeline', buildAuthMiddleware(authService), buildPipelineRouter(pipelineService));
  app.use('/api/orchestration', buildAuthMiddleware(authService), buildOrchestrationRouter(orchestrationService));
  app.use('/api/tasks', buildAuthMiddleware(authService), buildTasksRouter(tasksService, { adminAuditService }));
  app.use(
    '/api/settings',
    buildAuthMiddleware(authService),
    buildSettingsRouter(settingsService, {
      providerRegistryService: aiModule.providerRegistryService,
      adminAuditService,
      modelConnectionService
    })
  );
  app.use('/api/library', buildAuthMiddleware(authService), buildLibraryRouter(libraryService));
  app.use('/api/domain', buildAuthMiddleware(authService), buildDomainRouter(domainService));

  app.use('/api', (_req, res) => {
    sendApiNotFound(res);
  });

  const resolvedStaticDir = path.resolve(process.cwd(), staticDir);
  if (fs.existsSync(resolvedStaticDir)) {
    app.use(express.static(resolvedStaticDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(resolvedStaticDir, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    sendInternalError(res, err);
  });

  return app;
};
