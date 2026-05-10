import { Router, Request, Response } from 'express';
import { getDb, getSources } from '../db/index.js';
import type { Entry, Build, ZipSourceConfig, AntoraSourceConfig, MavenSourceConfig, AsciidocSourceConfig } from '../types.js';
import { buildEntry } from '../services/buildPipeline.js';

const router = Router();

router.post('/entries/:id/build', async (req: Request, res: Response) => {
  const entryId = req.params.id as string;
  const db = getDb();
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as Entry | undefined;
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  const sources = getSources(entryId);
  if (sources.length === 0) {
    res.status(400).json({ error: 'Entry has no sources' });
    return;
  }

  res.status(202).json({ buildId: 'pending', status: 'building' });

  buildEntry(entryId).catch((err) => {
    console.error('Build error:', err);
  });
});

router.get('/entries/:id/build-status', (req: Request, res: Response) => {
  const entryId = req.params.id as string;
  const db = getDb();
  const build = db.prepare('SELECT * FROM builds WHERE entry_id = ? ORDER BY started_at DESC LIMIT 1').get(entryId) as Build | undefined;
  if (!build) {
    res.json({ status: 'none', log: '' });
    return;
  }
  res.json({ status: build.status, log: build.log, startedAt: build.started_at, finishedAt: build.finished_at });
});

router.get('/entries/:id/cli-script', (req: Request, res: Response) => {
  const entryId = req.params.id as string;
  const db = getDb();
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as Entry | undefined;
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  const sources = getSources(entryId);

  let script = `#!/bin/bash
# Dockit build script for entry: ${entry.name} ${entry.version}
# Generated: ${new Date().toISOString()}
set -e

API_URL="http://localhost:3001"
ENTRY_ID="${entry.id}"

echo "Building documentation for ${entry.name} ${entry.version}"
echo ""

`;

  let stepNum = 1;

  for (const source of sources) {
    script += `# Step ${stepNum}: Process source "${source.label}" [${source.type}]\n`;

    switch (source.type) {
      case 'zip': {
        const config = source.config as ZipSourceConfig;
        script += `echo "  Downloading ZIP from ${config.url}..."\n`;
        script += `curl -o /tmp/dockit-source-${source.id}.zip "${config.url}"\n`;
        script += `# Extraction and processing would be handled by the dockit server\n\n`;
        break;
      }
      case 'maven': {
        const config = source.config as MavenSourceConfig;
        const groupPath = config.groupId.replace(/\./g, '/');
        const classifier = config.classifier || 'javadoc';
        const mavenUrl = `https://repo1.maven.org/maven2/${groupPath}/${config.artifactId}/${config.version}/${config.artifactId}-${config.version}-${classifier}.jar`;
        script += `echo "  Downloading Maven artifact: ${config.groupId}:${config.artifactId}:${config.version}"\n`;
        script += `curl -o /tmp/dockit-source-${source.id}.jar "${mavenUrl}"\n\n`;
        break;
      }
      case 'antora': {
        const config = source.config as AntoraSourceConfig;
        if (config.repoUrl) {
          script += `echo "  Cloning repository: ${config.repoUrl}"\n`;
          script += `git clone --depth 1 "${config.repoUrl}" /tmp/dockit-antora-${source.id}\n`;
          script += `pushd /tmp/dockit-antora-${source.id}\n`;
          script += `npx antora --to-dir /tmp/dockit-antora-output-${source.id} playbook.yml 2>&1 || echo "Note: run 'npx antora generate-playbook' first if needed"\n`;
          script += `popd\n\n`;
        } else if (config.zipPath) {
          script += `echo "  Extracting local ZIP: ${config.zipPath}"\n`;
          script += `mkdir -p /tmp/dockit-antora-${source.id}\n`;
          script += `unzip -o "${config.zipPath}" -d /tmp/dockit-antora-${source.id}\n\n`;
        }
        break;
      }
      case 'asciidoc': {
        const config = source.config as AsciidocSourceConfig;
        if (config.repoUrl) {
          script += `echo "  Cloning repository: ${config.repoUrl}"\n`;
          script += `git clone --depth 1 "${config.repoUrl}" /tmp/dockit-asciidoc-${source.id}\n`;
          script += `npx asciidoctor -R /tmp/dockit-asciidoc-${source.id} $(find /tmp/dockit-asciidoc-${source.id} -name '*.adoc') 2>&1 || echo "Note: requires asciidoctor js"\n\n`;
        } else if (config.zipPath) {
          script += `echo "  Extracting local ZIP: ${config.zipPath}"\n`;
          script += `unzip -o "${config.zipPath}" -d /tmp/dockit-asciidoc-${source.id}\n`;
        }
        break;
      }
    }
    stepNum++;
  }

  script += `echo ""\n`;
  script += `echo "To trigger server-side build, run:"\n`;
  script += `echo "  curl -X POST \\"$API_URL/api/entries/$ENTRY_ID/build\\""\n`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dockit-build-${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.sh"`);
  res.send(script);
});

export default router;
