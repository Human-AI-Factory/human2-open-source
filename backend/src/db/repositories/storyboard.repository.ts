import type { Storyboard } from '../../core/types.js';
import { mapStoryboard } from '../sqlite/row-mappers.js';
import type { StoryboardRow } from '../sqlite/row-types.js';
import { BaseRepository } from './base.repository.js';

export class StoryboardRepository extends BaseRepository {
  listStoryboards(projectId: string): Storyboard[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }

    const rows = this.db
      .prepare(
        'SELECT id, project_id, script_id, episode_id, scene_id, title, prompt, plan_json, image_url, status, created_at, updated_at FROM storyboards WHERE project_id = ? ORDER BY created_at DESC'
      )
      .all(projectId) as StoryboardRow[];

    return rows.map((row) => mapStoryboard(row));
  }

  listStoryboardsByScript(projectId: string, scriptId: string): Storyboard[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }
    const script = this.db
      .prepare('SELECT id FROM scripts WHERE id = ? AND project_id = ? LIMIT 1')
      .get(scriptId, projectId);
    if (!script) {
      return null;
    }
    const rows = this.db
      .prepare(
        'SELECT id, project_id, script_id, episode_id, scene_id, title, prompt, plan_json, image_url, status, created_at, updated_at FROM storyboards WHERE project_id = ? AND script_id = ? ORDER BY rowid ASC'
      )
      .all(projectId, scriptId) as StoryboardRow[];
    return rows.map((row) => mapStoryboard(row));
  }

  replaceStoryboards(
    projectId: string,
    scriptId: string,
    items: Array<{ id: string; title: string; prompt: string; plan?: Storyboard['plan']; imageUrl?: string | null; status?: Storyboard['status'] }>
  ): Storyboard[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }

    const scriptRow = this.db
      .prepare('SELECT id, episode_id FROM scripts WHERE id = ? AND project_id = ? LIMIT 1')
      .get(scriptId, projectId) as { id: string; episode_id: string | null } | undefined;
    if (!scriptRow) {
      return null;
    }

    const timestamp = this.timestamp();
    this.db.prepare('DELETE FROM storyboards WHERE script_id = ?').run(scriptId);
    for (const item of items) {
      const status = item.status ?? (item.imageUrl ? 'generated' : 'draft');
      this.db
        .prepare(
          'INSERT INTO storyboards (id, project_id, script_id, episode_id, scene_id, title, prompt, plan_json, image_url, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          item.id,
          projectId,
          scriptId,
          scriptRow.episode_id ?? null,
          null,
          item.title,
          item.prompt,
          item.plan ? JSON.stringify(item.plan) : null,
          item.imageUrl ?? null,
          status,
          timestamp,
          timestamp
        );
    }

    return this.listStoryboardsByScript(projectId, scriptId);
  }

  getStoryboard(projectId: string, storyboardId: string): Storyboard | null {
    const row = this.db
      .prepare(
        'SELECT id, project_id, script_id, episode_id, scene_id, title, prompt, plan_json, image_url, status, created_at, updated_at FROM storyboards WHERE id = ? AND project_id = ? LIMIT 1'
      )
      .get(storyboardId, projectId) as StoryboardRow | undefined;
    return row ? mapStoryboard(row) : null;
  }

  updateStoryboard(
    projectId: string,
    storyboardId: string,
    input: { title?: string; prompt?: string; plan?: Storyboard['plan'] | null; imageUrl?: string | null; firstFrameUrl?: string | null; lastFrameUrl?: string | null; sceneId?: string | null; episodeId?: string | null }
  ): Storyboard | null {
    const current = this.getStoryboard(projectId, storyboardId);
    if (!current) {
      return null;
    }
    if (input.sceneId !== undefined && input.sceneId !== null) {
      const sceneExists = this.db
        .prepare('SELECT id FROM scenes WHERE id = ? AND project_id = ? LIMIT 1')
        .get(input.sceneId, projectId);
      if (!sceneExists) {
        return null;
      }
    }
    if (input.episodeId !== undefined && input.episodeId !== null) {
      const episodeExists = this.db
        .prepare('SELECT id FROM episodes WHERE id = ? AND project_id = ? LIMIT 1')
        .get(input.episodeId, projectId);
      if (!episodeExists) {
        return null;
      }
    }
    const title = input.title ?? current.title;
    const prompt = input.prompt ?? current.prompt;
    const plan = input.plan === undefined ? current.plan : input.plan;
    const imageUrl = input.imageUrl === undefined ? current.imageUrl : input.imageUrl;
    const firstFrameUrl = input.firstFrameUrl === undefined ? current.firstFrameUrl : input.firstFrameUrl;
    const lastFrameUrl = input.lastFrameUrl === undefined ? current.lastFrameUrl : input.lastFrameUrl;
    const sceneId = input.sceneId === undefined ? current.sceneId : input.sceneId;
    const episodeId = input.episodeId === undefined ? current.episodeId : input.episodeId;
    const status = imageUrl ? 'generated' : current.status === 'generated' && input.imageUrl === null ? 'draft' : current.status;
    this.db
      .prepare('UPDATE storyboards SET title = ?, prompt = ?, plan_json = ?, image_url = ?, first_frame_url = ?, last_frame_url = ?, scene_id = ?, episode_id = ?, status = ?, updated_at = ? WHERE id = ? AND project_id = ?')
      .run(
        title,
        prompt,
        plan ? JSON.stringify(plan) : null,
        imageUrl,
        firstFrameUrl,
        lastFrameUrl,
        sceneId,
        episodeId,
        status,
        this.timestamp(),
        storyboardId,
        projectId
      );
    return this.getStoryboard(projectId, storyboardId);
  }

  listStoryboardsByEpisode(projectId: string, episodeId: string): Storyboard[] | null {
    if (!this.projectExists(projectId)) {
      return null;
    }
    const episode = this.db
      .prepare('SELECT id FROM episodes WHERE id = ? AND project_id = ? LIMIT 1')
      .get(episodeId, projectId);
    if (!episode) {
      return null;
    }
    const rows = this.db
      .prepare(
        'SELECT id, project_id, script_id, episode_id, scene_id, title, prompt, plan_json, image_url, status, created_at, updated_at FROM storyboards WHERE project_id = ? AND episode_id = ? ORDER BY created_at ASC'
      )
      .all(projectId, episodeId) as StoryboardRow[];
    return rows.map((row) => mapStoryboard(row));
  }
}
