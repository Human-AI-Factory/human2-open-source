import { getToken, request, requestForm, requestText } from '@/api/client';
import { API_BASE_URL } from '@/config/env';
import { buildQuery } from '@/api/utils';
import type {
  EpisodeDeliveryCompareReport,
  EpisodeDeliveryCompareResult,
  EpisodeDeliveryPackage,
  EpisodeDeliveryPackageVerifyResult,
  EpisodeDeliveryVersionEntry,
  VideoMerge
} from '@/types/models';

export const approveEpisodeWorkflow = (
  projectId: string,
  episodeId: string
): Promise<{ episode: { id: string; status: 'ready' }; storyboards: number }> =>
  request(`/api/pipeline/projects/${projectId}/episodes/${episodeId}/review/approve`, {
    method: 'POST'
  });

export const approveDramaEpisodeWorkflow = (
  dramaId: string,
  episodeId: string
): Promise<{ episode: { id: string; status: 'ready' }; storyboards: number }> =>
  request(`/api/pipeline/dramas/${dramaId}/episodes/${episodeId}/review/approve`, {
    method: 'POST'
  });

export const finalizeEpisodeDelivery = (
  projectId: string,
  episodeId: string,
  payload: { actor?: string; comment?: string } = {}
): Promise<{
  episode: { id: string; status: 'published' };
  latestMergeId: string | null;
  downloadUrl: string | null;
  actor: string;
  comment: string;
}> =>
  request(`/api/pipeline/projects/${projectId}/episodes/${episodeId}/finalize`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const finalizeDramaEpisodeDelivery = (
  dramaId: string,
  episodeId: string,
  payload: { actor?: string; comment?: string } = {}
): Promise<{
  episode: { id: string; status: 'published' };
  latestMergeId: string | null;
  downloadUrl: string | null;
  actor: string;
  comment: string;
}> =>
  request(`/api/pipeline/dramas/${dramaId}/episodes/${episodeId}/finalize`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getEpisodeDeliveryDownload = (
  projectId: string,
  episodeId: string
): Promise<{ mergeId: string; url: string }> =>
  request(`/api/pipeline/projects/${projectId}/episodes/${episodeId}/download`);

export const getDramaEpisodeDeliveryDownload = (
  dramaId: string,
  episodeId: string
): Promise<{ mergeId: string; url: string }> =>
  request(`/api/pipeline/dramas/${dramaId}/episodes/${episodeId}/download`);

export const getEpisodeDeliveryVersions = (
  projectId: string,
  episodeId: string,
  input: { limit?: number } = {}
): Promise<EpisodeDeliveryVersionEntry[]> =>
  request(`/api/pipeline/projects/${projectId}/episodes/${episodeId}/delivery/versions?${buildQuery(input)}`);

export const getDramaEpisodeDeliveryVersions = (
  dramaId: string,
  episodeId: string,
  input: { limit?: number } = {}
): Promise<EpisodeDeliveryVersionEntry[]> =>
  request(`/api/pipeline/dramas/${dramaId}/episodes/${episodeId}/delivery/versions?${buildQuery(input)}`);

export const compareEpisodeDeliveryVersions = (
  projectId: string,
  episodeId: string,
  input: { currentVersionId: string; previousVersionId?: string }
): Promise<EpisodeDeliveryCompareResult> =>
  request(`/api/pipeline/projects/${projectId}/episodes/${episodeId}/delivery/compare?${buildQuery(input)}`);

export const compareDramaEpisodeDeliveryVersions = (
  dramaId: string,
  episodeId: string,
  input: { currentVersionId: string; previousVersionId?: string }
): Promise<EpisodeDeliveryCompareResult> =>
  request(`/api/pipeline/dramas/${dramaId}/episodes/${episodeId}/delivery/compare?${buildQuery(input)}`);

export const getEpisodeDeliveryCompareReport = (
  projectId: string,
  episodeId: string,
  input: { currentVersionId: string; previousVersionId?: string }
): Promise<EpisodeDeliveryCompareReport> =>
  request(`/api/pipeline/projects/${projectId}/episodes/${episodeId}/delivery/compare/report?${buildQuery({ ...input, format: 'json' })}`);

export const getDramaEpisodeDeliveryCompareReport = (
  dramaId: string,
  episodeId: string,
  input: { currentVersionId: string; previousVersionId?: string }
): Promise<EpisodeDeliveryCompareReport> =>
  request(`/api/pipeline/dramas/${dramaId}/episodes/${episodeId}/delivery/compare/report?${buildQuery({ ...input, format: 'json' })}`);

export const getEpisodeDeliveryCompareReportCsv = (
  projectId: string,
  episodeId: string,
  input: { currentVersionId: string; previousVersionId?: string }
): Promise<string> =>
  requestText(`/api/pipeline/projects/${projectId}/episodes/${episodeId}/delivery/compare/report?${buildQuery({ ...input, format: 'csv' })}`);

export const getDramaEpisodeDeliveryCompareReportCsv = (
  dramaId: string,
  episodeId: string,
  input: { currentVersionId: string; previousVersionId?: string }
): Promise<string> =>
  requestText(`/api/pipeline/dramas/${dramaId}/episodes/${episodeId}/delivery/compare/report?${buildQuery({ ...input, format: 'csv' })}`);

export const getEpisodeDeliveryPackage = (
  projectId: string,
  episodeId: string,
  input: { versionId?: string } = {}
): Promise<EpisodeDeliveryPackage> =>
  request(`/api/pipeline/projects/${projectId}/episodes/${episodeId}/delivery/package?${buildQuery(input)}`);

export const getDramaEpisodeDeliveryPackage = (
  dramaId: string,
  episodeId: string,
  input: { versionId?: string } = {}
): Promise<EpisodeDeliveryPackage> =>
  request(`/api/pipeline/dramas/${dramaId}/episodes/${episodeId}/delivery/package?${buildQuery(input)}`);

export const downloadEpisodeDeliveryPackageZip = async (
  projectId: string,
  episodeId: string,
  input: { versionId?: string; includeMedia?: boolean } = {}
): Promise<{ blob: Blob; filename: string }> => {
  const token = getToken();
  const query = buildQuery({
    versionId: input.versionId,
    includeMedia: input.includeMedia === true ? 'true' : undefined
  });
  const response = await fetch(
    `${API_BASE_URL}/pipeline/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/delivery/package.zip?${query}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );
  if (!response.ok) {
    throw new Error('下载交付 ZIP 失败');
  }
  const contentDisposition = response.headers.get('content-disposition') || '';
  const match = contentDisposition.match(/filename=\"([^\"]+)\"/i);
  const filename = match?.[1] || `episode-delivery-package-${Date.now()}.zip`;
  return { blob: await response.blob(), filename };
};

export const downloadDramaEpisodeDeliveryPackageZip = async (
  dramaId: string,
  episodeId: string,
  input: { versionId?: string; includeMedia?: boolean } = {}
): Promise<{ blob: Blob; filename: string }> => {
  const token = getToken();
  const query = buildQuery({
    versionId: input.versionId,
    includeMedia: input.includeMedia === true ? 'true' : undefined
  });
  const response = await fetch(
    `${API_BASE_URL}/pipeline/dramas/${encodeURIComponent(dramaId)}/episodes/${encodeURIComponent(episodeId)}/delivery/package.zip?${query}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
  );
  if (!response.ok) {
    throw new Error('下载交付 ZIP 失败');
  }
  const contentDisposition = response.headers.get('content-disposition') || '';
  const match = contentDisposition.match(/filename=\"([^\"]+)\"/i);
  const filename = match?.[1] || `episode-delivery-package-${Date.now()}.zip`;
  return { blob: await response.blob(), filename };
};

export const verifyEpisodeDeliveryPackageZip = (
  projectId: string,
  episodeId: string,
  payload: { file: File }
): Promise<EpisodeDeliveryPackageVerifyResult> => {
  const form = new FormData();
  form.append('file', payload.file);
  return requestForm(`/api/pipeline/projects/${projectId}/episodes/${episodeId}/delivery/package.zip/verify`, form, {
    method: 'POST'
  });
};

export const verifyDramaEpisodeDeliveryPackageZip = (
  dramaId: string,
  episodeId: string,
  payload: { file: File }
): Promise<EpisodeDeliveryPackageVerifyResult> => {
  const form = new FormData();
  form.append('file', payload.file);
  return requestForm(`/api/pipeline/dramas/${dramaId}/episodes/${episodeId}/delivery/package.zip/verify`, form, {
    method: 'POST'
  });
};

export const getVideoMerges = (projectId: string): Promise<VideoMerge[]> =>
  request(`/api/pipeline/projects/${projectId}/video-merges`);

export const getDramaVideoMerges = (dramaId: string): Promise<VideoMerge[]> =>
  request(`/api/pipeline/dramas/${dramaId}/video-merges`);

const fetchProtectedFile = async (url: string, fallbackFilename: string): Promise<{ blob: Blob; filename: string }> => {
  const token = getToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  if (!response.ok) {
    throw new Error('获取成片文件失败');
  }
  const contentDisposition = response.headers.get('content-disposition') || '';
  const match = contentDisposition.match(/filename=\"([^\"]+)\"/i);
  const filename = match?.[1] || fallbackFilename;
  return {
    blob: await response.blob(),
    filename
  };
};

export const downloadVideoMergeFile = (projectId: string, mergeId: string): Promise<{ blob: Blob; filename: string }> =>
  fetchProtectedFile(
    `${API_BASE_URL}/pipeline/projects/${encodeURIComponent(projectId)}/video-merges/${encodeURIComponent(mergeId)}/file`,
    `video-merge-${mergeId}.mp4`
  );

export const downloadDramaVideoMergeFile = (dramaId: string, mergeId: string): Promise<{ blob: Blob; filename: string }> =>
  fetchProtectedFile(
    `${API_BASE_URL}/pipeline/dramas/${encodeURIComponent(dramaId)}/video-merges/${encodeURIComponent(mergeId)}/file`,
    `video-merge-${mergeId}.mp4`
  );
