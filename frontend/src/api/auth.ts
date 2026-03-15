import { request } from '@/api/client';

export const login = (username: string, password: string): Promise<{ token: string; username: string }> =>
  request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
