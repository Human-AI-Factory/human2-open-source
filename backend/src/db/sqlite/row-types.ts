import type {
  EpisodeWorkflowStatus,
  TaskPriority,
  TaskStatus,
} from '../../core/types.js';

export type ProjectRow = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SummaryRow = {
  project_count: number;
  task_count: number;
  done_count: number;
  doing_count: number;
};

export type BusinessSummaryRow = {
  project_count: number;
  task_count: number;
  novel_count: number;
  outline_count: number;
  script_count: number;
  storyboard_count: number;
  asset_count: number;
  video_task_count: number;
  audio_task_count: number;
  video_merge_count: number;
};

export type NovelRow = {
  id: string;
  project_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type OutlineRow = {
  id: string;
  project_id: string;
  title: string;
  summary: string;
  order_index: number;
  created_at: string;
  updated_at: string;
};

export type ScriptRow = {
  id: string;
  project_id: string;
  outline_id: string;
  episode_id: string | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type StoryboardRow = {
  id: string;
  project_id: string;
  script_id: string;
  episode_id: string | null;
  scene_id: string | null;
  title: string;
  prompt: string;
  plan_json: string | null;
  image_url: string | null;
  first_frame_url: string | null;
  last_frame_url: string | null;
  status: 'draft' | 'generated';
  created_at: string;
  updated_at: string;
};

export type SceneRow = {
  id: string;
  project_id: string;
  name: string;
  description: string;
  prompt: string;
  storyboard_count: number;
  created_at: string;
  updated_at: string;
};

export type AssetRow = {
  id: string;
  project_id: string;
  storyboard_id: string;
  name: string;
  type: 'character' | 'scene' | 'prop';
  scope: 'base' | 'shot';
  share_scope: 'project' | 'shared';
  base_asset_id: string | null;
  prompt: string;
  state_prompt: string | null;
  state_json: string | null;
  image_url: string | null;
  video_url: string | null;
  first_frame_url: string | null;
  last_frame_url: string | null;
  voice_profile: string | null;
  created_at: string;
  updated_at: string;
};

export type StoryboardAssetLinkRow = {
  storyboard_id: string;
  asset_id: string;
  role: 'scene' | 'character' | 'prop';
  created_at: string;
};

export type VideoTaskRow = {
  id: string;
  project_id: string;
  storyboard_id: string;
  prompt: string;
  model_name: string | null;
  params: string;
  priority: 'low' | 'medium' | 'high';
  status: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: number;
  result_url: string | null;
  first_frame_url: string | null;
  last_frame_url: string | null;
  error: string | null;
  provider_task_id: string | null;
  attempt: number;
  next_retry_at: string | null;
  provider_error_code: string | null;
  created_at: string;
  updated_at: string;
};

export type VideoTaskListRow = VideoTaskRow & {
  project_name: string;
  storyboard_title: string;
};

export type VideoTaskEventRow = {
  id: number;
  task_id: string;
  status: 'queued' | 'submitting' | 'polling' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: number;
  error: string | null;
  created_at: string;
};

export type ModelConfigRow = {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio';
  name: string;
  provider: string;
  manufacturer: string;
  model: string;
  auth_type: 'bearer' | 'api_key' | 'none';
  endpoint: string;
  endpoints: string;
  api_key: string;
  capabilities: string;
  priority: number;
  rate_limit: number;
  is_default: number;
  enabled: number;
  created_at: string;
  updated_at: string;
};

export type AudioTaskRow = {
  id: string;
  project_id: string;
  storyboard_id: string;
  prompt: string;
  model_name: string | null;
  params: string;
  priority: 'low' | 'medium' | 'high';
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  result_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type VideoMergeRow = {
  id: string;
  project_id: string;
  title: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  clips: string;
  params: string;
  result_url: string | null;
  output_path: string | null;
  error_code: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type DramaRow = {
  id: string;
  project_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  style: string;
};

export type EpisodeRow = {
  id: string;
  project_id: string;
  drama_id: string;
  title: string;
  order_index: number;
  status: 'draft' | 'ready' | 'published';
  created_at: string;
  updated_at: string;
};

export type TimelinePlanRow = {
  id: string;
  project_id: string;
  episode_id: string;
  title: string;
  tracks: string;
  clips: string;
  created_at: string;
  updated_at: string;
};

export type EpisodeAssetLinkRow = {
  project_id: string;
  episode_id: string;
  asset_id: string;
  role: 'scene' | 'character' | 'prop';
  created_at: string;
};

export type DomainEntityRow = {
  id: string;
  project_id: string;
  type: 'character' | 'scene' | 'prop';
  lifecycle_status: 'draft' | 'in_review' | 'approved' | 'archived';
  name: string;
  prompt: string;
  image_url: string | null;
  deleted_at: string | null;
  merged_into_entity_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EpisodeDomainEntityLinkRow = {
  project_id: string;
  episode_id: string;
  entity_id: string;
  role: 'scene' | 'character' | 'prop';
  created_at: string;
};

export type StoryboardDomainEntityLinkRow = {
  project_id: string;
  storyboard_id: string;
  entity_id: string;
  role: 'scene' | 'character' | 'prop';
  created_at: string;
};

export type EpisodeWorkflowStateRow = {
  project_id: string;
  episode_id: string;
  status: EpisodeWorkflowStatus;
  updated_at: string;
};

export type EpisodeWorkflowAuditRow = {
  id: number;
  project_id: string;
  episode_id: string;
  from_status: EpisodeWorkflowStatus;
  to_status: EpisodeWorkflowStatus;
  actor: string;
  comment: string;
  created_at: string;
};

export type DomainEntityAuditRow = {
  id: number;
  project_id: string;
  actor: string;
  action: string;
  target_type: 'domain_entity' | 'episode_relation' | 'storyboard_relation' | 'apply';
  target_id: string;
  details: string;
  created_at: string;
};

export type PromptTemplateRow = {
  id: string;
  key: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type PromptTemplateVersionRow = {
  id: number;
  prompt_id: string;
  title: string;
  content: string;
  created_at: string;
};

export type SystemSettingRow = {
  key: string;
  value: string;
  updated_at: string;
};

export type SortOrder = 'asc' | 'desc';
