import { v4 as uuid } from 'uuid';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import type { VideoMerge } from '../../core/types.js';
import { type SqliteStore } from '../../db/sqlite.js';

const EPISODE_DELIVERY_VERSION_KEY_PREFIX = 'episode_delivery_versions_v1:';
const EPISODE_DELIVERY_VERSION_MAX = 200;

export type EpisodeDeliveryVersionEntry = {
  id: string;
  createdAt: string;
  projectId: string;
  episodeId: string;
  mergeId: string | null;
  downloadUrl: string | null;
  actor: string;
  comment: string;
  status: 'published';
};

export class EpisodeDeliveryService {
  constructor(
    private readonly store: SqliteStore,
    private readonly uploadOutputDir: string,
    private readonly signSecret: string
  ) {}

  finalizeEpisodeDelivery(
    projectId: string,
    episodeId: string,
    input: { actor?: string; comment?: string } = {}
  ): {
    episode: { id: string; status: 'published' };
    latestMergeId: string | null;
    downloadUrl: string | null;
    actor: string;
    comment: string;
  } | null {
    const episode = this.store.updateEpisode(projectId, episodeId, { status: 'published' });
    if (!episode) {
      return null;
    }
    const actor = input.actor?.trim() || 'operator';
    const comment = input.comment?.trim() || '';
    const latestMerge = this.pickLatestEpisodeVideoMerge(projectId, episodeId);
    this.appendEpisodeDeliveryVersion(projectId, episodeId, {
      mergeId: latestMerge?.id ?? null,
      downloadUrl: latestMerge?.resultUrl ?? null,
      actor,
      comment,
      status: 'published',
    });
    return {
      episode: { id: episode.id, status: 'published' },
      latestMergeId: latestMerge?.id ?? null,
      downloadUrl: latestMerge?.resultUrl ?? null,
      actor,
      comment,
    };
  }

  getEpisodeDeliveryDownload(projectId: string, episodeId: string): { mergeId: string; url: string } | null {
    const episode = this.store.getEpisodeById(projectId, episodeId);
    if (!episode) {
      return null;
    }
    const latestMerge = this.pickLatestEpisodeVideoMerge(projectId, episodeId);
    if (!latestMerge?.resultUrl) {
      return null;
    }
    return {
      mergeId: latestMerge.id,
      url: latestMerge.resultUrl,
    };
  }

  listEpisodeDeliveryVersions(projectId: string, episodeId: string, limit = 50): EpisodeDeliveryVersionEntry[] | null {
    const episode = this.store.getEpisodeById(projectId, episodeId);
    if (!episode) {
      return null;
    }
    return this.readEpisodeDeliveryVersions(projectId, episodeId).slice(0, Math.max(1, Math.min(500, Math.floor(limit))));
  }

  compareEpisodeDeliveryVersions(
    projectId: string,
    episodeId: string,
    currentVersionId: string,
    previousVersionId?: string
  ):
    | {
        current: EpisodeDeliveryVersionEntry;
        previous: EpisodeDeliveryVersionEntry;
        changed: {
          mergeId: boolean;
          downloadUrl: boolean;
          actor: boolean;
          comment: boolean;
        };
        metrics: {
          currentClipCount: number;
          previousClipCount: number;
          currentDurationSec: number;
          previousDurationSec: number;
        };
      }
    | null {
    const episode = this.store.getEpisodeById(projectId, episodeId);
    if (!episode) {
      return null;
    }
    const versions = this.readEpisodeDeliveryVersions(projectId, episodeId);
    const current = versions.find((item) => item.id === currentVersionId);
    if (!current) {
      return null;
    }
    const previous =
      (previousVersionId ? versions.find((item) => item.id === previousVersionId) : null) ??
      versions.find((item) => item.id !== current.id);
    if (!previous) {
      return null;
    }
    const currentMerge = current.mergeId ? this.store.getVideoMerge(projectId, current.mergeId) : null;
    const previousMerge = previous.mergeId ? this.store.getVideoMerge(projectId, previous.mergeId) : null;
    return {
      current,
      previous,
      changed: {
        mergeId: current.mergeId !== previous.mergeId,
        downloadUrl: current.downloadUrl !== previous.downloadUrl,
        actor: current.actor !== previous.actor,
        comment: current.comment !== previous.comment,
      },
      metrics: {
        currentClipCount: currentMerge?.clips.length ?? 0,
        previousClipCount: previousMerge?.clips.length ?? 0,
        currentDurationSec: this.estimateMergeDurationSec(currentMerge),
        previousDurationSec: this.estimateMergeDurationSec(previousMerge),
      },
    };
  }

  buildEpisodeDeliveryCompareReport(
    projectId: string,
    episodeId: string,
    currentVersionId: string,
    previousVersionId?: string
  ):
    | {
        exportedAt: string;
        projectId: string;
        episodeId: string;
        compare: NonNullable<ReturnType<EpisodeDeliveryService['compareEpisodeDeliveryVersions']>>;
      }
    | null {
    const compare = this.compareEpisodeDeliveryVersions(projectId, episodeId, currentVersionId, previousVersionId);
    if (!compare) {
      return null;
    }
    return {
      exportedAt: new Date().toISOString(),
      projectId,
      episodeId,
      compare,
    };
  }

  buildEpisodeDeliveryCompareReportCsv(
    projectId: string,
    episodeId: string,
    currentVersionId: string,
    previousVersionId?: string
  ): string | null {
    const report = this.buildEpisodeDeliveryCompareReport(projectId, episodeId, currentVersionId, previousVersionId);
    if (!report) {
      return null;
    }
    const compare = report.compare;
    const rows = [
      ['field', 'current', 'previous', 'changed'],
      ['versionId', compare.current.id, compare.previous.id, compare.current.id !== compare.previous.id ? 'yes' : 'no'],
      ['mergeId', compare.current.mergeId ?? '', compare.previous.mergeId ?? '', compare.changed.mergeId ? 'yes' : 'no'],
      ['downloadUrl', compare.current.downloadUrl ?? '', compare.previous.downloadUrl ?? '', compare.changed.downloadUrl ? 'yes' : 'no'],
      ['actor', compare.current.actor, compare.previous.actor, compare.changed.actor ? 'yes' : 'no'],
      ['comment', compare.current.comment, compare.previous.comment, compare.changed.comment ? 'yes' : 'no'],
      ['clipCount', String(compare.metrics.currentClipCount), String(compare.metrics.previousClipCount), compare.metrics.currentClipCount !== compare.metrics.previousClipCount ? 'yes' : 'no'],
      ['durationSec', String(compare.metrics.currentDurationSec), String(compare.metrics.previousDurationSec), compare.metrics.currentDurationSec !== compare.metrics.previousDurationSec ? 'yes' : 'no'],
    ];
    return rows.map((row) => row.map((cell) => this.escapeCsvCell(cell)).join(',')).join('\n');
  }

  buildEpisodeDeliveryPackage(
    projectId: string,
    episodeId: string,
    versionId?: string
  ):
    | {
        manifestVersion: string;
        exportedAt: string;
        project: { id: string; name: string; description: string };
        episode: { id: string; title: string; orderIndex: number; status: 'draft' | 'ready' | 'published' };
        version: EpisodeDeliveryVersionEntry;
        merge: {
          id: string;
          title: string;
          status: string;
          resultUrl: string | null;
          outputPath: string | null;
          params: VideoMerge['params'];
          clips: VideoMerge['clips'];
          updatedAt: string;
          createdAt: string;
        } | null;
        assetsSnapshot: Array<{
          id: string;
          storyboardId: string;
          name: string;
          type: 'character' | 'scene' | 'prop';
          prompt: string;
          imageUrl: string | null;
        }>;
        reproducibility: {
          paramsHash: string;
          clipsHash: string;
          assetsHash: string;
          contentHash: string;
        };
        artifact: {
          exists: boolean;
          path: string | null;
          sizeBytes: number | null;
          updatedAt: string | null;
          resultUrl: string | null;
        };
        lineage: {
          versionCount: number;
          previousVersionId: string | null;
          compareChanged: { mergeId: boolean; downloadUrl: boolean; actor: boolean; comment: boolean } | null;
        };
      }
    | null {
    const project = this.store.getProjectById(projectId);
    const episode = this.store.getEpisodeById(projectId, episodeId);
    if (!project || !episode) {
      return null;
    }
    const versions = this.readEpisodeDeliveryVersions(projectId, episodeId);
    const version = (versionId ? versions.find((item) => item.id === versionId) : versions[0]) ?? null;
    if (!version) {
      return null;
    }
    const merge = version.mergeId ? this.store.getVideoMerge(projectId, version.mergeId) : null;
    const storyboards = (this.store.listStoryboards(projectId) ?? []).filter((item) => item.episodeId === episodeId);
    const storyboardIdSet = new Set(storyboards.map((item) => item.id));
    const assets = (this.store.listAssets(projectId) ?? []).filter((item) => storyboardIdSet.has(item.storyboardId));
    const versionsForEpisode = this.readEpisodeDeliveryVersions(projectId, episodeId);
    const previousVersion = versionsForEpisode.find((item) => item.id !== version.id) ?? null;
    const compare = previousVersion ? this.compareEpisodeDeliveryVersions(projectId, episodeId, version.id, previousVersion.id) : null;
    const assetsSnapshot = assets.map((item) => ({
      id: item.id,
      storyboardId: item.storyboardId,
      name: item.name,
      type: item.type,
      prompt: item.prompt,
      imageUrl: item.imageUrl,
    }));
    const paramsHash = this.hashDeterministicJson(merge?.params ?? {});
    const clipsHash = this.hashDeterministicJson(merge?.clips ?? []);
    const assetsHash = this.hashDeterministicJson(assetsSnapshot);
    const contentHash = this.hashDeterministicJson({
      projectId,
      episodeId,
      versionId: version.id,
      mergeId: merge?.id ?? null,
      paramsHash,
      clipsHash,
      assetsHash,
    });
    const artifactInfo = this.readDeliveryArtifactInfo(merge);
    return {
      manifestVersion: '2.0',
      exportedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
      episode: {
        id: episode.id,
        title: episode.title,
        orderIndex: episode.orderIndex,
        status: episode.status,
      },
      version,
      merge: merge
        ? {
            id: merge.id,
            title: merge.title,
            status: merge.status,
            resultUrl: merge.resultUrl,
            outputPath: merge.outputPath,
            params: merge.params,
            clips: merge.clips,
            updatedAt: merge.updatedAt,
            createdAt: merge.createdAt,
          }
        : null,
      assetsSnapshot,
      reproducibility: {
        paramsHash,
        clipsHash,
        assetsHash,
        contentHash,
      },
      artifact: artifactInfo,
      lineage: {
        versionCount: versionsForEpisode.length,
        previousVersionId: previousVersion?.id ?? null,
        compareChanged: compare?.changed ?? null,
      },
    };
  }

  async buildEpisodeDeliveryPackageArchive(
    projectId: string,
    episodeId: string,
    input: { versionId?: string; includeMedia?: boolean } = {}
  ): Promise<{ path: string; fileName: string } | null> {
    const pkg = this.buildEpisodeDeliveryPackage(projectId, episodeId, input.versionId);
    if (!pkg) {
      return null;
    }
    const workDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'human2-delivery-'));
    const safeProject = this.toSafeFileName(projectId);
    const safeEpisode = this.toSafeFileName(episodeId);
    const safeVersion = this.toSafeFileName(pkg.version.id);
    const fileName = `episode-delivery-${safeProject}-${safeEpisode}-${safeVersion}.zip`;
    const outputZipPath = path.join(os.tmpdir(), fileName);
    try {
      const manifestPath = path.join(workDir, 'manifest.json');
      const checksums: Array<{ path: string; sha256: string }> = [];
      const compareReport =
        pkg.lineage?.previousVersionId && pkg.version.id
          ? this.buildEpisodeDeliveryCompareReport(projectId, episodeId, pkg.version.id, pkg.lineage.previousVersionId)
          : null;
      const readmeLines = [
        'Toonflow Next Lite Delivery Package',
        `project: ${pkg.project.id}`,
        `episode: ${pkg.episode.id}`,
        `version: ${pkg.version.id}`,
        `exportedAt: ${pkg.exportedAt}`,
        `manifestVersion: ${pkg.manifestVersion ?? '1.0'}`,
        '',
        `reproducibility.contentHash: ${pkg.reproducibility?.contentHash ?? '-'}`,
        `artifact.exists: ${pkg.artifact?.exists ? 'yes' : 'no'}`,
      ];
      await fsPromises.writeFile(manifestPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
      checksums.push({ path: 'manifest.json', sha256: await this.hashFileSha256(manifestPath) });
      if (compareReport) {
        const comparePath = path.join(workDir, 'compare-report.json');
        await fsPromises.writeFile(comparePath, `${JSON.stringify(compareReport, null, 2)}\n`, 'utf8');
        checksums.push({ path: 'compare-report.json', sha256: await this.hashFileSha256(comparePath) });
      }
      const readmePath = path.join(workDir, 'README.txt');
      await fsPromises.writeFile(readmePath, `${readmeLines.join('\n')}\n`, 'utf8');
      checksums.push({ path: 'README.txt', sha256: await this.hashFileSha256(readmePath) });

      const assetsDir = path.join(workDir, 'assets');
      await fsPromises.mkdir(assetsDir, { recursive: true });
      const copiedAssets: Array<{ id: string; sourcePath: string; packagePath: string }> = [];
      for (const asset of pkg.assetsSnapshot) {
        const resolved = this.resolveAssetSnapshotLocalPath(projectId, asset.imageUrl);
        if (!resolved) {
          continue;
        }
        const ext = path.extname(resolved) || '.img';
        const assetFileName = `${this.toSafeFileName(asset.id)}${ext}`;
        const targetPath = path.join(assetsDir, assetFileName);
        await fsPromises.copyFile(resolved, targetPath);
        copiedAssets.push({ id: asset.id, sourcePath: resolved, packagePath: `assets/${assetFileName}` });
        checksums.push({ path: `assets/${assetFileName}`, sha256: await this.hashFileSha256(targetPath) });
      }
      if (copiedAssets.length > 0) {
        const indexPath = path.join(assetsDir, 'index.json');
        await fsPromises.writeFile(indexPath, `${JSON.stringify(copiedAssets, null, 2)}\n`, 'utf8');
        checksums.push({ path: 'assets/index.json', sha256: await this.hashFileSha256(indexPath) });
      }

      if (input.includeMedia && pkg.artifact?.path && pkg.artifact.exists) {
        const mediaDir = path.join(workDir, 'media');
        await fsPromises.mkdir(mediaDir, { recursive: true });
        const mediaName = path.basename(pkg.artifact.path);
        const mediaPath = path.join(mediaDir, mediaName);
        await fsPromises.copyFile(pkg.artifact.path, mediaPath);
        checksums.push({ path: `media/${mediaName}`, sha256: await this.hashFileSha256(mediaPath) });
      }
      const checksumsPath = path.join(workDir, 'checksums.txt');
      const checksumsText = checksums
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((item) => `${item.sha256}  ${item.path}`)
        .join('\n');
      await fsPromises.writeFile(checksumsPath, `${checksumsText}\n`, 'utf8');
      const checksumsSignature = this.signChecksums(checksumsText);
      const checksumsSigPath = path.join(workDir, 'checksums.sig');
      await fsPromises.writeFile(
        checksumsSigPath,
        JSON.stringify(
          {
            algorithm: 'HMAC-SHA256',
            encoding: 'hex',
            signature: checksumsSignature,
          },
          null,
          2
        ),
        'utf8'
      );
      await this.zipDirectory(workDir, outputZipPath);
      return { path: outputZipPath, fileName };
    } finally {
      await fsPromises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async verifyDeliveryPackageArchive(
    zipFile: Buffer
  ): Promise<{
    ok: boolean;
    signatureValid: boolean;
    checksumsValid: boolean;
    checkedFiles: number;
    missingFiles: string[];
    mismatchedFiles: Array<{ path: string; expected: string; actual: string | null }>;
    message: string;
  }> {
    const workDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'human2-delivery-verify-'));
    const zipPath = path.join(workDir, 'input.zip');
    const extractDir = path.join(workDir, 'extracted');
    try {
      await fsPromises.writeFile(zipPath, zipFile);
      await fsPromises.mkdir(extractDir, { recursive: true });
      await this.unzipToDir(zipPath, extractDir);
      const checksumsPath = path.join(extractDir, 'checksums.txt');
      const checksumsSigPath = path.join(extractDir, 'checksums.sig');
      if (!fs.existsSync(checksumsPath) || !fs.existsSync(checksumsSigPath)) {
        return {
          ok: false,
          signatureValid: false,
          checksumsValid: false,
          checkedFiles: 0,
          missingFiles: [],
          mismatchedFiles: [],
          message: 'missing checksums.txt or checksums.sig',
        };
      }
      const checksumsText = await fsPromises.readFile(checksumsPath, 'utf8');
      const sigRaw = await fsPromises.readFile(checksumsSigPath, 'utf8');
      let signatureValid = false;
      try {
        const sig = JSON.parse(sigRaw) as { signature?: string };
        if (typeof sig.signature === 'string' && sig.signature.trim()) {
          const expected = this.signChecksums(checksumsText.trimEnd());
          signatureValid = expected === sig.signature.trim();
        }
      } catch {
        signatureValid = false;
      }
      const lines = checksumsText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const missingFiles: string[] = [];
      const mismatchedFiles: Array<{ path: string; expected: string; actual: string | null }> = [];
      for (const line of lines) {
        const matched = line.match(/^([a-fA-F0-9]{64})\s{2}(.+)$/);
        if (!matched) {
          continue;
        }
        const expected = matched[1].toLowerCase();
        const relPath = matched[2];
        const target = path.resolve(extractDir, relPath);
        if (!this.isPathWithinBase(target, extractDir) || !fs.existsSync(target)) {
          missingFiles.push(relPath);
          continue;
        }
        const actual = (await this.hashFileSha256(target)).toLowerCase();
        if (actual !== expected) {
          mismatchedFiles.push({ path: relPath, expected, actual });
        }
      }
      const checksumsValid = missingFiles.length === 0 && mismatchedFiles.length === 0;
      const ok = signatureValid && checksumsValid;
      return {
        ok,
        signatureValid,
        checksumsValid,
        checkedFiles: lines.length,
        missingFiles,
        mismatchedFiles,
        message: ok ? 'verified' : signatureValid ? 'checksum mismatch' : 'invalid signature',
      };
    } finally {
      await fsPromises.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private getEpisodeDeliveryVersionKey(projectId: string, episodeId: string): string {
    return `${EPISODE_DELIVERY_VERSION_KEY_PREFIX}${projectId}:${episodeId}`;
  }

  private readEpisodeDeliveryVersions(projectId: string, episodeId: string): EpisodeDeliveryVersionEntry[] {
    const raw = this.store.getSystemSetting(this.getEpisodeDeliveryVersionKey(projectId, episodeId));
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => this.normalizeEpisodeDeliveryVersionEntry(item))
        .filter((item): item is EpisodeDeliveryVersionEntry => item !== null)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } catch {
      return [];
    }
  }

  private appendEpisodeDeliveryVersion(
    projectId: string,
    episodeId: string,
    input: Omit<EpisodeDeliveryVersionEntry, 'id' | 'createdAt' | 'projectId' | 'episodeId'>
  ): EpisodeDeliveryVersionEntry {
    const item: EpisodeDeliveryVersionEntry = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      projectId,
      episodeId,
      ...input,
    };
    const next = [item, ...this.readEpisodeDeliveryVersions(projectId, episodeId)].slice(0, EPISODE_DELIVERY_VERSION_MAX);
    this.store.setSystemSetting(this.getEpisodeDeliveryVersionKey(projectId, episodeId), JSON.stringify(next));
    return item;
  }

  private normalizeEpisodeDeliveryVersionEntry(input: unknown): EpisodeDeliveryVersionEntry | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }
    const row = input as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      typeof row.createdAt !== 'string' ||
      typeof row.projectId !== 'string' ||
      typeof row.episodeId !== 'string' ||
      (row.mergeId !== null && typeof row.mergeId !== 'string') ||
      (row.downloadUrl !== null && typeof row.downloadUrl !== 'string') ||
      typeof row.actor !== 'string' ||
      typeof row.comment !== 'string'
    ) {
      return null;
    }
    return {
      id: row.id,
      createdAt: row.createdAt,
      projectId: row.projectId,
      episodeId: row.episodeId,
      mergeId: row.mergeId,
      downloadUrl: row.downloadUrl,
      actor: row.actor,
      comment: row.comment,
      status: 'published',
    };
  }

  private pickLatestEpisodeVideoMerge(projectId: string, episodeId: string): VideoMerge | null {
    const storyboards = this.store.listStoryboardsByEpisode(projectId, episodeId);
    if (!storyboards || storyboards.length === 0) {
      return null;
    }
    const storyboardIdSet = new Set(storyboards.map((item) => item.id));
    const merges = this.store.listVideoMerges(projectId) ?? [];
    const candidates = merges
      .filter((merge) => merge.status === 'done' && typeof merge.resultUrl === 'string' && merge.resultUrl.length > 0)
      .filter((merge) => merge.clips.some((clip) => storyboardIdSet.has(clip.storyboardId)))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return candidates[0] ?? null;
  }

  private estimateMergeDurationSec(merge: VideoMerge | null): number {
    if (!merge) {
      return 0;
    }
    return merge.clips.reduce((sum, clip) => {
      if (typeof clip.durationSec === 'number' && Number.isFinite(clip.durationSec) && clip.durationSec > 0) {
        return sum + clip.durationSec;
      }
      const startMs = typeof clip.startMs === 'number' ? clip.startMs : 0;
      const endMs = typeof clip.endMs === 'number' ? clip.endMs : startMs;
      if (endMs > startMs) {
        return sum + (endMs - startMs) / 1000;
      }
      return sum;
    }, 0);
  }

  private escapeCsvCell(value: string): string {
    if (/[",\n]/.test(value)) {
      return `"${value.replaceAll('"', '""')}"`;
    }
    return value;
  }

  private hashDeterministicJson(value: unknown): string {
    const normalized = this.sortJson(value);
    const text = JSON.stringify(normalized);
    return createHash('sha256').update(text).digest('hex');
  }

  private sortJson(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortJson(item));
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    const row = value as Record<string, unknown>;
    const sortedKeys = Object.keys(row).sort((a, b) => a.localeCompare(b));
    const next: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      next[key] = this.sortJson(row[key]);
    }
    return next;
  }

  private readDeliveryArtifactInfo(merge: VideoMerge | null): {
    exists: boolean;
    path: string | null;
    sizeBytes: number | null;
    updatedAt: string | null;
    resultUrl: string | null;
  } {
    if (!merge?.outputPath) {
      return {
        exists: false,
        path: merge?.outputPath ?? null,
        sizeBytes: null,
        updatedAt: null,
        resultUrl: merge?.resultUrl ?? null,
      };
    }
    try {
      const stat = fs.statSync(merge.outputPath);
      return {
        exists: true,
        path: merge.outputPath,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
        resultUrl: merge.resultUrl ?? null,
      };
    } catch {
      return {
        exists: false,
        path: merge.outputPath,
        sizeBytes: null,
        updatedAt: null,
        resultUrl: merge.resultUrl ?? null,
      };
    }
  }

  private async zipDirectory(sourceDir: string, outputPath: string): Promise<void> {
    await fsPromises.rm(outputPath, { force: true }).catch(() => undefined);
    await new Promise<void>((resolve, reject) => {
      const child = spawn('/usr/bin/zip', ['-rq', outputPath, '.'], { cwd: sourceDir });
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', (err) => {
        reject(err);
      });
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `zip exited with code ${code ?? 'unknown'}`));
      });
    });
  }

  private async unzipToDir(zipPath: string, outputDir: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('/usr/bin/unzip', ['-oq', zipPath, '-d', outputDir]);
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', (err) => {
        reject(err);
      });
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `unzip exited with code ${code ?? 'unknown'}`));
      });
    });
  }

  private toSafeFileName(input: string): string {
    return input.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
  }

  private async hashFileSha256(filePath: string): Promise<string> {
    const data = await fsPromises.readFile(filePath);
    return createHash('sha256').update(data).digest('hex');
  }

  private resolveAssetSnapshotLocalPath(projectId: string, imageUrl: string | null): string | null {
    if (!imageUrl) {
      return null;
    }
    const prefix = `/api/pipeline/projects/${encodeURIComponent(projectId)}/uploads/files/`;
    if (!imageUrl.startsWith(prefix)) {
      return null;
    }
    const fileName = decodeURIComponent(imageUrl.slice(prefix.length));
    if (!fileName || fileName.includes('/') || fileName.includes('\\')) {
      return null;
    }
    const resolved = path.resolve(this.uploadOutputDir, fileName);
    if (!this.isPathWithinBase(resolved, this.uploadOutputDir)) {
      return null;
    }
    if (!fs.existsSync(resolved)) {
      return null;
    }
    return resolved;
  }

  private signChecksums(text: string): string {
    return createHmac('sha256', this.signSecret).update(text, 'utf8').digest('hex');
  }

  private isPathWithinBase(targetPath: string, basePath: string): boolean {
    const relative = path.relative(path.resolve(basePath), path.resolve(targetPath));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }
}
