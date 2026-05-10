import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { getDb, getSources } from '../db/index.js';
import type { Entry, ZipSourceConfig, AntoraSourceConfig, MavenSourceConfig, AsciidocSourceConfig } from '../types.js';
import { downloadAndExtractZip } from './zip.js';
import { buildAntoraSource } from './antora.js';
import { buildAsciidocSource } from './asciidoc.js';
import { downloadAndExtractMavenJar } from './maven.js';
import { normalizeDocs } from './normalizer.js';
import { buildSearchIndex } from './indexer.js';
import { DATA_ROOT } from './paths.js';

export interface BuildResult {
  buildId: string;
  entryId: string;
  status: 'ready' | 'error';
  log: string;
}

export async function buildEntry(entryId: string): Promise<BuildResult> {
  const db = getDb();
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as Entry | undefined;
  if (!entry) throw new Error(`Entry not found: ${entryId}`);

  const sources = getSources(entryId);
  if (sources.length === 0) throw new Error('Entry has no sources');

  const buildId = uuid();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO builds (id, entry_id, status, started_at) VALUES (?, ?, ?, ?)').run(buildId, entry.id, 'building', now);
  db.prepare('UPDATE entries SET status = ? WHERE id = ?').run('building', entry.id);

  const logLines: string[] = [];
  const log = (msg: string) => logLines.push(`[${new Date().toISOString()}] ${msg}`);
  log('Build started');

  const entryDir = path.join(DATA_ROOT, entry.id);
  const bundleDir = path.join(entryDir, 'bundle');

  try {
    const normalizedSources: Array<{ label: string; dir: string }> = [];

    for (const source of sources) {
      const sourceDir = path.join(entryDir, 'sources', source.id);
      log(`Processing source [${source.type}]: ${source.label}`);

      db.prepare('UPDATE sources SET status = ? WHERE id = ?').run('building', source.id);

      try {
        switch (source.type) {
          case 'zip': {
            const config = source.config as ZipSourceConfig;
            await downloadAndExtractZip(config, sourceDir, log);
            normalizedSources.push({ label: source.label, dir: sourceDir });
            break;
          }
          case 'maven': {
            const config = source.config as MavenSourceConfig;
            await downloadAndExtractMavenJar(config, sourceDir, log);
            normalizedSources.push({ label: source.label, dir: sourceDir });
            break;
          }
          case 'antora': {
            const config = source.config as AntoraSourceConfig;
            const workDir = path.join(entryDir, 'antora', source.id);
            const outputDir = await buildAntoraSource(config, entry.id, workDir, log);
            normalizedSources.push({ label: source.label, dir: outputDir });
            break;
          }
          case 'asciidoc': {
            const config = source.config as AsciidocSourceConfig;
            await buildAsciidocSource(config, sourceDir, log);
            normalizedSources.push({ label: source.label, dir: sourceDir });
            break;
          }
        }
        db.prepare('UPDATE sources SET status = ? WHERE id = ?').run('ready', source.id);
      } catch (err) {
        db.prepare('UPDATE sources SET status = ? WHERE id = ?').run('error', source.id);
        log(`  ERROR processing source ${source.label}: ${(err as Error).message}`);
        throw err;
      }
    }

    log('Normalizing documentation bundle');
    const htmlFiles = normalizeDocs(normalizedSources, bundleDir, log);

    log('Building search index');
    const indexPath = path.join(entryDir, 'index.json');
    buildSearchIndex(
      htmlFiles.map((f) => path.join(bundleDir, f)),
      indexPath,
      log
    );

    const now2 = new Date().toISOString();
    const fullLog = logLines.join('\n');
    db.prepare('UPDATE builds SET status = ?, log = ?, finished_at = ? WHERE id = ?').run('ready', fullLog, now2, buildId);
    db.prepare('UPDATE entries SET status = ? WHERE id = ?').run('ready', entry.id);

    return { buildId, entryId, status: 'ready', log: fullLog };
  } catch (err) {
    const now2 = new Date().toISOString();
    const fullLog = logLines.join('\n');
    db.prepare('UPDATE builds SET status = ?, log = ?, finished_at = ? WHERE id = ?').run('error', fullLog, now2, buildId);
    db.prepare('UPDATE entries SET status = ? WHERE id = ?').run('error', entry.id);

    return { buildId, entryId, status: 'error', log: fullLog };
  }
}
