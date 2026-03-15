import type { ComputedRef } from 'vue';
import type { TimelineClip } from '@/types/models';

type ClipEffectType = NonNullable<TimelineClip['effects']>[number]['type'];
type EditableTimelineClip = TimelineClip & {
  transition: NonNullable<TimelineClip['transition']>;
  keyframe: NonNullable<TimelineClip['keyframe']>;
};

type UseTimelineClipEffectsOptions = {
  selectedClip: ComputedRef<EditableTimelineClip | null>;
  clampNumber: (value: number, min: number, max: number) => number;
};

export const useTimelineClipEffects = (options: UseTimelineClipEffectsOptions) => {
  const ensureClipEffects = (): NonNullable<TimelineClip['effects']> => {
    const item = options.selectedClip.value;
    if (!item) {
      return [];
    }
    if (!Array.isArray(item.effects)) {
      item.effects = [];
    }
    return item.effects;
  };

  const findClipEffect = (type: ClipEffectType): NonNullable<TimelineClip['effects']>[number] | null =>
    ensureClipEffects().find((item) => item.type === type) ?? null;

  const upsertClipEffect = (type: ClipEffectType): NonNullable<TimelineClip['effects']>[number] => {
    const effects = ensureClipEffects();
    let effect = effects.find((item) => item.type === type) ?? null;
    if (!effect) {
      effect = {
        type,
        enabled: true,
        order: effects.length,
        config: {}
      };
      effects.push(effect);
    }
    if (!effect.config || typeof effect.config !== 'object' || Array.isArray(effect.config)) {
      effect.config = {};
    }
    return effect;
  };

  const isEffectEnabled = (type: ClipEffectType): boolean => {
    const effect = findClipEffect(type);
    return Boolean(effect && effect.enabled !== false);
  };

  const setEffectEnabled = (type: ClipEffectType, enabled: boolean): void => {
    if (enabled) {
      const effect = upsertClipEffect(type);
      effect.enabled = true;
      return;
    }
    const effect = findClipEffect(type);
    if (effect) {
      effect.enabled = false;
    }
  };

  const getNumericEffectConfig = (type: ClipEffectType, key: string, fallback: number): number => {
    const effect = findClipEffect(type);
    const cfg = effect?.config;
    const raw = cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? (cfg as Record<string, unknown>)[key] : undefined;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }
    return fallback;
  };

  const setNumericEffectConfig = (
    type: ClipEffectType,
    key: string,
    rawValue: number,
    min: number,
    max: number,
    precision = 0.01
  ): void => {
    if (!Number.isFinite(rawValue)) {
      return;
    }
    const effect = upsertClipEffect(type);
    const value = options.clampNumber(rawValue, min, max);
    const fixed = Number((Math.round(value / precision) * precision).toFixed(4));
    const cfg = effect.config as Record<string, unknown>;
    cfg[key] = fixed;
    effect.enabled = true;
  };

  return {
    getNumericEffectConfig,
    isEffectEnabled,
    setEffectEnabled,
    setNumericEffectConfig
  };
};
