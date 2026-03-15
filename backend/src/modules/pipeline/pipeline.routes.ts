import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { Request, Response, Router, raw } from 'express';
import { z } from 'zod';
import { BIZ_CODE } from '../../constants/bizCode.js';
import { withAsyncRoute } from '../../utils/async-route.js';
import { parsePayload, parseQuery } from '../../utils/validation.js';
import { PipelineService } from './pipeline.service.js';
import { ProviderError } from './providers/errors.js';

const storyboardGenerateSchema = z.object({
  scriptId: z.string().min(1),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional(),
  resolution: z.string().min(2).max(16).optional(),
  aspectRatio: z.string().min(3).max(16).optional(),
  providerOptions: z.record(z.unknown()).optional()
});

const storyboardPlanSchema = z.object({
  scriptId: z.string().min(1)
});

const storyboardRenderSchema = z
  .object({
    scriptId: z.string().min(1).optional(),
    storyboardIds: z.array(z.string().min(1)).min(1).optional(),
    modelId: z.string().min(1).optional(),
    customModel: z.string().min(1).optional(),
    resolution: z.string().min(2).max(16).optional(),
    aspectRatio: z.string().min(3).max(16).optional(),
    providerOptions: z.record(z.unknown()).optional()
  })
  .refine((node) => Boolean(node.scriptId || (node.storyboardIds && node.storyboardIds.length > 0)), {
    message: 'scriptId or storyboardIds is required'
  });

const assetsGenerateSchema = z.object({
  storyboardId: z.string().min(1),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional(),
  resolution: z.string().min(2).max(16).optional(),
  aspectRatio: z.string().min(3).max(16).optional(),
  providerOptions: z.record(z.unknown()).optional()
});

const videoTaskCreateSchema = z.object({
  storyboardId: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional(),
  mode: z.enum(['text', 'singleImage', 'startEnd', 'multiImage', 'reference']).optional(),
  duration: z.coerce.number().int().min(1).max(120).optional(),
  resolution: z.string().min(2).max(16).optional(),
  aspectRatio: z.string().min(3).max(16).optional(),
  audio: z.boolean().optional(),
  imageInputs: z.array(z.string().url()).max(8).optional(),
  imageWithRoles: z
    .array(
      z.object({
        url: z.string().url(),
        role: z.enum(['first_frame', 'last_frame', 'reference'])
      })
    )
    .max(8)
    .optional(),
  endFrame: z.string().url().optional(),
  providerOptions: z.record(z.unknown()).optional()
});

const videoTaskBatchSchema = z.object({
  storyboardIds: z.array(z.string().min(1)).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional(),
  mode: z.enum(['text', 'singleImage', 'startEnd', 'multiImage', 'reference']).optional(),
  duration: z.coerce.number().int().min(1).max(120).optional(),
  resolution: z.string().min(2).max(16).optional(),
  aspectRatio: z.string().min(3).max(16).optional(),
  audio: z.boolean().optional(),
  imageInputs: z.array(z.string().url()).max(8).optional(),
  imageWithRoles: z
    .array(
      z.object({
        url: z.string().url(),
        role: z.enum(['first_frame', 'last_frame', 'reference'])
      })
    )
    .max(8)
    .optional(),
  endFrame: z.string().url().optional(),
  providerOptions: z.record(z.unknown()).optional()
});

const audioTaskCreateSchema = z.object({
  storyboardId: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional(),
  voice: z.string().min(1).max(64).optional(),
  speed: z.coerce.number().min(0.25).max(4).optional(),
  emotion: z.string().min(1).max(64).optional(),
  format: z.enum(['mp3', 'wav', 'aac', 'flac', 'ogg']).optional(),
  providerOptions: z.record(z.unknown()).optional()
});
const audioExtractCreateSchema = z
  .object({
    videoTaskId: z.string().min(1).optional(),
    sourceUrl: z.string().min(1).optional(),
    format: z.enum(['mp3', 'wav', 'aac', 'flac', 'ogg']).optional(),
    sampleRate: z.coerce.number().int().min(8000).max(96000).optional(),
    channels: z.coerce.number().int().min(1).max(8).optional(),
    bitrateKbps: z.coerce.number().int().min(32).max(320).optional()
  })
  .refine((node) => Boolean(node.videoTaskId || node.sourceUrl), {
    message: 'videoTaskId or sourceUrl is required'
  });

const videoMergeCreateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  clips: z
    .array(
      z.object({
        storyboardId: z.string().min(1),
        videoTaskId: z.string().min(1).optional(),
        sourceUrl: z.string().url().optional(),
        durationSec: z.coerce.number().min(0.1).max(600).optional(),
        startMs: z.coerce.number().int().min(0).max(60 * 60 * 1000).optional(),
        endMs: z.coerce.number().int().min(0).max(60 * 60 * 1000).optional(),
        trimStartMs: z.coerce.number().int().min(0).max(60 * 60 * 1000).optional(),
        trimEndMs: z.coerce.number().int().min(0).max(60 * 60 * 1000).optional(),
        speed: z.coerce.number().min(0.1).max(8).optional(),
        volume: z.coerce.number().min(0).max(200).optional(),
        muted: z.boolean().optional(),
        fadeInMs: z.coerce.number().int().min(0).max(30 * 1000).optional(),
        fadeOutMs: z.coerce.number().int().min(0).max(30 * 1000).optional(),
        transition: z
          .object({
            type: z.enum(['cut', 'fade', 'dissolve', 'wipeleft', 'wiperight', 'slideleft', 'slideright', 'circleopen', 'circleclose']),
            durationSec: z.coerce.number().min(0).max(5).optional(),
            easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']).optional(),
            direction: z.enum(['left', 'right', 'up', 'down']).optional()
          })
          .optional(),
        keyframe: z
          .object({
            startScale: z.coerce.number().min(0.1).max(5).optional(),
            endScale: z.coerce.number().min(0.1).max(5).optional(),
            startX: z.coerce.number().min(-100).max(100).optional(),
            startY: z.coerce.number().min(-100).max(100).optional(),
            endX: z.coerce.number().min(-100).max(100).optional(),
            endY: z.coerce.number().min(-100).max(100).optional(),
            rotationDeg: z.coerce.number().min(-180).max(180).optional()
          })
          .optional()
      })
    )
    .min(1)
    .max(200),
  params: z
    .object({
      keepAudio: z.boolean().optional(),
      fps: z.coerce.number().int().min(12).max(60).optional(),
      crf: z.coerce.number().int().min(16).max(40).optional(),
      preset: z.enum(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow']).optional()
    })
    .optional()
});

const fullChainRunSchema = z.object({
  scriptId: z.string().min(1)
});

const storyboardRewriteSchema = z.object({
  instruction: z.string().min(1),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional()
});

const storyboardVideoPromptSchema = z.object({
  style: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional()
});
const storyboardFramePromptSchema = z.object({
  frameType: z.enum(['opening', 'middle', 'ending', 'action', 'emotion']),
  style: z.string().min(1).max(80).optional(),
  shotSize: z.enum(['ecu', 'cu', 'mcu', 'ms', 'mls', 'ls', 'els']).optional(),
  cameraMove: z.enum(['static', 'pan', 'tilt', 'dolly', 'truck', 'handheld']).optional(),
  lighting: z.string().min(1).max(120).optional(),
  mood: z.string().min(1).max(120).optional(),
  instruction: z.string().min(1).max(2000).optional(),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional()
});
const storyboardFramePromptHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  frameType: z.enum(['opening', 'middle', 'ending', 'action', 'emotion']).optional(),
  source: z.enum(['single', 'episode_batch', 'workflow_batch', 'rollback']).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional()
});
const storyboardFramePromptRollbackSchema = z.object({
  historyId: z.string().min(1),
  actor: z.string().min(1).max(120).optional(),
  comment: z.string().max(2000).optional()
});
const storyboardFramePromptRollbackAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  actor: z.string().trim().max(120).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional()
});
const episodeDeliveryVersionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional()
});
const episodeDeliveryCompareQuerySchema = z.object({
  currentVersionId: z.string().min(1),
  previousVersionId: z.string().min(1).optional()
});
const episodeDeliveryCompareReportQuerySchema = episodeDeliveryCompareQuerySchema.extend({
  format: z.enum(['json', 'csv']).optional()
});
const episodeDeliveryPackageQuerySchema = z.object({
  versionId: z.string().min(1).optional()
});
const episodeDeliveryPackageZipQuerySchema = z.object({
  versionId: z.string().min(1).optional(),
  includeMedia: z
    .union([z.coerce.boolean(), z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }
      if (value === 'true') {
        return true;
      }
      if (value === 'false') {
        return false;
      }
      return value;
    })
});
const episodeBatchFramePromptSchema = storyboardFramePromptSchema.extend({
  saveAs: z.enum(['none', 'replace_storyboard_prompt']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});
const projectBatchFramePromptByWorkflowSchema = storyboardFramePromptSchema.extend({
  statuses: z.array(z.enum(['draft', 'in_review', 'approved', 'rejected'])).max(4).optional(),
  saveAs: z.enum(['none', 'replace_storyboard_prompt']).optional(),
  limitPerEpisode: z.coerce.number().int().min(1).max(200).optional(),
  autoTransitionToInReview: z.boolean().optional(),
  actor: z.string().min(1).max(120).optional(),
  comment: z.string().max(2000).optional()
});

const storyboardUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  imageUrl: z.string().url().nullable().optional(),
  firstFrameUrl: z.string().url().nullable().optional(),
  lastFrameUrl: z.string().url().nullable().optional(),
  sceneId: z.string().min(1).nullable().optional(),
  episodeId: z.string().min(1).nullable().optional()
});

const assetVoiceProfileSchema = z.object({
  voice: z.string().min(1).max(120),
  speed: z.coerce.number().min(0.25).max(4).optional(),
  providerOptions: z.record(z.unknown()).optional(),
  provider: z.string().optional()
});

const sceneCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  prompt: z.string().max(5000).optional()
});

const sceneUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  prompt: z.string().max(5000).optional()
});

const storyboardRelationsReplaceSchema = z.object({
  sceneAssetId: z.string().min(1).nullable().optional(),
  characterAssetIds: z.array(z.string().min(1)).max(50).optional(),
  propAssetIds: z.array(z.string().min(1)).max(50).optional()
});

const storyboardShotImageSchema = z.object({
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional(),
  resolution: z.string().min(2).max(16).optional(),
  aspectRatio: z.string().min(3).max(16).optional(),
  instruction: z.string().min(1).optional(),
  providerOptions: z.record(z.unknown()).optional()
});

const storyboardBatchSuperResSchema = z.object({
  storyboardIds: z.array(z.string().min(1)).optional(),
  scale: z.coerce.number().int().min(2).max(8).optional(),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional(),
  resolution: z.string().min(2).max(16).optional(),
  aspectRatio: z.string().min(3).max(16).optional()
});

const storyboardUploadImageSchema = z.object({
  imageUrl: z.string().url()
});

const timelineClipSchema = z.object({
  id: z.string().min(1).optional(),
  storyboardId: z.string().min(1),
  videoTaskId: z.string().min(1).optional(),
  sourceUrl: z.string().min(1).optional(),
  durationSec: z.coerce.number().min(0.1).max(600).optional(),
  startMs: z.coerce.number().int().min(0).max(60 * 60 * 1000).optional(),
  endMs: z.coerce.number().int().min(0).max(60 * 60 * 1000).optional(),
  trimStartMs: z.coerce.number().int().min(0).max(60 * 60 * 1000).optional(),
  trimEndMs: z.coerce.number().int().min(0).max(60 * 60 * 1000).optional(),
  speed: z.coerce.number().min(0.1).max(8).optional(),
  volume: z.coerce.number().min(0).max(200).optional(),
  muted: z.boolean().optional(),
  fadeInMs: z.coerce.number().int().min(0).max(30 * 1000).optional(),
  fadeOutMs: z.coerce.number().int().min(0).max(30 * 1000).optional(),
  transition: z
    .object({
      type: z.enum(['cut', 'fade', 'dissolve', 'wipeleft', 'wiperight', 'slideleft', 'slideright', 'circleopen', 'circleclose']),
      durationSec: z.coerce.number().min(0).max(5).optional(),
      easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']).optional(),
      direction: z.enum(['left', 'right', 'up', 'down']).optional()
    })
    .optional(),
  keyframe: z
    .object({
      startScale: z.coerce.number().min(0.1).max(5).optional(),
      endScale: z.coerce.number().min(0.1).max(5).optional(),
      startX: z.coerce.number().min(-100).max(100).optional(),
      startY: z.coerce.number().min(-100).max(100).optional(),
      endX: z.coerce.number().min(-100).max(100).optional(),
      endY: z.coerce.number().min(-100).max(100).optional(),
      rotationDeg: z.coerce.number().min(-180).max(180).optional()
    })
    .optional(),
  effects: z
    .array(
      z.object({
        id: z.string().min(1).optional(),
        type: z.enum(['filter', 'color', 'blur', 'brightness', 'contrast', 'saturation', 'crop']),
        name: z.string().min(1).max(120).optional(),
        enabled: z.boolean().optional(),
        order: z.coerce.number().int().min(0).max(999).optional(),
        config: z.record(z.unknown()).optional()
      })
    )
    .max(20)
    .optional()
});

const timelineTrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  type: z.enum(['video', 'audio', 'text']),
  order: z.coerce.number().int().min(0).max(999).optional(),
  isLocked: z.boolean().optional(),
  isMuted: z.boolean().optional(),
  volume: z.coerce.number().int().min(0).max(200).optional(),
  clips: z.array(timelineClipSchema).max(500).optional()
});

const timelineGetQuerySchema = z.object({
  episodeId: z.string().min(1).optional()
});

const timelineSaveSchema = z.object({
  id: z.string().min(1).optional(),
  episodeId: z.string().min(1).nullable().optional(),
  title: z.string().min(1).max(120).optional(),
  tracks: z.array(timelineTrackSchema).max(50).optional(),
  clips: z.array(timelineClipSchema).min(1).max(300).optional()
}).refine((node) => Array.isArray(node.tracks) || Array.isArray(node.clips), {
  message: 'tracks or clips is required'
});

const timelineAudioTrackSyncSchema = z.object({
  episodeId: z.string().min(1).nullable().optional()
});

const timelineSubtitleGenerateSchema = z.object({
  episodeId: z.string().min(1).nullable().optional(),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional()
});

const timelineAudioBatchSchema = z.object({
  episodeId: z.string().min(1).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional(),
  voice: z.string().min(1).max(64).optional(),
  speed: z.coerce.number().min(0.25).max(4).optional(),
  emotion: z.string().min(1).max(64).optional(),
  format: z.enum(['mp3', 'wav', 'aac', 'flac', 'ogg']).optional(),
  providerOptions: z.record(z.unknown()).optional()
});

const episodeBatchAssetsSchema = z.object({
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional(),
  resolution: z.string().min(2).max(16).optional(),
  aspectRatio: z.string().min(3).max(16).optional(),
  providerOptions: z.record(z.unknown()).optional(),
  scope: z.enum(['base', 'shot']).optional()
});

const episodeBatchVideoTasksSchema = z.object({
  priority: z.enum(['low', 'medium', 'high']).optional(),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional(),
  mode: z.enum(['text', 'singleImage', 'startEnd', 'multiImage', 'reference']).optional(),
  duration: z.coerce.number().int().min(1).max(120).optional(),
  resolution: z.string().min(2).max(16).optional(),
  aspectRatio: z.string().min(3).max(16).optional(),
  audio: z.boolean().optional(),
  imageInputs: z.array(z.string().url()).max(8).optional(),
  imageWithRoles: z
    .array(
      z.object({
        url: z.string().url(),
        role: z.enum(['first_frame', 'last_frame', 'reference'])
      })
    )
    .max(8)
    .optional(),
  endFrame: z.string().url().optional(),
  providerOptions: z.record(z.unknown()).optional()
});

const episodesBatchAssetsSchema = episodeBatchAssetsSchema.extend({
  episodeIds: z.array(z.string().min(1)).max(500).optional()
});

const episodesBatchVideoTasksSchema = episodeBatchVideoTasksSchema.extend({
  episodeIds: z.array(z.string().min(1)).max(500).optional()
});

const episodesBatchPrecheckSchema = z.object({
  episodeIds: z.array(z.string().min(1)).max(500).optional()
});
const episodeFinalizeSchema = z.object({
  actor: z.string().min(1).max(120).optional(),
  comment: z.string().max(2000).optional()
});

const uploadImageBodySchema = z.object({
  purpose: z.enum(['storyboard', 'asset']),
  storyboardId: z.string().min(1),
  assetId: z.string().min(1).optional(),
  assetType: z.enum(['character', 'scene', 'prop']).optional(),
  assetName: z.string().max(120).optional(),
  prompt: z.string().max(5000).optional()
});
const uploadObjectImageQuerySchema = z.object({
  storyboardId: z.string().min(1).optional()
});

type MultipartFilePart = {
  filename: string;
  contentType: string;
  data: Buffer;
};

const parseMultipartFormData = (
  contentType: string | undefined,
  body: Buffer
): { fields: Record<string, string>; file: MultipartFilePart | null } => {
  if (!contentType) {
    throw new Error('Content-Type is required');
  }
  const match = contentType.match(/boundary=([^;]+)/i);
  if (!match) {
    throw new Error('Missing multipart boundary');
  }
  const boundary = `--${match[1].trim()}`;
  const rawText = body.toString('binary');
  const parts = rawText.split(boundary).slice(1, -1);
  const fields: Record<string, string> = {};
  let file: MultipartFilePart | null = null;

  for (const rawPart of parts) {
    const normalized = rawPart.replace(/^\r\n/, '').replace(/\r\n$/, '');
    if (!normalized) {
      continue;
    }
    const split = normalized.indexOf('\r\n\r\n');
    if (split < 0) {
      continue;
    }
    const headersText = normalized.slice(0, split);
    const contentText = normalized.slice(split + 4);
    const lines = headersText.split('\r\n');
    const disposition = lines.find((line) => line.toLowerCase().startsWith('content-disposition:'));
    if (!disposition) {
      continue;
    }
    const nameMatch = disposition.match(/name="([^"]+)"/i);
    if (!nameMatch) {
      continue;
    }
    const fieldName = nameMatch[1];
    const filenameMatch = disposition.match(/filename="([^"]*)"/i);
    if (filenameMatch) {
      const contentTypeLine = lines.find((line) => line.toLowerCase().startsWith('content-type:'));
      const partType = contentTypeLine ? contentTypeLine.split(':')[1].trim() : 'application/octet-stream';
      file = {
        filename: filenameMatch[1] || 'upload.bin',
        contentType: partType,
        data: Buffer.from(contentText, 'binary')
      };
      continue;
    }
    fields[fieldName] = Buffer.from(contentText, 'binary').toString('utf-8').trim();
  }

  return { fields, file };
};

const assetCreateSchema = z.object({
  storyboardId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['character', 'scene', 'prop']),
  prompt: z.string().min(1),
  imageUrl: z.string().url().nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
  firstFrameUrl: z.string().url().nullable().optional(),
  lastFrameUrl: z.string().url().nullable().optional(),
  voiceProfile: assetVoiceProfileSchema.nullable().optional()
});

const assetUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['character', 'scene', 'prop']).optional(),
  prompt: z.string().min(1).optional(),
  imageUrl: z.string().url().nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
  firstFrameUrl: z.string().url().nullable().optional(),
  lastFrameUrl: z.string().url().nullable().optional(),
  voiceProfile: assetVoiceProfileSchema.nullable().optional()
});

const assetPolishSchema = z.object({
  instruction: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional()
});

const assetRedrawSchema = z.object({
  instruction: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional(),
  resolution: z.string().min(2).max(16).optional(),
  aspectRatio: z.string().min(3).max(16).optional(),
  providerOptions: z.record(z.unknown()).optional()
});

export const buildPipelineRouter = (service: PipelineService): Router => {
  const router = Router();
  const fail = (res: Response, status: number, message: string, bizCode: string) =>
    res.status(status).json({ message, bizCode });
  const failInvalidPayload = (res: Response) => fail(res, 400, 'Invalid payload', BIZ_CODE.INVALID_PAYLOAD);
  const failNotFound = (res: Response, message: string) => fail(res, 404, message, BIZ_CODE.NOT_FOUND);
  const failKnownError = (res: Response, err: Error, allowQueueConflict = false) => {
    const msg = err.message;
    if (err instanceof ProviderError) {
      if (err.kind === 'rate_limit') {
        return fail(res, err.statusCode ?? 429, msg, BIZ_CODE.PROVIDER_RATE_LIMITED);
      }
      if (err.kind === 'auth') {
        return fail(res, err.statusCode ?? 401, msg, BIZ_CODE.UNAUTHORIZED);
      }
      if (err.kind === 'validation') {
        return fail(res, err.statusCode ?? 400, msg, BIZ_CODE.INVALID_PAYLOAD);
      }
      if (err.kind === 'transient') {
        return fail(res, err.statusCode ?? 502, msg, BIZ_CODE.INTERNAL_ERROR);
      }
    }
    if (allowQueueConflict && msg.includes('queue is full')) {
      return fail(res, 409, msg, BIZ_CODE.QUEUE_FULL);
    }
    if (msg.includes('daily video task quota exceeded')) {
      return fail(res, 409, msg, BIZ_CODE.CONFLICT);
    }
    if (msg.includes('does not support')) {
      const bizCode = msg.includes('Model ') ? BIZ_CODE.CAPABILITY_MISMATCH : BIZ_CODE.MODEL_NOT_SUPPORTED;
      return fail(res, 400, msg, bizCode);
    }
    if (msg.includes('Invalid video mode') || msg.includes('requires')) {
      return fail(res, 400, msg, BIZ_CODE.CAPABILITY_MISMATCH);
    }
    return null;
  };
  const resolveProjectIdByDrama = (res: Response, dramaId: string): string | null => {
    const projectId = service.resolveProjectIdByDrama(dramaId);
    if (!projectId) {
      failNotFound(res, 'Drama not found');
      return null;
    }
    return projectId;
  };

  router.get('/dramas/:dramaId/storyboards', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const items = service.listStoryboards(projectId);
    if (!items) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(items);
  });

  router.get('/dramas/:dramaId/assets', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const items = service.listAssets(projectId);
    if (!items) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(items);
  });

  router.get('/projects/:projectId/episodes/:episodeId/assets', (req, res) => {
    const projectId = req.params.projectId;
    const episodeId = req.params.episodeId;
    const items = service.listAssetsByEpisode(projectId, episodeId);
    if (!items) {
      return failNotFound(res, 'Project or Episode not found');
    }
    return res.json(items);
  });

  router.get('/projects/:projectId/episodes/:episodeId/domain-entities', (req, res) => {
    const projectId = req.params.projectId;
    const episodeId = req.params.episodeId;
    const items = service.listDomainEntitiesByEpisode(projectId, episodeId);
    if (!items) {
      return failNotFound(res, 'Project or Episode not found');
    }
    return res.json(items);
  });

  router.get('/dramas/:dramaId/video-tasks', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const items = service.listVideoTasks(projectId);
    if (!items) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(items);
  });

  router.get('/dramas/:dramaId/audio-tasks', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const items = service.listAudioTasks(projectId);
    if (!items) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(items);
  });

  router.get('/dramas/:dramaId/video-merges', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const items = service.listVideoMerges(projectId);
    if (!items) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(items);
  });

  router.get('/dramas/:dramaId/timeline', (req, res) => {
    const query = parseQuery(timelineGetQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const item = service.getTimelinePlan(projectId, query.episodeId ?? null);
    if (!item) {
      return failNotFound(res, 'Project or episode not found');
    }
    return res.json(item);
  });

  router.put('/dramas/:dramaId/timeline', (req, res) => {
    const payload = parsePayload(timelineSaveSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    try {
      const normalizedTracks = payload.tracks?.map((track, index) => ({
        id: track.id,
        name: track.name,
        type: track.type,
        order: track.order ?? index,
        isLocked: track.isLocked ?? false,
        isMuted: track.isMuted ?? false,
        volume: track.volume ?? 100,
        clips: track.clips ?? []
      }));
      const item = service.saveTimelinePlan(projectId, {
        id: payload.id,
        episodeId: payload.episodeId ?? null,
        title: payload.title,
        tracks: normalizedTracks,
        clips: payload.clips ?? []
      });
      if (!item) {
        return failNotFound(res, 'Project or episode not found');
      }
      return res.json(item);
    } catch (err) {
      if (err instanceof Error) {
        return fail(res, 400, err.message, BIZ_CODE.INVALID_PAYLOAD);
      }
      throw err;
    }
  });

  router.post('/dramas/:dramaId/timeline/video-merge', async (req, res) => {
    const payload = parsePayload(
      z.object({
        episodeId: z.string().min(1).nullable().optional(),
        title: z.string().min(1).max(120).optional()
      }),
      req.body ?? {},
      res,
      fail
    );
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const merge = await service.createVideoMergeFromTimeline(projectId, payload.episodeId ?? null, payload.title);
    if (!merge) {
      return failNotFound(res, 'Project or timeline not found');
    }
    return res.status(201).json(merge);
  });

  router.post('/dramas/:dramaId/timeline/audio-tasks/batch', async (req, res) => {
    const payload = parsePayload(timelineAudioBatchSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    let result;
    try {
      result = await service.createTimelineAudioTasksBatch(projectId, payload.episodeId ?? null, payload.priority, {
        modelId: payload.modelId,
        customModel: payload.customModel,
        voice: payload.voice,
        speed: payload.speed,
        emotion: payload.emotion,
        format: payload.format,
        providerOptions: payload.providerOptions
      });
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
    if (!result) {
      return failNotFound(res, 'Project or timeline not found');
    }
    return res.status(201).json(result);
  });

  router.post('/dramas/:dramaId/timeline/audio-track/sync', (req, res) => {
    const payload = parsePayload(timelineAudioTrackSyncSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const result = service.syncTimelineAudioTrack(projectId, payload.episodeId ?? null);
    if (!result) {
      return failNotFound(res, 'Project or timeline not found');
    }
    return res.json(result);
  });

  router.post('/dramas/:dramaId/timeline/subtitles/generate', async (req, res) => {
    const payload = parsePayload(timelineSubtitleGenerateSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const result = await service.generateTimelineSubtitleTrack(projectId, payload.episodeId ?? null, {
      modelId: payload.modelId,
      customModel: payload.customModel
    });
    if (!result) {
      return failNotFound(res, 'Project or timeline not found');
    }
    return res.json(result);
  });

  router.post('/dramas/:dramaId/episodes/batch/assets/precheck', (req, res) => {
    const payload = parsePayload(episodesBatchPrecheckSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const result = service.precheckEpisodesAssetsBatch(projectId, payload);
    if (!result) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(result);
  });

  router.post('/dramas/:dramaId/episodes/batch/assets/generate', withAsyncRoute(async (
    req: { params: { dramaId: string }; body: unknown },
    res
  ) => {
    const payload = parsePayload(episodesBatchAssetsSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    try {
      const result = await service.generateEpisodesAssetsBatch(projectId, payload);
      if (!result) {
        return failNotFound(res, 'Project not found');
      }
      return res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
  }));

  router.post('/dramas/:dramaId/episodes/batch/video-tasks/precheck', (req, res) => {
    const payload = parsePayload(episodesBatchPrecheckSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const result = service.precheckEpisodesVideoTasksBatch(projectId, payload);
    if (!result) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(result);
  });

  router.post('/dramas/:dramaId/episodes/batch/video-tasks', async (req, res) => {
    const payload = parsePayload(episodesBatchVideoTasksSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    try {
      const result = await service.createEpisodesVideoTasksBatch(projectId, payload);
      if (!result) {
        return failNotFound(res, 'Project not found');
      }
      return res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
  });

  router.post('/dramas/:dramaId/storyboards/:storyboardId/rewrite', async (req, res) => {
    const payload = parsePayload(storyboardRewriteSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const storyboard = await service.rewriteStoryboardPrompt(projectId, req.params.storyboardId, payload);
    if (!storyboard) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(storyboard);
  });

  router.post('/dramas/:dramaId/storyboards/:storyboardId/video-prompt', async (req, res) => {
    const payload = parsePayload(storyboardVideoPromptSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const result = await service.generateVideoPrompt(projectId, req.params.storyboardId, payload);
    if (!result) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(result);
  });

  router.post('/dramas/:dramaId/storyboards/:storyboardId/frame-prompt', async (req, res) => {
    const payload = parsePayload(storyboardFramePromptSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const result = await service.generateFramePrompt(projectId, req.params.storyboardId, payload);
    if (!result) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(result);
  });

  router.get('/dramas/:dramaId/storyboards/:storyboardId/frame-prompts', (req, res) => {
    const query = parseQuery(storyboardFramePromptHistoryQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const items = service.listStoryboardFramePromptHistory(projectId, req.params.storyboardId, query);
    if (!items) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(items);
  });

  router.post('/dramas/:dramaId/storyboards/:storyboardId/frame-prompts/rollback', (req, res) => {
    const payload = parsePayload(storyboardFramePromptRollbackSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const output = service.rollbackStoryboardFramePrompt(projectId, req.params.storyboardId, payload.historyId, {
      actor: payload.actor,
      comment: payload.comment
    });
    if (!output) {
      return failNotFound(res, 'Storyboard or history not found');
    }
    return res.json(output);
  });

  router.get('/dramas/:dramaId/storyboards/:storyboardId/frame-prompts/rollback-audits', (req, res) => {
    const query = parseQuery(storyboardFramePromptRollbackAuditQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const items = service.listStoryboardFramePromptRollbackAudits(projectId, req.params.storyboardId, query);
    if (!items) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(items);
  });

  router.post('/dramas/:dramaId/episodes/:episodeId/frame-prompts/batch', async (req, res) => {
    const payload = parsePayload(episodeBatchFramePromptSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const result = await service.generateEpisodeFramePromptsBatch(projectId, req.params.episodeId, payload);
    if (!result) {
      return failNotFound(res, 'Episode not found');
    }
    return res.json(result);
  });

  router.post('/dramas/:dramaId/frame-prompts/batch-by-workflow', async (req, res) => {
    const payload = parsePayload(projectBatchFramePromptByWorkflowSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const result = await service.generateProjectFramePromptsByWorkflow(projectId, payload);
    if (!result) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(result);
  });

  router.post('/dramas/:dramaId/storyboards/:storyboardId/shot-image', withAsyncRoute(async (
    req: { params: { dramaId: string; storyboardId: string }; body: unknown },
    res
  ) => {
    const payload = parsePayload(storyboardShotImageSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    try {
      const storyboard = await service.generateShotImage(projectId, req.params.storyboardId, payload);
      if (!storyboard) {
        return failNotFound(res, 'Storyboard not found');
      }
      return res.json(storyboard);
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support')) {
        return failKnownError(res, err);
      }
      throw err;
    }
  }));

  router.post('/dramas/:dramaId/storyboards/batch-super-res', async (req, res) => {
    const payload = parsePayload(storyboardBatchSuperResSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    try {
      const result = await service.batchSuperResStoryboards(projectId, payload);
      if (!result) {
        return failNotFound(res, 'Project not found');
      }
      return res.json(result);
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support')) {
        return failKnownError(res, err);
      }
      throw err;
    }
  });

  router.post('/dramas/:dramaId/storyboards/:storyboardId/upload-image', (req, res) => {
    const payload = parsePayload(storyboardUploadImageSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const storyboard = service.uploadStoryboardImage(projectId, req.params.storyboardId, payload.imageUrl);
    if (!storyboard) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(storyboard);
  });

  router.post('/dramas/:dramaId/assets/:assetId/polish-prompt', async (req, res) => {
    const payload = parsePayload(assetPolishSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const asset = await service.polishAssetPrompt(projectId, req.params.assetId, payload);
    if (!asset) {
      return failNotFound(res, 'Asset not found');
    }
    return res.json(asset);
  });

  router.post('/dramas/:dramaId/assets/:assetId/redraw-image', async (req, res) => {
    const payload = parsePayload(assetRedrawSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    try {
      const asset = await service.redrawAssetImage(projectId, req.params.assetId, payload);
      if (!asset) {
        return failNotFound(res, 'Asset not found');
      }
      return res.json(asset);
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support')) {
        return failKnownError(res, err);
      }
      throw err;
    }
  });

  router.post('/dramas/:dramaId/storyboards/generate', withAsyncRoute(async (
    req: { params: { dramaId: string }; body: unknown },
    res
  ) => {
    const payload = parsePayload(storyboardGenerateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    let items;
    try {
      items = await service.generateStoryboards(projectId, payload.scriptId, {
        modelId: payload.modelId,
        customModel: payload.customModel,
        resolution: payload.resolution,
        aspectRatio: payload.aspectRatio,
        providerOptions: payload.providerOptions
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support')) {
        return failKnownError(res, err);
      }
      throw err;
    }
    if (!items) {
      return failNotFound(res, 'Script not found');
    }
    return res.json(items);
  }));

  router.post('/dramas/:dramaId/storyboards/plan', withAsyncRoute(async (
    req: { params: { dramaId: string }; body: unknown },
    res
  ) => {
    const payload = parsePayload(storyboardPlanSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const items = await service.planStoryboards(projectId, payload.scriptId);
    if (!items) {
      return failNotFound(res, 'Script not found');
    }
    return res.json(items);
  }));

  router.post('/dramas/:dramaId/storyboards/render', withAsyncRoute(async (
    req: { params: { dramaId: string }; body: unknown },
    res
  ) => {
    const payload = parsePayload(storyboardRenderSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    let items;
    try {
      items = await service.renderStoryboardImages(projectId, payload);
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support')) {
        return failKnownError(res, err);
      }
      throw err;
    }
    if (!items) {
      return failNotFound(res, 'Storyboard render target not found');
    }
    return res.json(items);
  }));

  router.patch('/dramas/:dramaId/storyboards/:storyboardId', (req, res) => {
    const payload = parsePayload(storyboardUpdateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const storyboard = service.updateStoryboard(projectId, req.params.storyboardId, payload);
    if (!storyboard) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(storyboard);
  });

  router.put('/dramas/:dramaId/storyboards/:storyboardId/relations', (req, res) => {
    const payload = parsePayload(storyboardRelationsReplaceSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const items = service.replaceStoryboardAssetRelations(projectId, req.params.storyboardId, payload);
    if (!items) {
      return failNotFound(res, 'Storyboard or assets not found');
    }
    return res.json(items);
  });

  router.post('/dramas/:dramaId/assets/generate', async (req, res) => {
    const payload = parsePayload(assetsGenerateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    let items;
    try {
      items = await service.generateAssets(projectId, payload.storyboardId, {
        modelId: payload.modelId,
        customModel: payload.customModel,
        resolution: payload.resolution,
        aspectRatio: payload.aspectRatio,
        providerOptions: payload.providerOptions
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support')) {
        return failKnownError(res, err);
      }
      throw err;
    }
    if (!items) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(items);
  });

  router.post('/dramas/:dramaId/assets', (req, res) => {
    const payload = parsePayload(assetCreateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const asset = service.createAsset(projectId, payload);
    if (!asset) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.status(201).json(asset);
  });

  router.patch('/dramas/:dramaId/assets/:assetId', (req, res) => {
    const payload = parsePayload(assetUpdateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const asset = service.updateAsset(projectId, req.params.assetId, payload);
    if (!asset) {
      return failNotFound(res, 'Asset not found');
    }
    return res.json(asset);
  });

  router.delete('/dramas/:dramaId/assets/:assetId', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const ok = service.deleteAsset(projectId, req.params.assetId);
    if (!ok) {
      return failNotFound(res, 'Asset not found');
    }
    return res.status(204).send();
  });

  router.post('/dramas/:dramaId/video-tasks', async (req, res) => {
    const payload = parsePayload(videoTaskCreateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    let task;
    try {
      task = await service.createAndRunVideoTask(projectId, payload.storyboardId, payload.priority, {
        modelId: payload.modelId,
        customModel: payload.customModel,
        mode: payload.mode,
        duration: payload.duration,
        resolution: payload.resolution,
        aspectRatio: payload.aspectRatio,
        audio: payload.audio,
        imageInputs: payload.imageInputs,
        imageWithRoles: payload.imageWithRoles,
        endFrame: payload.endFrame,
        providerOptions: payload.providerOptions
      });
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err, true);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
    if (!task) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.status(201).json(task);
  });

  router.post('/dramas/:dramaId/video-tasks/:taskId/retry', async (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    let task;
    try {
      task = await service.retryVideoTask(projectId, req.params.taskId);
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err, true);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
    if (!task) {
      return failNotFound(res, 'Video task not found');
    }
    return res.json(task);
  });

  router.post('/dramas/:dramaId/video-tasks/:taskId/cancel', async (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const task = await service.cancelVideoTask(projectId, req.params.taskId);
    if (!task) {
      return failNotFound(res, 'Video task not found');
    }
    return res.json(task);
  });

  router.post('/dramas/:dramaId/video-tasks/batch', async (req, res) => {
    const payload = parsePayload(videoTaskBatchSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    let result;
    try {
      result = await service.createVideoTasksBatch(projectId, payload.storyboardIds, payload.priority, {
        modelId: payload.modelId,
        customModel: payload.customModel,
        mode: payload.mode,
        duration: payload.duration,
        resolution: payload.resolution,
        aspectRatio: payload.aspectRatio,
        audio: payload.audio,
        imageInputs: payload.imageInputs,
        imageWithRoles: payload.imageWithRoles,
        endFrame: payload.endFrame,
        providerOptions: payload.providerOptions
      });
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
    if (!result) {
      return failNotFound(res, 'Project not found');
    }
    return res.status(201).json(result);
  });

  router.post('/dramas/:dramaId/video-merges', async (req, res) => {
    const payload = parsePayload(videoMergeCreateSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    try {
      const item = await service.createAndRunVideoMerge(projectId, payload);
      if (!item) {
        return failNotFound(res, 'Project not found');
      }
      return res.status(201).json(item);
    } catch (err) {
      if (err instanceof Error) {
        return fail(res, 400, err.message, BIZ_CODE.INVALID_PAYLOAD);
      }
      throw err;
    }
  });

  router.post('/dramas/:dramaId/video-merges/:mergeId/retry', async (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const item = await service.retryVideoMerge(projectId, req.params.mergeId);
    if (!item) {
      return failNotFound(res, 'Video merge not found');
    }
    return res.json(item);
  });

  router.post('/dramas/:dramaId/full-chain/run', async (req, res) => {
    const payload = parsePayload(fullChainRunSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const result = await service.runFullChainFromScript(projectId, payload.scriptId);
    if (!result) {
      return failNotFound(res, 'Script not found');
    }
    return res.status(201).json(result);
  });

  router.post('/dramas/:dramaId/audio-tasks', async (req, res) => {
    const payload = parsePayload(audioTaskCreateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    let task;
    try {
      task = await service.createAndRunAudioTask(projectId, payload.storyboardId, payload.priority, {
        modelId: payload.modelId,
        customModel: payload.customModel,
        voice: payload.voice,
        speed: payload.speed,
        emotion: payload.emotion,
        format: payload.format,
        providerOptions: payload.providerOptions
      });
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
    if (!task) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.status(201).json(task);
  });

  router.post('/dramas/:dramaId/audio-tasks/:taskId/retry', async (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    let task;
    try {
      task = await service.retryAudioTask(projectId, req.params.taskId);
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
    if (!task) {
      return failNotFound(res, 'Audio task not found');
    }
    return res.json(task);
  });

  router.get('/dramas/:dramaId/audio-tasks/:taskId/file', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const resolved = service.resolveAudioTaskDownload(projectId, req.params.taskId);
    if ('reason' in resolved && resolved.reason === 'not_found') {
      return failNotFound(res, 'Audio task not found');
    }
    if ('reason' in resolved && resolved.reason === 'not_ready') {
      return fail(res, 409, 'Audio task file not ready', BIZ_CODE.CONFLICT);
    }
    if ('reason' in resolved && resolved.reason === 'forbidden') {
      return fail(res, 403, 'Invalid audio task output path', BIZ_CODE.FORBIDDEN);
    }
    if ('path' in resolved) {
      return res.sendFile(path.resolve(resolved.path));
    }
    return failNotFound(res, 'Audio task file not found');
  });

  router.post('/dramas/:dramaId/audio-extracts', async (req, res) => {
    const payload = parsePayload(audioExtractCreateSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    try {
      const item = await service.createAndRunAudioExtract(projectId, payload);
      if (!item) {
        return failNotFound(res, 'Project not found');
      }
      return res.status(201).json(item);
    } catch (err) {
      if (err instanceof Error) {
        return fail(res, 400, err.message, BIZ_CODE.INVALID_PAYLOAD);
      }
      throw err;
    }
  });

  router.get('/projects/:projectId/storyboards', (req, res) => {
    const items = service.listStoryboards(req.params.projectId);
    if (!items) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(items);
  });

  router.get('/projects/:projectId/scenes', (req, res) => {
    const items = service.listScenes(req.params.projectId);
    if (!items) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(items);
  });

  router.post('/projects/:projectId/scenes', (req, res) => {
    const payload = parsePayload(sceneCreateSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const created = service.createScene(req.params.projectId, payload);
    if (!created) {
      return failNotFound(res, 'Project not found');
    }
    return res.status(201).json(created);
  });

  router.patch('/projects/:projectId/scenes/:sceneId', (req, res) => {
    const payload = parsePayload(sceneUpdateSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const updated = service.updateScene(req.params.projectId, req.params.sceneId, payload);
    if (!updated) {
      return failNotFound(res, 'Scene not found');
    }
    return res.json(updated);
  });

  router.delete('/projects/:projectId/scenes/:sceneId', (req, res) => {
    const ok = service.deleteScene(req.params.projectId, req.params.sceneId);
    if (!ok) {
      return failNotFound(res, 'Scene not found');
    }
    return res.status(204).send();
  });

  router.post('/projects/:projectId/storyboards/generate', withAsyncRoute(async (
    req: { params: { projectId: string }; body: unknown },
    res
  ) => {
    const payload = parsePayload(storyboardGenerateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }

    let items;
    try {
      items = await service.generateStoryboards(req.params.projectId, payload.scriptId, {
        modelId: payload.modelId,
        customModel: payload.customModel,
        resolution: payload.resolution,
        aspectRatio: payload.aspectRatio,
        providerOptions: payload.providerOptions
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support')) {
        return failKnownError(res, err);
      }
      throw err;
    }
    if (!items) {
      return failNotFound(res, 'Script not found');
    }

    return res.json(items);
  }));

  router.post('/projects/:projectId/storyboards/plan', withAsyncRoute(async (
    req: { params: { projectId: string }; body: unknown },
    res
  ) => {
    const payload = parsePayload(storyboardPlanSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const items = await service.planStoryboards(req.params.projectId, payload.scriptId);
    if (!items) {
      return failNotFound(res, 'Script not found');
    }
    return res.json(items);
  }));

  router.post('/projects/:projectId/storyboards/render', withAsyncRoute(async (
    req: { params: { projectId: string }; body: unknown },
    res
  ) => {
    const payload = parsePayload(storyboardRenderSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    let items;
    try {
      items = await service.renderStoryboardImages(req.params.projectId, payload);
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support')) {
        return failKnownError(res, err);
      }
      throw err;
    }
    if (!items) {
      return failNotFound(res, 'Storyboard render target not found');
    }
    return res.json(items);
  }));

  router.post('/projects/:projectId/storyboards/:storyboardId/rewrite', async (req, res) => {
    const payload = parsePayload(storyboardRewriteSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const storyboard = await service.rewriteStoryboardPrompt(req.params.projectId, req.params.storyboardId, payload);
    if (!storyboard) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(storyboard);
  });

  router.post('/projects/:projectId/storyboards/:storyboardId/video-prompt', async (req, res) => {
    const payload = parsePayload(storyboardVideoPromptSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = await service.generateVideoPrompt(req.params.projectId, req.params.storyboardId, payload);
    if (!result) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(result);
  });

  router.post('/projects/:projectId/storyboards/:storyboardId/frame-prompt', async (req, res) => {
    const payload = parsePayload(storyboardFramePromptSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = await service.generateFramePrompt(req.params.projectId, req.params.storyboardId, payload);
    if (!result) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(result);
  });

  router.get('/projects/:projectId/storyboards/:storyboardId/frame-prompts', (req, res) => {
    const query = parseQuery(storyboardFramePromptHistoryQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const items = service.listStoryboardFramePromptHistory(req.params.projectId, req.params.storyboardId, query);
    if (!items) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(items);
  });

  router.post('/projects/:projectId/storyboards/:storyboardId/frame-prompts/rollback', (req, res) => {
    const payload = parsePayload(storyboardFramePromptRollbackSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const output = service.rollbackStoryboardFramePrompt(req.params.projectId, req.params.storyboardId, payload.historyId, {
      actor: payload.actor,
      comment: payload.comment
    });
    if (!output) {
      return failNotFound(res, 'Storyboard or history not found');
    }
    return res.json(output);
  });

  router.get('/projects/:projectId/storyboards/:storyboardId/frame-prompts/rollback-audits', (req, res) => {
    const query = parseQuery(storyboardFramePromptRollbackAuditQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const items = service.listStoryboardFramePromptRollbackAudits(req.params.projectId, req.params.storyboardId, query);
    if (!items) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(items);
  });

  router.post('/projects/:projectId/episodes/:episodeId/frame-prompts/batch', async (req, res) => {
    const payload = parsePayload(episodeBatchFramePromptSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = await service.generateEpisodeFramePromptsBatch(req.params.projectId, req.params.episodeId, payload);
    if (!result) {
      return failNotFound(res, 'Episode not found');
    }
    return res.json(result);
  });

  router.post('/projects/:projectId/frame-prompts/batch-by-workflow', async (req, res) => {
    const payload = parsePayload(projectBatchFramePromptByWorkflowSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = await service.generateProjectFramePromptsByWorkflow(req.params.projectId, payload);
    if (!result) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(result);
  });

  router.patch('/projects/:projectId/storyboards/:storyboardId', (req, res) => {
    const payload = parsePayload(storyboardUpdateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const storyboard = service.updateStoryboard(req.params.projectId, req.params.storyboardId, payload);
    if (!storyboard) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(storyboard);
  });

  router.get('/projects/:projectId/storyboards/:storyboardId/relations', (req, res) => {
    const items = service.listStoryboardAssetRelations(req.params.projectId, req.params.storyboardId);
    if (!items) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(items);
  });

  router.put('/projects/:projectId/storyboards/:storyboardId/relations', (req, res) => {
    const payload = parsePayload(storyboardRelationsReplaceSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const items = service.replaceStoryboardAssetRelations(req.params.projectId, req.params.storyboardId, payload);
    if (!items) {
      return failNotFound(res, 'Storyboard or assets not found');
    }
    return res.json(items);
  });

  router.post('/projects/:projectId/storyboards/:storyboardId/shot-image', withAsyncRoute(async (
    req: { params: { projectId: string; storyboardId: string }; body: unknown },
    res
  ) => {
    const payload = parsePayload(storyboardShotImageSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    try {
      const storyboard = await service.generateShotImage(req.params.projectId, req.params.storyboardId, payload);
      if (!storyboard) {
        return failNotFound(res, 'Storyboard not found');
      }
      return res.json(storyboard);
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support')) {
        return failKnownError(res, err);
      }
      throw err;
    }
  }));

  router.post('/projects/:projectId/storyboards/batch-super-res', async (req, res) => {
    const payload = parsePayload(storyboardBatchSuperResSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    try {
      const result = await service.batchSuperResStoryboards(req.params.projectId, payload);
      if (!result) {
        return failNotFound(res, 'Project not found');
      }
      return res.json(result);
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support')) {
        return failKnownError(res, err);
      }
      throw err;
    }
  });

  router.post('/projects/:projectId/storyboards/:storyboardId/upload-image', (req, res) => {
    const payload = parsePayload(storyboardUploadImageSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const storyboard = service.uploadStoryboardImage(req.params.projectId, req.params.storyboardId, payload.imageUrl);
    if (!storyboard) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.json(storyboard);
  });

  router.get('/projects/:projectId/assets', (req, res) => {
    const items = service.listAssets(req.params.projectId);
    if (!items) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(items);
  });

  router.post('/projects/:projectId/assets/generate', async (req, res) => {
    const payload = parsePayload(assetsGenerateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }

    let items;
    try {
      items = await service.generateAssets(req.params.projectId, payload.storyboardId, {
        modelId: payload.modelId,
        customModel: payload.customModel,
        resolution: payload.resolution,
        aspectRatio: payload.aspectRatio,
        providerOptions: payload.providerOptions
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support')) {
        return failKnownError(res, err);
      }
      throw err;
    }
    if (!items) {
      return failNotFound(res, 'Storyboard not found');
    }

    return res.json(items);
  });

  router.post('/projects/:projectId/assets', (req, res) => {
    const payload = parsePayload(assetCreateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const asset = service.createAsset(req.params.projectId, payload);
    if (!asset) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.status(201).json(asset);
  });

  router.patch('/projects/:projectId/assets/:assetId', (req, res) => {
    const payload = parsePayload(assetUpdateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    const asset = service.updateAsset(req.params.projectId, req.params.assetId, payload);
    if (!asset) {
      return failNotFound(res, 'Asset not found');
    }
    return res.json(asset);
  });

  router.delete('/projects/:projectId/assets/:assetId', (req, res) => {
    const ok = service.deleteAsset(req.params.projectId, req.params.assetId);
    if (!ok) {
      return failNotFound(res, 'Asset not found');
    }
    return res.status(204).send();
  });

  router.post('/projects/:projectId/assets/:assetId/polish-prompt', async (req, res) => {
    const payload = parsePayload(assetPolishSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const asset = await service.polishAssetPrompt(req.params.projectId, req.params.assetId, payload);
    if (!asset) {
      return failNotFound(res, 'Asset not found');
    }
    return res.json(asset);
  });

  router.post('/projects/:projectId/assets/:assetId/redraw-image', async (req, res) => {
    const payload = parsePayload(assetRedrawSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    try {
      const asset = await service.redrawAssetImage(req.params.projectId, req.params.assetId, payload);
      if (!asset) {
        return failNotFound(res, 'Asset not found');
      }
      return res.json(asset);
    } catch (err) {
      if (err instanceof Error && err.message.includes('does not support')) {
        return failKnownError(res, err);
      }
      throw err;
    }
  });

  router.get('/projects/:projectId/video-tasks', (req, res) => {
    const items = service.listVideoTasks(req.params.projectId);
    if (!items) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(items);
  });

  router.post('/projects/:projectId/video-tasks', async (req, res) => {
    const payload = parsePayload(videoTaskCreateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }

    let task;
    try {
      task = await service.createAndRunVideoTask(req.params.projectId, payload.storyboardId, payload.priority, {
        modelId: payload.modelId,
        customModel: payload.customModel,
        mode: payload.mode,
        duration: payload.duration,
        resolution: payload.resolution,
        aspectRatio: payload.aspectRatio,
        audio: payload.audio,
        imageInputs: payload.imageInputs,
        imageWithRoles: payload.imageWithRoles,
        endFrame: payload.endFrame,
        providerOptions: payload.providerOptions
      });
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err, true);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
    if (!task) {
      return failNotFound(res, 'Storyboard not found');
    }

    return res.status(201).json(task);
  });

  router.post('/projects/:projectId/video-tasks/:taskId/retry', async (req, res) => {
    let task;
    try {
      task = await service.retryVideoTask(req.params.projectId, req.params.taskId);
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err, true);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }

    if (!task) {
      return failNotFound(res, 'Video task not found');
    }
    return res.json(task);
  });

  router.post('/projects/:projectId/video-tasks/:taskId/cancel', async (req, res) => {
    const task = await service.cancelVideoTask(req.params.projectId, req.params.taskId);
    if (!task) {
      return failNotFound(res, 'Video task not found');
    }
    return res.json(task);
  });

  router.post('/projects/:projectId/video-tasks/batch', async (req, res) => {
    const payload = parsePayload(videoTaskBatchSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }

    let result;
    try {
      result = await service.createVideoTasksBatch(req.params.projectId, payload.storyboardIds, payload.priority, {
        modelId: payload.modelId,
        customModel: payload.customModel,
        mode: payload.mode,
        duration: payload.duration,
        resolution: payload.resolution,
        aspectRatio: payload.aspectRatio,
        audio: payload.audio,
        imageInputs: payload.imageInputs,
        imageWithRoles: payload.imageWithRoles,
        endFrame: payload.endFrame,
        providerOptions: payload.providerOptions
      });
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
    if (!result) {
      return failNotFound(res, 'Project not found');
    }
    return res.status(201).json(result);
  });

  router.get('/projects/:projectId/timeline', (req, res) => {
    const query = parseQuery(timelineGetQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const item = service.getTimelinePlan(req.params.projectId, query.episodeId ?? null);
    if (!item) {
      return failNotFound(res, 'Project or episode not found');
    }
    return res.json(item);
  });

  router.put('/projects/:projectId/timeline', (req, res) => {
    const payload = parsePayload(timelineSaveSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    try {
      const normalizedTracks = payload.tracks?.map((track, index) => ({
        id: track.id,
        name: track.name,
        type: track.type,
        order: track.order ?? index,
        isLocked: track.isLocked ?? false,
        isMuted: track.isMuted ?? false,
        volume: track.volume ?? 100,
        clips: track.clips ?? []
      }));
      const item = service.saveTimelinePlan(req.params.projectId, {
        id: payload.id,
        episodeId: payload.episodeId ?? null,
        title: payload.title,
        tracks: normalizedTracks,
        clips: payload.clips ?? []
      });
      if (!item) {
        return failNotFound(res, 'Project or episode not found');
      }
      return res.json(item);
    } catch (err) {
      if (err instanceof Error) {
        return fail(res, 400, err.message, BIZ_CODE.INVALID_PAYLOAD);
      }
      throw err;
    }
  });

  router.post('/projects/:projectId/timeline/video-merge', async (req, res) => {
    const payload = parsePayload(
      z.object({
        episodeId: z.string().min(1).nullable().optional(),
        title: z.string().min(1).max(120).optional()
      }),
      req.body ?? {},
      res,
      fail
    );
    if (!payload) {
      return;
    }
    const merge = await service.createVideoMergeFromTimeline(req.params.projectId, payload.episodeId ?? null, payload.title);
    if (!merge) {
      return failNotFound(res, 'Project or timeline not found');
    }
    return res.status(201).json(merge);
  });

  router.post('/projects/:projectId/timeline/audio-tasks/batch', async (req, res) => {
    const payload = parsePayload(timelineAudioBatchSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    let result;
    try {
      result = await service.createTimelineAudioTasksBatch(req.params.projectId, payload.episodeId ?? null, payload.priority, {
        modelId: payload.modelId,
        customModel: payload.customModel,
        voice: payload.voice,
        speed: payload.speed,
        emotion: payload.emotion,
        format: payload.format,
        providerOptions: payload.providerOptions
      });
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
    if (!result) {
      return failNotFound(res, 'Project or timeline not found');
    }
    return res.status(201).json(result);
  });

  router.post('/projects/:projectId/timeline/audio-track/sync', (req, res) => {
    const payload = parsePayload(timelineAudioTrackSyncSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = service.syncTimelineAudioTrack(req.params.projectId, payload.episodeId ?? null);
    if (!result) {
      return failNotFound(res, 'Project or timeline not found');
    }
    return res.json(result);
  });

  router.post('/projects/:projectId/timeline/subtitles/generate', async (req, res) => {
    const payload = parsePayload(timelineSubtitleGenerateSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = await service.generateTimelineSubtitleTrack(req.params.projectId, payload.episodeId ?? null, {
      modelId: payload.modelId,
      customModel: payload.customModel
    });
    if (!result) {
      return failNotFound(res, 'Project or timeline not found');
    }
    return res.json(result);
  });

  router.post('/projects/:projectId/episodes/batch/assets/precheck', (req, res) => {
    const payload = parsePayload(episodesBatchPrecheckSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = service.precheckEpisodesAssetsBatch(req.params.projectId, payload);
    if (!result) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(result);
  });

  router.post('/projects/:projectId/episodes/batch/assets/generate', withAsyncRoute(async (
    req: { params: { projectId: string }; body: unknown },
    res
  ) => {
    const payload = parsePayload(episodesBatchAssetsSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    try {
      const result = await service.generateEpisodesAssetsBatch(req.params.projectId, payload);
      if (!result) {
        return failNotFound(res, 'Project not found');
      }
      return res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
  }));

  router.post('/projects/:projectId/episodes/batch/video-tasks/precheck', (req, res) => {
    const payload = parsePayload(episodesBatchPrecheckSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const result = service.precheckEpisodesVideoTasksBatch(req.params.projectId, payload);
    if (!result) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(result);
  });

  router.post('/projects/:projectId/episodes/batch/video-tasks', async (req, res) => {
    const payload = parsePayload(episodesBatchVideoTasksSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    try {
      const result = await service.createEpisodesVideoTasksBatch(req.params.projectId, payload);
      if (!result) {
        return failNotFound(res, 'Project not found');
      }
      return res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
  });

  // Keep generic :episodeId routes after /episodes/batch/* routes so "batch" is not
  // captured as a fake episode id.
  router.post('/projects/:projectId/episodes/:episodeId/assets/generate', async (req, res) => {
    const payload = parsePayload(episodeBatchAssetsSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    try {
      const result = await service.generateEpisodeAssetsBatch(req.params.projectId, req.params.episodeId, payload);
      if (!result) {
        return failNotFound(res, 'Project or episode not found');
      }
      return res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
  });

  router.post('/projects/:projectId/episodes/:episodeId/video-tasks/batch', async (req, res) => {
    const payload = parsePayload(episodeBatchVideoTasksSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    try {
      const result = await service.createEpisodeVideoTasksBatch(req.params.projectId, req.params.episodeId, payload.priority, {
        modelId: payload.modelId,
        customModel: payload.customModel,
        mode: payload.mode,
        duration: payload.duration,
        resolution: payload.resolution,
        aspectRatio: payload.aspectRatio,
        audio: payload.audio,
        imageInputs: payload.imageInputs,
        imageWithRoles: payload.imageWithRoles,
        endFrame: payload.endFrame,
        providerOptions: payload.providerOptions
      });
      if (!result) {
        return failNotFound(res, 'Project or episode not found');
      }
      return res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
  });

  router.post('/projects/:projectId/episodes/:episodeId/review/approve', (req, res) => {
    const result = service.approveEpisodeWorkflow(req.params.projectId, req.params.episodeId);
    if (!result) {
      return failNotFound(res, 'Project or episode not found');
    }
    return res.json(result);
  });

  router.post('/projects/:projectId/episodes/:episodeId/finalize', (req, res) => {
    const payload = parsePayload(episodeFinalizeSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const output = service.finalizeEpisodeDelivery(req.params.projectId, req.params.episodeId, payload);
    if (!output) {
      return failNotFound(res, 'Project or episode not found');
    }
    return res.json(output);
  });

  router.post('/dramas/:dramaId/episodes/:episodeId/review/approve', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const result = service.approveEpisodeWorkflow(projectId, req.params.episodeId);
    if (!result) {
      return failNotFound(res, 'Project or episode not found');
    }
    return res.json(result);
  });

  router.post('/dramas/:dramaId/episodes/:episodeId/finalize', (req, res) => {
    const payload = parsePayload(episodeFinalizeSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const output = service.finalizeEpisodeDelivery(projectId, req.params.episodeId, payload);
    if (!output) {
      return failNotFound(res, 'Project or episode not found');
    }
    return res.json(output);
  });

  router.get('/dramas/:dramaId/episodes/:episodeId/download', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const output = service.getEpisodeDeliveryDownload(projectId, req.params.episodeId);
    if (!output) {
      return failNotFound(res, 'Episode download not found');
    }
    return res.json(output);
  });

  router.get('/dramas/:dramaId/episodes/:episodeId/delivery/versions', (req, res) => {
    const query = parseQuery(episodeDeliveryVersionsQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const output = service.listEpisodeDeliveryVersions(projectId, req.params.episodeId, query.limit);
    if (!output) {
      return failNotFound(res, 'Project or episode not found');
    }
    return res.json(output);
  });

  router.get('/dramas/:dramaId/episodes/:episodeId/delivery/compare', (req, res) => {
    const query = parseQuery(episodeDeliveryCompareQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const output = service.compareEpisodeDeliveryVersions(
      projectId,
      req.params.episodeId,
      query.currentVersionId,
      query.previousVersionId
    );
    if (!output) {
      return failNotFound(res, 'Delivery versions not found');
    }
    return res.json(output);
  });

  router.get('/dramas/:dramaId/episodes/:episodeId/delivery/compare/report', (req, res) => {
    const query = parseQuery(episodeDeliveryCompareReportQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const format = query.format ?? 'json';
    if (format === 'csv') {
      const csv = service.buildEpisodeDeliveryCompareReportCsv(
        projectId,
        req.params.episodeId,
        query.currentVersionId,
        query.previousVersionId
      );
      if (!csv) {
        return failNotFound(res, 'Delivery versions not found');
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=\"episode-delivery-compare-${Date.now()}.csv\"`);
      return res.status(200).send(csv);
    }
    const json = service.buildEpisodeDeliveryCompareReport(
      projectId,
      req.params.episodeId,
      query.currentVersionId,
      query.previousVersionId
    );
    if (!json) {
      return failNotFound(res, 'Delivery versions not found');
    }
    return res.json(json);
  });

  router.get('/projects/:projectId/episodes/:episodeId/download', (req, res) => {
    const output = service.getEpisodeDeliveryDownload(req.params.projectId, req.params.episodeId);
    if (!output) {
      return failNotFound(res, 'Episode download not found');
    }
    return res.json(output);
  });

  router.get('/projects/:projectId/episodes/:episodeId/delivery/versions', (req, res) => {
    const query = parseQuery(episodeDeliveryVersionsQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const output = service.listEpisodeDeliveryVersions(req.params.projectId, req.params.episodeId, query.limit);
    if (!output) {
      return failNotFound(res, 'Project or episode not found');
    }
    return res.json(output);
  });

  router.get('/projects/:projectId/episodes/:episodeId/delivery/compare', (req, res) => {
    const query = parseQuery(episodeDeliveryCompareQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const output = service.compareEpisodeDeliveryVersions(
      req.params.projectId,
      req.params.episodeId,
      query.currentVersionId,
      query.previousVersionId
    );
    if (!output) {
      return failNotFound(res, 'Delivery versions not found');
    }
    return res.json(output);
  });

  router.get('/projects/:projectId/episodes/:episodeId/delivery/compare/report', (req, res) => {
    const query = parseQuery(episodeDeliveryCompareReportQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const format = query.format ?? 'json';
    if (format === 'csv') {
      const csv = service.buildEpisodeDeliveryCompareReportCsv(
        req.params.projectId,
        req.params.episodeId,
        query.currentVersionId,
        query.previousVersionId
      );
      if (!csv) {
        return failNotFound(res, 'Delivery versions not found');
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=\"episode-delivery-compare-${Date.now()}.csv\"`);
      return res.status(200).send(csv);
    }
    const json = service.buildEpisodeDeliveryCompareReport(
      req.params.projectId,
      req.params.episodeId,
      query.currentVersionId,
      query.previousVersionId
    );
    if (!json) {
      return failNotFound(res, 'Delivery versions not found');
    }
    return res.json(json);
  });

  router.get('/projects/:projectId/episodes/:episodeId/delivery/package', (req, res) => {
    const query = parseQuery(episodeDeliveryPackageQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const output = service.buildEpisodeDeliveryPackage(req.params.projectId, req.params.episodeId, query.versionId);
    if (!output) {
      return failNotFound(res, 'Delivery package not found');
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=\"episode-delivery-package-${Date.now()}.json\"`);
    return res.status(200).send(JSON.stringify(output, null, 2));
  });

  router.get('/dramas/:dramaId/episodes/:episodeId/delivery/package', (req, res) => {
    const query = parseQuery(episodeDeliveryPackageQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const output = service.buildEpisodeDeliveryPackage(projectId, req.params.episodeId, query.versionId);
    if (!output) {
      return failNotFound(res, 'Delivery package not found');
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=\"episode-delivery-package-${Date.now()}.json\"`);
    return res.status(200).send(JSON.stringify(output, null, 2));
  });

  router.get('/projects/:projectId/episodes/:episodeId/delivery/package.zip', async (req, res) => {
    const query = parseQuery(episodeDeliveryPackageZipQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    try {
      const output = await service.buildEpisodeDeliveryPackageArchive(req.params.projectId, req.params.episodeId, {
        versionId: query.versionId,
        includeMedia: query.includeMedia === true
      });
      if (!output) {
        return failNotFound(res, 'Delivery package not found');
      }
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename=\"${output.fileName}\"`);
      res.on('finish', () => {
        fsPromises.rm(output.path, { force: true }).catch(() => undefined);
      });
      return res.status(200).sendFile(output.path);
    } catch (err) {
      return fail(res, 500, err instanceof Error ? err.message : 'Failed to build delivery package zip', BIZ_CODE.INTERNAL_ERROR);
    }
  });

  router.get('/dramas/:dramaId/episodes/:episodeId/delivery/package.zip', async (req, res) => {
    const query = parseQuery(episodeDeliveryPackageZipQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    try {
      const output = await service.buildEpisodeDeliveryPackageArchive(projectId, req.params.episodeId, {
        versionId: query.versionId,
        includeMedia: query.includeMedia === true
      });
      if (!output) {
        return failNotFound(res, 'Delivery package not found');
      }
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename=\"${output.fileName}\"`);
      res.on('finish', () => {
        fsPromises.rm(output.path, { force: true }).catch(() => undefined);
      });
      return res.status(200).sendFile(output.path);
    } catch (err) {
      return fail(res, 500, err instanceof Error ? err.message : 'Failed to build delivery package zip', BIZ_CODE.INTERNAL_ERROR);
    }
  });

  router.post('/projects/:projectId/episodes/:episodeId/delivery/package.zip/verify', raw({ type: 'multipart/form-data', limit: '200mb' }), async (req, res) => {
    const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    let file: MultipartFilePart | null;
    try {
      const parsedMultipart = parseMultipartFormData(req.headers['content-type'], bodyBuffer);
      file = parsedMultipart.file;
    } catch (err) {
      return fail(res, 400, err instanceof Error ? err.message : 'Invalid multipart payload', BIZ_CODE.INVALID_PAYLOAD);
    }
    if (!file) {
      return fail(res, 400, 'file is required', BIZ_CODE.INVALID_PAYLOAD);
    }
    try {
      const output = await service.verifyDeliveryPackageArchive(file.data);
      return res.json(output);
    } catch (err) {
      return fail(res, 500, err instanceof Error ? err.message : 'Verify delivery zip failed', BIZ_CODE.INTERNAL_ERROR);
    }
  });

  router.post('/dramas/:dramaId/episodes/:episodeId/delivery/package.zip/verify', raw({ type: 'multipart/form-data', limit: '200mb' }), async (req, res) => {
    const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    let file: MultipartFilePart | null;
    try {
      const parsedMultipart = parseMultipartFormData(req.headers['content-type'], bodyBuffer);
      file = parsedMultipart.file;
    } catch (err) {
      return fail(res, 400, err instanceof Error ? err.message : 'Invalid multipart payload', BIZ_CODE.INVALID_PAYLOAD);
    }
    if (!file) {
      return fail(res, 400, 'file is required', BIZ_CODE.INVALID_PAYLOAD);
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    try {
      const output = await service.verifyDeliveryPackageArchive(file.data);
      return res.json(output);
    } catch (err) {
      return fail(res, 500, err instanceof Error ? err.message : 'Verify delivery zip failed', BIZ_CODE.INTERNAL_ERROR);
    }
  });

  router.post('/projects/:projectId/uploads/image', raw({ type: 'multipart/form-data', limit: '20mb' }), async (req, res) => {
    const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    let fields: Record<string, string>;
    let file: MultipartFilePart | null;
    try {
      const parsedMultipart = parseMultipartFormData(req.headers['content-type'], bodyBuffer);
      fields = parsedMultipart.fields;
      file = parsedMultipart.file;
    } catch (err) {
      return fail(res, 400, err instanceof Error ? err.message : 'Invalid multipart payload', BIZ_CODE.INVALID_PAYLOAD);
    }
    if (!file) {
      return fail(res, 400, 'file is required', BIZ_CODE.INVALID_PAYLOAD);
    }
    const payload = parsePayload(uploadImageBodySchema, fields, res, fail);
    if (!payload) {
      return;
    }
    try {
      const output = await service.saveUploadedImage(req.params.projectId, {
        originalName: file.filename,
        buffer: file.data,
        purpose: payload.purpose,
        storyboardId: payload.storyboardId,
        assetId: payload.assetId,
        assetType: payload.assetType,
        assetName: payload.assetName,
        prompt: payload.prompt
      });
      return res.status(201).json(output);
    } catch (err) {
      if (err instanceof Error) {
        return fail(res, 400, err.message, BIZ_CODE.INVALID_PAYLOAD);
      }
      throw err;
    }
  });

  router.post('/dramas/:dramaId/uploads/image', raw({ type: 'multipart/form-data', limit: '20mb' }), async (req, res) => {
    const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    let fields: Record<string, string>;
    let file: MultipartFilePart | null;
    try {
      const parsedMultipart = parseMultipartFormData(req.headers['content-type'], bodyBuffer);
      fields = parsedMultipart.fields;
      file = parsedMultipart.file;
    } catch (err) {
      return fail(res, 400, err instanceof Error ? err.message : 'Invalid multipart payload', BIZ_CODE.INVALID_PAYLOAD);
    }
    if (!file) {
      return fail(res, 400, 'file is required', BIZ_CODE.INVALID_PAYLOAD);
    }
    const payload = parsePayload(uploadImageBodySchema, fields, res, fail);
    if (!payload) {
      return;
    }
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    try {
      const output = await service.saveUploadedImage(projectId, {
        originalName: file.filename,
        buffer: file.data,
        purpose: payload.purpose,
        storyboardId: payload.storyboardId,
        assetId: payload.assetId,
        assetType: payload.assetType,
        assetName: payload.assetName,
        prompt: payload.prompt
      });
      return res.status(201).json(output);
    } catch (err) {
      if (err instanceof Error) {
        return fail(res, 400, err.message, BIZ_CODE.INVALID_PAYLOAD);
      }
      throw err;
    }
  });

  const handleObjectUpload = async (
    req: Request,
    res: Response,
    objectType: 'character' | 'scene' | 'prop',
    projectId: string,
    assetId: string
  ) => {
    const query = parseQuery(uploadObjectImageQuerySchema, req.query ?? {}, res, fail);
    if (!query) {
      return;
    }
    const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    let file: MultipartFilePart | null;
    try {
      const parsedMultipart = parseMultipartFormData(req.headers['content-type'], bodyBuffer);
      file = parsedMultipart.file;
    } catch (err) {
      return fail(res, 400, err instanceof Error ? err.message : 'Invalid multipart payload', BIZ_CODE.INVALID_PAYLOAD);
    }
    if (!file) {
      return fail(res, 400, 'file is required', BIZ_CODE.INVALID_PAYLOAD);
    }
    try {
      const output = await service.saveUploadedImageForAssetObject(projectId, {
        objectType,
        assetId,
        originalName: file.filename,
        buffer: file.data
      });
      return res.status(201).json(output);
    } catch (err) {
      if (err instanceof Error) {
        return fail(res, 400, err.message, BIZ_CODE.INVALID_PAYLOAD);
      }
      throw err;
    }
  };

  router.post('/projects/:projectId/uploads/characters/:assetId/image', raw({ type: 'multipart/form-data', limit: '20mb' }), (req, res) => {
    void handleObjectUpload(req, res, 'character', req.params.projectId, req.params.assetId);
  });

  router.post('/projects/:projectId/uploads/scenes/:assetId/image', raw({ type: 'multipart/form-data', limit: '20mb' }), (req, res) => {
    void handleObjectUpload(req, res, 'scene', req.params.projectId, req.params.assetId);
  });

  router.post('/projects/:projectId/uploads/props/:assetId/image', raw({ type: 'multipart/form-data', limit: '20mb' }), (req, res) => {
    void handleObjectUpload(req, res, 'prop', req.params.projectId, req.params.assetId);
  });

  router.post('/dramas/:dramaId/uploads/characters/:assetId/image', raw({ type: 'multipart/form-data', limit: '20mb' }), (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    void handleObjectUpload(req, res, 'character', projectId, req.params.assetId);
  });

  router.post('/dramas/:dramaId/uploads/scenes/:assetId/image', raw({ type: 'multipart/form-data', limit: '20mb' }), (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    void handleObjectUpload(req, res, 'scene', projectId, req.params.assetId);
  });

  router.post('/dramas/:dramaId/uploads/props/:assetId/image', raw({ type: 'multipart/form-data', limit: '20mb' }), (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    void handleObjectUpload(req, res, 'prop', projectId, req.params.assetId);
  });

  router.get('/projects/:projectId/uploads/files/:fileName', (req, res) => {
    const result = service.resolveUploadedImage(req.params.projectId, req.params.fileName);
    if ('path' in result) {
      return res.sendFile(path.resolve(result.path));
    }
    if ('reason' in result && result.reason === 'forbidden') {
      return fail(res, 403, 'Invalid file path', BIZ_CODE.FORBIDDEN);
    }
    if ('reason' in result && result.reason === 'not_found') {
      return failNotFound(res, 'File not found');
    }
    return failNotFound(res, 'File not found');
  });

  router.get('/dramas/:dramaId/uploads/files/:fileName', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const result = service.resolveUploadedImage(projectId, req.params.fileName);
    if ('path' in result) {
      return res.sendFile(path.resolve(result.path));
    }
    if ('reason' in result && result.reason === 'forbidden') {
      return fail(res, 403, 'Invalid file path', BIZ_CODE.FORBIDDEN);
    }
    if ('reason' in result && result.reason === 'not_found') {
      return failNotFound(res, 'File not found');
    }
    return failNotFound(res, 'File not found');
  });

  router.get('/projects/:projectId/video-merges', (req, res) => {
    const items = service.listVideoMerges(req.params.projectId);
    if (!items) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(items);
  });

  router.get('/projects/:projectId/video-merges/:mergeId', (req, res) => {
    const item = service.getVideoMerge(req.params.projectId, req.params.mergeId);
    if (!item) {
      return failNotFound(res, 'Video merge not found');
    }
    return res.json(item);
  });

  router.get('/dramas/:dramaId/video-merges/:mergeId', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const item = service.getVideoMerge(projectId, req.params.mergeId);
    if (!item) {
      return failNotFound(res, 'Video merge not found');
    }
    return res.json(item);
  });

  router.get('/projects/:projectId/video-merges/:mergeId/file', (req, res) => {
    const resolved = service.resolveVideoMergeDownload(req.params.projectId, req.params.mergeId);
    if ('reason' in resolved && resolved.reason === 'not_found') {
      return failNotFound(res, 'Video merge not found');
    }
    if ('reason' in resolved && resolved.reason === 'not_ready') {
      return fail(res, 409, 'Video merge file not ready', BIZ_CODE.CONFLICT);
    }
    if ('reason' in resolved && resolved.reason === 'forbidden') {
      return fail(res, 403, 'Invalid merge output path', BIZ_CODE.FORBIDDEN);
    }
    if ('path' in resolved) {
      return res.sendFile(path.resolve(resolved.path));
    }
    return failNotFound(res, 'Merged file not found');
  });

  router.get('/dramas/:dramaId/video-merges/:mergeId/file', (req, res) => {
    const projectId = resolveProjectIdByDrama(res, req.params.dramaId);
    if (!projectId) {
      return;
    }
    const resolved = service.resolveVideoMergeDownload(projectId, req.params.mergeId);
    if ('reason' in resolved && resolved.reason === 'not_found') {
      return failNotFound(res, 'Video merge not found');
    }
    if ('reason' in resolved && resolved.reason === 'not_ready') {
      return fail(res, 409, 'Video merge file not ready', BIZ_CODE.CONFLICT);
    }
    if ('reason' in resolved && resolved.reason === 'forbidden') {
      return fail(res, 403, 'Invalid merge output path', BIZ_CODE.FORBIDDEN);
    }
    if ('path' in resolved) {
      return res.sendFile(path.resolve(resolved.path));
    }
    return failNotFound(res, 'Merged file not found');
  });

  router.post('/projects/:projectId/video-merges', async (req, res) => {
    const payload = parsePayload(videoMergeCreateSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    try {
      const item = await service.createAndRunVideoMerge(req.params.projectId, payload);
      if (!item) {
        return failNotFound(res, 'Project not found');
      }
      return res.status(201).json(item);
    } catch (err) {
      if (err instanceof Error) {
        return fail(res, 400, err.message, BIZ_CODE.INVALID_PAYLOAD);
      }
      throw err;
    }
  });

  router.post('/projects/:projectId/video-merges/:mergeId/retry', async (req, res) => {
    const item = await service.retryVideoMerge(req.params.projectId, req.params.mergeId);
    if (!item) {
      return failNotFound(res, 'Video merge not found');
    }
    return res.json(item);
  });

  router.post('/projects/:projectId/full-chain/run', async (req, res) => {
    const payload = parsePayload(fullChainRunSchema, req.body, res, fail);
    if (!payload) {
      return;
    }

    const result = await service.runFullChainFromScript(req.params.projectId, payload.scriptId);
    if (!result) {
      return failNotFound(res, 'Script not found');
    }
    return res.status(201).json(result);
  });

  router.get('/projects/:projectId/audio-tasks', (req, res) => {
    const items = service.listAudioTasks(req.params.projectId);
    if (!items) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(items);
  });

  router.post('/projects/:projectId/audio-tasks', async (req, res) => {
    const payload = parsePayload(audioTaskCreateSchema, req.body, res, fail);
    if (!payload) {
      return;
    }
    let task;
    try {
      task = await service.createAndRunAudioTask(req.params.projectId, payload.storyboardId, payload.priority, {
        modelId: payload.modelId,
        customModel: payload.customModel,
        voice: payload.voice,
        speed: payload.speed,
        emotion: payload.emotion,
        format: payload.format,
        providerOptions: payload.providerOptions
      });
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
    if (!task) {
      return failNotFound(res, 'Storyboard not found');
    }
    return res.status(201).json(task);
  });

  router.post('/projects/:projectId/audio-tasks/:taskId/retry', async (req, res) => {
    let task;
    try {
      task = await service.retryAudioTask(req.params.projectId, req.params.taskId);
    } catch (err) {
      if (err instanceof Error) {
        const handled = failKnownError(res, err);
        if (handled) {
          return handled;
        }
      }
      throw err;
    }
    if (!task) {
      return failNotFound(res, 'Audio task not found');
    }
    return res.json(task);
  });

  router.get('/projects/:projectId/audio-tasks/:taskId/file', (req, res) => {
    const resolved = service.resolveAudioTaskDownload(req.params.projectId, req.params.taskId);
    if ('reason' in resolved && resolved.reason === 'not_found') {
      return failNotFound(res, 'Audio task not found');
    }
    if ('reason' in resolved && resolved.reason === 'not_ready') {
      return fail(res, 409, 'Audio task file not ready', BIZ_CODE.CONFLICT);
    }
    if ('reason' in resolved && resolved.reason === 'forbidden') {
      return fail(res, 403, 'Invalid audio task output path', BIZ_CODE.FORBIDDEN);
    }
    if ('path' in resolved) {
      return res.sendFile(path.resolve(resolved.path));
    }
    return failNotFound(res, 'Audio task file not found');
  });

  router.get('/projects/:projectId/audio-extracts', (req, res) => {
    const items = service.listAudioExtracts(req.params.projectId);
    if (!items) {
      return failNotFound(res, 'Project not found');
    }
    return res.json(items);
  });

  router.post('/projects/:projectId/audio-extracts', async (req, res) => {
    const payload = parsePayload(audioExtractCreateSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }
    try {
      const item = await service.createAndRunAudioExtract(req.params.projectId, payload);
      if (!item) {
        return failNotFound(res, 'Project not found');
      }
      return res.status(201).json(item);
    } catch (err) {
      if (err instanceof Error) {
        return fail(res, 400, err.message, BIZ_CODE.INVALID_PAYLOAD);
      }
      throw err;
    }
  });

  router.get('/projects/:projectId/audio-extracts/:extractId/file', (req, res) => {
    const resolved = service.resolveAudioExtractDownload(req.params.projectId, req.params.extractId);
    if ('reason' in resolved && resolved.reason === 'not_found') {
      return failNotFound(res, 'Audio extract not found');
    }
    if ('reason' in resolved && resolved.reason === 'forbidden') {
      return fail(res, 403, 'Invalid audio extract output path', BIZ_CODE.FORBIDDEN);
    }
    if ('path' in resolved) {
      return res.sendFile(path.resolve(resolved.path));
    }
    return failNotFound(res, 'Audio extract file not found');
  });

  return router;
};
