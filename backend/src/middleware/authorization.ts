import { NextFunction, Request, Response } from 'express';
import { BIZ_CODE } from '../constants/bizCode.js';

export const requireRole =
  (...allowedRoles: string[]) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    const auth = (res.locals.auth ?? {}) as { role?: string };
    const role = typeof auth.role === 'string' ? auth.role.trim() : '';
    if (role && allowedRoles.includes(role)) {
      next();
      return;
    }
    res.status(403).json({
      message: `Forbidden: requires role ${allowedRoles.join(', ')}`,
      bizCode: BIZ_CODE.FORBIDDEN
    });
  };
