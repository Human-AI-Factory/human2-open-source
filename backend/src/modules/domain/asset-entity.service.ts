import { v4 as uuid } from 'uuid';
import { Asset, EpisodeAssetRelation } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';

export class AssetEntityService {
  constructor(private readonly store: SqliteStore) {}

  listEntities(
    projectId: string,
    input: { type?: 'character' | 'scene' | 'prop'; episodeId?: string }
  ): Array<
    {
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
  > | null {
    const assets = this.store.listAssets(projectId);
    const storyboards = this.store.listStoryboards(projectId);
    const episodes = this.store.listEpisodes(projectId);
    if (!assets || !storyboards || !episodes) {
      return null;
    }
    const storyboardMap = new Map(storyboards.map((item) => [item.id, item]));
    const episodeMap = new Map(episodes.map((item) => [item.id, item]));
    const usageCountByAssetId = new Map<string, number>();
    for (const storyboard of storyboards) {
      const relations = this.store.listStoryboardAssetRelations(projectId, storyboard.id) ?? [];
      for (const relation of relations) {
        usageCountByAssetId.set(relation.assetId, (usageCountByAssetId.get(relation.assetId) ?? 0) + 1);
      }
    }

    return assets
      .filter((asset) => (input.type ? asset.type === input.type : true))
      .map((asset) => {
        const storyboard = storyboardMap.get(asset.storyboardId) ?? null;
        const episode = storyboard?.episodeId ? episodeMap.get(storyboard.episodeId) ?? null : null;
        return {
          id: asset.id,
          type: asset.type,
          name: asset.name,
          prompt: asset.prompt,
          imageUrl: asset.imageUrl,
          storyboardId: asset.storyboardId,
          storyboardTitle: storyboard?.title ?? null,
          episodeId: storyboard?.episodeId ?? null,
          episodeTitle: episode?.title ?? null,
          usageCount: usageCountByAssetId.get(asset.id) ?? 0
        };
      })
      .filter((item) => (input.episodeId ? item.episodeId === input.episodeId : true));
  }

  createEntity(
    projectId: string,
    input: {
      storyboardId?: string;
      episodeId?: string;
      type: 'character' | 'scene' | 'prop';
      name: string;
      prompt: string;
      imageUrl?: string | null;
      voiceProfile?: Asset['voiceProfile'];
    }
  ): Asset | null {
    const storyboards = this.store.listStoryboards(projectId);
    if (!storyboards) {
      return null;
    }
    const targetStoryboardId = input.storyboardId?.trim()
      ? input.storyboardId.trim()
      : storyboards.find((item) => (input.episodeId ? item.episodeId === input.episodeId : true))?.id;
    if (!targetStoryboardId) {
      return null;
    }
    return this.store.createAsset({
      id: uuid(),
      projectId,
      storyboardId: targetStoryboardId,
      type: input.type,
      name: input.name.trim(),
      prompt: input.prompt.trim(),
      imageUrl: input.imageUrl ?? null,
      voiceProfile: input.voiceProfile ?? null,
    });
  }

  updateEntity(
    projectId: string,
    assetId: string,
    input: {
      name?: string;
      prompt?: string;
      imageUrl?: string | null;
      type?: 'character' | 'scene' | 'prop';
      voiceProfile?: Asset['voiceProfile'];
    }
  ): Asset | null {
    return this.store.updateAsset(projectId, assetId, input);
  }

  deleteEntity(projectId: string, assetId: string): boolean {
    return this.store.deleteAsset(projectId, assetId);
  }

  listEntityWorkbench(
    projectId: string,
    input: { type?: 'character' | 'scene' | 'prop'; q?: string; episodeId?: string }
  ): Array<{
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
  }> | null {
    const assets = this.store.listAssets(projectId);
    const storyboards = this.store.listStoryboards(projectId);
    if (!assets || !storyboards) {
      return null;
    }
    const q = input.q?.trim().toLowerCase();
    const storyboardMap = new Map(storyboards.map((item) => [item.id, item]));
    const grouped = new Map<
      string,
      {
        entityId: string;
        type: 'character' | 'scene' | 'prop';
        name: string;
        prompt: string;
        imageUrl: string | null;
        usageCount: number;
        appearances: number;
        episodeIds: Set<string>;
        storyboardIds: Set<string>;
        sourceStoryboardId: string;
      }
    >();
    for (const asset of assets) {
      if (input.type && asset.type !== input.type) {
        continue;
      }
      const storyboard = storyboardMap.get(asset.storyboardId);
      if (!storyboard) {
        continue;
      }
      if (input.episodeId && storyboard.episodeId !== input.episodeId) {
        continue;
      }
      if (q) {
        const haystack = `${asset.name} ${asset.prompt}`.toLowerCase();
        if (!haystack.includes(q)) {
          continue;
        }
      }
      const key = `${asset.type}::${asset.name.trim().toLowerCase()}`;
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, {
          entityId: asset.id,
          type: asset.type,
          name: asset.name,
          prompt: asset.prompt,
          imageUrl: asset.imageUrl,
          usageCount: 1,
          appearances: 1,
          episodeIds: new Set(storyboard.episodeId ? [storyboard.episodeId] : []),
          storyboardIds: new Set([storyboard.id]),
          sourceStoryboardId: storyboard.id
        });
        continue;
      }
      current.appearances += 1;
      current.usageCount += 1;
      current.storyboardIds.add(storyboard.id);
      if (storyboard.episodeId) {
        current.episodeIds.add(storyboard.episodeId);
      }
      if (!current.imageUrl && asset.imageUrl) {
        current.imageUrl = asset.imageUrl;
      }
    }
    return Array.from(grouped.values())
      .map((item) => ({
        entityId: item.entityId,
        type: item.type,
        name: item.name,
        prompt: item.prompt,
        imageUrl: item.imageUrl,
        usageCount: item.usageCount,
        appearances: item.appearances,
        episodeIds: Array.from(item.episodeIds),
        storyboardIds: Array.from(item.storyboardIds),
        sourceStoryboardId: item.sourceStoryboardId
      }))
      .sort((a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name));
  }

  applyEntityToEpisode(
    projectId: string,
    entityId: string,
    input: {
      episodeId: string;
      mode?: 'missing_only' | 'all';
      overrideName?: string;
      overridePrompt?: string;
      overrideImageUrl?: string | null;
    }
  ):
    | {
        created: Asset[];
        skippedStoryboardIds: string[];
        totalStoryboards: number;
      }
    | null {
    const source = this.store.getAsset(projectId, entityId);
    if (!source) {
      return null;
    }
    const storyboards = this.store.listStoryboardsByEpisode(projectId, input.episodeId);
    if (!storyboards) {
      return null;
    }
    const mode = input.mode ?? 'missing_only';
    const allAssets = this.store.listAssets(projectId) ?? [];
    const created: Asset[] = [];
    const skippedStoryboardIds: string[] = [];
    const targetName = input.overrideName?.trim() || source.name;
    for (const storyboard of storyboards) {
      const exists = allAssets.some(
        (item) =>
          item.storyboardId === storyboard.id &&
          item.type === source.type &&
          item.name.trim().toLowerCase() === targetName.trim().toLowerCase()
      );
      if (mode === 'missing_only' && exists) {
        skippedStoryboardIds.push(storyboard.id);
        continue;
      }
      const inserted = this.store.createAsset({
        id: uuid(),
        projectId,
        storyboardId: storyboard.id,
        type: source.type,
        name: targetName,
        prompt: input.overridePrompt?.trim() || source.prompt,
        imageUrl: input.overrideImageUrl === undefined ? source.imageUrl : input.overrideImageUrl
      });
      if (inserted) {
        created.push(inserted);
        allAssets.push(inserted);
      }
    }
    return {
      created,
      skippedStoryboardIds,
      totalStoryboards: storyboards.length
    };
  }

  listEpisodeAssetRelations(projectId: string, episodeId: string): EpisodeAssetRelation[] | null {
    return this.store.listEpisodeAssetRelations(projectId, episodeId);
  }

  replaceEpisodeAssetRelations(
    projectId: string,
    episodeId: string,
    input: { sceneAssetIds?: string[]; characterAssetIds?: string[]; propAssetIds?: string[] }
  ): EpisodeAssetRelation[] | null {
    return this.store.replaceEpisodeAssetRelations(projectId, episodeId, input);
  }
}
