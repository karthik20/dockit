import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb, getSources } from '../db/index.js';
import type { Entry, Source, CreateEntryInput, UpdateEntryInput } from '../types.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT e.*, COUNT(s.id) as source_count
    FROM entries e
    LEFT JOIN sources s ON s.entry_id = e.id
    GROUP BY e.id
    ORDER BY e.created_at DESC
  `).all() as (Entry & { source_count: number })[];
  res.json(rows);
});

router.get('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDb();
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Entry | undefined;
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }
  const sources = getSources(id);
  const latestBuild = db.prepare('SELECT * FROM builds WHERE entry_id = ? ORDER BY started_at DESC LIMIT 1').get(id);
  res.json({ ...entry, sources, latestBuild });
});

router.post('/', (req: Request, res: Response) => {
  const { name, version, description } = req.body as CreateEntryInput;
  if (!name || !version) {
    res.status(400).json({ error: 'name and version are required' });
    return;
  }
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO entries (id, name, version, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, version, description || '', now, now);
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Entry;
  res.status(201).json(entry);
});

router.put('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Entry | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }
  const input = req.body as UpdateEntryInput;
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE entries SET name = ?, version = ?, description = ?, updated_at = ? WHERE id = ?'
  ).run(
    input.name ?? existing.name,
    input.version ?? existing.version,
    input.description ?? existing.description,
    now,
    id,
  );
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Entry;
  res.json(entry);
});

router.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Entry | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }
  db.prepare('DELETE FROM entries WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
