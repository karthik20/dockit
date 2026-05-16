import { Router, Request, Response } from 'express';
import type { ConfigUseCase } from '../core/usecases/ConfigUseCase.js';
import type { Entry, Source, Build } from '../core/domain/types.js';

export function createEntryRoutes(configUseCase: ConfigUseCase): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    const entries = await configUseCase.listEntries();
    res.json(entries);
  });

  router.get('/:id', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const entry = await configUseCase.getEntryWithSources(id);
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    const db = (await import('../infrastructure/persistence/sqlite/connection.js')).getDb();
    const latestBuild = db.prepare(
      'SELECT * FROM builds WHERE entry_id = ? ORDER BY started_at DESC LIMIT 1'
    ).get(id) as Build | undefined;
    res.json({ ...entry, latestBuild });
  });

  router.post('/', async (req: Request, res: Response) => {
    const { name, version, description } = req.body as { name: string; version: string; description?: string };
    if (!name || !version) {
      res.status(400).json({ error: 'name and version are required' });
      return;
    }
    const entry = await configUseCase.createEntry({ name, version, description });
    res.status(201).json(entry);
  });

  router.put('/:id', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const existing = await configUseCase.getEntry(id);
    if (!existing) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    const input = req.body as { name?: string; version?: string; description?: string };
    await configUseCase.updateEntry(id, input);
    const entry = await configUseCase.getEntry(id);
    res.json(entry);
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const existing = await configUseCase.getEntry(id);
    if (!existing) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    await configUseCase.deleteEntry(id);
    res.json({ success: true });
  });

  return router;
}
