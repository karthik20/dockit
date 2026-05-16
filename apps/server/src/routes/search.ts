import { Router, Request, Response } from 'express';
import type { SearchUseCase } from '../core/usecases/SearchUseCase.js';

export function createSearchRoutes(searchUseCase: SearchUseCase): Router {
  const router = Router();

  router.get('/entries/:id/search', async (req: Request, res: Response) => {
    const q = (req.query.q as string) || '';
    if (!q) {
      res.json([]);
      return;
    }
    const results = await searchUseCase.searchEntry(req.params.id as string, q, 20);
    res.json(results);
  });

  router.get('/search', async (req: Request, res: Response) => {
    const q = (req.query.q as string) || '';
    if (!q) {
      res.json([]);
      return;
    }
    const results = await searchUseCase.globalSearch(q, 30);
    res.json(results);
  });

  return router;
}
