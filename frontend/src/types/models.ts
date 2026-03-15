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

export interface Summary {
  projectCount: number;
  taskCount: number;
  doneCount: number;
  doingCount: number;
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

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
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

export interface ScriptDoc {
  id: string;
  projectId: string;
  outlineId: string;
  episodeId: string | null;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudioTextGenerationMeta {
  usedConfiguredModel: boolean;
  model: string | null;
  modelLabel: string | null;
  provider: string | null;
  manufacturer: string | null;
}

export interface OutlineGenerationResult {
  items: Outline[];
  generation: StudioTextGenerationMeta;
}

export interface ScriptGenerationResult {
  script: ScriptDoc;
  generation: StudioTextGenerationMeta;
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
  /** First frame extracted from generated video - used for video continuity */
  firstFrameUrl: string | null;
  /** Last frame from generated video - used for connecting to next storyboard */
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
  /** Generated video URL (for shot-level assets using I2V) */
  videoUrl: string | null;
  /** First frame extracted from video - used for continuity */
  firstFrameUrl: string | null;
  /** Last frame from video - used for continuity */
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
  params: VideoTaskParams;
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

export interface VideoTaskDetail {
  task: VideoTask;
  project: {
    id: string;
    name: string;
    description: string;
  } | null;
  storyboard: {
    id: string;
    title: string;
    prompt: string;
    imageUrl: string | null;
    status: 'draft' | 'generated';
  } | null;
  events: VideoTaskEvent[];
}

export interface VideoTaskBatchActionResult {
  updated: VideoTask[];
  unchangedIds: string[];
  notFoundIds: string[];
}

export interface VideoTaskBatchRepairByPolicyResult {
  matchedCount?: number;
  retried: VideoTask[];
  recreated: VideoTask[];
  manualIds: string[];
  unchangedIds: string[];
  notFoundIds: string[];
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

export interface QueueRuntimeAlertConfig {
  warnQueuedThreshold: number;
  criticalQueuedThreshold: number;
  updatedAt: string;
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

export interface TaskCatalogItem {
  taskType: 'video' | 'audio' | 'video_merge';
  queueTopic: string;
  terminalStatuses: string[];
  retryableStatuses: string[];
  defaultPriority: 'low' | 'medium' | 'high';
}

export interface TaskCatalogContractCheckItem {
  taskType: string;
  drift: boolean;
  reasons: string[];
  expected?: TaskCatalogItem;
  actual?: TaskCatalogItem;
}

export interface TaskCatalogContractCheckResult {
  total: number;
  driftCount: number;
  level: 'green' | 'yellow' | 'red';
  reason: string;
  items: TaskCatalogContractCheckItem[];
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

export interface VideoTaskBatchResult {
  tasks: VideoTask[];
  createdStoryboardIds: string[];
  skippedStoryboardIds: string[];
}

export interface FullChainRunResult {
  storyboards: Storyboard[];
  assets: Asset[];
  videoTasks: VideoTask[];
  createdAssetStoryboardIds: string[];
  skippedAssetStoryboardIds: string[];
  createdVideoStoryboardIds: string[];
  skippedVideoStoryboardIds: string[];
}

export interface ProjectFullChainResult {
  outlines: Outline[];
  scripts: ScriptDoc[];
  storyboards: Storyboard[];
  assets: Asset[];
  videoTasks: VideoTask[];
  createdAssetStoryboardIds: string[];
  skippedAssetStoryboardIds: string[];
  createdVideoStoryboardIds: string[];
  skippedVideoStoryboardIds: string[];
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

export interface ModelConnectionTestResult {
  ok: boolean;
  checkedAt: string;
  latencyMs: number;
  type: 'text' | 'image' | 'video' | 'audio';
  provider: string;
  manufacturer: string;
  model: string;
  endpoint: string;
  message: string;
  preview: string | null;
  errorKind: 'validation' | 'auth' | 'rate_limit' | 'transient' | 'unknown' | null;
  statusCode: number | null;
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
  format?: 'mp3' | 'wav' | 'aac' | 'flac' | 'ogg' | string;
  providerOptions?: Record<string, unknown>;
}

export interface AudioExtract {
  id: string;
  projectId: string;
  sourceUrl: string;
  format: 'mp3' | 'wav' | 'aac' | 'flac' | 'ogg';
  sampleRate: number | null;
  channels: number | null;
  bitrateKbps: number | null;
  resultUrl: string;
  outputPath: string;
  createdAt: string;
}

export interface ResourceLibraryItem {
  id: string;
  type: 'character' | 'scene' | 'prop';
  name: string;
  prompt: string;
  imageUrl: string | null;
  tags: string[];
  sourceProjectId: string | null;
  sourceAssetId: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceLibraryBatchImportResult {
  created: ResourceLibraryItem[];
  skippedAssetIds: string[];
  projectAssetCount: number;
}

export interface ResourceLibraryExportJson {
  exportedAt: string;
  count: number;
  items: ResourceLibraryItem[];
}

export interface ResourceLibraryImportJsonResult {
  created: ResourceLibraryItem[];
  skipped: number;
}

export interface ResourceLibraryDuplicateGroup {
  fingerprint: string;
  type: 'character' | 'scene' | 'prop';
  name: string;
  prompt: string;
  count: number;
  ids: string[];
}

export interface ResourceLibraryDeduplicateResult {
  strategy: 'keep_latest' | 'keep_most_used';
  groups: number;
  removed: number;
  removedIds: string[];
}

export interface ResourceLibraryResolveDuplicateResult {
  strategy: 'keep_latest' | 'keep_most_used';
  fingerprint: string;
  removed: number;
  removedIds: string[];
}

export interface ResourceLibraryDuplicateCandidate {
  id: string;
  usageCount: number;
  updatedAt: string;
  lastUsedAt: string | null;
  sourceProjectId: string | null;
  sourceAssetId: string | null;
  sourceStoryboardId: string | null;
  sourceStoryboardTitle: string | null;
}

export interface ResourceLibraryDuplicatePreview {
  strategy: 'keep_latest' | 'keep_most_used';
  fingerprint: string;
  keepId: string;
  removeIds: string[];
  candidates: ResourceLibraryDuplicateCandidate[];
}

export interface ResourceLibraryResolveByKeepResult {
  fingerprint: string;
  keepId: string;
  removed: number;
  removedIds: string[];
}

export interface ResourceLibraryConflictGroup {
  conflictKey: string;
  conflictKind: 'fingerprint' | 'source' | 'name';
  type: 'character' | 'scene' | 'prop';
  name: string;
  prompt: string;
  count: number;
  ids: string[];
  sourceProjectId: string | null;
  sourceAssetId: string | null;
}

export interface ResourceLibraryConflictPreview {
  strategy: 'keep_latest' | 'keep_most_used';
  conflictKind: 'fingerprint' | 'source' | 'name';
  conflictKey: string;
  keepId: string;
  removeIds: string[];
  candidates: ResourceLibraryDuplicateCandidate[];
}

export interface ResourceLibraryConflictResolveResult {
  strategy: 'keep_latest' | 'keep_most_used' | 'manual_keep';
  conflictKind: 'fingerprint' | 'source' | 'name';
  conflictKey: string;
  keepId: string;
  removed: number;
  removedIds: string[];
}

export interface ResourceLibraryMergeAuditEntry {
  id: string;
  createdAt: string;
  strategy: 'keep_latest' | 'keep_most_used' | 'manual_keep';
  conflictKind: 'fingerprint' | 'source' | 'name';
  conflictKey: string;
  keepId: string;
  removedIds: string[];
}

export interface ResourceLibraryDeduplicateUndoResult {
  restored: number;
  expired: boolean;
  entryId: string | null;
}

export interface ResourceLibraryDeduplicateUndoEntry {
  id: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  removedCount: number;
}

export interface ResourceLibraryDeduplicateUndoDetailItem {
  id: string;
  type: 'character' | 'scene' | 'prop';
  name: string;
  prompt: string;
  usageCount: number;
  updatedAt: string;
}

export interface ResourceLibraryDeduplicateUndoDetail {
  id: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  removedCount: number;
  removedItems: ResourceLibraryDeduplicateUndoDetailItem[];
}

export interface ResourceLibraryApplyAuditEntry {
  id: string;
  createdAt: string;
  projectId: string;
  episodeId: string;
  resourceId: string;
  mode: 'missing_only' | 'all';
  createdCount: number;
  skippedCount: number;
  totalStoryboards: number;
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

export interface EpisodeImportFromScriptsResult {
  createdEpisodes: EpisodeDomain[];
  boundScripts: ScriptDoc[];
  skippedScriptIds: string[];
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

export interface WorkflowEpisodeListItem {
  episode: EpisodeDomain;
  workflow: EpisodeWorkflowState;
  storyboardCount: number;
  lastAuditAt: string | null;
}

export interface WorkflowEpisodeTransitionBatchResult {
  updated: EpisodeWorkflowState[];
  invalidTransitionIds: string[];
  notFoundIds: string[];
  undoEntryId: string | null;
}

export interface WorkflowEpisodeOverrideBatchResult {
  updated: EpisodeWorkflowState[];
  unchangedIds: string[];
  notFoundIds: string[];
  undoEntryId: string | null;
}

export interface WorkflowTransitionUndoEntry {
  id: string;
  actor: string;
  comment: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  toStatus: EpisodeWorkflowStatus;
  affectedEpisodes: number;
}

export interface WorkflowOpLogEntry {
  id: string;
  time: string;
  action: string;
  estimated: string;
  actual: string;
  note?: string;
}

export interface EpisodeAssetRelation {
  projectId: string;
  episodeId: string;
  assetId: string;
  role: 'scene' | 'character' | 'prop';
  createdAt: string;
}

export interface DomainEntityItem {
  id: string;
  type: 'character' | 'scene' | 'prop';
  name: string;
  prompt: string;
  imageUrl: string | null;
  storyboardId: string;
  storyboardTitle: string | null;
  episodeId: string | null;
  episodeTitle: string | null;
  usageCount: number;
}

export interface DomainEntityWorkbenchItem {
  entityId: string;
  type: 'character' | 'scene' | 'prop';
  name: string;
  prompt: string;
  imageUrl: string | null;
  usageCount: number;
  appearances: number;
  episodeIds: string[];
  storyboardIds: string[];
  sourceStoryboardId: string;
}

export interface CanonicalDomainEntity {
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

export interface DomainEntityLifecycleCheckResult {
  entityId: string;
  fromStatus: 'draft' | 'in_review' | 'approved' | 'archived';
  toStatus: 'draft' | 'in_review' | 'approved' | 'archived';
  allowed: boolean;
  reason: 'not_found' | 'deleted' | 'invalid_transition' | 'entity_in_use' | 'ok';
  reference: {
    episodeRelationCount: number;
    storyboardRelationCount: number;
  };
}

export interface DomainEntityLifecycleRecommendation {
  entityId: string;
  currentStatus: 'draft' | 'in_review' | 'approved' | 'archived';
  recommendedStatus: 'draft' | 'in_review' | 'approved' | 'archived';
  reason: 'no_relation' | 'all_approved' | 'has_in_review' | 'has_rejected' | 'default_draft';
  episodeStatusBreakdown: Record<'draft' | 'in_review' | 'approved' | 'rejected', number>;
}

export interface DomainEntityLifecycleBatchTransitionResult {
  opId: string;
  executedAt: string;
  actor: string;
  updated: Array<{
    entityId: string;
    fromStatus: 'draft' | 'in_review' | 'approved' | 'archived';
    toStatus: 'draft' | 'in_review' | 'approved' | 'archived';
    autoRecommended: boolean;
  }>;
  rejected: Array<{
    entityId: string;
    toStatus: 'draft' | 'in_review' | 'approved' | 'archived';
    reason: 'not_found' | 'deleted' | 'invalid_transition' | 'entity_in_use' | 'no_recommendation';
  }>;
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

export interface DomainEntityConflictSummary {
  byName: Array<{
    type: 'character' | 'scene' | 'prop';
    key: string;
    count: number;
    entityIds: string[];
    entityNames: string[];
  }>;
  byPromptFingerprint: Array<{
    type: 'character' | 'scene' | 'prop';
    fingerprint: string;
    count: number;
    entityIds: string[];
    entityNames: string[];
  }>;
}

export interface DomainEntityApplyPreviewItem {
  storyboardId: string;
  storyboardTitle: string;
  action: 'create' | 'update' | 'skip';
  reason: string;
  existingAssetId?: string;
}

export interface DomainEntityApplyPreviewResult {
  entityId: string;
  episodeId: string;
  totalStoryboards: number;
  createCount: number;
  updateCount: number;
  skipCount: number;
  items: DomainEntityApplyPreviewItem[];
}

export interface DomainEntityApplyResult {
  entityId: string;
  episodeId: string;
  created: Asset[];
  updated: Asset[];
  skippedStoryboardIds: string[];
  totalStoryboards: number;
}

export interface DomainApplyPolicyRule {
  conflictStrategy: 'skip' | 'overwrite_prompt' | 'overwrite_all' | 'rename';
  priority: 'entity_first' | 'existing_first';
  renameSuffix: string;
}

export interface DomainApplyPolicy {
  projectId: string;
  updatedAt: string;
  updatedBy: string;
  defaultMode: 'missing_only' | 'all';
  byType: {
    character: DomainApplyPolicyRule;
    scene: DomainApplyPolicyRule;
    prop: DomainApplyPolicyRule;
  };
  byStatus: Partial<
    Record<
      'draft' | 'in_review' | 'approved' | 'rejected',
      Partial<Record<'character' | 'scene' | 'prop', Partial<DomainApplyPolicyRule>>>
    >
  >;
}

export interface FramePromptResult {
  prompt: string;
  frameType: 'opening' | 'middle' | 'ending' | 'action' | 'emotion';
  style: string;
  shotSize: string;
  cameraMove: string;
  lighting: string;
  mood: string;
}

export interface FramePromptHistoryEntry {
  id: string;
  createdAt: string;
  frameType: 'opening' | 'middle' | 'ending' | 'action' | 'emotion';
  style: string;
  shotSize: string;
  cameraMove: string;
  lighting: string;
  mood: string;
  prompt: string;
  source: 'single' | 'episode_batch' | 'workflow_batch' | 'rollback';
}

export interface FramePromptRollbackAuditEntry {
  id: string;
  createdAt: string;
  projectId: string;
  storyboardId: string;
  historyId: string;
  actor: string;
  comment: string;
  restoredPrompt: string;
}

export interface EpisodeDeliveryVersionEntry {
  id: string;
  createdAt: string;
  projectId: string;
  episodeId: string;
  mergeId: string | null;
  downloadUrl: string | null;
  actor: string;
  comment: string;
  status: 'published';
}

export interface EpisodeDeliveryCompareResult {
  current: EpisodeDeliveryVersionEntry;
  previous: EpisodeDeliveryVersionEntry;
  changed: {
    mergeId: boolean;
    downloadUrl: boolean;
    actor: boolean;
    comment: boolean;
  };
  metrics: {
    currentClipCount: number;
    previousClipCount: number;
    currentDurationSec: number;
    previousDurationSec: number;
  };
}

export interface EpisodeDeliveryCompareReport {
  exportedAt: string;
  projectId: string;
  episodeId: string;
  compare: EpisodeDeliveryCompareResult;
}

export interface EpisodeDeliveryPackage {
  manifestVersion?: string;
  exportedAt: string;
  project: {
    id: string;
    name: string;
    description: string;
  };
  episode: {
    id: string;
    title: string;
    orderIndex: number;
    status: 'draft' | 'ready' | 'published';
  };
  version: EpisodeDeliveryVersionEntry;
  merge: {
    id: string;
    title: string;
    status: string;
    resultUrl: string | null;
    outputPath: string | null;
    params: Record<string, unknown>;
    clips: TimelineClip[];
    updatedAt: string;
    createdAt: string;
  } | null;
  assetsSnapshot: Array<{
    id: string;
    storyboardId: string;
    name: string;
    type: 'character' | 'scene' | 'prop';
    prompt: string;
    imageUrl: string | null;
  }>;
  reproducibility?: {
    paramsHash: string;
    clipsHash: string;
    assetsHash: string;
    contentHash: string;
  };
  artifact?: {
    exists: boolean;
    path: string | null;
    sizeBytes: number | null;
    updatedAt: string | null;
    resultUrl: string | null;
  };
  lineage?: {
    versionCount: number;
    previousVersionId: string | null;
    compareChanged: {
      mergeId: boolean;
      downloadUrl: boolean;
      actor: boolean;
      comment: boolean;
    } | null;
  };
}

export interface EpisodeDeliveryPackageVerifyResult {
  ok: boolean;
  signatureValid: boolean;
  checksumsValid: boolean;
  checkedFiles: number;
  missingFiles: string[];
  mismatchedFiles: Array<{ path: string; expected: string; actual: string | null }>;
  message: string;
}

export interface EpisodeFramePromptBatchResult {
  episodeId: string;
  total: number;
  generated: number;
  updatedStoryboardPrompts: number;
  items: Array<{
    storyboardId: string;
    storyboardTitle: string;
    prompt: string;
    updated: boolean;
  }>;
}

export interface ProjectFramePromptByWorkflowResult {
  statuses: EpisodeWorkflowStatus[];
  episodesMatched: number;
  episodesProcessed: number;
  generatedTotal: number;
  updatedStoryboardPrompts: number;
  transitionedEpisodeIds: string[];
  skippedTransitionEpisodeIds: string[];
  episodes: Array<{
    episodeId: string;
    generated: number;
    updatedStoryboardPrompts: number;
  }>;
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

export interface TimelineAudioTrackSyncResult {
  plan: TimelinePlan;
  syncedClipCount: number;
  syncedTrackCount: number;
  dialogueClipCount: number;
  skippedMockClipCount: number;
  requiresRealAudioModel: boolean;
}

export interface TimelineAudioTaskBatchResult {
  tasks: AudioTask[];
  createdStoryboardIds: string[];
  skippedStoryboardIds: string[];
  createdTaskCount: number;
  speakerCount: number;
  usedConfiguredTextModel: boolean;
  fallback: boolean;
  modelLabel: string | null;
}

export interface TimelineSubtitleTrackGenerationResult {
  plan: TimelinePlan;
  generatedClipCount: number;
  usedConfiguredModel: boolean;
  fallback: boolean;
  modelLabel: string | null;
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

export interface TaskFailurePolicyItem {
  errorCode: 'CAPABILITY_MISMATCH' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNKNOWN';
  action: 'retry' | 'recreate_conservative' | 'manual';
  preferredMode: 'keep' | 'text' | 'singleImage' | 'startEnd' | 'multiImage' | 'reference';
  disableAudio: boolean;
  priority: 'keep' | 'low' | 'medium' | 'high';
}

export interface TaskFailurePolicyConfig {
  updatedAt: string;
  autoApply: boolean;
  maxAutoApplyPerTask: number;
  items: TaskFailurePolicyItem[];
}

export interface ProviderLogEntry {
  id: number;
  timestamp: string;
  provider: string;
  taskType: 'text' | 'image' | 'video' | 'audio';
  endpoint: string;
  success: boolean;
  durationMs: number;
  statusCode?: number;
  message?: string;
}

export interface ProviderLogProviderStat {
  provider: string;
  count: number;
  failed: number;
}

export interface ProviderLogTaskTypeStat {
  taskType: 'text' | 'image' | 'video' | 'audio';
  count: number;
  failed: number;
}

export interface ProviderLogBreakdown {
  byProvider: ProviderLogProviderStat[];
  byTaskType: ProviderLogTaskTypeStat[];
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

export interface OpsSummary {
  now: string;
  uptimeSec: number;
  env: {
    nodeEnv: string;
    aiProvider: string;
    videoMaxConcurrent: number;
  };
  data: {
    projectCount: number;
    taskCount: number;
    novelCount: number;
    outlineCount: number;
    scriptCount: number;
    storyboardCount: number;
    assetCount: number;
    videoTaskCount: number;
    audioTaskCount: number;
    videoMergeCount: number;
  };
  providerLogs: {
    count: number;
    max: number;
  };
  autoRepairLogs: {
    count: number;
    max: number;
    success: number;
    failed: number;
  };
}

export interface VideoMergeErrorStat {
  errorCode: string;
  count: number;
  latestAt: string;
}

export interface AutoRepairLogEntry {
  id: number;
  timestamp: string;
  projectId: string;
  taskId: string;
  storyboardId: string;
  errorCode: string;
  action: 'retry' | 'recreate_conservative' | 'manual';
  success: boolean;
  detail?: string;
  resultTaskId?: string;
}

export interface AutoRepairLogStats {
  count: number;
  max: number;
  success: number;
  failed: number;
  byErrorCode: Array<{ errorCode: string; count: number; failed: number }>;
  byAction: Array<{ action: 'retry' | 'recreate_conservative' | 'manual'; count: number; failed: number }>;
}
