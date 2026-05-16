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
  const searchEngine = await createSearchEngine();

  const configUseCase = new ConfigUseCase(entryRepo, sourceRepo);
  const searchUseCase = new SearchUseCase(searchEngine);
  const buildUseCase = new BuildUseCase(buildRepo, sourceRepo, entryRepo, searchEngine);

  app.use('/api/entries', createEntryRoutes(configUseCase));
  app.use('/api/entries/:entryId/sources', createSourceRoutes(configUseCase));
  app.use('/api/sources', createSourceFlatRoutes(configUseCase));
  app.use('/api', createBuildRoutes(buildUseCase, configUseCase));
  app.use('/api', createSearchRoutes(searchUseCase));
  app.use('/api', viewerRoutes);

  app.listen(PORT, () => {
    console.log(`Dockit server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
