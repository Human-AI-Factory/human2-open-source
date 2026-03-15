const parseBool = (raw: string | undefined, fallback: boolean): boolean => {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
};

const parseIntBounded = (value: string | undefined, fallback: number, min: number, max: number, key: string): number => {
  const parsed = value === undefined || value.trim() === '' ? fallback : Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} out of range [${min}, ${max}]`);
  }
  return parsed;
};

const main = (): void => {
  const enabled = parseBool(process.env.UNIFIED_ALERT_NOTIFICATION_ENABLED, false);
  const endpoint = (process.env.UNIFIED_ALERT_NOTIFICATION_ENDPOINT || '').trim();
  const authHeader = (process.env.UNIFIED_ALERT_NOTIFICATION_AUTH_HEADER || '').trim();
  const timeoutMs = parseIntBounded(process.env.UNIFIED_ALERT_NOTIFICATION_TIMEOUT_MS, 5000, 500, 60_000, 'UNIFIED_ALERT_NOTIFICATION_TIMEOUT_MS');
  const maxRetries = parseIntBounded(process.env.UNIFIED_ALERT_NOTIFICATION_MAX_RETRIES, 3, 0, 10, 'UNIFIED_ALERT_NOTIFICATION_MAX_RETRIES');
  const retryBaseDelaySeconds = parseIntBounded(
    process.env.UNIFIED_ALERT_NOTIFICATION_RETRY_BASE_DELAY_SECONDS,
    30,
    1,
    3600,
    'UNIFIED_ALERT_NOTIFICATION_RETRY_BASE_DELAY_SECONDS'
  );
  const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();

  if (enabled && !endpoint) {
    throw new Error('UNIFIED_ALERT_NOTIFICATION_ENABLED=1 requires UNIFIED_ALERT_NOTIFICATION_ENDPOINT');
  }
  if (endpoint) {
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      throw new Error('UNIFIED_ALERT_NOTIFICATION_ENDPOINT must be a valid URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('UNIFIED_ALERT_NOTIFICATION_ENDPOINT protocol must be http or https');
    }
    if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
      throw new Error('UNIFIED_ALERT_NOTIFICATION_ENDPOINT must use https in production');
    }
  }
  if (authHeader.includes('\n') || authHeader.includes('\r')) {
    throw new Error('UNIFIED_ALERT_NOTIFICATION_AUTH_HEADER must not contain line breaks');
  }

  console.log(
    `[guard] unified alert notification config ok (enabled=${enabled ? 'on' : 'off'}, endpoint=${endpoint ? 'set' : 'empty'}, timeoutMs=${timeoutMs}, maxRetries=${maxRetries}, retryBaseDelaySeconds=${retryBaseDelaySeconds})`
  );
};

main();
