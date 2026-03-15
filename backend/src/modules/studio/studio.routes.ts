import { Response, Router } from 'express';
import { z } from 'zod';
import { BIZ_CODE } from '../../constants/bizCode.js';
import { withAsyncRoute } from '../../utils/async-route.js';
import { parsePayload } from '../../utils/validation.js';
import { StudioService } from './studio.service.js';

const novelSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1)
});

const generateOutlineSchema = z.object({
  chapterCount: z.number().int().min(1).max(20).optional(),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional()
});

const generateScriptSchema = z.object({
  outlineId: z.string().min(1),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional()
});

const generateNovelSchema = z.object({
  title: z.string().min(1).optional(),
  idea: z.string().min(1),
  targetLength: z.number().int().min(400).max(6000).optional(),
  modelId: z.string().min(1).optional(),
  customModel: z.string().min(1).optional()
});

export const buildStudioRouter = (service: StudioService): Router => {
  const router = Router();
  const fail = (res: Response, status: number, message: string, bizCode: string) =>
    res.status(status).json({ message, bizCode });

  const resolveProjectId = (params: { projectId?: string; dramaId?: string }): string | null => {
    if (params.projectId) {
      return params.projectId;
    }
    if (params.dramaId) {
      return service.resolveProjectIdByDrama(params.dramaId);
    }
    return null;
  };

  const getNovelHandler = (req: { params: { projectId?: string; dramaId?: string } }, res: Response) => {
    const projectId = resolveProjectId(req.params);
    if (!projectId) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    const novel = service.getNovel(projectId);
    if (!novel) {
      return fail(res, 404, 'Novel not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(novel);
  };

  router.get('/projects/:projectId/novel', getNovelHandler);
  router.get('/dramas/:dramaId/novel', getNovelHandler);

  const saveNovelHandler = (req: { params: { projectId?: string; dramaId?: string }; body: unknown }, res: Response) => {
    const projectId = resolveProjectId(req.params);
    if (!projectId) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    const payload = parsePayload(novelSchema, req.body, res, fail);
    if (!payload) {
      return;
    }

    const novel = service.saveNovel(projectId, payload);
    if (!novel) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(novel);
  };

  router.put('/projects/:projectId/novel', saveNovelHandler);
  router.put('/dramas/:dramaId/novel', saveNovelHandler);

  const generateNovelHandler = withAsyncRoute(async (req: { params: { projectId?: string; dramaId?: string }; body: unknown }, res: Response) => {
    const projectId = resolveProjectId(req.params);
    if (!projectId) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    const payload = parsePayload(generateNovelSchema, req.body, res, fail);
    if (!payload) {
      return;
    }

    const novel = await service.generateNovel(projectId, payload);
    if (!novel) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(201).json(novel);
  });

  router.post('/projects/:projectId/novel/generate', generateNovelHandler);
  router.post('/dramas/:dramaId/novel/generate', generateNovelHandler);

  const listOutlinesHandler = (req: { params: { projectId?: string; dramaId?: string } }, res: Response) => {
    const projectId = resolveProjectId(req.params);
    if (!projectId) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    const outlines = service.listOutlines(projectId);
    if (!outlines) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(outlines);
  };

  router.get('/projects/:projectId/outlines', listOutlinesHandler);
  router.get('/dramas/:dramaId/outlines', listOutlinesHandler);

  const generateOutlinesHandler = withAsyncRoute(async (req: { params: { projectId?: string; dramaId?: string }; body: unknown }, res: Response) => {
    const projectId = resolveProjectId(req.params);
    if (!projectId) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    const payload = parsePayload(generateOutlineSchema, req.body ?? {}, res, fail);
    if (!payload) {
      return;
    }

    const generated = await service.generateOutlinesWithMeta(projectId, payload);
    if (!generated) {
      return fail(res, 404, 'Novel not found or project not found', BIZ_CODE.NOT_FOUND);
    }

    return res.json(generated);
  });

  router.post('/projects/:projectId/outlines/generate', generateOutlinesHandler);
  router.post('/dramas/:dramaId/outlines/generate', generateOutlinesHandler);

  const listScriptsHandler = (req: { params: { projectId?: string; dramaId?: string } }, res: Response) => {
    const projectId = resolveProjectId(req.params);
    if (!projectId) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    const scripts = service.listScripts(projectId);
    if (!scripts) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(scripts);
  };

  router.get('/projects/:projectId/scripts', listScriptsHandler);
  router.get('/dramas/:dramaId/scripts', listScriptsHandler);

  const generateScriptHandler = withAsyncRoute(async (req: { params: { projectId?: string; dramaId?: string }; body: unknown }, res: Response) => {
    const projectId = resolveProjectId(req.params);
    if (!projectId) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    const payload = parsePayload(generateScriptSchema, req.body, res, fail);
    if (!payload) {
      return;
    }

    const generated = await service.generateScriptWithMeta(projectId, payload);
    if (!generated) {
      return fail(res, 404, 'Outline not found', BIZ_CODE.NOT_FOUND);
    }

    return res.status(201).json(generated);
  });

  router.post('/projects/:projectId/scripts/generate', generateScriptHandler);
  router.post('/dramas/:dramaId/scripts/generate', generateScriptHandler);

  return router;
};
