import { ref, type ComputedRef, type Ref } from 'vue';

type DockLayoutMode = 'left' | 'right' | 'float';

type TimelineFloatingPanelsOptions = {
  clampNumber: (value: number, min: number, max: number) => number;
  minDockWidthPx: number;
  maxDockWidthPx: number;
  dockLayoutMode: Ref<DockLayoutMode>;
  clipPanelLayoutMode: Ref<DockLayoutMode>;
  dockPinned: Ref<boolean>;
  clipPanelPinned: Ref<boolean>;
  dockLocked: Ref<boolean>;
  clipPanelLocked: Ref<boolean>;
  dockZIndex: Ref<number>;
  clipPanelZIndex: Ref<number>;
  dockFloatPosition: Ref<{ x: number; y: number }>;
  clipPanelFloatPosition: Ref<{ x: number; y: number }>;
  studioDockCollapsed: Ref<boolean>;
  dockWidthPx: Ref<number>;
  normalizedDockWidthPx: ComputedRef<number>;
  normalizedClipPanelWidthPx: ComputedRef<number>;
  dockSnapAnimating: Ref<boolean>;
  clipPanelSnapAnimating: Ref<boolean>;
};

export const useTimelineFloatingPanels = (options: TimelineFloatingPanelsOptions) => {
  const dockResizeState = ref<{
    startX: number;
    startWidth: number;
  } | null>(null);
  const dockFloatDragState = ref<{ pointerOffsetX: number; pointerOffsetY: number } | null>(null);
  const clipPanelFloatDragState = ref<{ pointerOffsetX: number; pointerOffsetY: number } | null>(null);

  let dockSnapAnimateTimer: number | null = null;
  let clipPanelSnapAnimateTimer: number | null = null;

  const computeViewportPanelPos = (x: number, y: number, width: number, height = 420): { x: number; y: number } => {
    const margin = 8;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900;
    const clampedX = options.clampNumber(x, margin, Math.max(margin, viewportWidth - width - margin));
    const clampedY = options.clampNumber(y, 72, Math.max(72, viewportHeight - height - margin));
    return {
      x: Math.round(clampedX),
      y: Math.round(clampedY)
    };
  };

  const overlapArea = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ): number => {
    const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return overlapX * overlapY;
  };

  const applyFloatingAvoidance = (target: 'dock' | 'clip'): void => {
    if (options.dockLayoutMode.value !== 'float' || options.clipPanelLayoutMode.value !== 'float') {
      return;
    }
    const dockRect = {
      x: options.dockFloatPosition.value.x,
      y: options.dockFloatPosition.value.y,
      width: options.studioDockCollapsed.value ? 72 : options.normalizedDockWidthPx.value,
      height: 420
    };
    const clipRect = {
      x: options.clipPanelFloatPosition.value.x,
      y: options.clipPanelFloatPosition.value.y,
      width: options.normalizedClipPanelWidthPx.value,
      height: 460
    };
    if (overlapArea(dockRect, clipRect) <= 0) {
      return;
    }
    const spacing = 12;
    if (target === 'dock') {
      options.dockFloatPosition.value = computeViewportPanelPos(
        clipRect.x - dockRect.width - spacing,
        dockRect.y,
        dockRect.width,
        dockRect.height
      );
      return;
    }
    options.clipPanelFloatPosition.value = computeViewportPanelPos(
      dockRect.x + dockRect.width + spacing,
      clipRect.y,
      clipRect.width,
      clipRect.height
    );
  };

  const startDockResize = (event: PointerEvent): void => {
    if (options.studioDockCollapsed.value || options.dockLocked.value) {
      return;
    }
    dockResizeState.value = {
      startX: event.clientX,
      startWidth: options.normalizedDockWidthPx.value
    };
  };

  const activateFloatingPanel = (target: 'dock' | 'clip'): void => {
    if (target === 'dock') {
      if (options.dockLayoutMode.value !== 'float' || options.dockPinned.value) {
        return;
      }
      options.dockZIndex.value = Math.max(50, options.clipPanelZIndex.value + 1);
      return;
    }
    if (options.clipPanelLayoutMode.value !== 'float' || options.clipPanelPinned.value) {
      return;
    }
    options.clipPanelZIndex.value = Math.max(50, options.dockZIndex.value + 1);
  };

  const startDockFloatDrag = (event: PointerEvent): void => {
    if (options.dockLayoutMode.value !== 'float' || options.dockLocked.value) {
      return;
    }
    if (!options.dockPinned.value) {
      options.dockZIndex.value = 55;
    }
    dockFloatDragState.value = {
      pointerOffsetX: event.clientX - options.dockFloatPosition.value.x,
      pointerOffsetY: event.clientY - options.dockFloatPosition.value.y
    };
  };

  const startClipPanelFloatDrag = (event: PointerEvent): void => {
    if (options.clipPanelLayoutMode.value !== 'float' || options.clipPanelLocked.value) {
      return;
    }
    if (!options.clipPanelPinned.value) {
      options.clipPanelZIndex.value = 56;
    }
    clipPanelFloatDragState.value = {
      pointerOffsetX: event.clientX - options.clipPanelFloatPosition.value.x,
      pointerOffsetY: event.clientY - options.clipPanelFloatPosition.value.y
    };
  };

  const handleDockResizeMove = (event: PointerEvent): void => {
    const state = dockResizeState.value;
    if (!state || options.studioDockCollapsed.value) {
      return;
    }
    const nextWidth = options.clampNumber(
      state.startWidth + (event.clientX - state.startX),
      options.minDockWidthPx,
      options.maxDockWidthPx
    );
    options.dockWidthPx.value = Math.round(nextWidth);
  };

  const handleFloatingPointerMove = (event: PointerEvent): boolean => {
    if (dockFloatDragState.value) {
      options.dockFloatPosition.value = computeViewportPanelPos(
        event.clientX - dockFloatDragState.value.pointerOffsetX,
        event.clientY - dockFloatDragState.value.pointerOffsetY,
        options.studioDockCollapsed.value ? 72 : options.normalizedDockWidthPx.value,
        420
      );
      applyFloatingAvoidance('dock');
      return true;
    }
    if (clipPanelFloatDragState.value) {
      options.clipPanelFloatPosition.value = computeViewportPanelPos(
        event.clientX - clipPanelFloatDragState.value.pointerOffsetX,
        event.clientY - clipPanelFloatDragState.value.pointerOffsetY,
        options.normalizedClipPanelWidthPx.value,
        460
      );
      applyFloatingAvoidance('clip');
      return true;
    }
    if (dockResizeState.value) {
      handleDockResizeMove(event);
      return true;
    }
    return false;
  };

  const handleFloatingPointerUp = (timelineRect?: DOMRect | null): { dockMoved: boolean; clipMoved: boolean } => {
    const hadInteraction = Boolean(dockResizeState.value || dockFloatDragState.value || clipPanelFloatDragState.value);
    dockResizeState.value = null;
    dockFloatDragState.value = null;
    clipPanelFloatDragState.value = null;
    if (!hadInteraction) {
      return { dockMoved: false, clipMoved: false };
    }

    let dockMoved = false;
    let clipMoved = false;
    const threshold = 28;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const timelineLeft = timelineRect ? Math.round(timelineRect.left) : null;
    const timelineRight = timelineRect ? Math.round(timelineRect.right) : null;
    const timelineSnapThreshold = 36;

    if (options.dockLayoutMode.value === 'float') {
      const width = options.studioDockCollapsed.value ? 72 : options.normalizedDockWidthPx.value;
      const before = options.dockFloatPosition.value.x;
      if (options.dockFloatPosition.value.x <= threshold) {
        options.dockFloatPosition.value.x = 8;
      }
      if (viewportWidth - (options.dockFloatPosition.value.x + width) <= threshold) {
        options.dockFloatPosition.value.x = Math.max(8, viewportWidth - width - 8);
      }
      if (timelineLeft !== null && Math.abs(options.dockFloatPosition.value.x - timelineLeft) <= timelineSnapThreshold) {
        options.dockFloatPosition.value.x = timelineLeft;
      }
      if (
        timelineRight !== null &&
        Math.abs(options.dockFloatPosition.value.x + width - timelineRight) <= timelineSnapThreshold
      ) {
        options.dockFloatPosition.value.x = Math.max(8, timelineRight - width);
      }
      dockMoved = before !== options.dockFloatPosition.value.x;
    }

    if (options.clipPanelLayoutMode.value === 'float') {
      const width = options.normalizedClipPanelWidthPx.value;
      const before = options.clipPanelFloatPosition.value.x;
      if (options.clipPanelFloatPosition.value.x <= threshold) {
        options.clipPanelFloatPosition.value.x = 8;
      }
      if (viewportWidth - (options.clipPanelFloatPosition.value.x + width) <= threshold) {
        options.clipPanelFloatPosition.value.x = Math.max(8, viewportWidth - width - 8);
      }
      if (timelineLeft !== null && Math.abs(options.clipPanelFloatPosition.value.x - timelineLeft) <= timelineSnapThreshold) {
        options.clipPanelFloatPosition.value.x = timelineLeft;
      }
      if (
        timelineRight !== null &&
        Math.abs(options.clipPanelFloatPosition.value.x + width - timelineRight) <= timelineSnapThreshold
      ) {
        options.clipPanelFloatPosition.value.x = Math.max(8, timelineRight - width);
      }
      clipMoved = before !== options.clipPanelFloatPosition.value.x;
    }

    const dockBeforeAvoid = `${options.dockFloatPosition.value.x},${options.dockFloatPosition.value.y}`;
    const clipBeforeAvoid = `${options.clipPanelFloatPosition.value.x},${options.clipPanelFloatPosition.value.y}`;
    applyFloatingAvoidance('clip');
    dockMoved = dockMoved || dockBeforeAvoid !== `${options.dockFloatPosition.value.x},${options.dockFloatPosition.value.y}`;
    clipMoved =
      clipMoved || clipBeforeAvoid !== `${options.clipPanelFloatPosition.value.x},${options.clipPanelFloatPosition.value.y}`;

    if (dockMoved) {
      options.dockSnapAnimating.value = true;
      if (dockSnapAnimateTimer !== null) {
        window.clearTimeout(dockSnapAnimateTimer);
      }
      dockSnapAnimateTimer = window.setTimeout(() => {
        options.dockSnapAnimating.value = false;
      }, 220);
    }
    if (clipMoved) {
      options.clipPanelSnapAnimating.value = true;
      if (clipPanelSnapAnimateTimer !== null) {
        window.clearTimeout(clipPanelSnapAnimateTimer);
      }
      clipPanelSnapAnimateTimer = window.setTimeout(() => {
        options.clipPanelSnapAnimating.value = false;
      }, 220);
    }

    return { dockMoved, clipMoved };
  };

  const disposeFloatingPanels = (): void => {
    dockResizeState.value = null;
    dockFloatDragState.value = null;
    clipPanelFloatDragState.value = null;
    if (dockSnapAnimateTimer !== null) {
      window.clearTimeout(dockSnapAnimateTimer);
      dockSnapAnimateTimer = null;
    }
    if (clipPanelSnapAnimateTimer !== null) {
      window.clearTimeout(clipPanelSnapAnimateTimer);
      clipPanelSnapAnimateTimer = null;
    }
  };

  return {
    activateFloatingPanel,
    disposeFloatingPanels,
    handleFloatingPointerMove,
    handleFloatingPointerUp,
    startClipPanelFloatDrag,
    startDockFloatDrag,
    startDockResize
  };
};
