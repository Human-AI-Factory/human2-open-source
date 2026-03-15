export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  tasks: Task[];
}

export interface User {
  id: string;
  username: string;
  password: string;
  role: 'admin';
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProjectWorkflowSummary {
  projectId: string;
  counts: {
    novel: number;
    outline: number;
    script: number;
    storyboard: number;
    asset: number;
    videoTask: number;
    videoTaskDone: number;
    audioTask: number;
    audioTaskDone: number;
    videoMerge: number;
    videoMergeDone: number;
  };
  stage: {
    current: 'writing' | 'storyboard' | 'asset' | 'video' | 'merge' | 'done';
    nextAction:
      | 'create_novel'
      | 'generate_outline'
      | 'generate_script'
      | 'generate_storyboard'
      | 'generate_asset'
      | 'create_video_task'
      | 'create_video_merge'
      | 'optimize_result';
    progressPercent: number;
  };
}

export interface Novel {
  id: string;
  projectId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Outline {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface Script {
  id: string;
  projectId: string;
  outlineId: string;
  episodeId: string | null;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Storyboard {
  id: string;
  projectId: string;
  scriptId: string;
  episodeId: string | null;
  sceneId: string | null;
  title: string;
  prompt: string;
  plan: StoryboardPlan | null;
  imageUrl: string | null;
  /** First frame extracted from storyboard video - used for video continuity */
  firstFrameUrl: string | null;
  /** Last frame from storyboard video - used for connecting to next storyboard */
  lastFrameUrl: string | null;
  status: 'draft' | 'generated';
  createdAt: string;
  updatedAt: string;
}

export interface StoryboardPlan {
  shotTitle: string;
  continuityGroupId: string;
  scene: string;
  time: string;
  subject: string;
  action: string;
  composition: string;
  lighting: string;
  finalImagePrompt: string;
  characterIds: string[];
  sceneEntityId: string | null;
  propEntityIds: string[];
  baseSceneAssetId: string | null;
  baseCharacterAssetIds: string[];
  shotSceneStateId: string | null;
  shotCharacterStateIds: string[];
  sceneAssetId: string | null;
  characterAssetIds: string[];
  propAssetIds: string[];
}

export interface Scene {
  id: string;
  projectId: string;
  name: string;
  description: string;
  prompt: string;
  storyboardCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  projectId: string;
  storyboardId: string;
  name: string;
  type: 'character' | 'scene' | 'prop';
  scope: 'base' | 'shot';
  shareScope: 'project' | 'shared';
  baseAssetId: string | null;
  prompt: string;
  statePrompt: string | null;
  state: AssetState | null;
  imageUrl: string | null;
  /** I2V video URL for shot-level assets (generated via image-to-video) */
  videoUrl: string | null;
  /** First frame extracted from I2V video - used for storyboard generation */
  firstFrameUrl: string | null;
  /** Last frame from I2V video - used for video continuity */
  lastFrameUrl: string | null;
  voiceProfile: AssetVoiceProfile | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetState {
  emotion?: string;
  action?: string;
  pose?: string;
  costumeState?: string;
  condition?: string;
  time?: string;
  weather?: string;
  lighting?: string;
  camera?: string;
  localChange?: string;
}

export interface AssetVoiceProfile {
  voice: string;
  speed?: number;
  providerOptions?: Record<string, unknown>;
  /** Provider/manufacturer name (e.g., elevenlabs, minimax, dashscope-cosyvoice) */
  provider?: string;
}

/**
 * Episode assets result - includes both generated assets and domain entities (characters/scenes)
 */
export interface EpisodeAssetsResult {
  assets: Asset[];
  domainEntities: {
    characters: DomainEntity[];
    scenes: DomainEntity[];
    props: DomainEntity[];
  };
}

export interface StoryboardAssetRelation {
  storyboardId: string;
  assetId: string;
  role: 'scene' | 'character' | 'prop';
  createdAt: string;
}

export interface VideoTask {
  id: string;
  projectId: string;
  storyboardId: string;
  prompt: string;
  modelName: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: number;
  resultUrl: string | null;
  /** First frame extracted from generated video - used for video continuity */
  firstFrameUrl: string | null;
  /** Last frame from generated video - used for connecting to next storyboard */
  lastFrameUrl: string | null;
  error: string | null;
  providerTaskId: string | null;
  attempt: number;
  nextRetryAt: string | null;
  providerErrorCode: string | null;
  params: VideoTaskParams;
  createdAt: string;
  updatedAt: string;
}

export interface VideoTaskParams {
  mode?: 'text' | 'singleImage' | 'startEnd' | 'multiImage' | 'reference';
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  audio?: boolean;
  imageInputs?: string[];
  imageWithRoles?: Array<{
    url: string;
    role: 'first_frame' | 'last_frame' | 'reference';
  }>;
  endFrame?: string;
  providerOptions?: Record<string, unknown>;
  autoPolicyApplied?: number;
}

export interface VideoTaskListItem extends VideoTask {
  projectName: string;
  storyboardTitle: string;
}

export interface VideoTaskEvent {
  id: number;
  taskId: string;
  status: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: number;
  error: string | null;
  createdAt: string;
}

export interface VideoTaskMetrics {
  total: number;
  queued: number;
  running: number;
  done: number;
  failed: number;
  failureRate: number;
  avgQueueWaitMs: number;
  avgRunDurationMs: number;
}

export interface VideoTaskRuntimeProjectStat {
  projectId: string;
  queued: number;
  running: number;
  active: number;
}

export interface VideoTaskRuntimeSnapshot {
  heartbeatAt: string;
  isPumpRunning: boolean;
  maxConcurrent: number;
  activeWorkerCount: number;
  activeTaskIds: string[];
  queueDriver: 'internal' | 'external';
  queueBackend: 'lease' | 'bullmq';
  bullmqReady: boolean;
  bullmqWorkerEnabled: boolean;
  queueLoopEnabled: boolean;
  queueLeaseOwnerId: string;
  lockOwnerId: string | null;
  lockExpiresAt: string | null;
  lockHeartbeatAt: string | null;
  queuedProjects: number;
  queuedTotal: number;
  runningTotal: number;
  pumpCycleCount: number;
  pumpErrorCount: number;
  lastPumpStartedAt: string | null;
  lastPumpFinishedAt: string | null;
  lastPumpDurationMs: number | null;
  lastPumpError: string | null;
  projects: VideoTaskRuntimeProjectStat[];
}

export interface VideoTaskRuntimeTrendPoint {
  at: string;
  queued: number;
  running: number;
  pumpDurationMs: number;
}

export interface VideoTaskRuntimeHealth {
  snapshot: VideoTaskRuntimeSnapshot;
  trend: VideoTaskRuntimeTrendPoint[];
  congestionLevel: 'green' | 'yellow' | 'red';
  congestionReason: string;
}

export interface QueueRuntimeAlertEvent {
  id: string;
  at: string;
  level: 'green' | 'yellow' | 'red';
  reason: string;
  queuedTotal: number;
  runningTotal: number;
  pumpErrorCount: number;
  warnQueuedThreshold: number;
  criticalQueuedThreshold: number;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

export interface QueueRuntimeAlertState {
  silencedUntil: string | null;
  events: QueueRuntimeAlertEvent[];
}

export interface TaskCatalogAlertEvent {
  id: string;
  at: string;
  level: 'green' | 'yellow' | 'red';
  reason: string;
  driftCount: number;
  total: number;
}

export interface TaskUnifiedAlertEvent {
  id: string;
  at: string;
  level: 'green' | 'yellow' | 'red';
  reason: string;
  source: 'queue' | 'contract';
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  queue?: {
    queuedTotal: number;
    runningTotal: number;
    pumpErrorCount: number;
    warnQueuedThreshold: number;
    criticalQueuedThreshold: number;
  };
  contract?: {
    driftCount: number;
    total: number;
  };
}

export interface TaskUnifiedAlertState {
  windowMinutes: number;
  from: string;
  to: string;
  total: number;
  byLevel: {
    green: number;
    yellow: number;
    red: number;
  };
  bySource: {
    queue: number;
    contract: number;
  };
  events: TaskUnifiedAlertEvent[];
}

export interface TaskUnifiedAlertPolicyConfig {
  redTotalThreshold: number;
  redQueueThreshold: number;
  redContractThreshold: number;
  cooldownMinutes: number;
  updatedAt: string;
}

export interface TaskUnifiedAlertActionLog {
  id: string;
  at: string;
  level: 'green' | 'yellow' | 'red';
  reason: string;
  windowMinutes: number;
  totals: {
    total: number;
    red: number;
    queue: number;
    contract: number;
  };
}

export interface TaskUnifiedAlertIncident {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'open' | 'resolved';
  level: 'green' | 'yellow' | 'red';
  reason: string;
  latestActionLogId: string;
  occurrenceCount: number;
  assignee?: string;
  note?: string;
}

export interface TaskUnifiedAlertIncidentSlaConfig {
  warnAfterMinutes: number;
  criticalAfterMinutes: number;
  escalationAfterMinutes: number;
  updatedAt: string;
}

export interface TaskUnifiedAlertIncidentSlaSummaryItem {
  incidentId: string;
  status: 'open' | 'resolved';
  level: 'green' | 'yellow' | 'red';
  ageMinutes: number;
  slaLevel: 'green' | 'yellow' | 'red';
  shouldEscalate: boolean;
  assignee?: string;
}

export interface TaskUnifiedAlertIncidentSlaSummary {
  generatedAt: string;
  config: TaskUnifiedAlertIncidentSlaConfig;
  openTotal: number;
  resolvedTotal: number;
  warnTotal: number;
  criticalTotal: number;
  escalationCandidateTotal: number;
  byLevelOpen: {
    green: number;
    yellow: number;
    red: number;
  };
  topAging: TaskUnifiedAlertIncidentSlaSummaryItem[];
}

export interface TaskUnifiedAlertIncidentEscalationLog {
  id: string;
  at: string;
  incidentId: string;
  actor?: string;
  ageMinutes: number;
  reason: string;
  notificationStatus: 'pending' | 'sent' | 'failed';
  notificationAttempt?: number;
  nextRetryAt?: string;
  notifiedAt?: string;
  notificationMessage?: string;
}

export interface TaskUnifiedAlertIncidentEscalationConfig {
  autoEnabled: boolean;
  autoCooldownMinutes: number;
  updatedAt: string;
}

export interface TaskUnifiedAlertIncidentNotificationConfig {
  enabled: boolean;
  endpoint: string;
  authHeader?: string;
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelaySeconds: number;
  updatedAt: string;
}

export interface TaskUnifiedAlertIncidentNotificationDeliveryLog {
  id: string;
  at: string;
  escalationId: string;
  incidentId: string;
  endpoint: string;
  status: 'sent' | 'failed';
  responseCode?: number;
  requestId?: string;
  durationMs?: number;
  message?: string;
}

export interface FailureInjectionEvent {
  id: string;
  at: string;
  taskType: 'video' | 'audio' | 'video_merge';
  projectId: string;
  taskId: string;
  stage: string;
  errorCode: 'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN';
  message: string;
}

export interface FailureInjectionReport {
  enabled: boolean;
  ratio: number;
  taskTypes: Array<'video' | 'audio' | 'video_merge'>;
  errorCodes: Array<'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN'>;
  generatedAt: string;
  totalEvents: number;
  events: FailureInjectionEvent[];
}

export interface FailureInjectionConfig {
  enabled: boolean;
  ratio: number;
  taskTypes: Array<'video' | 'audio' | 'video_merge'>;
  errorCodes: Array<'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN'>;
}

export interface TaskSloConfig {
  p95QueueWaitWarnMs: number;
  p95QueueWaitCriticalMs: number;
  pumpErrorRateWarn: number;
  pumpErrorRateCritical: number;
  windowSamples: number;
  updatedAt: string;
}

export interface TaskSloState {
  level: 'green' | 'yellow' | 'red';
  reason: string;
  p95QueueWaitMs: number;
  pumpErrorRate: number;
  sampleSize: number;
  windowSamples: number;
}

export interface TaskQuotaConfig {
  dailyVideoTaskDefault: number;
  dailyVideoTaskOverrides: Record<string, number>;
  dailyVideoTaskTierLimits?: Partial<Record<'standard' | 'pro' | 'enterprise', number>>;
  projectTierOverrides?: Record<string, 'standard' | 'pro' | 'enterprise'>;
  updatedAt: string;
}

export interface TaskQuotaUsage {
  projectId: string;
  date: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  tier?: 'standard' | 'pro' | 'enterprise';
  limitSource?: 'default' | 'tier_limit' | 'project_override';
}

export interface TaskQuotaRejectEvent {
  id: string;
  at: string;
  projectId: string;
  date: string;
  used: number;
  dailyLimit: number;
  reason: string;
  tier?: 'standard' | 'pro' | 'enterprise';
  limitSource?: 'default' | 'tier_limit' | 'project_override';
}

export interface TaskQuotaUsageEvent {
  id: string;
  at: string;
  projectId: string;
  taskId: string;
  storyboardId: string;
  date: string;
  consumed: number;
  usedAfter: number;
  dailyLimit: number;
  tier?: 'standard' | 'pro' | 'enterprise';
  limitSource?: 'default' | 'tier_limit' | 'project_override';
}

export interface RuntimeTaskReconcileItem {
  taskType: 'video' | 'audio' | 'video_merge';
  taskId: string;
  projectId: string;
  issue:
    | 'missing_storyboard'
    | 'stale_active'
    | 'duplicate_active_storyboard_task'
    | 'missing_result_url'
    | 'merge_without_resolved_clips';
  severity: 'warning' | 'critical';
  status: string;
  updatedAt: string;
  detail: string;
}

export interface RuntimeTaskReconcileSummary {
  generatedAt: string;
  staleAfterMinutes: number;
  runtime: {
    heartbeatAt: string;
    isPumpRunning: boolean;
    queuedTotal: number;
    runningTotal: number;
    activeWorkerCount: number;
  };
  totals: {
    issues: number;
    critical: number;
    warning: number;
    video: number;
    audio: number;
    videoMerge: number;
  };
  byIssue: Array<{
    issue: RuntimeTaskReconcileItem['issue'];
    count: number;
  }>;
  projects: Array<{
    projectId: string;
    issueCount: number;
    criticalCount: number;
  }>;
  items: RuntimeTaskReconcileItem[];
}

export type VideoTransitionType =
  | 'cut'
  | 'fade'
  | 'dissolve'
  | 'wipeleft'
  | 'wiperight'
  | 'slideleft'
  | 'slideright'
  | 'circleopen'
  | 'circleclose';

export type VideoTransitionEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
export type VideoTransitionDirection = 'left' | 'right' | 'up' | 'down';

export interface VideoTransitionConfig {
  type: VideoTransitionType;
  durationSec?: number;
  easing?: VideoTransitionEasing;
  direction?: VideoTransitionDirection;
}

export interface VideoKeyframeConfig {
  startScale?: number;
  endScale?: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  rotationDeg?: number;
}

export interface VideoMergeClip {
  storyboardId: string;
  videoTaskId?: string;
  sourceUrl?: string;
  durationSec?: number;
  startMs?: number;
  endMs?: number;
  trimStartMs?: number;
  trimEndMs?: number;
  speed?: number;
  volume?: number;
  muted?: boolean;
  fadeInMs?: number;
  fadeOutMs?: number;
  transition?: VideoTransitionConfig;
  keyframe?: VideoKeyframeConfig;
  effects?: Array<{
    id?: string;
    type: 'filter' | 'color' | 'blur' | 'brightness' | 'contrast' | 'saturation' | 'crop';
    name?: string;
    enabled?: boolean;
    order?: number;
    config?: Record<string, unknown>;
  }>;
}

export interface VideoMergeParams {
  keepAudio?: boolean;
  fps?: number;
  crf?: number;
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';
  subtitleBurnIn?: boolean;
  audioTracks?: TimelineTrack[];
  textTracks?: TimelineTrack[];
}

export interface VideoMerge {
  id: string;
  projectId: string;
  title: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  clips: VideoMergeClip[];
  params: VideoMergeParams;
  resultUrl: string | null;
  outputPath: string | null;
  errorCode: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DramaDomain {
  id: string;
  projectId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  style: string;
}

export interface EpisodeDomain {
  id: string;
  projectId: string;
  dramaId: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'ready' | 'published';
  createdAt: string;
  updatedAt: string;
}

export type EpisodeWorkflowStatus = 'draft' | 'in_review' | 'approved' | 'rejected';

export interface EpisodeWorkflowState {
  projectId: string;
  episodeId: string;
  status: EpisodeWorkflowStatus;
  updatedAt: string;
}

export interface EpisodeWorkflowAudit {
  id: number;
  projectId: string;
  episodeId: string;
  fromStatus: EpisodeWorkflowStatus;
  toStatus: EpisodeWorkflowStatus;
  actor: string;
  comment: string;
  createdAt: string;
}

export interface EpisodeImportFromScriptsResult {
  createdEpisodes: EpisodeDomain[];
  boundScripts: Script[];
  skippedScriptIds: string[];
}

export interface DramaProductionChainEpisodeSummary {
  episodeId: string;
  title: string;
  orderIndex: number;
  publishStatus: EpisodeDomain['status'];
  workflowStatus: EpisodeWorkflowStatus;
  counts: {
    script: number;
    storyboard: number;
    storyboardGenerated: number;
    asset: number;
    assetLinked: number;
    videoTask: number;
    videoTaskActive: number;
    videoTaskDone: number;
    videoTaskFailed: number;
    audioTask: number;
    audioTaskDone: number;
    audioTaskFailed: number;
    videoMerge: number;
    videoMergeDone: number;
    videoMergeFailed: number;
  };
  stage: {
    current: 'writing' | 'storyboard' | 'asset' | 'video' | 'merge' | 'delivery' | 'done';
    nextAction:
      | 'generate_script'
      | 'generate_storyboard'
      | 'generate_asset'
      | 'create_video_task'
      | 'create_video_merge'
      | 'publish_episode'
      | 'optimize_result';
    progressPercent: number;
    blockers: string[];
  };
}

export interface DramaProductionChainSummary {
  dramaId: string;
  projectId: string;
  dramaName: string;
  generatedAt: string;
  counts: {
    episode: number;
    episodePublished: number;
    script: number;
    storyboard: number;
    storyboardGenerated: number;
    asset: number;
    assetLinked: number;
    videoTask: number;
    videoTaskActive: number;
    videoTaskDone: number;
    videoTaskFailed: number;
    audioTask: number;
    audioTaskDone: number;
    audioTaskFailed: number;
    videoMerge: number;
    videoMergeDone: number;
    videoMergeFailed: number;
  };
  stage: {
    current: 'writing' | 'storyboard' | 'asset' | 'video' | 'merge' | 'delivery' | 'done';
    nextAction:
      | 'generate_script'
      | 'generate_storyboard'
      | 'generate_asset'
      | 'create_video_task'
      | 'create_video_merge'
      | 'publish_episode'
      | 'optimize_result';
    progressPercent: number;
  };
  episodes: DramaProductionChainEpisodeSummary[];
}

export interface EpisodeAssetRelation {
  projectId: string;
  episodeId: string;
  assetId: string;
  role: 'scene' | 'character' | 'prop';
  createdAt: string;
}

export interface DomainEntity {
  id: string;
  projectId: string;
  type: 'character' | 'scene' | 'prop';
  lifecycleStatus: 'draft' | 'in_review' | 'approved' | 'archived';
  name: string;
  prompt: string;
  imageUrl: string | null;
  deletedAt: string | null;
  mergedIntoEntityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EpisodeDomainEntityRelation {
  projectId: string;
  episodeId: string;
  entityId: string;
  role: 'scene' | 'character' | 'prop';
  createdAt: string;
}

export interface StoryboardDomainEntityRelation {
  projectId: string;
  storyboardId: string;
  entityId: string;
  role: 'scene' | 'character' | 'prop';
  createdAt: string;
}

export interface DomainEntityAudit {
  id: number;
  projectId: string;
  actor: string;
  action: string;
  targetType: 'domain_entity' | 'episode_relation' | 'storyboard_relation' | 'apply';
  targetId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface DomainEntityAuditStats {
  total: number;
  recent24h: number;
  byAction: Array<{ action: string; count: number }>;
  byActor: Array<{ actor: string; count: number }>;
  byTargetType: Array<{ targetType: 'domain_entity' | 'episode_relation' | 'storyboard_relation' | 'apply'; count: number }>;
}

export interface TimelineClip {
  id?: string;
  storyboardId: string;
  videoTaskId?: string;
  sourceUrl?: string;
  durationSec?: number;
  startMs?: number;
  endMs?: number;
  trimStartMs?: number;
  trimEndMs?: number;
  speed?: number;
  volume?: number;
  muted?: boolean;
  fadeInMs?: number;
  fadeOutMs?: number;
  transition?: VideoTransitionConfig;
  keyframe?: VideoKeyframeConfig;
  effects?: Array<{
    id?: string;
    type: 'filter' | 'color' | 'blur' | 'brightness' | 'contrast' | 'saturation' | 'crop';
    name?: string;
    enabled?: boolean;
    order?: number;
    config?: Record<string, unknown>;
  }>;
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text';
  order: number;
  isLocked: boolean;
  isMuted: boolean;
  volume: number;
  clips: TimelineClip[];
}

export interface TimelinePlan {
  id: string;
  projectId: string;
  episodeId: string | null;
  title: string;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfig {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio';
  name: string;
  provider: string;
  manufacturer: string;
  model: string;
  authType: 'bearer' | 'api_key' | 'none';
  endpoint: string;
  endpoints: Record<string, string>;
  apiKey: string;
  capabilities: Record<string, unknown>;
  priority: number;
  rateLimit: number;
  isDefault: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AudioTask {
  id: string;
  projectId: string;
  storyboardId: string;
  prompt: string;
  modelName: string | null;
  params: AudioTaskParams;
  priority: 'low' | 'medium' | 'high';
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  resultUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AudioTaskParams {
  trackKind?: 'narration' | 'dialogue' | 'ambience' | 'music';
  speaker?: string;
  sourceText?: string;
  segmentIndex?: number;
  segmentStartMs?: number;
  segmentEndMs?: number;
  voice?: string;
  speed?: number;
  emotion?: string;
  format?: string;
  providerOptions?: Record<string, unknown>;
}

export interface PromptTemplate {
  id: string;
  key: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptTemplateVersion {
  id: number;
  promptId: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface TaskRuntimeConfig {
  videoTaskAutoRetry: number;
  videoTaskRetryDelayMs: number;
  videoTaskPollIntervalMs: number;
}

export interface QueueRuntimeAlertConfig {
  warnQueuedThreshold: number;
  criticalQueuedThreshold: number;
  updatedAt: string;
}

export interface TaskCenterFilterPreset {
  name: string;
  q: string;
  providerTaskId: string;
  status: '' | 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
  providerErrorCode:
    | ''
    | 'CAPABILITY_MISMATCH'
    | 'PROVIDER_AUTH_FAILED'
    | 'PROVIDER_RATE_LIMITED'
    | 'PROVIDER_TIMEOUT'
    | 'PROVIDER_UNKNOWN';
  createdFrom: string;
  createdTo: string;
  sortBy: 'createdAt' | 'updatedAt' | 'priority' | 'status';
  order: 'asc' | 'desc';
  isDefault: boolean;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface TeamWorkspaceLayoutTemplate {
  name: string;
  contextScope: string;
  uiPrefs: Record<string, unknown>;
  updatedAt: string;
  updatedBy: string;
  updatedByRole?: string;
  readOnly?: boolean;
}
