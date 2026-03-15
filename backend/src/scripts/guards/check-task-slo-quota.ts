const parseNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`invalid number: ${value}`);
  }
  return parsed;
};

const parseIntBounded = (value: string | undefined, fallback: number, min: number, max: number, key: string): number => {
  const parsed = Math.trunc(parseNumber(value, fallback));
  if (parsed < min || parsed > max) {
    throw new Error(`${key} out of range [${min}, ${max}]: ${parsed}`);
  }
  return parsed;
};

const parseFloatBounded = (value: string | undefined, fallback: number, min: number, max: number, key: string): number => {
  const parsed = parseNumber(value, fallback);
  if (parsed < min || parsed > max) {
    throw new Error(`${key} out of range [${min}, ${max}]: ${parsed}`);
  }
  return parsed;
};

const main = () => {
  const p95WarnMs = parseIntBounded(process.env.TASK_SLO_P95_WARN_MS, 60_000, 1_000, 30 * 60_000, 'TASK_SLO_P95_WARN_MS');
  const p95CriticalMs = parseIntBounded(process.env.TASK_SLO_P95_CRITICAL_MS, 120_000, 1_000, 30 * 60_000, 'TASK_SLO_P95_CRITICAL_MS');
  const pumpWarn = parseFloatBounded(process.env.TASK_SLO_PUMP_ERROR_RATE_WARN, 0.02, 0, 1, 'TASK_SLO_PUMP_ERROR_RATE_WARN');
  const pumpCritical = parseFloatBounded(
    process.env.TASK_SLO_PUMP_ERROR_RATE_CRITICAL,
    0.05,
    0,
    1,
    'TASK_SLO_PUMP_ERROR_RATE_CRITICAL'
  );
  const windowSamples = parseIntBounded(process.env.TASK_SLO_WINDOW_SAMPLES, 30, 5, 240, 'TASK_SLO_WINDOW_SAMPLES');
  if (p95CriticalMs <= p95WarnMs) {
    throw new Error(`TASK_SLO_P95_CRITICAL_MS must be greater than TASK_SLO_P95_WARN_MS (${p95CriticalMs} <= ${p95WarnMs})`);
  }
  if (pumpCritical <= pumpWarn) {
    throw new Error(
      `TASK_SLO_PUMP_ERROR_RATE_CRITICAL must be greater than TASK_SLO_PUMP_ERROR_RATE_WARN (${pumpCritical} <= ${pumpWarn})`
    );
  }

  const dailyDefault = parseIntBounded(
    process.env.TASK_QUOTA_DAILY_VIDEO_DEFAULT,
    200,
    1,
    100_000,
    'TASK_QUOTA_DAILY_VIDEO_DEFAULT'
  );

  const overridesRaw = (process.env.TASK_QUOTA_DAILY_VIDEO_OVERRIDES || '').trim();
  let overrideCount = 0;
  if (overridesRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(overridesRaw);
    } catch {
      throw new Error('TASK_QUOTA_DAILY_VIDEO_OVERRIDES must be valid JSON object');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('TASK_QUOTA_DAILY_VIDEO_OVERRIDES must be JSON object map');
    }
    for (const [projectId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!projectId.trim()) {
        throw new Error('TASK_QUOTA_DAILY_VIDEO_OVERRIDES contains empty projectId key');
      }
      const limit = Number(value);
      if (!Number.isFinite(limit) || Math.trunc(limit) < 1 || Math.trunc(limit) > 100_000) {
        throw new Error(`invalid quota override for projectId=${projectId}: ${String(value)}`);
      }
      overrideCount += 1;
    }
  }

  console.log(
    `[guard] task slo/quota config ok (p95=${p95WarnMs}/${p95CriticalMs}ms, pump=${pumpWarn}/${pumpCritical}, window=${windowSamples}, quotaDefault=${dailyDefault}, overrides=${overrideCount})`
  );
};

main();
