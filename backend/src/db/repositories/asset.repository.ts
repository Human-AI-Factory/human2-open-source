import type { Asset, AssetState, AssetVoiceProfile, EpisodeAssetRelation, StoryboardAssetRelation } from '../../core/types.js';
import { mapAsset, mapEpisodeAssetRelation, mapStoryboardAssetRelation } from '../sqlite/row-mappers.js';
import type { AssetRow, EpisodeAssetLinkRow, StoryboardAssetLinkRow } from '../sqlite/row-types.js';
import { BaseRepository } from './base.repository.js';

export class AssetRepository extends BaseRepository {
  listEpisodeAssetRelations(projectId: string, episodeId: string): EpisodeAssetRelation[] | null {
    const episode = this.db.prepare('SELECT id FROM episodes WHERE id = ? AND project_id = ? LIMIT 1').get(episodeId, projectId);
    if (!episode) {
      return null;
    }
    const rows = this.db
      .prepare(
        'SELECT project_id, episode_id, asset_id, role, created_at FROM episode_asset_links WHERE project_id = ? AND episode_id = ? ORDER BY role ASC, created_at ASC'
      )
      .all(projectId, episodeId) as EpisodeAssetLinkRow[];
    return rows.map((row) => mapEpisodeAssetRelation(row));
  }

  replaceEpisodeAssetRelations(
    projectId: string,
    episodeId: string,
    input: {
      sceneAssetIds?: string[];
      characterAssetIds?: string[];
      propAssetIds?: string[];
    }
  ): EpisodeAssetRelation[] | null {
    const episode = this.db.prepare('SELECT id FROM episodes WHERE id = ? AND project_id = ? LIMIT 1').get(episodeId, projectId);
    if (!episode) {
      return null;
    }

    const sceneAssetIds = this.normalizeIds(input.sceneAssetIds);
    const characterAssetIds = this.normalizeIds(input.characterAssetIds);
    const propAssetIds = this.normalizeIds(input.propAssetIds);
    if (!sceneAssetIds.every((id) => this.hasAssetType(projectId, id, 'scene'))) {
      return null;
    }
    if (!characterAssetIds.every((id) => this.hasAssetType(projectId, id, 'character'))) {
      return null;
    }
    if (!propAssetIds.every((id) => this.hasAssetType(projectId, id, 'prop'))) {
      return null;
    }

    this.db.prepare('DELETE FROM episode_asset_links WHERE project_id = ? AND episode_id = ?').run(projectId, episodeId);
    const now = this.timestamp();
    for (const assetId of sceneAssetIds) {
      this.db
        .prepare('INSERT INTO episode_asset_links (project_id, episode_id, asset_id, role, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(projectId, episodeId, assetId, 'scene', now);
    }
    for (const assetId of characterAssetIds) {
      this.db
        .prepare('INSERT INTO episode_asset_links (project_id, episode_id, asset_id, role, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(projectId, episodeId, assetId, 'character', now);
    }
    for (const assetId of propAssetIds) {
      this.db
        .prepare('INSERT INTO episode_asset_links (project_id, episode_id, asset_id, role, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(projectId, episodeId, assetId, 'prop', now);
    }
    return this.listEpisodeAssetRelations(projectId, episodeId);
  }

  listStoryboardAssetRelations(projectId: string, storyboardId: string): StoryboardAssetRelation[] | null {
    const storyboard = this.getStoryboardRecord(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }
    const rows = this.db
      .prepare(
        'SELECT storyboard_id, asset_id, role, created_at FROM storyboard_asset_links WHERE storyboard_id = ? ORDER BY role ASC, created_at ASC'
      )
      .all(storyboardId) as StoryboardAssetLinkRow[];
    return rows.map((row) => mapStoryboardAssetRelation(row));
  }

  replaceStoryboardAssetRelations(
    projectId: string,
    storyboardId: string,
    input: {
      sceneAssetId?: string | null;
      characterAssetIds?: string[];
      propAssetIds?: string[];
    }
  ): StoryboardAssetRelation[] | null {
    const storyboard = this.getStoryboardRecord(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }

    const sceneAssetId = input.sceneAssetId?.trim() || null;
    const characterAssetIds = this.normalizeIds(input.characterAssetIds);
    const propAssetIds = this.normalizeIds(input.propAssetIds);
    if (sceneAssetId && !this.hasAssetType(projectId, sceneAssetId, 'scene')) {
      return null;
    }
    if (!characterAssetIds.every((id) => this.hasAssetType(projectId, id, 'character'))) {
      return null;
    }
    if (!propAssetIds.every((id) => this.hasAssetType(projectId, id, 'prop'))) {
      return null;
    }

    if (storyboard.episode_id) {
      const episodeLinks = this.listEpisodeAssetRelations(projectId, storyboard.episode_id) ?? [];
      const roleSet = (role: 'scene' | 'character' | 'prop') =>
        new Set(episodeLinks.filter((item) => item.role === role).map((item) => item.assetId));
      const allowedScene = roleSet('scene');
      const allowedCharacter = roleSet('character');
      const allowedProp = roleSet('prop');
      const hasScopedRules = allowedScene.size > 0 || allowedCharacter.size > 0 || allowedProp.size > 0;
      if (hasScopedRules) {
        if (sceneAssetId && allowedScene.size > 0 && !allowedScene.has(sceneAssetId)) {
          return null;
        }
        if (allowedCharacter.size > 0 && !characterAssetIds.every((id) => allowedCharacter.has(id))) {
          return null;
        }
        if (allowedProp.size > 0 && !propAssetIds.every((id) => allowedProp.has(id))) {
          return null;
        }
      }
    }

    this.db.prepare('DELETE FROM storyboard_asset_links WHERE storyboard_id = ?').run(storyboardId);
    const now = this.timestamp();
    if (sceneAssetId) {
      this.db
        .prepare('INSERT INTO storyboard_asset_links (storyboard_id, asset_id, role, created_at) VALUES (?, ?, ?, ?)')
        .run(storyboardId, sceneAssetId, 'scene', now);
    }
    for (const assetId of characterAssetIds) {
      this.db
        .prepare('INSERT INTO storyboard_asset_links (storyboard_id, asset_id, role, created_at) VALUES (?, ?, ?, ?)')
        .run(storyboardId, assetId, 'character', now);
    }
    for (const assetId of propAssetIds) {
      this.db
        .prepare('INSERT INTO storyboard_asset_links (storyboard_id, asset_id, role, created_at) VALUES (?, ?, ?, ?)')
        .run(storyboardId, assetId, 'prop', now);
    }
    return this.listStoryboardAssetRelations(projectId, storyboardId);
  }

  listAssets(projectId: string): Asset[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }

    const rows = this.db
      .prepare(
        'SELECT id, project_id, storyboard_id, name, type, scope, share_scope, base_asset_id, prompt, state_prompt, state_json, image_url, voice_profile, created_at, updated_at FROM assets WHERE project_id = ? ORDER BY scope ASC, created_at DESC'
      )
      .all(projectId) as AssetRow[];

    return rows.map((row) => mapAsset(row));
  }

  listAssetsByEpisode(projectId: string, episodeId: string): Asset[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }

    // Verify episode exists and belongs to project
    const episode = this.db.prepare('SELECT id FROM episodes WHERE id = ? AND project_id = ? LIMIT 1').get(episodeId, projectId);
    if (!episode) {
      return null;
    }

    // Get storyboards for this episode
    const storyboards = this.db.prepare('SELECT id FROM storyboards WHERE episode_id = ?').all(episodeId) as { id: string }[];
    const storyboardIds = storyboards.map((s) => s.id);

    // Get assets linked to episode via episode_asset_links
    const episodeAssetLinks = this.db
      .prepare('SELECT asset_id FROM episode_asset_links WHERE project_id = ? AND episode_id = ?')
      .all(projectId, episodeId) as { asset_id: string }[];
    const episodeAssetIds = episodeAssetLinks.map((link) => link.asset_id);

    // Get assets that either:
    // 1. Are linked to storyboards in this episode, OR
    // 2. Are explicitly linked to this episode
    let query = '';
    const params: string[] = [];

    if (storyboardIds.length > 0 && episodeAssetIds.length > 0) {
      const placeholders = storyboardIds.map(() => '?').join(',');
      const episodePlaceholders = episodeAssetIds.map(() => '?').join(',');
      query = `SELECT DISTINCT id, project_id, storyboard_id, name, type, scope, share_scope, base_asset_id, prompt, state_prompt, state_json, image_url, voice_profile, created_at, updated_at FROM assets WHERE project_id = ? AND (storyboard_id IN (${placeholders}) OR id IN (${episodePlaceholders})) ORDER BY scope ASC, created_at DESC`;
      params.push(projectId, ...storyboardIds, ...episodeAssetIds);
    } else if (storyboardIds.length > 0) {
      const placeholders = storyboardIds.map(() => '?').join(',');
      query = `SELECT DISTINCT id, project_id, storyboard_id, name, type, scope, share_scope, base_asset_id, prompt, state_prompt, state_json, image_url, voice_profile, created_at, updated_at FROM assets WHERE project_id = ? AND storyboard_id IN (${placeholders}) ORDER BY scope ASC, created_at DESC`;
      params.push(projectId, ...storyboardIds);
    } else if (episodeAssetIds.length > 0) {
      const episodePlaceholders = episodeAssetIds.map(() => '?').join(',');
      query = `SELECT DISTINCT id, project_id, storyboard_id, name, type, scope, share_scope, base_asset_id, prompt, state_prompt, state_json, image_url, voice_profile, created_at, updated_at FROM assets WHERE project_id = ? AND id IN (${episodePlaceholders}) ORDER BY scope ASC, created_at DESC`;
      params.push(projectId, ...episodeAssetIds);
    } else {
      // No storyboards or linked assets for this episode
      return [];
    }

    const rows = this.db.prepare(query).all(...params) as AssetRow[];
    return rows.map((row) => mapAsset(row));
  }

  createAssets(
    projectId: string,
    storyboardId: string,
    items: Array<{
      id: string;
      name: string;
      type: 'character' | 'scene' | 'prop';
      scope?: Asset['scope'];
      shareScope?: Asset['shareScope'];
      baseAssetId?: string | null;
      prompt: string;
      statePrompt?: string | null;
      state?: AssetState | null;
      imageUrl: string | null;
      voiceProfile?: AssetVoiceProfile | null;
    }>
  ): Asset[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }
    const storyboard = this.getStoryboardRecord(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }

    const timestamp = this.timestamp();
    for (const item of items) {
      this.db
        .prepare(
          'INSERT INTO assets (id, project_id, storyboard_id, name, type, scope, share_scope, base_asset_id, prompt, state_prompt, state_json, image_url, voice_profile, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          item.id,
          projectId,
          storyboardId,
          item.name,
          item.type,
          item.scope ?? 'shot',
          item.shareScope ?? 'project',
          item.baseAssetId ?? null,
          item.prompt,
          item.statePrompt ?? null,
          this.serializeAssetState(item.state),
          item.imageUrl,
          this.serializeVoiceProfile(item.voiceProfile),
          timestamp,
          timestamp
        );
    }

    const rows = this.db
      .prepare(
        'SELECT id, project_id, storyboard_id, name, type, scope, share_scope, base_asset_id, prompt, state_prompt, state_json, image_url, voice_profile, created_at, updated_at FROM assets WHERE storyboard_id = ? ORDER BY scope ASC, created_at DESC'
      )
      .all(storyboardId) as AssetRow[];
    return rows.map((row) => mapAsset(row));
  }

  getAsset(projectId: string, assetId: string): Asset | null {
    const row = this.db
      .prepare(
        'SELECT id, project_id, storyboard_id, name, type, scope, share_scope, base_asset_id, prompt, state_prompt, state_json, image_url, voice_profile, created_at, updated_at FROM assets WHERE id = ? AND project_id = ? LIMIT 1'
      )
      .get(assetId, projectId) as AssetRow | undefined;
    return row ? mapAsset(row) : null;
  }

  createAsset(input: {
    id: string;
    projectId: string;
    storyboardId: string;
    name: string;
    type: 'character' | 'scene' | 'prop';
    scope?: Asset['scope'];
    shareScope?: Asset['shareScope'];
    baseAssetId?: string | null;
    prompt: string;
    statePrompt?: string | null;
    state?: AssetState | null;
    imageUrl?: string | null;
    videoUrl?: string | null;
    firstFrameUrl?: string | null;
    lastFrameUrl?: string | null;
    voiceProfile?: AssetVoiceProfile | null;
  }): Asset | null {
    if (!this.projectExists(input.projectId)) {
      return null;
    }
    const storyboard = this.getStoryboardRecord(input.projectId, input.storyboardId);
    if (!storyboard) {
      return null;
    }
    const timestamp = this.timestamp();
    this.db
      .prepare(
        'INSERT INTO assets (id, project_id, storyboard_id, name, type, scope, share_scope, base_asset_id, prompt, state_prompt, state_json, image_url, video_url, first_frame_url, last_frame_url, voice_profile, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        input.id,
        input.projectId,
        input.storyboardId,
        input.name,
        input.type,
        input.scope ?? 'shot',
        input.shareScope ?? 'project',
        input.baseAssetId ?? null,
        input.prompt,
        input.statePrompt ?? null,
        this.serializeAssetState(input.state),
        input.imageUrl ?? null,
        input.videoUrl ?? null,
        input.firstFrameUrl ?? null,
        input.lastFrameUrl ?? null,
        this.serializeVoiceProfile(input.voiceProfile),
        timestamp,
        timestamp
      );
    return this.getAsset(input.projectId, input.id);
  }

  updateAsset(
    projectId: string,
    assetId: string,
    input: {
      name?: string;
      type?: 'character' | 'scene' | 'prop';
      scope?: Asset['scope'];
      shareScope?: Asset['shareScope'];
      baseAssetId?: string | null;
      prompt?: string;
      statePrompt?: string | null;
      state?: AssetState | null;
      imageUrl?: string | null;
      videoUrl?: string | null;
      firstFrameUrl?: string | null;
      lastFrameUrl?: string | null;
      voiceProfile?: AssetVoiceProfile | null;
    }
  ): Asset | null {
    const current = this.getAsset(projectId, assetId);
    if (!current) {
      return null;
    }
    const name = input.name ?? current.name;
    const type = input.type ?? current.type;
    const scope = input.scope ?? current.scope;
    const shareScope = input.shareScope ?? current.shareScope;
    const baseAssetId = input.baseAssetId === undefined ? current.baseAssetId : input.baseAssetId;
    const prompt = input.prompt ?? current.prompt;
    const statePrompt = input.statePrompt === undefined ? current.statePrompt : input.statePrompt;
    const state = input.state === undefined ? current.state : input.state;
    const imageUrl = input.imageUrl === undefined ? current.imageUrl : input.imageUrl;
    const videoUrl = input.videoUrl === undefined ? current.videoUrl : input.videoUrl;
    const firstFrameUrl = input.firstFrameUrl === undefined ? current.firstFrameUrl : input.firstFrameUrl;
    const lastFrameUrl = input.lastFrameUrl === undefined ? current.lastFrameUrl : input.lastFrameUrl;
    const voiceProfile = input.voiceProfile === undefined ? current.voiceProfile : input.voiceProfile;
    this.db
      .prepare('UPDATE assets SET name = ?, type = ?, scope = ?, share_scope = ?, base_asset_id = ?, prompt = ?, state_prompt = ?, state_json = ?, image_url = ?, video_url = ?, first_frame_url = ?, last_frame_url = ?, voice_profile = ?, updated_at = ? WHERE id = ? AND project_id = ?')
      .run(
        name,
        type,
        scope,
        shareScope,
        baseAssetId,
        prompt,
        statePrompt,
        this.serializeAssetState(state),
        imageUrl,
        videoUrl,
        firstFrameUrl,
        lastFrameUrl,
        this.serializeVoiceProfile(voiceProfile),
        this.timestamp(),
        assetId,
        projectId
      );
    return this.getAsset(projectId, assetId);
  }

  deleteAsset(projectId: string, assetId: string): boolean {
    const result = this.db.prepare('DELETE FROM assets WHERE id = ? AND project_id = ?').run(assetId, projectId);
    return Number(result.changes) > 0;
  }

  private normalizeIds(ids?: string[]): string[] {
    return [...new Set((ids ?? []).map((item) => item.trim()).filter((item) => item.length > 0))];
  }

  private hasAssetType(projectId: string, assetId: string, type: 'scene' | 'character' | 'prop'): boolean {
    const row = this.db
      .prepare('SELECT type FROM assets WHERE id = ? AND project_id = ? LIMIT 1')
      .get(assetId, projectId) as { type: 'scene' | 'character' | 'prop' } | undefined;
    return row?.type === type;
  }

  private getStoryboardRecord(projectId: string, storyboardId: string): { id: string; episode_id: string | null } | null {
    const row = this.db
      .prepare('SELECT id, episode_id FROM storyboards WHERE id = ? AND project_id = ? LIMIT 1')
      .get(storyboardId, projectId) as { id: string; episode_id: string | null } | undefined;
    return row ?? null;
  }

  private serializeVoiceProfile(input: AssetVoiceProfile | null | undefined): string | null {
    if (!input?.voice?.trim()) {
      return null;
    }
    return JSON.stringify({
      voice: input.voice.trim(),
      ...(typeof input.speed === 'number' && Number.isFinite(input.speed) ? { speed: input.speed } : {}),
      ...(input.providerOptions && typeof input.providerOptions === 'object' ? { providerOptions: input.providerOptions } : {}),
    });
  }

  private serializeAssetState(input: AssetState | null | undefined): string | null {
    if (!input || typeof input !== 'object') {
      return null;
    }
    const entries = Object.entries(input).filter(([, value]) => typeof value === 'string' && value.trim().length > 0);
    if (entries.length === 0) {
      return null;
    }
    return JSON.stringify(Object.fromEntries(entries.map(([key, value]) => [key, value.trim()])));
  }
}
