import { request } from '@/api/client';
import { buildQuery } from '@/api/utils';
import type {
  EpisodeFramePromptBatchResult,
  EpisodeWorkflowStatus,
  FramePromptHistoryEntry,
  FramePromptResult,
  FramePromptRollbackAuditEntry,
  ProjectFramePromptByWorkflowResult,
  Storyboard
} from '@/types/models';

type FramePromptType = 'opening' | 'middle' | 'ending' | 'action' | 'emotion';
type FramePromptShotSize = 'ecu' | 'cu' | 'mcu' | 'ms' | 'mls' | 'ls' | 'els';
type FramePromptCameraMove = 'static' | 'pan' | 'tilt' | 'dolly' | 'truck' | 'handheld';

type FramePromptPayload = {
  frameType: FramePromptType;
  style?: string;
  shotSize?: FramePromptShotSize;
  cameraMove?: FramePromptCameraMove;
  lighting?: string;
  mood?: string;
  instruction?: string;
  modelId?: string;
  customModel?: string;
};

type FramePromptHistoryQuery = {
  limit?: number;
  frameType?: FramePromptType;
  source?: 'single' | 'episode_batch' | 'workflow_batch' | 'rollback';
  startAt?: string;
  endAt?: string;
};

export const generateStoryboardFramePrompt = (
  projectId: string,
  storyboardId: string,
  payload: FramePromptPayload
): Promise<FramePromptResult> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/${storyboardId}/frame-prompt`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateDramaStoryboardFramePrompt = (
  dramaId: string,
  storyboardId: string,
  payload: FramePromptPayload
): Promise<FramePromptResult> =>
  request(`/api/pipeline/dramas/${dramaId}/storyboards/${storyboardId}/frame-prompt`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getStoryboardFramePromptHistory = (
  projectId: string,
  storyboardId: string,
  input: FramePromptHistoryQuery = {}
): Promise<FramePromptHistoryEntry[]> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/${storyboardId}/frame-prompts?${buildQuery(input)}`);

export const getDramaStoryboardFramePromptHistory = (
  dramaId: string,
  storyboardId: string,
  input: FramePromptHistoryQuery = {}
): Promise<FramePromptHistoryEntry[]> =>
  request(`/api/pipeline/dramas/${dramaId}/storyboards/${storyboardId}/frame-prompts?${buildQuery(input)}`);

export const rollbackStoryboardFramePrompt = (
  projectId: string,
  storyboardId: string,
  payload: { historyId: string; actor?: string; comment?: string }
): Promise<{ storyboard: Storyboard; restored: FramePromptHistoryEntry }> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/${storyboardId}/frame-prompts/rollback`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const rollbackDramaStoryboardFramePrompt = (
  dramaId: string,
  storyboardId: string,
  payload: { historyId: string; actor?: string; comment?: string }
): Promise<{ storyboard: Storyboard; restored: FramePromptHistoryEntry }> =>
  request(`/api/pipeline/dramas/${dramaId}/storyboards/${storyboardId}/frame-prompts/rollback`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getStoryboardFramePromptRollbackAudits = (
  projectId: string,
  storyboardId: string,
  input: { limit?: number; actor?: string; startAt?: string; endAt?: string } = {}
): Promise<FramePromptRollbackAuditEntry[]> =>
  request(`/api/pipeline/projects/${projectId}/storyboards/${storyboardId}/frame-prompts/rollback-audits?${buildQuery(input)}`);

export const getDramaStoryboardFramePromptRollbackAudits = (
  dramaId: string,
  storyboardId: string,
  input: { limit?: number; actor?: string; startAt?: string; endAt?: string } = {}
): Promise<FramePromptRollbackAuditEntry[]> =>
  request(`/api/pipeline/dramas/${dramaId}/storyboards/${storyboardId}/frame-prompts/rollback-audits?${buildQuery(input)}`);

export const generateEpisodeFramePromptsBatch = (
  projectId: string,
  episodeId: string,
  payload: FramePromptPayload & { saveAs?: 'none' | 'replace_storyboard_prompt'; limit?: number }
): Promise<EpisodeFramePromptBatchResult> =>
  request(`/api/pipeline/projects/${projectId}/episodes/${episodeId}/frame-prompts/batch`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateDramaEpisodeFramePromptsBatch = (
  dramaId: string,
  episodeId: string,
  payload: FramePromptPayload & { saveAs?: 'none' | 'replace_storyboard_prompt'; limit?: number }
): Promise<EpisodeFramePromptBatchResult> =>
  request(`/api/pipeline/dramas/${dramaId}/episodes/${episodeId}/frame-prompts/batch`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateProjectFramePromptsByWorkflow = (
  projectId: string,
  payload: FramePromptPayload & {
    statuses?: EpisodeWorkflowStatus[];
    saveAs?: 'none' | 'replace_storyboard_prompt';
    limitPerEpisode?: number;
    autoTransitionToInReview?: boolean;
    actor?: string;
    comment?: string;
  }
): Promise<ProjectFramePromptByWorkflowResult> =>
  request(`/api/pipeline/projects/${projectId}/frame-prompts/batch-by-workflow`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const generateDramaFramePromptsByWorkflow = (
  dramaId: string,
  payload: FramePromptPayload & {
    statuses?: EpisodeWorkflowStatus[];
    saveAs?: 'none' | 'replace_storyboard_prompt';
    limitPerEpisode?: number;
    autoTransitionToInReview?: boolean;
    actor?: string;
    comment?: string;
  }
): Promise<ProjectFramePromptByWorkflowResult> =>
  request(`/api/pipeline/dramas/${dramaId}/frame-prompts/batch-by-workflow`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
