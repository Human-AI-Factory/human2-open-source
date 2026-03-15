import type { DomainEntity } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';

export type CharacterBibleEntry = {
  id: string;
  name: string;
  prompt: string;
  imageUrl: string | null;
  lifecycleStatus: DomainEntity['lifecycleStatus'];
  linkedToStoryboard: boolean;
  linkedToEpisode: boolean;
};

export type CharacterBibleDocument = {
  projectId: string;
  scope: 'project' | 'episode' | 'storyboard';
  episodeId?: string;
  storyboardId?: string;
  generatedAt: string;
  entries: CharacterBibleEntry[];
};

export class CharacterBibleService {
  constructor(private readonly store: SqliteStore) {}

  listProjectCharacters(projectId: string): DomainEntity[] {
    return this.store.listDomainEntities(projectId, { type: 'character', includeDeleted: false }) ?? [];
  }

  buildProjectCharacterBible(projectId: string): CharacterBibleDocument {
    return {
      projectId,
      scope: 'project',
      generatedAt: new Date().toISOString(),
      entries: this.listProjectCharacters(projectId).map((entity) => this.toEntry(entity, { linkedToStoryboard: false, linkedToEpisode: false })),
    };
  }

  buildEpisodeCharacterBible(projectId: string, episodeId: string): CharacterBibleDocument {
    const linkedIds = new Set(
      (this.store.listEpisodeDomainEntityRelations(projectId, episodeId) ?? [])
        .filter((relation) => relation.role === 'character')
        .map((relation) => relation.entityId)
    );
    const storyboards = this.store.listStoryboardsByEpisode(projectId, episodeId) ?? [];
    for (const storyboard of storyboards) {
      for (const relation of this.store.listStoryboardDomainEntityRelations(projectId, storyboard.id) ?? []) {
        if (relation.role === 'character') {
          linkedIds.add(relation.entityId);
        }
      }
    }
    const entries = this.listProjectCharacters(projectId)
      .filter((entity) => linkedIds.size === 0 || linkedIds.has(entity.id))
      .map((entity) => this.toEntry(entity, { linkedToStoryboard: false, linkedToEpisode: linkedIds.has(entity.id) }));
    return {
      projectId,
      scope: 'episode',
      episodeId,
      generatedAt: new Date().toISOString(),
      entries,
    };
  }

  buildStoryboardCharacterBible(projectId: string, storyboardId: string): CharacterBibleDocument {
    const linkedIds = new Set(
      (this.store.listStoryboardDomainEntityRelations(projectId, storyboardId) ?? [])
        .filter((relation) => relation.role === 'character')
        .map((relation) => relation.entityId)
    );
    const entries = this.listProjectCharacters(projectId)
      .filter((entity) => linkedIds.size === 0 || linkedIds.has(entity.id))
      .map((entity) => this.toEntry(entity, { linkedToStoryboard: linkedIds.has(entity.id), linkedToEpisode: false }));
    return {
      projectId,
      scope: 'storyboard',
      storyboardId,
      generatedAt: new Date().toISOString(),
      entries,
    };
  }

  private toEntry(
    entity: DomainEntity,
    input: {
      linkedToStoryboard: boolean;
      linkedToEpisode: boolean;
    }
  ): CharacterBibleEntry {
    return {
      id: entity.id,
      name: entity.name,
      prompt: entity.prompt.trim(),
      imageUrl: entity.imageUrl,
      lifecycleStatus: entity.lifecycleStatus,
      linkedToStoryboard: input.linkedToStoryboard,
      linkedToEpisode: input.linkedToEpisode,
    };
  }
}
