import { Response } from 'express';
import { z } from 'zod';
import { BIZ_CODE } from '../constants/bizCode.js';

type FailHandler = (res: Response, status: number, message: string, bizCode: string) => Response;

const parseWithSchema = <S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  res: Response,
  fail: FailHandler,
  mode: 'query' | 'payload'
): z.infer<S> | null => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    if (mode === 'query') {
      fail(res, 400, 'Invalid query', BIZ_CODE.INVALID_QUERY);
    } else {
      fail(res, 400, 'Invalid payload', BIZ_CODE.INVALID_PAYLOAD);
    }
    return null;
  }
  return parsed.data;
};

export const parseQuery = <S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  res: Response,
  fail: FailHandler
): z.infer<S> | null => parseWithSchema(schema, input, res, fail, 'query');

export const parsePayload = <S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  res: Response,
  fail: FailHandler
): z.infer<S> | null => parseWithSchema(schema, input, res, fail, 'payload');
