import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export type RequestContext = {
  requestId: string;
  startedAtMs: number;
  source: 'client' | 'generated';
};

type ResponseWithRequestContext = Response & {
  locals: Response['locals'] & {
    requestContext?: RequestContext;
  };
};

export const getRequestContext = (res: Response): RequestContext | null => {
  const response = res as ResponseWithRequestContext;
  return response.locals.requestContext ?? null;
};

export const requestContextMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incomingId = req.header('x-request-id');
  const requestId = typeof incomingId === 'string' && incomingId.trim().length > 0 ? incomingId.trim() : randomUUID();
  const source: RequestContext['source'] = incomingId && incomingId.trim().length > 0 ? 'client' : 'generated';
  const response = res as ResponseWithRequestContext;

  response.locals.requestContext = {
    requestId,
    startedAtMs: Date.now(),
    source
  };
  res.setHeader('x-request-id', requestId);

  next();
};
