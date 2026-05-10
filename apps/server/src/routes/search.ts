import { Router, Request, Response } from 'express';
import path from 'node:path';
import { searchIndex } from '../services/indexer.js';
import { DATA_ROOT } from '../services/paths.js';

const router = Router();

router.get('/entries/:id/search', (req: Request, res: Response) => {
  const q = (req.query.q as string) || '';
  if (!q) {
    res.json([]);
    return;
  }

  const indexPath = path.join(DATA_ROOT, req.params.id as string, 'index.json');
  const results = searchIndex(indexPath, q, 20);
  res.json(results);
});

export default router;
