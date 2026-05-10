import { Router, Request, Response } from 'express';
import path from 'node:path';
import { searchIndex } from '../services/indexer.js';
import { DATA_ROOT } from '../services/paths.js';
import { getDb } from '../db/index.js';

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

router.get('/search', (req: Request, res: Response) => {
  const q = (req.query.q as string) || '';
  if (!q) {
    res.json([]);
    return;
  }

  const db = getDb();
  const readyEntries = db.prepare("SELECT id, name, version FROM entries WHERE status = 'ready' ORDER BY name").all() as { id: string; name: string; version: string }[];

  const allResults: Array<Record<string, unknown>> = [];
  for (const entry of readyEntries) {
    const indexPath = path.join(DATA_ROOT, entry.id, 'index.json');
    const results = searchIndex(indexPath, q, 10);
    for (const r of results) {
      allResults.push({
        entryId: entry.id,
        entryName: entry.name,
        entryVersion: entry.version,
        ...r,
      });
    }
  }

  allResults.sort((a, b) => ((b as any).score || 0) - ((a as any).score || 0));
  res.json(allResults.slice(0, 30));
});

export default router;
