import type { QueueRuntimeAlertConfig, VideoTaskRuntimeHealth, VideoTaskRuntimeSnapshot } from '../../core/types.js';
import { PipelineService } from '../pipeline/pipeline.service.js';

export class TaskRuntimeService {
  private runtimeTrend: Array<{ at: string; queued: number; running: number; pumpDurationMs: number }> = [];
  private runtimeCounterTrend: Array<{ at: string; pumpCycleCount: number; pumpErrorCount: number }> = [];

  constructor(private readonly pipelineService: PipelineService) {}

  getVideoTaskRuntimeSnapshot(): VideoTaskRuntimeSnapshot {
    const snapshot = this.pipelineService.getVideoTaskRuntimeSnapshot();
    this.pushRuntimeTrendPoint(snapshot);
    return snapshot;
  }

  getVideoTaskRuntimeHealth(input: { limit?: number; alertConfig: QueueRuntimeAlertConfig }): VideoTaskRuntimeHealth {
    const snapshot = this.getVideoTaskRuntimeSnapshot();
    const limit = this.clampInt(input.limit ?? 30, 5, 240);
    let congestionLevel: 'green' | 'yellow' | 'red' = 'green';
    let congestionReason = 'queue healthy';
    if (snapshot.queuedTotal >= input.alertConfig.criticalQueuedThreshold || snapshot.pumpErrorCount > 0) {
      congestionLevel = 'red';
      congestionReason =
        snapshot.pumpErrorCount > 0
          ? `pump errors=${snapshot.pumpErrorCount}`
          : `queued=${snapshot.queuedTotal} >= critical=${input.alertConfig.criticalQueuedThreshold}`;
    } else if (snapshot.queuedTotal >= input.alertConfig.warnQueuedThreshold || snapshot.runningTotal > snapshot.maxConcurrent) {
      congestionLevel = 'yellow';
      congestionReason =
        snapshot.queuedTotal >= input.alertConfig.warnQueuedThreshold
          ? `queued=${snapshot.queuedTotal} >= warn=${input.alertConfig.warnQueuedThreshold}`
          : `running=${snapshot.runningTotal} > maxConcurrent=${snapshot.maxConcurrent}`;
    }
    return {
      snapshot,
      trend: this.runtimeTrend.slice(-limit),
      congestionLevel,
      congestionReason,
    };
  }

  getRuntimeCounterTrend(): Array<{ at: string; pumpCycleCount: number; pumpErrorCount: number }> {
    return this.runtimeCounterTrend.slice();
  }

  private clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  private pushRuntimeTrendPoint(snapshot: VideoTaskRuntimeSnapshot): void {
    const point = {
      at: snapshot.heartbeatAt || new Date().toISOString(),
      queued: snapshot.queuedTotal,
      running: snapshot.runningTotal,
      pumpDurationMs: snapshot.lastPumpDurationMs ?? 0,
    };
    const last = this.runtimeTrend[this.runtimeTrend.length - 1];
    if (last && last.at === point.at && last.queued === point.queued && last.running === point.running && last.pumpDurationMs === point.pumpDurationMs) {
      return;
    }
    this.runtimeTrend.push(point);
    if (this.runtimeTrend.length > 240) {
      this.runtimeTrend = this.runtimeTrend.slice(-240);
    }
    this.runtimeCounterTrend.push({
      at: point.at,
      pumpCycleCount: snapshot.pumpCycleCount,
      pumpErrorCount: snapshot.pumpErrorCount,
    });
    if (this.runtimeCounterTrend.length > 240) {
      this.runtimeCounterTrend = this.runtimeCounterTrend.slice(-240);
    }
  }
}
