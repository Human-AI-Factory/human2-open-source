import { Response, Router } from 'express';
import { z } from 'zod';
import { BIZ_CODE } from '../../constants/bizCode.js';
import { OrchestrationService } from './orchestration.service.js';

const runProjectSchema = z.object({
  chapterCount: z.number().int().min(1).max(20).optional()
});

export const buildOrchestrationRouter = (service: OrchestrationService): Router => {
  const router = Router();
  const fail = (res: Response, status: number, message: string, bizCode: string) =>
    res.status(status).json({ message, bizCode });

  router.post('/projects/:projectId/full-chain/run', async (req, res) => {
    const parsed = runProjectSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return fail(res, 400, 'Invalid payload', BIZ_CODE.INVALID_PAYLOAD);
    }

    const result = await service.runProjectFullChain(req.params.projectId, {
      chapterCount: parsed.data.chapterCount
    });
    if (!result) {
      return fail(res, 404, 'Novel not found or project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(201).json(result);
  });

  return router;
};
