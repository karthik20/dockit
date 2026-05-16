import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, initDb } from './infrastructure/persistence/sqlite/connection.js';
import { SqliteEntryRepository } from './infrastructure/persistence/sqlite/SqliteEntryRepository.js';
import { SqliteSourceRepository } from './infrastructure/persistence/sqlite/SqliteSourceRepository.js';
import { SqliteBuildRepository } from './infrastructure/persistence/sqlite/SqliteBuildRepository.js';
import { createSearchEngine } from './infrastructure/search/SearchEngineFactory.js';
import { SearchUseCase } from './core/usecases/SearchUseCase.js';
import { BuildUseCase } from './core/usecases/BuildUseCase.js';
import { ConfigUseCase } from './core/usecases/ConfigUseCase.js';
import { NotFoundError, ValidationError } from './core/domain/errors.js';
import { ZipSourceProcessor } from './infrastructure/source-processors/ZipSourceProcessor.js';
import { AntoraSourceProcessor } from './infrastructure/source-processors/AntoraSourceProcessor.js';
import { AsciidocSourceProcessor } from './infrastructure/source-processors/AsciidocSourceProcessor.js';
import { MavenSourceProcessor } from './infrastructure/source-processors/MavenSourceProcessor.js';
import { GithubMarkdownSourceProcessor } from './infrastructure/source-processors/GithubMarkdownSourceProcessor.js';
import { DocumentNormalizer } from './infrastructure/source-processors/DocumentNormalizer.js';
import { PathResolver } from './infrastructure/source-processors/PathResolver.js';
import { SqliteEntryReadModel } from './infrastructure/persistence/sqlite/SqliteEntryReadModel.js';
import { createEntryRoutes } from './routes/entries.js';
import { createSearchRoutes } from './routes/search.js';
import { createBuildRoutes } from './routes/build.js';
import { createSourceRoutes, createSourceFlatRoutes } from './routes/sources.js';
import viewerRoutes from './routes/viewer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const db = getDb();
  const entryRepo = new SqliteEntryRepository(db);
  const sourceRepo = new SqliteSourceRepository(db);
  const buildRepo = new SqliteBuildRepository(db);
  const entryReadModel = new SqliteEntryReadModel(db);
  const searchEngine = await createSearchEngine(entryReadModel);

  const configUseCase = new ConfigUseCase(entryRepo, sourceRepo);
  const searchUseCase = new SearchUseCase(searchEngine);

  const processors = [
    new ZipSourceProcessor(),
    new AntoraSourceProcessor(),
    new AsciidocSourceProcessor(),
    new MavenSourceProcessor(),
    new GithubMarkdownSourceProcessor(),
  ];
  const documentNormalizer = new DocumentNormalizer();
  const pathResolver = new PathResolver();

  const buildUseCase = new BuildUseCase(
    buildRepo, sourceRepo, entryRepo, searchEngine,
    processors, documentNormalizer, pathResolver,
  );

  app.use('/api/entries', createEntryRoutes(configUseCase));
  app.use('/api/entries/:entryId/sources', createSourceRoutes(configUseCase));
  app.use('/api/sources', createSourceFlatRoutes(configUseCase));
  app.use('/api', createBuildRoutes(buildUseCase, configUseCase, buildRepo));
  app.use('/api', createSearchRoutes(searchUseCase));
  app.use('/api', viewerRoutes);

  // Global error handler — catches domain errors thrown by use cases
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof ValidationError) {
      const body: Record<string, unknown> = { error: err.message, code: err.code };
      if (err.field) body.field = err.field;
      res.status(400).json(body);
      return;
    }
    console.error('Unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  app.listen(PORT, () => {
    console.log(`Dockit server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
