import { env } from '../../config/env.js';
import {
  Asset,
  AudioTask,
  DomainEntity,
  DomainEntityAudit,
  DramaDomain,
  EpisodeAssetRelation,
  EpisodeDomain,
  EpisodeDomainEntityRelation,
  EpisodeWorkflowAudit,
  EpisodeWorkflowState,
  ModelConfig,
  Novel,
  Outline,
  PromptTemplate,
  PromptTemplateVersion,
  Project,
  Scene,
  Script,
  Storyboard,
  StoryboardPlan,
  StoryboardAssetRelation,
  StoryboardDomainEntityRelation,
  Task,
  TimelinePlan,
  type TimelineTrack,
  VideoMerge,
  type VideoMergeClip,
  VideoTask,
  VideoTaskEvent,
  VideoTaskListItem,
} from '../../core/types.js';
import { decryptSecret } from '../../utils/secret.js';
import type {
  AssetRow,
  AudioTaskRow,
  DomainEntityAuditRow,
  DomainEntityRow,
  DramaRow,
  EpisodeAssetLinkRow,
  EpisodeDomainEntityLinkRow,
  EpisodeRow,
  EpisodeWorkflowAuditRow,
  EpisodeWorkflowStateRow,
  ModelConfigRow,
  NovelRow,
  OutlineRow,
  ProjectRow,
  PromptTemplateRow,
  PromptTemplateVersionRow,
  SceneRow,
  ScriptRow,
  StoryboardAssetLinkRow,
  StoryboardDomainEntityLinkRow,
  StoryboardRow,
  TaskRow,
  TimelinePlanRow,
  VideoMergeRow,
  VideoTaskEventRow,
  VideoTaskListRow,
  VideoTaskRow,
} from './row-types.js';

export const parseJsonRecord = (raw: string): Record<string, string> => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === 'string') {
        acc[key] = value;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
};

export const parseJsonRecordUnknown = (raw: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
};

const parseStoryboardPlan = (raw: string | null): StoryboardPlan | null => {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const fields = [
      record.shotTitle,
      record.scene,
      record.time,
      record.subject,
      record.action,
      record.composition,
      record.lighting,
      record.finalImagePrompt
    ];
    if (fields.some((value) => typeof value !== 'string')) {
      return null;
    }
    const readIdArray = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
    const readOptionalId = (value: unknown): string | null =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
    return {
      shotTitle: String(record.shotTitle),
      scene: String(record.scene),
      time: String(record.time),
      subject: String(record.subject),
      action: String(record.action),
      composition: String(record.composition),
      lighting: String(record.lighting),
      finalImagePrompt: String(record.finalImagePrompt),
      continuityGroupId: readOptionalId(record.continuityGroupId) ?? 'standalone',
      characterIds: readIdArray(record.characterIds),
      sceneEntityId: readOptionalId(record.sceneEntityId),
      propEntityIds: readIdArray(record.propEntityIds),
      baseSceneAssetId: readOptionalId(record.baseSceneAssetId),
      baseCharacterAssetIds: readIdArray(record.baseCharacterAssetIds),
      shotSceneStateId: readOptionalId(record.shotSceneStateId),
      shotCharacterStateIds: readIdArray(record.shotCharacterStateIds),
      sceneAssetId: readOptionalId(record.sceneAssetId),
      characterAssetIds: readIdArray(record.characterAssetIds),
      propAssetIds: readIdArray(record.propAssetIds)
    };
  } catch {
    return null;
  }
};

const parseAssetVoiceProfile = (raw: string | null): Asset['voiceProfile'] => {
  if (!raw?.trim()) {
    return null;
  }
  const record = parseJsonRecordUnknown(raw);
  const voice = typeof record.voice === 'string' ? record.voice.trim() : '';
  if (!voice) {
    return null;
  }
  const speed =
    typeof record.speed === 'number' && Number.isFinite(record.speed) ? Number(record.speed) : undefined;
  const providerOptions =
    record.providerOptions && typeof record.providerOptions === 'object' && !Array.isArray(record.providerOptions)
      ? (record.providerOptions as Record<string, unknown>)
      : undefined;
  return {
    voice,
    ...(speed !== undefined ? { speed } : {}),
    ...(providerOptions ? { providerOptions } : {}),
  };
};

const parseAssetState = (raw: string | null): Asset['state'] => {
  if (!raw?.trim()) {
    return null;
  }
  const record = parseJsonRecordUnknown(raw);
  const allowedKeys = [
    'emotion',
    'action',
    'pose',
    'costumeState',
    'condition',
    'time',
    'weather',
    'lighting',
    'camera',
    'localChange',
  ] as const;
  const state = allowedKeys.reduce<NonNullable<Asset['state']>>((acc, key) => {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      acc[key] = value.trim();
    }
    return acc;
  }, {});
  return Object.keys(state).length > 0 ? state : null;
};

export const mapTask = (row: TaskRow): Task => ({
  id: row.id,
  title: row.title,
  status: row.status,
  priority: row.priority,
  dueAt: row.due_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapNovel = (row: NovelRow): Novel => ({
  id: row.id,
  projectId: row.project_id,
  title: row.title,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapOutline = (row: OutlineRow): Outline => ({
  id: row.id,
  projectId: row.project_id,
  title: row.title,
  summary: row.summary,
  orderIndex: row.order_index,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapScript = (row: ScriptRow): Script => ({
  id: row.id,
  projectId: row.project_id,
  outlineId: row.outline_id,
  episodeId: row.episode_id ?? null,
  title: row.title,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapStoryboard = (row: StoryboardRow): Storyboard => ({
  id: row.id,
  projectId: row.project_id,
  scriptId: row.script_id,
  episodeId: row.episode_id ?? null,
  sceneId: row.scene_id ?? null,
  title: row.title,
  prompt: row.prompt,
  plan: parseStoryboardPlan(row.plan_json),
  imageUrl: row.image_url,
  firstFrameUrl: row.first_frame_url ?? null,
  lastFrameUrl: row.last_frame_url ?? null,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapScene = (row: SceneRow): Scene => ({
  id: row.id,
  projectId: row.project_id,
  name: row.name,
  description: row.description,
  prompt: row.prompt,
  storyboardCount: row.storyboard_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapDrama = (row: DramaRow): DramaDomain => ({
  id: row.id,
  projectId: row.project_id,
  name: row.name,
  description: row.description,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  style: row.style || '',
});

export const mapEpisode = (row: EpisodeRow): EpisodeDomain => ({
  id: row.id,
  projectId: row.project_id,
  dramaId: row.drama_id,
  title: row.title,
  orderIndex: row.order_index,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapAsset = (row: AssetRow): Asset => ({
  id: row.id,
  projectId: row.project_id,
  storyboardId: row.storyboard_id,
  name: row.name,
  type: row.type,
  scope: row.scope === 'base' ? 'base' : 'shot',
  shareScope: row.share_scope === 'shared' ? 'shared' : 'project',
  baseAssetId: row.base_asset_id ?? null,
  prompt: row.prompt,
  statePrompt: row.state_prompt ?? null,
  state: parseAssetState(row.state_json),
  imageUrl: row.image_url,
  videoUrl: row.video_url ?? null,
  firstFrameUrl: row.first_frame_url ?? null,
  lastFrameUrl: row.last_frame_url ?? null,
  voiceProfile: parseAssetVoiceProfile(row.voice_profile),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapStoryboardAssetRelation = (row: StoryboardAssetLinkRow): StoryboardAssetRelation => ({
  storyboardId: row.storyboard_id,
  assetId: row.asset_id,
  role: row.role,
  createdAt: row.created_at,
});

export const mapVideoTask = (row: VideoTaskRow): VideoTask => ({
  id: row.id,
  projectId: row.project_id,
  storyboardId: row.storyboard_id,
  prompt: row.prompt,
  modelName: row.model_name,
  params: parseJsonRecordUnknown(row.params) as VideoTask['params'],
  priority: row.priority,
  status: row.status,
  progress: row.progress,
  resultUrl: row.result_url,
  firstFrameUrl: row.first_frame_url ?? null,
  lastFrameUrl: row.last_frame_url ?? null,
  error: row.error,
  providerTaskId: row.provider_task_id ?? null,
  attempt: row.attempt ?? 0,
  nextRetryAt: row.next_retry_at ?? null,
  providerErrorCode: row.provider_error_code ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapAudioTask = (row: AudioTaskRow): AudioTask => ({
  id: row.id,
  projectId: row.project_id,
  storyboardId: row.storyboard_id,
  prompt: row.prompt,
  modelName: row.model_name,
  params: parseJsonRecordUnknown(row.params) as AudioTask['params'],
  priority: row.priority,
  status: row.status,
  progress: row.progress,
  resultUrl: row.result_url,
  error: row.error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapVideoMerge = (row: VideoMergeRow): VideoMerge => {
  let clips: VideoMerge['clips'] = [];
  let params: VideoMerge['params'] = {};
  try {
    const parsed = JSON.parse(row.clips) as unknown;
    if (Array.isArray(parsed)) {
      clips = parsed as VideoMerge['clips'];
    }
  } catch {
    clips = [];
  }
  try {
    const parsed = JSON.parse(row.params) as unknown;
    if (parsed && typeof parsed === 'object') {
      params = parsed as VideoMerge['params'];
    }
  } catch {
    params = {};
  }
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
    clips,
    params,
    resultUrl: row.result_url,
    outputPath: row.output_path ?? null,
    errorCode: row.error_code ?? null,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
};

export const mapTimelinePlan = (row: TimelinePlanRow): TimelinePlan => {
  let tracks: TimelineTrack[] = [];
  let clips: VideoMergeClip[] = [];
  try {
    const parsed = JSON.parse(row.tracks) as unknown;
    if (Array.isArray(parsed)) {
      tracks = parsed as TimelineTrack[];
    }
  } catch {
    tracks = [];
  }
  try {
    const parsed = JSON.parse(row.clips) as unknown;
    if (Array.isArray(parsed)) {
      clips = parsed as VideoMergeClip[];
    }
  } catch {
    clips = [];
  }
  if (tracks.length === 0 && clips.length > 0) {
    tracks = [
      {
        id: 'video-main',
        name: 'Video Main',
        type: 'video',
        order: 0,
        isLocked: false,
        isMuted: false,
        volume: 100,
        clips,
      },
    ];
  }
  return {
    id: row.id,
    projectId: row.project_id,
    episodeId: row.episode_id || null,
    title: row.title,
    tracks,
    clips,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const mapEpisodeAssetRelation = (row: EpisodeAssetLinkRow): EpisodeAssetRelation => ({
  projectId: row.project_id,
  episodeId: row.episode_id,
  assetId: row.asset_id,
  role: row.role,
  createdAt: row.created_at,
});

export const mapDomainEntity = (row: DomainEntityRow): DomainEntity => {
  const lifecycleStatus =
    row.lifecycle_status === 'in_review' || row.lifecycle_status === 'approved' || row.lifecycle_status === 'archived'
      ? row.lifecycle_status
      : 'draft';
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    lifecycleStatus,
    name: row.name,
    prompt: row.prompt,
    imageUrl: row.image_url,
    deletedAt: row.deleted_at ?? null,
    mergedIntoEntityId: row.merged_into_entity_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const mapEpisodeDomainEntityRelation = (row: EpisodeDomainEntityLinkRow): EpisodeDomainEntityRelation => ({
  projectId: row.project_id,
  episodeId: row.episode_id,
  entityId: row.entity_id,
  role: row.role,
  createdAt: row.created_at,
});

export const mapStoryboardDomainEntityRelation = (row: StoryboardDomainEntityLinkRow): StoryboardDomainEntityRelation => ({
  projectId: row.project_id,
  storyboardId: row.storyboard_id,
  entityId: row.entity_id,
  role: row.role,
  createdAt: row.created_at,
});

export const mapDomainEntityAudit = (row: DomainEntityAuditRow): DomainEntityAudit => ({
  id: row.id,
  projectId: row.project_id,
  actor: row.actor,
  action: row.action,
  targetType: row.target_type,
  targetId: row.target_id,
  details: parseJsonRecordUnknown(row.details),
  createdAt: row.created_at,
});

export const mapEpisodeWorkflowState = (row: EpisodeWorkflowStateRow): EpisodeWorkflowState => ({
  projectId: row.project_id,
  episodeId: row.episode_id,
  status: row.status,
  updatedAt: row.updated_at,
});

export const mapEpisodeWorkflowAudit = (row: EpisodeWorkflowAuditRow): EpisodeWorkflowAudit => ({
  id: row.id,
  projectId: row.project_id,
  episodeId: row.episode_id,
  fromStatus: row.from_status,
  toStatus: row.to_status,
  actor: row.actor,
  comment: row.comment,
  createdAt: row.created_at,
});

export const mapVideoTaskListItem = (row: VideoTaskListRow): VideoTaskListItem => ({
  ...mapVideoTask(row),
  projectName: row.project_name,
  storyboardTitle: row.storyboard_title,
});

export const mapVideoTaskEvent = (row: VideoTaskEventRow): VideoTaskEvent => ({
  id: row.id,
  taskId: row.task_id,
  status: row.status,
  progress: row.progress,
  error: row.error,
  createdAt: row.created_at,
});

export const mapModelConfig = (row: ModelConfigRow): ModelConfig => {
  let apiKey = '';
  try {
    apiKey = decryptSecret(row.api_key, env.modelSecretKey);
  } catch {
    apiKey = '';
  }
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    provider: row.provider,
    manufacturer: row.manufacturer,
    model: row.model,
    authType: row.auth_type,
    endpoint: row.endpoint,
    endpoints: parseJsonRecord(row.endpoints),
    apiKey,
    capabilities: parseJsonRecordUnknown(row.capabilities),
    priority: row.priority,
    rateLimit: row.rate_limit,
    isDefault: Boolean(row.is_default),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const mapPromptTemplate = (row: PromptTemplateRow): PromptTemplate => ({
  id: row.id,
  key: row.key,
  title: row.title,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapPromptTemplateVersion = (row: PromptTemplateVersionRow): PromptTemplateVersion => ({
  id: row.id,
  promptId: row.prompt_id,
  title: row.title,
  content: row.content,
  createdAt: row.created_at,
});

export const attachTasks = (projectRows: ProjectRow[], taskRows: TaskRow[]): Project[] => {
  const tasksByProjectId = new Map<string, Task[]>();

  for (const row of taskRows) {
    const list = tasksByProjectId.get(row.project_id) ?? [];
    list.push(mapTask(row));
    tasksByProjectId.set(row.project_id, list);
  }

  return projectRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tasks: tasksByProjectId.get(row.id) ?? [],
  }));
};
