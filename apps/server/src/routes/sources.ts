import { Router, Request, Response } from 'express';
import type { ConfigUseCase } from '../core/usecases/ConfigUseCase.js';
import type { SourceType } from '../core/domain/types.js';

const VALID_TYPES: SourceType[] = ['zip', 'antora', 'maven', 'asciidoc', 'github-markdown'];

function validateConfig(type: SourceType, config: Record<string, unknown>): string | null {
  switch (type) {
    case 'maven':
      if (!config.groupId || typeof config.groupId !== 'string') return 'groupId is required';
      if (!config.artifactId || typeof config.artifactId !== 'string') return 'artifactId is required';
      if (!config.version || typeof config.version !== 'string') return 'version is required';
      return null;
    case 'zip': {
      const hasUrl = config.url && typeof config.url === 'string';
      const hasLocalPath = config.localPath && typeof config.localPath === 'string';
      if (!hasUrl && !hasLocalPath) return 'url or localPath is required';
      return null;
    }
    case 'antora': {
      const hasRepoUrl = config.repoUrl && typeof config.repoUrl === 'string';
      const hasZipPath = config.zipPath && typeof config.zipPath === 'string';
      const hasLocalPath = config.localPath && typeof config.localPath === 'string';
      if (!hasRepoUrl && !hasZipPath && !hasLocalPath) return 'repoUrl, localPath, or zipPath is required';
      return null;
    }
    case 'asciidoc': {
      const hasRepoUrl = config.repoUrl && typeof config.repoUrl === 'string';
      const hasZipPath = config.zipPath && typeof config.zipPath === 'string';
      const hasLocalPath = config.localPath && typeof config.localPath === 'string';
      if (!hasRepoUrl && !hasZipPath && !hasLocalPath) return 'repoUrl, localPath, or zipPath is required';
      return null;
    }
    case 'github-markdown': {
      const hasRepoUrl = config.repoUrl && typeof config.repoUrl === 'string';
      const hasLocalPath = config.localPath && typeof config.localPath === 'string';
      if (!hasRepoUrl && !hasLocalPath) return 'repoUrl or localPath is required';
      return null;
    }
  }
}

export function createSourceRoutes(configUseCase: ConfigUseCase): Router {
  const router = Router({ mergeParams: true });

  router.post('/', async (req: Request, res: Response) => {
    const entryId = req.params.entryId as string;
    const entry = await configUseCase.getEntry(entryId);
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    const { type, label, config } = req.body as { type: SourceType; label: string; config: Record<string, unknown> };

    if (!type || !VALID_TYPES.includes(type)) {
      res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      return;
    }
    if (!label) {
      res.status(400).json({ error: 'label is required' });
      return;
    }
    const configError = validateConfig(type, config);
    if (configError) {
      res.status(400).json({ error: configError });
      return;
    }

    const source = await configUseCase.createSource(entryId, { type, label, config: config as any });
    res.status(201).json(source);
  });

  return router;
}

export function createSourceFlatRoutes(configUseCase: ConfigUseCase): Router {
  const router = Router();

  router.put('/:id', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const input = req.body as { label?: string; config?: Record<string, unknown> };
    await configUseCase.updateSource(id, input);
    const { SqliteSourceRepository } = await import('../infrastructure/persistence/sqlite/SqliteSourceRepository.js');
    const source = await new SqliteSourceRepository().findById(id);
    res.json(source);
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await configUseCase.deleteSource(id);
    res.json({ success: true });
  });

  return router;
}
