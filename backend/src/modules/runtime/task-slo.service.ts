import type { TaskSloConfig, TaskSloState } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import { TaskRuntimeService } from './task-runtime.service.js';

const TASK_SLO_P95_WARN_MS_KEY = 'task_slo_p95_warn_ms';
const TASK_SLO_P95_CRITICAL_MS_KEY = 'task_slo_p95_critical_ms';
const TASK_SLO_PUMP_ERROR_RATE_WARN_KEY = 'task_slo_pump_error_rate_warn';
const TASK_SLO_PUMP_ERROR_RATE_CRITICAL_KEY = 'task_slo_pump_error_rate_critical';
const TASK_SLO_WINDOW_SAMPLES_KEY = 'task_slo_window_samples';
const TASK_SLO_UPDATED_AT_KEY = 'task_slo_updated_at';

export class TaskSloService {
  constructor(
    private readonly store: SqliteStore,
    private readonly taskRuntimeService: TaskRuntimeService
  ) {}

  getTaskSloConfig(): TaskSloConfig {
    const p95Warn = this.readBoundedIntSetting(TASK_SLO_P95_WARN_MS_KEY, 60_000, 1_000, 30 * 60_000);
    const p95CriticalRaw = this.readBoundedIntSetting(TASK_SLO_P95_CRITICAL_MS_KEY, 120_000, 1_000, 30 * 60_000);
    const p95Critical = Math.max(p95Warn + 1_000, p95CriticalRaw);
    const pumpWarn = this.readBoundedFloatSetting(TASK_SLO_PUMP_ERROR_RATE_WARN_KEY, 0.02, 0, 1);
    const pumpCriticalRaw = this.readBoundedFloatSetting(TASK_SLO_PUMP_ERROR_RATE_CRITICAL_KEY, 0.05, 0, 1);
    const pumpCritical = Math.max(pumpWarn + 0.001, pumpCriticalRaw);
    const windowSamples = this.readBoundedIntSetting(TASK_SLO_WINDOW_SAMPLES_KEY, 30, 5, 240);
    const updatedAt = this.store.getSystemSetting(TASK_SLO_UPDATED_AT_KEY) ?? '';
    return {
      p95QueueWaitWarnMs: p95Warn,
      p95QueueWaitCriticalMs: p95Critical,
      pumpErrorRateWarn: Number(pumpWarn.toFixed(4)),
      pumpErrorRateCritical: Number(pumpCritical.toFixed(4)),
      windowSamples,
      updatedAt,
    };
  }

  updateTaskSloConfig(input: {
    p95QueueWaitWarnMs?: number;
    p95QueueWaitCriticalMs?: number;
    pumpErrorRateWarn?: number;
    pumpErrorRateCritical?: number;
    windowSamples?: number;
  }): TaskSloConfig {
    const current = this.getTaskSloConfig();
    const p95Warn = this.clampInt(input.p95QueueWaitWarnMs ?? current.p95QueueWaitWarnMs, 1_000, 30 * 60_000);
    const p95Critical = Math.max(
      p95Warn + 1_000,
      this.clampInt(input.p95QueueWaitCriticalMs ?? current.p95QueueWaitCriticalMs, 1_000, 30 * 60_000)
    );
    const pumpWarn = this.clampFloat(input.pumpErrorRateWarn ?? current.pumpErrorRateWarn, 0, 1);
    const pumpCritical = Math.max(pumpWarn + 0.001, this.clampFloat(input.pumpErrorRateCritical ?? current.pumpErrorRateCritical, 0, 1));
    const windowSamples = this.clampInt(input.windowSamples ?? current.windowSamples, 5, 240);
    const updatedAt = new Date().toISOString();
    this.store.setSystemSetting(TASK_SLO_P95_WARN_MS_KEY, String(p95Warn));
    this.store.setSystemSetting(TASK_SLO_P95_CRITICAL_MS_KEY, String(p95Critical));
    this.store.setSystemSetting(TASK_SLO_PUMP_ERROR_RATE_WARN_KEY, String(pumpWarn));
    this.store.setSystemSetting(TASK_SLO_PUMP_ERROR_RATE_CRITICAL_KEY, String(pumpCritical));
    this.store.setSystemSetting(TASK_SLO_WINDOW_SAMPLES_KEY, String(windowSamples));
    this.store.setSystemSetting(TASK_SLO_UPDATED_AT_KEY, updatedAt);
    return {
      p95QueueWaitWarnMs: p95Warn,
      p95QueueWaitCriticalMs: p95Critical,
      pumpErrorRateWarn: Number(pumpWarn.toFixed(4)),
      pumpErrorRateCritical: Number(pumpCritical.toFixed(4)),
      windowSamples,
      updatedAt,
    };
  }

  getTaskSloState(): TaskSloState {
    const config = this.getTaskSloConfig();
    const queuePercentile = this.store.getVideoTaskQueueWaitPercentiles(1_000);
    const recent = this.taskRuntimeService.getRuntimeCounterTrend().slice(-config.windowSamples);
    let pumpErrorRate = 0;
    if (recent.length >= 2) {
      const first = recent[0];
      const last = recent[recent.length - 1];
      const cycleDelta = Math.max(0, last.pumpCycleCount - first.pumpCycleCount);
      const errorDelta = Math.max(0, last.pumpErrorCount - first.pumpErrorCount);
      pumpErrorRate = cycleDelta <= 0 ? 0 : errorDelta / cycleDelta;
    }
    let level: 'green' | 'yellow' | 'red' = 'green';
    let reason = 'slo_healthy';
    if (queuePercentile.p95Ms >= config.p95QueueWaitCriticalMs || pumpErrorRate >= config.pumpErrorRateCritical) {
      level = 'red';
      reason =
        queuePercentile.p95Ms >= config.p95QueueWaitCriticalMs
          ? `p95_queue_wait_ms=${queuePercentile.p95Ms}`
          : `pump_error_rate=${pumpErrorRate.toFixed(4)}`;
    } else if (queuePercentile.p95Ms >= config.p95QueueWaitWarnMs || pumpErrorRate >= config.pumpErrorRateWarn) {
      level = 'yellow';
      reason =
        queuePercentile.p95Ms >= config.p95QueueWaitWarnMs
          ? `p95_queue_wait_ms=${queuePercentile.p95Ms}`
          : `pump_error_rate=${pumpErrorRate.toFixed(4)}`;
    }
    return {
      level,
      reason,
      p95QueueWaitMs: queuePercentile.p95Ms,
      pumpErrorRate: Number(pumpErrorRate.toFixed(4)),
      sampleSize: queuePercentile.sampleSize,
      windowSamples: config.windowSamples,
    };
  }

  private readBoundedIntSetting(key: string, fallback: number, min: number, max: number): number {
    const raw = this.store.getSystemSetting(key) ?? '';
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return this.clampInt(parsed, min, max);
  }

  private readBoundedFloatSetting(key: string, fallback: number, min: number, max: number): number {
    const raw = this.store.getSystemSetting(key) ?? '';
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return this.clampFloat(parsed, min, max);
  }

  private clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  private clampFloat(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.max(min, Math.min(max, value));
  }
}
