import { Response, Router } from 'express';
import { z } from 'zod';
import { BIZ_CODE } from '../../constants/bizCode.js';
import { parsePayload, parseQuery } from '../../utils/validation.js';
import { ProjectsService } from './projects.service.js';

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional()
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional()
});

const createTaskSchema = z.object({
  title: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueAt: z.string().datetime().nullable().optional()
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(['todo', 'doing', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueAt: z.string().datetime().nullable().optional()
});

const pageQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name']).optional(),
  order: z.enum(['asc', 'desc']).optional()
});

const taskPageQuerySchema = pageQuerySchema.extend({
  status: z.enum(['todo', 'doing', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title', 'status', 'priority', 'dueAt']).optional()
});

const workflowListQuerySchema = z.object({
  projectIds: z.string().min(1)
});

export const buildProjectsRouter = (service: ProjectsService): Router => {
  const router = Router();
  const fail = (res: Response, status: number, message: string, bizCode: string) =>
    res.status(status).json({ message, bizCode });

  router.get('/', (req, res) => {
    const query = parseQuery(pageQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    return res.json(service.listProjects(query));
  });

  router.get('/:projectId', (req, res) => {
    const project = service.getProject(req.params.projectId);
    if (!project) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(project);
  });

  router.get('/:projectId/workflow', (req, res) => {
    const workflow = service.getProjectWorkflow(req.params.projectId);
    if (!workflow) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(workflow);
  });

  router.get('/workflow/list', (req, res) => {
    const query = parseQuery(workflowListQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }
    const ids = query.projectIds
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 50);
    return res.json(service.listProjectWorkflows(ids));
  });

  router.post('/', (req, res) => {
    const payload = parsePayload(createProjectSchema, req.body, res, fail);
    if (!payload) {
      return;
    }

    const project = service.createProject(payload);
    return res.status(201).json(project);
  });

  router.patch('/:projectId', (req, res) => {
    const payload = parsePayload(updateProjectSchema, req.body, res, fail);
    if (!payload) {
      return;
    }

    const project = service.updateProject(req.params.projectId, payload);
    if (!project) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(project);
  });

  router.delete('/:projectId', (req, res) => {
    const ok = service.deleteProject(req.params.projectId);
    if (!ok) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(204).send();
  });

  router.post('/:projectId/tasks', (req, res) => {
    const payload = parsePayload(createTaskSchema, req.body, res, fail);
    if (!payload) {
      return;
    }

    const task = service.createTask(req.params.projectId, payload);
    if (!task) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }

    return res.status(201).json(task);
  });

  router.get('/:projectId/tasks', (req, res) => {
    const query = parseQuery(taskPageQuerySchema, req.query, res, fail);
    if (!query) {
      return;
    }

    const result = service.listTasks(req.params.projectId, query);
    if (!result) {
      return fail(res, 404, 'Project not found', BIZ_CODE.NOT_FOUND);
    }
    return res.json(result);
  });

  router.patch('/:projectId/tasks/:taskId', (req, res) => {
    const payload = parsePayload(updateTaskSchema, req.body, res, fail);
    if (!payload) {
      return;
    }

    const task = service.updateTask(req.params.projectId, req.params.taskId, payload);
    if (!task) {
      return fail(res, 404, 'Project or task not found', BIZ_CODE.NOT_FOUND);
    }

    return res.json(task);
  });

  router.delete('/:projectId/tasks/:taskId', (req, res) => {
    const ok = service.deleteTask(req.params.projectId, req.params.taskId);
    if (!ok) {
      return fail(res, 404, 'Project or task not found', BIZ_CODE.NOT_FOUND);
    }
    return res.status(204).send();
  });

  return router;
};
