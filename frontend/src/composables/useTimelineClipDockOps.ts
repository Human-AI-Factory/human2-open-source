import { ref, type ComputedRef, type Ref } from 'vue';
import type { Storyboard, TimelineClip } from '@/types/models';

type EditableTimelineClip = TimelineClip & {
  transition: NonNullable<TimelineClip['transition']>;
  keyframe: NonNullable<TimelineClip['keyframe']>;
};

type DesktopLocalMediaApi = {
  enqueueLocalMediaIngest: (paths: string[], source: string) => Promise<{ count: number; id: string } | null | undefined>;
};

type UseTimelineClipDockOpsOptions = {
  clips: Ref<TimelineClip[]>;
  storyboards: Ref<Storyboard[]>;
  selectedClip: ComputedRef<EditableTimelineClip | null>;
  selectedClipIndex: Ref<number>;
  selectedClipIndices: Ref<number[]>;
  latestDoneVideoTaskByStoryboardId: Ref<Record<string, { taskId: string; resultUrl: string }>>;
  videoClipSpans: ComputedRef<Array<{ startSec: number; endSec: number }>>;
  timelineTotalDurationSec: ComputedRef<number>;
  quickCommandFeedback: Ref<string>;
  error: Ref<string>;
  desktopIngestStatus: Ref<string>;
  transientObjectUrls: Ref<string[]>;
  desktopLocalMedia: DesktopLocalMediaApi;
  getBatchPanelTargetIndices: () => number[];
  checkpointTimelineEdit: (action: string, detail?: string) => void;
  syncVideoClipTimeline: () => void;
  selectClip: (idx: number) => void;
  clampNumber: (value: number, min: number, max: number) => number;
};

export const useTimelineClipDockOps = (options: UseTimelineClipDockOpsOptions) => {
  const dragSourceIndex = ref<number | null>(null);
  const dragTargetIndex = ref<number | null>(null);
  const timelineBarDragSourceIndex = ref<number | null>(null);
  const timelineBarDragTargetIndex = ref<number | null>(null);
  const dockDragStoryboardId = ref('');
  const externalFileDragActive = ref(false);
  const dockDropIndicator = ref<{ active: boolean; leftPx: number }>({ active: false, leftPx: 0 });

  const isVideoFile = (file: File): boolean => {
    if (file.type && file.type.startsWith('video/')) {
      return true;
    }
    return /\.(mp4|mov|m4v|webm|mkv|avi|wmv)$/i.test(file.name || '');
  };

  const resolveExternalFileSourceUrl = (file: File): string => {
    const maybePath = (file as File & { path?: string }).path;
    if (typeof maybePath === 'string' && maybePath.trim()) {
      return `file://${maybePath}`;
    }
    const objectUrl = URL.createObjectURL(file);
    options.transientObjectUrls.value.push(objectUrl);
    return objectUrl;
  };

  const createClipFromExternalVideoFile = (file: File): TimelineClip => ({
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    storyboardId: `local:${file.name || 'video'}`,
    sourceUrl: resolveExternalFileSourceUrl(file),
    durationSec: 5,
    transition: {
      type: options.clips.value.length === 0 ? 'cut' : 'fade',
      durationSec: options.clips.value.length === 0 ? 0.05 : 0.6,
      easing: 'easeInOut',
      direction: 'left'
    },
    keyframe: { startScale: 1, endScale: 1, startX: 0, startY: 0, endX: 0, endY: 0, rotationDeg: 0 }
  });

  const enqueueDesktopIngestForDroppedFiles = async (paths: string[]): Promise<void> => {
    const normalized = paths.map((item) => item.trim()).filter(Boolean);
    if (normalized.length === 0) {
      return;
    }
    try {
      const queued = await options.desktopLocalMedia.enqueueLocalMediaIngest(normalized, 'timeline-drop');
      if (!queued) {
        return;
      }
      options.desktopIngestStatus.value = `已同步加入本地队列：${queued.count} 个文件（task #${queued.id}）`;
    } catch (ingestError) {
      const message = ingestError instanceof Error ? ingestError.message : 'enqueue failed';
      options.desktopIngestStatus.value = `本地队列入队失败：${message}`;
    }
  };

  const createClipFromStoryboard = (storyboardId: string): TimelineClip => {
    const latest = options.latestDoneVideoTaskByStoryboardId.value[storyboardId];
    return {
      storyboardId,
      videoTaskId: latest?.taskId,
      sourceUrl: latest?.resultUrl,
      durationSec: 5,
      transition: {
        type: options.clips.value.length === 0 ? 'cut' : 'fade',
        durationSec: options.clips.value.length === 0 ? 0.05 : 0.6,
        easing: 'easeInOut',
        direction: 'left'
      },
      keyframe: { startScale: 1, endScale: 1, startX: 0, startY: 0, endX: 0, endY: 0, rotationDeg: 0 }
    };
  };

  const insertClipAt = (clip: TimelineClip, targetIndex: number): void => {
    const safeIndex = Math.max(0, Math.min(targetIndex, options.clips.value.length));
    const next = [...options.clips.value];
    next.splice(safeIndex, 0, clip);
    options.clips.value = next;
    options.syncVideoClipTimeline();
    options.selectClip(safeIndex);
  };

  const handleExternalVideoFileDrop = (event: DragEvent, targetIndex?: number): boolean => {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) {
      return false;
    }
    const accepted = files.filter((file) => isVideoFile(file));
    if (accepted.length === 0) {
      options.error.value = '仅支持拖入视频文件（mp4/mov/webm/mkv/avi/wmv）';
      options.quickCommandFeedback.value = '未识别到可导入的视频文件';
      return true;
    }
    const nextClips = accepted.map((file) => createClipFromExternalVideoFile(file));
    options.checkpointTimelineEdit('external-file-drop', `导入本地视频 ${nextClips.length} 个`);
    const insertAt = Math.max(0, Math.min(targetIndex ?? options.clips.value.length, options.clips.value.length));
    const next = [...options.clips.value];
    next.splice(insertAt, 0, ...nextClips);
    options.clips.value = next;
    options.syncVideoClipTimeline();
    options.selectClip(insertAt);
    const skippedCount = files.length - accepted.length;
    if (skippedCount > 0) {
      options.quickCommandFeedback.value = `已导入 ${accepted.length} 个视频文件，忽略 ${skippedCount} 个非视频文件`;
    } else {
      options.quickCommandFeedback.value = `已导入 ${accepted.length} 个本地视频文件`;
    }
    const nativePaths = accepted
      .map((file) => (file as File & { path?: string }).path)
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (nativePaths.length > 0) {
      void enqueueDesktopIngestForDroppedFiles(nativePaths);
    } else {
      options.desktopIngestStatus.value = '';
    }
    options.error.value = '';
    return true;
  };

  const onClipDragStart = (idx: number, event: DragEvent): void => {
    dragSourceIndex.value = idx;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(idx));
    }
  };

  const onClipDragOver = (idx: number, event: DragEvent): void => {
    event.preventDefault();
    dragTargetIndex.value = idx;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const onClipDrop = (idx: number, event: DragEvent): void => {
    event.preventDefault();
    const source = dragSourceIndex.value;
    if (source === null || source < 0 || source >= options.clips.value.length || source === idx) {
      dragTargetIndex.value = null;
      return;
    }
    options.checkpointTimelineEdit('drag-reorder-clip', `片段 #${source + 1} 拖拽排序`);
    const next = [...options.clips.value];
    const [item] = next.splice(source, 1);
    const target = source < idx ? idx - 1 : idx;
    next.splice(target, 0, item);
    options.clips.value = next;
    options.syncVideoClipTimeline();
    options.selectClip(target);
    dragTargetIndex.value = null;
    dragSourceIndex.value = null;
  };

  const onClipDropToEnd = (event: DragEvent): void => {
    event.preventDefault();
    if (handleExternalVideoFileDrop(event, options.clips.value.length)) {
      dragTargetIndex.value = null;
      dragSourceIndex.value = null;
      return;
    }
    const source = dragSourceIndex.value;
    if (source === null || source < 0 || source >= options.clips.value.length) {
      dragTargetIndex.value = null;
      return;
    }
    options.checkpointTimelineEdit('drag-clip-to-end', `片段 #${source + 1} 拖拽到末尾`);
    const next = [...options.clips.value];
    const [item] = next.splice(source, 1);
    next.push(item);
    options.clips.value = next;
    options.syncVideoClipTimeline();
    options.selectClip(next.length - 1);
    dragTargetIndex.value = null;
    dragSourceIndex.value = null;
  };

  const onClipDragEnd = (): void => {
    dragTargetIndex.value = null;
    dragSourceIndex.value = null;
  };

  const onTimelineBarDragStart = (idx: number, event: DragEvent): void => {
    timelineBarDragSourceIndex.value = idx;
    timelineBarDragTargetIndex.value = idx;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `timeline-bar:${idx}`);
    }
  };

  const resolveDockDropSnap = (lane: HTMLElement, clientX: number): { leftPx: number; timeSec: number; targetIndex: number } => {
    const rect = lane.getBoundingClientRect();
    const laneWidth = Math.max(1, rect.width);
    const rawLeft = options.clampNumber(clientX - rect.left, 0, laneWidth);
    const ratio = options.clampNumber(rawLeft / laneWidth, 0, 1);
    const rawTimeSec = options.timelineTotalDurationSec.value * ratio;
    const boundaries = [0, ...options.videoClipSpans.value.map((span) => span.startSec), options.timelineTotalDurationSec.value]
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    let snappedTimeSec = rawTimeSec;
    let minDistance = Number.POSITIVE_INFINITY;
    for (const candidate of boundaries) {
      const distance = Math.abs(candidate - rawTimeSec);
      if (distance < minDistance) {
        minDistance = distance;
        snappedTimeSec = candidate;
      }
    }
    const snappedLeft =
      options.timelineTotalDurationSec.value > 0
        ? options.clampNumber((snappedTimeSec / options.timelineTotalDurationSec.value) * laneWidth, 0, laneWidth)
        : rawLeft;
    const targetIndex = options.videoClipSpans.value.findIndex((span) => snappedTimeSec >= span.startSec && snappedTimeSec <= span.endSec);
    return {
      leftPx: snappedLeft,
      timeSec: snappedTimeSec,
      targetIndex: targetIndex >= 0 ? targetIndex : options.clips.value.length
    };
  };

  const onTimelineBarDragOver = (idx: number, event: DragEvent): void => {
    event.preventDefault();
    const text = event.dataTransfer?.getData('text/plain') || '';
    const hasExternalFiles = (event.dataTransfer?.files?.length || 0) > 0;
    timelineBarDragTargetIndex.value = idx;
    if (text.startsWith('dock-shot:') || hasExternalFiles) {
      const lane = (event.currentTarget as HTMLElement | null)?.closest('.lane-bars') as HTMLElement | null;
      const rect = lane?.getBoundingClientRect();
      const span = options.videoClipSpans.value[idx];
      if (rect && span && options.timelineTotalDurationSec.value > 0) {
        const leftPx = options.clampNumber(
          (span.startSec / options.timelineTotalDurationSec.value) * Math.max(1, rect.width),
          0,
          Math.max(1, rect.width)
        );
        dockDropIndicator.value = { active: true, leftPx };
      }
    }
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = text.startsWith('dock-shot:') || hasExternalFiles ? 'copy' : 'move';
    }
  };

  const onTimelineBarDrop = (idx: number, event: DragEvent): void => {
    event.preventDefault();
    if (handleExternalVideoFileDrop(event, idx)) {
      timelineBarDragTargetIndex.value = null;
      timelineBarDragSourceIndex.value = null;
      dockDragStoryboardId.value = '';
      dockDropIndicator.value = { active: false, leftPx: 0 };
      externalFileDragActive.value = false;
      return;
    }
    const dockText = event.dataTransfer?.getData('text/plain') || '';
    if (dockText.startsWith('dock-shot:')) {
      const storyboardId = dockText.slice('dock-shot:'.length);
      if (storyboardId) {
        options.checkpointTimelineEdit('dock-drop-on-bar', `${storyboardId} -> #${idx + 1}`);
        insertClipAt(createClipFromStoryboard(storyboardId), idx);
      }
      timelineBarDragTargetIndex.value = null;
      timelineBarDragSourceIndex.value = null;
      dockDragStoryboardId.value = '';
      dockDropIndicator.value = { active: false, leftPx: 0 };
      return;
    }
    const source = timelineBarDragSourceIndex.value;
    if (source === null || source < 0 || source >= options.clips.value.length || source === idx) {
      timelineBarDragTargetIndex.value = null;
      timelineBarDragSourceIndex.value = null;
      return;
    }
    options.checkpointTimelineEdit('drag-reorder-bar', `时间轴条 #${source + 1} 拖拽排序`);
    const next = [...options.clips.value];
    const [moved] = next.splice(source, 1);
    const target = source < idx ? idx - 1 : idx;
    next.splice(target, 0, moved);
    options.clips.value = next;
    options.selectClip(target);
    options.syncVideoClipTimeline();
    timelineBarDragTargetIndex.value = null;
    timelineBarDragSourceIndex.value = null;
  };

  const onTimelineBarDragEnd = (): void => {
    timelineBarDragTargetIndex.value = null;
    timelineBarDragSourceIndex.value = null;
    externalFileDragActive.value = false;
    dockDropIndicator.value = { active: false, leftPx: 0 };
  };

  const replaceSelectedClipSourceWithLatestTask = (): void => {
    const clip = options.selectedClip.value;
    if (!clip) {
      return;
    }
    const storyboardId = clip.storyboardId?.trim();
    if (!storyboardId) {
      return;
    }
    const latest = options.latestDoneVideoTaskByStoryboardId.value[storyboardId];
    if (!latest || !latest.resultUrl) {
      options.error.value = '该分镜暂无可用的已完成视频任务';
      return;
    }
    options.checkpointTimelineEdit('replace-source', `分镜 ${storyboardId}`);
    clip.videoTaskId = latest.taskId;
    clip.sourceUrl = latest.resultUrl;
    options.error.value = '';
  };

  const addClipFromStoryboard = (storyboardId: string): void => {
    const storyboard = options.storyboards.value.find((item) => item.id === storyboardId);
    if (!storyboard) {
      return;
    }
    options.checkpointTimelineEdit('dock-add-clip', storyboard.title || storyboard.id);
    insertClipAt(createClipFromStoryboard(storyboardId), options.clips.value.length);
  };

  const applyMediaToSelectedClip = (storyboardId: string): void => {
    const latest = options.latestDoneVideoTaskByStoryboardId.value[storyboardId];
    if (!latest || !latest.resultUrl || !options.selectedClip.value) {
      return;
    }
    options.checkpointTimelineEdit('dock-apply-media', storyboardId);
    options.selectedClip.value.storyboardId = storyboardId;
    options.selectedClip.value.videoTaskId = latest.taskId;
    options.selectedClip.value.sourceUrl = latest.resultUrl;
    options.error.value = '';
  };

  const appendMediaAsClip = (storyboardId: string): void => {
    const latest = options.latestDoneVideoTaskByStoryboardId.value[storyboardId];
    if (!latest?.resultUrl) {
      options.quickCommandFeedback.value = '该分镜暂无可用媒体结果';
      return;
    }
    options.checkpointTimelineEdit('dock-append-media-clip', storyboardId);
    insertClipAt(
      {
        ...createClipFromStoryboard(storyboardId),
        videoTaskId: latest.taskId,
        sourceUrl: latest.resultUrl
      },
      options.clips.value.length
    );
    options.quickCommandFeedback.value = '已追加媒体为新片段';
  };

  const applyMediaToSelectedClipsBatch = (): void => {
    const indices = options.getBatchPanelTargetIndices();
    if (indices.length === 0) {
      options.quickCommandFeedback.value = '当前无可批量替换的片段';
      return;
    }
    options.checkpointTimelineEdit('dock-apply-media-batch', `${indices.length} clips`);
    let updated = 0;
    for (const idx of indices) {
      const clip = options.clips.value[idx];
      if (!clip) {
        continue;
      }
      const latest = options.latestDoneVideoTaskByStoryboardId.value[clip.storyboardId];
      if (!latest?.resultUrl) {
        continue;
      }
      clip.videoTaskId = latest.taskId;
      clip.sourceUrl = latest.resultUrl;
      updated += 1;
    }
    options.syncVideoClipTimeline();
    options.quickCommandFeedback.value = updated > 0 ? `已批量替换 ${updated} 个片段媒体` : '未找到可替换的媒体结果';
  };

  const autoBindMediaForTimelineClips = (): void => {
    if (options.clips.value.length === 0) {
      return;
    }
    options.checkpointTimelineEdit('dock-auto-bind-media', `${options.clips.value.length} clips`);
    let updated = 0;
    for (const clip of options.clips.value) {
      const latest = options.latestDoneVideoTaskByStoryboardId.value[clip.storyboardId];
      if (!latest?.resultUrl) {
        continue;
      }
      clip.videoTaskId = latest.taskId;
      clip.sourceUrl = latest.resultUrl;
      updated += 1;
    }
    options.syncVideoClipTimeline();
    options.quickCommandFeedback.value = `自动绑定完成：${updated}/${options.clips.value.length}`;
  };

  const onDockShotDragStart = (storyboardId: string, event: DragEvent): void => {
    dockDragStoryboardId.value = storyboardId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', `dock-shot:${storyboardId}`);
    }
  };

  const onDockShotDragEnd = (): void => {
    dockDragStoryboardId.value = '';
    dockDropIndicator.value = { active: false, leftPx: 0 };
  };

  const onTimelineLaneDockDragOver = (event: DragEvent): void => {
    const hasExternalFiles = (event.dataTransfer?.files?.length || 0) > 0;
    if (hasExternalFiles) {
      event.preventDefault();
      externalFileDragActive.value = true;
      const lane = event.currentTarget as HTMLElement | null;
      if (lane) {
        const snapped = resolveDockDropSnap(lane, event.clientX);
        dockDropIndicator.value = { active: true, leftPx: snapped.leftPx };
      }
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      return;
    }
    const text = event.dataTransfer?.getData('text/plain') || '';
    if (text.startsWith('dock-shot:')) {
      event.preventDefault();
      const lane = event.currentTarget as HTMLElement | null;
      if (lane) {
        const snapped = resolveDockDropSnap(lane, event.clientX);
        dockDropIndicator.value = { active: true, leftPx: snapped.leftPx };
      }
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    }
  };

  const onTimelineLaneDockDragLeave = (event: DragEvent): void => {
    const lane = event.currentTarget as HTMLElement | null;
    const related = event.relatedTarget as Node | null;
    if (!lane || (related && lane.contains(related))) {
      return;
    }
    externalFileDragActive.value = false;
    dockDropIndicator.value = { active: false, leftPx: 0 };
  };

  const onTimelineLaneDockDrop = (event: DragEvent): void => {
    event.preventDefault();
    externalFileDragActive.value = false;
    if (handleExternalVideoFileDrop(event)) {
      dockDragStoryboardId.value = '';
      dockDropIndicator.value = { active: false, leftPx: 0 };
      return;
    }
    const text = event.dataTransfer?.getData('text/plain') || '';
    const storyboardId = text.startsWith('dock-shot:') ? text.slice('dock-shot:'.length) : dockDragStoryboardId.value;
    dockDragStoryboardId.value = '';
    dockDropIndicator.value = { active: false, leftPx: 0 };
    if (!storyboardId) {
      return;
    }
    const lane = event.currentTarget as HTMLElement | null;
    if (!lane || options.timelineTotalDurationSec.value <= 0) {
      options.checkpointTimelineEdit('dock-drop-append', storyboardId);
      insertClipAt(createClipFromStoryboard(storyboardId), options.clips.value.length);
      return;
    }
    const snapped = resolveDockDropSnap(lane, event.clientX);
    options.checkpointTimelineEdit('dock-drop-insert', `${storyboardId} @${snapped.timeSec.toFixed(2)}s`);
    insertClipAt(createClipFromStoryboard(storyboardId), snapped.targetIndex);
  };

  return {
    addClipFromStoryboard,
    applyMediaToSelectedClip,
    applyMediaToSelectedClipsBatch,
    appendMediaAsClip,
    autoBindMediaForTimelineClips,
    dockDragStoryboardId,
    dockDropIndicator,
    dragSourceIndex,
    dragTargetIndex,
    externalFileDragActive,
    onClipDragEnd,
    onClipDragOver,
    onClipDragStart,
    onClipDrop,
    onClipDropToEnd,
    onDockShotDragEnd,
    onDockShotDragStart,
    onTimelineBarDragEnd,
    onTimelineBarDragOver,
    onTimelineBarDragStart,
    onTimelineBarDrop,
    onTimelineLaneDockDragLeave,
    onTimelineLaneDockDragOver,
    onTimelineLaneDockDrop,
    replaceSelectedClipSourceWithLatestTask,
    timelineBarDragSourceIndex,
    timelineBarDragTargetIndex
  };
};
