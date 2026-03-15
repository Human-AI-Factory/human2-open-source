import type { TimelinePlan, TimelineTrack, VideoMergeClip } from '../../core/types.js';
import { mapTimelinePlan } from '../sqlite/row-mappers.js';
import type { TimelinePlanRow } from '../sqlite/row-types.js';
import { BaseRepository } from './base.repository.js';

export class TimelineRepository extends BaseRepository {
  upsertTimelinePlan(input: {
    id: string;
    projectId: string;
    episodeId: string | null;
    title: string;
    tracks?: TimelineTrack[];
    clips: VideoMergeClip[];
  }): TimelinePlan | null {
    if (!this.projectExists(input.projectId)) {
      return null;
    }
    if (input.episodeId) {
      const episode = this.db
        .prepare('SELECT id FROM episodes WHERE id = ? AND project_id = ? LIMIT 1')
        .get(input.episodeId, input.projectId);
      if (!episode) {
        return null;
      }
    }
    const episodeKey = input.episodeId ?? '';
    const current = this.db
      .prepare(
        'SELECT id, project_id, episode_id, title, tracks, clips, created_at, updated_at FROM timeline_plans WHERE project_id = ? AND episode_id = ? LIMIT 1'
      )
      .get(input.projectId, episodeKey) as TimelinePlanRow | undefined;
    const timestamp = this.timestamp();
    const normalizedTracks = Array.isArray(input.tracks) ? input.tracks : [];
    if (!current) {
      this.db
        .prepare(
          'INSERT INTO timeline_plans (id, project_id, episode_id, title, tracks, clips, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          input.id,
          input.projectId,
          episodeKey,
          input.title,
          JSON.stringify(normalizedTracks),
          JSON.stringify(input.clips ?? []),
          timestamp,
          timestamp
        );
    } else {
      this.db
        .prepare('UPDATE timeline_plans SET title = ?, tracks = ?, clips = ?, updated_at = ? WHERE project_id = ? AND episode_id = ?')
        .run(input.title, JSON.stringify(normalizedTracks), JSON.stringify(input.clips ?? []), timestamp, input.projectId, episodeKey);
    }
    return this.getTimelinePlan(input.projectId, input.episodeId ?? null);
  }

  getTimelinePlan(projectId: string, episodeId: string | null): TimelinePlan | null {
    if (!this.projectExists(projectId)) {
      return null;
    }
    const row = this.db
      .prepare(
        'SELECT id, project_id, episode_id, title, tracks, clips, created_at, updated_at FROM timeline_plans WHERE project_id = ? AND episode_id = ? LIMIT 1'
      )
      .get(projectId, episodeId ?? '') as TimelinePlanRow | undefined;
    return row ? mapTimelinePlan(row) : null;
  }
}
