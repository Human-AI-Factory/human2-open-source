import { Router } from 'express';
import { ProjectsService } from '../projects/projects.service.js';

export const buildDashboardRouter = (service: ProjectsService): Router => {
  const router = Router();

  router.get('/summary', (_req, res) => {
    res.json(service.getSummary());
  });

  return router;
};
