import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../modules/auth/auth.service.js';
import { BIZ_CODE } from '../constants/bizCode.js';

export const buildAuthMiddleware = (authService: AuthService) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const fail = (status: number, message: string, bizCode: string) => {
      res.status(status).json({ message, bizCode });
    };
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      fail(401, 'Unauthorized', BIZ_CODE.UNAUTHORIZED);
      return;
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const payload = authService.verifyAndDecode(token);
    if (!payload) {
      fail(401, 'Invalid token', BIZ_CODE.UNAUTHORIZED);
      return;
    }

    res.locals.auth = payload;
    next();
  };
};
