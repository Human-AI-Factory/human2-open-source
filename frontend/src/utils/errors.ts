import { ApiError } from '@/api/client';

export const toErrorMessage = (err: unknown, fallback = '操作失败，请稍后重试'): string => {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
};

export const isVideoTaskQuotaExceededError = (err: unknown): boolean => {
  if (err instanceof ApiError) {
    if (err.bizCode === 'CONFLICT' && err.status === 409 && err.message.includes('daily video task quota exceeded')) {
      return true;
    }
    if (err.status === 409 && err.message.toLowerCase().includes('quota')) {
      return true;
    }
  }
  return err instanceof Error && err.message.toLowerCase().includes('daily video task quota exceeded');
};
