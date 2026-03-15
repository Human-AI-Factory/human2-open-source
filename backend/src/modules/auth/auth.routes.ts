import { Response, Router } from 'express';
import { z } from 'zod';
import { BIZ_CODE } from '../../constants/bizCode.js';
import { parsePayload } from '../../utils/validation.js';
import { AuthService } from './auth.service.js';

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const buildAuthRouter = (authService: AuthService): Router => {
  const router = Router();
  const fail = (res: Response, status: number, message: string, bizCode: string) =>
    res.status(status).json({ message, bizCode });

  router.post('/login', (req, res) => {
    const payload = parsePayload(schema, req.body, res, fail);
    if (!payload) {
      return;
    }

    const token = authService.login(payload.username, payload.password);
    if (!token) {
      return fail(res, 401, 'Invalid username or password', BIZ_CODE.UNAUTHORIZED);
    }

    return res.json({ token, username: payload.username });
  });

  return router;
};
