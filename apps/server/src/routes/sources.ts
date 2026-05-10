import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb, getSources, getSource } from '../db/index.js';
import type { Source, Entry, CreateSourceInput, UpdateSourceInput, SourceType } from '../types.js';

const router = Router({ mergeParams: true });

const VALID_TYPES: SourceType[] = ['zip', 'antora', 'maven', 'asciidoc'];

function validateMavenConfig(config: Record<string, unknown>): string | null {
  if (!config.groupId || typeof config.groupId !== 'string') return 'groupId is required';
  if (!config.artifactId || typeof config.artifactId !== 'string') return 'artifactId is required';
  if (!config.version || typeof config.version !== 'string') return 'version is required';
  return null;
}

function validateZipConfig(config: Record<string, unknown>): string | null {
  const hasUrl = config.url && typeof config.url === 'string';
  const hasLocalPath = config.localPath && typeof config.localPath === 'string';
  if (!hasUrl && !hasLocalPath) return 'url or localPath is required';
  return null;
}

function validateAntoraConfig(config: Record<string, unknown>): string | null {
  const hasRepoUrl = config.repoUrl && typeof config.repoUrl === 'string';
  const hasZipPath = config.zipPath && typeof config.zipPath === 'string';
  const hasLocalPath = config.localPath && typeof config.localPath === 'string';
  if (!hasRepoUrl && !hasZipPath && !hasLocalPath) return 'repoUrl, localPath, or zipPath is required';
  return null;
}

function validateAsciidocConfig(config: Record<string, unknown>): string | null {
  const hasRepoUrl = config.repoUrl && typeof config.repoUrl === 'string';
  const hasZipPath = config.zipPath && typeof config.zipPath === 'string';
  const hasLocalPath = config.localPath && typeof config.localPath === 'string';
  if (!hasRepoUrl && !hasZipPath && !hasLocalPath) return 'repoUrl, localPath, or zipPath is required';
  return null;
}

function validateConfig(type: SourceType, config: Record<string, unknown>): string | null {
  switch (type) {
    case 'maven': return validateMavenConfig(config);
    case 'zip': return validateZipConfig(config);
    case 'antora': return validateAntoraConfig(config);
    case 'asciidoc': return validateAsciidocConfig(config);
  }
}

router.post('/', (req: Request, res: Response) => {
  const entryId = req.params.entryId as string;
  const db = getDb();
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as Entry | undefined;
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  const { type, label, config } = req.body as CreateSourceInput;

  if (!type || !VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    return;
  }
  if (!label) {
    res.status(400).json({ error: 'label is required' });
    return;
  }
  const configError = validateConfig(type, config as Record<string, unknown>);
  if (configError) {
    res.status(400).json({ error: configError });
    return;
  }

  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO sources (id, entry_id, type, label, config, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, entryId, type, label, JSON.stringify(config), now);
  const source = getSource(id);
  res.status(201).json(source);
});

export default router;
