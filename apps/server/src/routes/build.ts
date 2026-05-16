import { Router, Request, Response } from 'express';
import type { BuildUseCase } from '../core/usecases/BuildUseCase.js';
import type { ConfigUseCase } from '../core/usecases/ConfigUseCase.js';
import type { Source, ZipSourceConfig, MavenSourceConfig, AntoraSourceConfig, AsciidocSourceConfig } from '../core/domain/types.js';

export function createBuildRoutes(buildUseCase: BuildUseCase, configUseCase: ConfigUseCase): Router {
  const router = Router();

  router.post('/entries/:id/build', async (req: Request, res: Response) => {
    const entryId = req.params.id as string;
    const entry = await configUseCase.getEntry(entryId);
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    const entryWithSources = await configUseCase.getEntryWithSources(entryId);
    if (!entryWithSources || entryWithSources.sources.length === 0) {
      res.status(400).json({ error: 'Entry has no sources' });
      return;
    }

    res.status(202).json({ buildId: 'pending', status: 'building' });

    buildUseCase.build(entryId).catch((err) => {
      console.error('Build error:', err);
    });
  });

  router.get('/entries/:id/build-status', async (req: Request, res: Response) => {
    const entryId = req.params.id as string;
    const db = (await import('../infrastructure/persistence/sqlite/connection.js')).getDb();
    const build = db.prepare(
      'SELECT * FROM builds WHERE entry_id = ? ORDER BY started_at DESC LIMIT 1'
    ).get(entryId) as { status: string; log: string; started_at: string; finished_at: string } | undefined;
    if (!build) {
      res.json({ status: 'none', log: '' });
      return;
    }
    res.json({ status: build.status, log: build.log, startedAt: build.started_at, finishedAt: build.finished_at });
  });

  router.get('/entries/:id/cli-script', async (req: Request, res: Response) => {
    const entryId = req.params.id as string;
    const entry = await configUseCase.getEntry(entryId);
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    const entryWithSources = await configUseCase.getEntryWithSources(entryId);
    const sources = entryWithSources?.sources ?? [];

    let script = `#!/bin/bash\n# Dockit build script for entry: ${entry.name} ${entry.version}\n# Generated: ${new Date().toISOString()}\nset -e\n\nAPI_URL="http://localhost:3001"\nENTRY_ID="${entry.id}"\n\necho "Building documentation for ${entry.name} ${entry.version}"\necho ""\n\n`;

    let stepNum = 1;
    for (const source of sources) {
      script += `# Step ${stepNum}: Process source "${source.label}" [${source.type}]\n`;
      switch (source.type) {
        case 'zip': {
          const config = source.config as ZipSourceConfig;
          script += `echo "  Downloading ZIP from ${config.url}..."\n`;
          script += `curl -o /tmp/dockit-source-${source.id}.zip "${config.url}"\n\n`;
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
          }
          break;
        }
        case 'asciidoc': {
          const config = source.config as AsciidocSourceConfig;
          if (config.repoUrl) {
            script += `echo "  Cloning repository: ${config.repoUrl}"\n`;
            script += `git clone --depth 1 "${config.repoUrl}" /tmp/dockit-asciidoc-${source.id}\n`;
            script += `npx asciidoctor -R /tmp/dockit-asciidoc-${source.id} $(find /tmp/dockit-asciidoc-${source.id} -name '*.adoc') 2>&1 || echo "Note: requires asciidoctor js"\n\n`;
          }
          break;
        }
      }
      stepNum++;
    }

    script += `echo ""\necho "To trigger server-side build, run:"\necho "  curl -X POST \\"$API_URL/api/entries/$ENTRY_ID/build\\""\n`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dockit-build-${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.sh"`);
    res.send(script);
  });

  return router;
}
