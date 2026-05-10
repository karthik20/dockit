import { Router, Request, Response } from 'express';
import { getDb, getSource } from '../db/index.js';
import type { UpdateSourceInput } from '../types.js';

const router = Router();

router.put('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDb();
  const existing = getSource(id);
  if (!existing) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  const input = req.body as UpdateSourceInput;
  const label = input.label ?? existing.label;
  const config = input.config ? JSON.stringify(input.config) : JSON.stringify(existing.config);
  db.prepare('UPDATE sources SET label = ?, config = ? WHERE id = ?').run(label, config, id);
  const updated = getSource(id);
  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDb();
  const existing = getSource(id);
  if (!existing) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  db.prepare('DELETE FROM sources WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
