import { Router, Request, Response } from 'express';

import path from 'node:path';
import fs from 'node:fs';
import { DATA_ROOT } from '../services/paths.js';

const router = Router();

router.use('/bundle/:entryId', (req: Request, res: Response) => {
  const entryId = req.params.entryId as string;
  const filePath = req.path.replace(/^\//, '') || 'index.html';
  const dataDir = path.join(DATA_ROOT, entryId, 'bundle');
  const fullPath = path.join(dataDir, filePath);

  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Documentation not built yet' });
    return;
  }

  res.sendFile(fullPath);
});

export default router;
