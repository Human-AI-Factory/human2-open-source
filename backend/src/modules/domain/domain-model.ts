import { DramaDomain, EpisodeAssetRelation, EpisodeDomain, Script, Storyboard } from '../../core/types.js';

export interface DomainModelView {
  projectId: string;
  drama: DramaDomain | null;
  episodes: EpisodeDomain[];
  scripts: Script[];
  storyboards: Storyboard[];
  episodeAssetRelations: EpisodeAssetRelation[];
  unassignedStoryboardIds: string[];
}

export const buildDomainModelView = (input: {
  projectId: string;
  drama: DramaDomain | null;
  episodes: EpisodeDomain[];
  scripts: Script[];
  storyboards: Storyboard[];
  episodeAssetRelations: EpisodeAssetRelation[];
}): DomainModelView => ({
  projectId: input.projectId,
  drama: input.drama,
  episodes: input.episodes,
  scripts: input.scripts,
  storyboards: input.storyboards,
  episodeAssetRelations: input.episodeAssetRelations,
  unassignedStoryboardIds: input.storyboards.filter((item) => !item.episodeId).map((item) => item.id)
});

export const canAssignStoryboardEpisode = (input: {
  storyboard: Storyboard;
  targetEpisodeId: string | null;
  episodes: EpisodeDomain[];
  scripts: Script[];
}): boolean => {
  if (!input.targetEpisodeId) {
    return true;
  }
  const episodeExists = input.episodes.some((item) => item.id === input.targetEpisodeId);
  if (!episodeExists) {
    return false;
  }
  const script = input.scripts.find((item) => item.id === input.storyboard.scriptId);
  if (!script) {
    return false;
  }
  if (script.episodeId && script.episodeId !== input.targetEpisodeId) {
    return false;
  }
  return true;
};
