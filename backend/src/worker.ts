import { env } from './config/env.js';
import { SqliteStore } from './db/sqlite.js';
import { createAiProvider } from './modules/pipeline/providers/factory.js';
import { PipelineService } from './modules/pipeline/pipeline.service.js';

const store = new SqliteStore(env.dataFile);
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

const pipelineService = new PipelineService(store, aiProvider, env.videoMaxConcurrent, {
  ffmpegBin: env.ffmpegBin,
  videoMergeOutputDir: env.videoMergeOutputDir,
  videoMergeEngine: env.videoMergeEngine,
  queueBackend: env.queueBackend,
  queueRedisUrl: env.queueRedisUrl,
  queueName: env.queueName,
  queueDriver: 'external',
  queueLoopEnabled: true,
  queueLeaseOwnerId: env.queueLeaseOwnerId || `worker-${process.pid}`,
  queueLeaseTtlMs: env.queueLeaseTtlMs,
  failureInjectionEnabled: env.failureInjectionEnabled,
  failureInjectionTaskTypes: env.failureInjectionTaskTypes,
  failureInjectionErrorCodes: env.failureInjectionErrorCodes,
  failureInjectionRatio: env.failureInjectionRatio
});

console.log(
  `[Worker] started with owner=${env.queueLeaseOwnerId || `worker-${process.pid}`}, dataFile=${env.dataFile}, maxConcurrent=${env.videoMaxConcurrent}`
);

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await pipelineService.shutdown();
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
