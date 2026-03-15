import type {
  Asset,
  AudioTask,
  DramaProductionChainEpisodeSummary,
  DramaProductionChainSummary,
  EpisodeDomain,
  Script,
  Storyboard,
  VideoMerge,
  VideoTask
} from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import { nowIso } from '../../utils/time.js';

const ACTIVE_VIDEO_TASK_STATUSES = new Set<VideoTask['status']>(['queued', 'submitting', 'polling', 'running']);

const resolveEpisodeStage = (
  input: Pick<DramaProductionChainEpisodeSummary, 'counts' | 'publishStatus'>
): DramaProductionChainEpisodeSummary['stage'] => {
  const storyboardTarget = input.counts.storyboard;
  const assetCoverage = Math.max(input.counts.asset, input.counts.assetLinked);
  const storyboardReady = storyboardTarget > 0 && input.counts.storyboardGenerated >= storyboardTarget;
  const assetReady = storyboardReady && assetCoverage >= storyboardTarget;
  const videoReady = storyboardReady && input.counts.videoTaskDone >= storyboardTarget;
  const mergeReady = input.counts.videoMergeDone > 0;
  const published = input.publishStatus === 'published';
  const blockers: string[] = [];

  if (input.counts.script <= 0) {
    blockers.push('script_missing');
  } else if (input.counts.storyboard <= 0) {
    blockers.push('storyboard_missing');
  } else if (!storyboardReady) {
    blockers.push('storyboard_generation_pending');
  } else if (!assetReady) {
    blockers.push('asset_gap');
  } else if (!videoReady) {
    blockers.push('video_gap');
  } else if (!mergeReady) {
    blockers.push('merge_missing');
  } else if (!published) {
    blockers.push('publish_pending');
  }

  const stepsDone = [
    input.counts.script > 0,
    storyboardReady,
    assetReady,
    videoReady,
    mergeReady,
    published
  ].filter(Boolean).length;

  if (input.counts.script <= 0) {
    return {
      current: 'writing',
      nextAction: 'generate_script',
      progressPercent: Math.round((stepsDone / 6) * 100),
      blockers
    };
  }
  if (input.counts.storyboard <= 0 || !storyboardReady) {
    return {
      current: 'storyboard',
      nextAction: 'generate_storyboard',
      progressPercent: Math.round((stepsDone / 6) * 100),
      blockers
    };
  }
  if (!assetReady) {
    return {
      current: 'asset',
      nextAction: 'generate_asset',
      progressPercent: Math.round((stepsDone / 6) * 100),
      blockers
    };
  }
  if (!videoReady) {
    return {
      current: 'video',
      nextAction: 'create_video_task',
      progressPercent: Math.round((stepsDone / 6) * 100),
      blockers
    };
  }
  if (!mergeReady) {
    return {
      current: 'merge',
      nextAction: 'create_video_merge',
      progressPercent: Math.round((stepsDone / 6) * 100),
      blockers
    };
  }
  if (!published) {
    return {
      current: 'delivery',
      nextAction: 'publish_episode',
      progressPercent: Math.round((stepsDone / 6) * 100),
      blockers
    };
  }
  return {
    current: 'done',
    nextAction: 'optimize_result',
    progressPercent: 100,
    blockers
  };
};

export class DramaProductionChainService {
  constructor(private readonly store: SqliteStore) {}

  getDramaProductionChain(dramaId: string): DramaProductionChainSummary | null {
    const drama = this.store.getDramaById(dramaId);
    if (!drama) {
      return null;
    }

    const projectId = drama.projectId;
    const episodes = (this.store.listEpisodesByDrama(dramaId) ?? []).slice().sort((left, right) => left.orderIndex - right.orderIndex);
    const scripts = this.store.listScripts(projectId) ?? [];
    const storyboards = this.store.listStoryboards(projectId) ?? [];
    const assets = this.store.listAssets(projectId) ?? [];
    const videoTasks = this.store.listVideoTasks(projectId) ?? [];
    const audioTasks = this.store.listAudioTasks(projectId) ?? [];
    const videoMerges = this.store.listVideoMerges(projectId) ?? [];

    const episodeItems = episodes.map((episode) =>
      this.buildEpisodeSummary({
        projectId,
        episode,
        scripts,
        storyboards,
        assets,
        videoTasks,
        audioTasks,
        videoMerges
      })
    );

    const firstPendingEpisode = episodeItems.find((item) => item.stage.current !== 'done');
    const progressPercent =
      episodeItems.length > 0 ? Math.round(episodeItems.reduce((sum, item) => sum + item.stage.progressPercent, 0) / episodeItems.length) : 0;

    return {
      dramaId: drama.id,
      projectId,
      dramaName: drama.name,
      generatedAt: nowIso(),
      counts: {
        episode: episodes.length,
        episodePublished: episodes.filter((item) => item.status === 'published').length,
        script: scripts.filter((item) => item.episodeId && episodes.some((episode) => episode.id === item.episodeId)).length,
        storyboard: storyboards.filter((item) => item.episodeId && episodes.some((episode) => episode.id === item.episodeId)).length,
        storyboardGenerated: storyboards.filter(
          (item) => item.status === 'generated' && item.episodeId && episodes.some((episode) => episode.id === item.episodeId)
        ).length,
        asset: assets.filter((item) => storyboards.some((board) => board.id === item.storyboardId && board.episodeId && episodes.some((episode) => episode.id === board.episodeId))).length,
        assetLinked: episodeItems.reduce((sum, item) => sum + item.counts.assetLinked, 0),
        videoTask: videoTasks.filter(
          (item) => storyboards.some((board) => board.id === item.storyboardId && board.episodeId && episodes.some((episode) => episode.id === board.episodeId))
        ).length,
        videoTaskActive: videoTasks.filter(
          (item) =>
            ACTIVE_VIDEO_TASK_STATUSES.has(item.status) &&
            storyboards.some((board) => board.id === item.storyboardId && board.episodeId && episodes.some((episode) => episode.id === board.episodeId))
        ).length,
        videoTaskDone: videoTasks.filter(
          (item) =>
            item.status === 'done' &&
            storyboards.some((board) => board.id === item.storyboardId && board.episodeId && episodes.some((episode) => episode.id === board.episodeId))
        ).length,
        videoTaskFailed: videoTasks.filter(
          (item) =>
            item.status === 'failed' &&
            storyboards.some((board) => board.id === item.storyboardId && board.episodeId && episodes.some((episode) => episode.id === board.episodeId))
        ).length,
        audioTask: audioTasks.filter(
          (item) => storyboards.some((board) => board.id === item.storyboardId && board.episodeId && episodes.some((episode) => episode.id === board.episodeId))
        ).length,
        audioTaskDone: audioTasks.filter(
          (item) =>
            item.status === 'done' &&
            storyboards.some((board) => board.id === item.storyboardId && board.episodeId && episodes.some((episode) => episode.id === board.episodeId))
        ).length,
        audioTaskFailed: audioTasks.filter(
          (item) =>
            item.status === 'failed' &&
            storyboards.some((board) => board.id === item.storyboardId && board.episodeId && episodes.some((episode) => episode.id === board.episodeId))
        ).length,
        videoMerge: videoMerges.filter((item) =>
          item.clips.some((clip) => storyboards.some((board) => board.id === clip.storyboardId && board.episodeId && episodes.some((episode) => episode.id === board.episodeId)))
        ).length,
        videoMergeDone: videoMerges.filter(
          (item) =>
            item.status === 'done' &&
            item.clips.some((clip) => storyboards.some((board) => board.id === clip.storyboardId && board.episodeId && episodes.some((episode) => episode.id === board.episodeId)))
        ).length,
        videoMergeFailed: videoMerges.filter(
          (item) =>
            item.status === 'failed' &&
            item.clips.some((clip) => storyboards.some((board) => board.id === clip.storyboardId && board.episodeId && episodes.some((episode) => episode.id === board.episodeId)))
        ).length
      },
      stage: firstPendingEpisode
        ? {
            current: firstPendingEpisode.stage.current,
            nextAction: firstPendingEpisode.stage.nextAction,
            progressPercent
          }
        : {
            current: 'done',
            nextAction: 'optimize_result',
            progressPercent
          },
      episodes: episodeItems
    };
  }

  private buildEpisodeSummary(input: {
    projectId: string;
    episode: EpisodeDomain;
    scripts: Script[];
    storyboards: Storyboard[];
    assets: Asset[];
    videoTasks: VideoTask[];
    audioTasks: AudioTask[];
    videoMerges: VideoMerge[];
  }): DramaProductionChainEpisodeSummary {
    const episodeScripts = input.scripts.filter((item) => item.episodeId === input.episode.id);
    const episodeStoryboards = input.storyboards.filter((item) => item.episodeId === input.episode.id);
    const storyboardIds = new Set(episodeStoryboards.map((item) => item.id));
    const episodeAssets = input.assets.filter((item) => storyboardIds.has(item.storyboardId));
    const episodeVideoTasks = input.videoTasks.filter((item) => storyboardIds.has(item.storyboardId));
    const episodeAudioTasks = input.audioTasks.filter((item) => storyboardIds.has(item.storyboardId));
    const episodeVideoMerges = input.videoMerges.filter((item) => item.clips.some((clip) => storyboardIds.has(clip.storyboardId)));
    const assetLinked = this.countLinkedAssets(input.projectId, input.episode.id, episodeStoryboards);
    const workflowStatus = this.store.getEpisodeWorkflowState(input.projectId, input.episode.id)?.status ?? 'draft';

    const counts: DramaProductionChainEpisodeSummary['counts'] = {
      script: episodeScripts.length,
      storyboard: episodeStoryboards.length,
      storyboardGenerated: episodeStoryboards.filter((item) => item.status === 'generated').length,
      asset: episodeAssets.length,
      assetLinked,
      videoTask: episodeVideoTasks.length,
      videoTaskActive: episodeVideoTasks.filter((item) => ACTIVE_VIDEO_TASK_STATUSES.has(item.status)).length,
      videoTaskDone: episodeVideoTasks.filter((item) => item.status === 'done').length,
      videoTaskFailed: episodeVideoTasks.filter((item) => item.status === 'failed').length,
      audioTask: episodeAudioTasks.length,
      audioTaskDone: episodeAudioTasks.filter((item) => item.status === 'done').length,
      audioTaskFailed: episodeAudioTasks.filter((item) => item.status === 'failed').length,
      videoMerge: episodeVideoMerges.length,
      videoMergeDone: episodeVideoMerges.filter((item) => item.status === 'done').length,
      videoMergeFailed: episodeVideoMerges.filter((item) => item.status === 'failed').length
    };

    return {
      episodeId: input.episode.id,
      title: input.episode.title,
      orderIndex: input.episode.orderIndex,
      publishStatus: input.episode.status,
      workflowStatus,
      counts,
      stage: resolveEpisodeStage({
        counts,
        publishStatus: input.episode.status
      })
    };
  }

  private countLinkedAssets(projectId: string, episodeId: string, storyboards: Storyboard[]): number {
    const linkedIds = new Set((this.store.listEpisodeAssetRelations(projectId, episodeId) ?? []).map((item) => item.assetId));
    for (const storyboard of storyboards) {
      for (const relation of this.store.listStoryboardAssetRelations(projectId, storyboard.id) ?? []) {
        linkedIds.add(relation.assetId);
      }
    }
    return linkedIds.size;
  }
}
