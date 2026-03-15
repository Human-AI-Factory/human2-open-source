const parseBool = (raw: string | undefined, fallback: boolean): boolean => {
  if (raw === undefined) return fallback;
  return raw !== '0' && raw.toLowerCase() !== 'false';
};

const main = () => {
  const queueBackend = process.env.QUEUE_BACKEND === 'bullmq' ? 'bullmq' : 'lease';
  const queueDriver = process.env.QUEUE_DRIVER === 'external' ? 'external' : 'internal';
  const queueLoopEnabled = parseBool(process.env.QUEUE_LOOP_ENABLED, true);
  const redisUrl = process.env.QUEUE_REDIS_URL || process.env.REDIS_URL || '';

  if (queueBackend === 'bullmq' && !redisUrl.trim()) {
    throw new Error('QUEUE_BACKEND=bullmq requires QUEUE_REDIS_URL or REDIS_URL');
  }
  if (queueDriver === 'external' && queueLoopEnabled) {
    console.log('[guard] external driver with queue loop enabled: expected for dedicated worker process');
  }
  if (queueDriver === 'internal' && !queueLoopEnabled) {
    throw new Error('QUEUE_DRIVER=internal requires QUEUE_LOOP_ENABLED=1');
  }

  console.log(
    `[guard] queue config ok (backend=${queueBackend}, driver=${queueDriver}, loop=${queueLoopEnabled ? 'on' : 'off'})`
  );
};

main();

