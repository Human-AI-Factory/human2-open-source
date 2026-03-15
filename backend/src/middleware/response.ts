import { NextFunction, Request, Response } from 'express';
import { BIZ_CODE } from '../constants/bizCode.js';
import { getRequestContext } from './request-context.js';

type Envelope<T> = {
  code: number;
  bizCode: string;
  data: T;
  message: string;
};

type ResponseWithEnvelopeMeta = Response & {
  locals: Response['locals'] & {
    responseBizCode?: string;
  };
};

const isEnvelope = (payload: unknown): payload is Envelope<unknown> => {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const data = payload as Record<string, unknown>;
  return 'code' in data && 'bizCode' in data && 'data' in data && 'message' in data;
};

const statusToBizCode = (status: number): string => {
  if (status >= 500) return BIZ_CODE.INTERNAL_ERROR;
  if (status === 429) return BIZ_CODE.PROVIDER_RATE_LIMITED;
  if (status === 409) return BIZ_CODE.CONFLICT;
  if (status === 404) return BIZ_CODE.NOT_FOUND;
  if (status === 403) return BIZ_CODE.FORBIDDEN;
  if (status === 401) return BIZ_CODE.UNAUTHORIZED;
  if (status >= 400) return BIZ_CODE.INVALID_PAYLOAD;
  return BIZ_CODE.OK;
};

const isApiRequest = (req: Request): boolean => {
  const candidates = [req.originalUrl, req.baseUrl, req.path]
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  return candidates.some((value) => value === '/api' || value.startsWith('/api/'));
};

export const responseEnvelopeMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const rawJson = res.json.bind(res);
  const response = res as ResponseWithEnvelopeMeta;

  res.json = ((payload: unknown) => {
    if (!isApiRequest(req)) {
      return rawJson(payload);
    }

    const requestContext = getRequestContext(res);
    if (requestContext) {
      res.setHeader('x-request-id', requestContext.requestId);
      res.setHeader('x-api-duration-ms', String(Math.max(0, Date.now() - requestContext.startedAtMs)));
    }

    if (isEnvelope(payload)) {
      response.locals.responseBizCode = payload.bizCode;
      return rawJson(payload);
    }

    const status = res.statusCode;
    const ok = status < 400;
    if (ok) {
      const envelope = {
        code: status,
        bizCode: BIZ_CODE.OK,
        data: payload ?? null,
        message: '成功'
      } satisfies Envelope<unknown>;
      response.locals.responseBizCode = envelope.bizCode;
      return rawJson(envelope);
    }

    const message =
      payload && typeof payload === 'object' && 'message' in payload && typeof (payload as { message?: unknown }).message === 'string'
        ? String((payload as { message: string }).message)
        : '失败';

    const bizCode =
      payload && typeof payload === 'object' && 'bizCode' in payload && typeof (payload as { bizCode?: unknown }).bizCode === 'string'
        ? String((payload as { bizCode: string }).bizCode)
        : statusToBizCode(status);

    const envelope = {
      code: status,
      bizCode,
      data: null,
      message
    } satisfies Envelope<null>;
    response.locals.responseBizCode = envelope.bizCode;
    return rawJson(envelope);
  }) as Response['json'];

  next();
};

export const getResponseBizCode = (res: Response): string | null => {
  const response = res as ResponseWithEnvelopeMeta;
  return typeof response.locals.responseBizCode === 'string' ? response.locals.responseBizCode : null;
};
