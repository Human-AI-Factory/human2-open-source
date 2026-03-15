import type { NextFunction, Response } from 'express';

export const withAsyncRoute = <TReq>(
  handler: (req: TReq, res: Response) => Promise<unknown>
) => {
  return (req: TReq, res: Response, next: NextFunction): void => {
    void handler(req, res).catch(next);
  };
};
