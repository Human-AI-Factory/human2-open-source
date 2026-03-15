import { BIZ_CODE } from '../../constants/bizCode.js';

const CONTRACT_BIZ_CODES = [
  'OK',
  'INVALID_QUERY',
  'INVALID_PAYLOAD',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'CONFLICT',
  'NOT_FOUND',
  'QUEUE_FULL',
  'CAPABILITY_MISMATCH',
  'MODEL_NOT_SUPPORTED',
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_TIMEOUT',
  'INTERNAL_ERROR'
] as const;

const main = (): void => {
  const actual = Object.keys(BIZ_CODE).sort();
  const expected = [...CONTRACT_BIZ_CODES].sort();

  const missing = expected.filter((item) => !actual.includes(item));
  const extra = actual.filter((item) => !expected.includes(item as (typeof CONTRACT_BIZ_CODES)[number]));

  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `biz code contract mismatch: missing=[${missing.join(', ')}], extra=[${extra.join(', ')}]`
    );
  }

  const valueMismatches = expected.filter((item) => (BIZ_CODE as Record<string, string>)[item] !== item);
  if (valueMismatches.length > 0) {
    throw new Error(`biz code value mismatch: ${valueMismatches.join(', ')}`);
  }

  console.log(`[guard] biz code contract ok (${expected.length} codes)`);
};

main();
