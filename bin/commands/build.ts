import path from 'node:path';

export default async function build(root, positional, flags) {
  const entryId = positional[0];
  if (!entryId) {
    console.error('Error: entry ID is required');
    console.error('Usage: dockit build <entry>');
    process.exit(1);
  }

  const { getDb } = await import(path.join(root, 'apps/server/src/infrastructure/persistence/sqlite/connection.js'));
  const { SqliteEntryRepository } = await import(path.join(root, 'apps/server/src/infrastructure/persistence/sqlite/SqliteEntryRepository.js'));
  const { SqliteSourceRepository } = await import(path.join(root, 'apps/server/src/infrastructure/persistence/sqlite/SqliteSourceRepository.js'));
  const { SqliteBuildRepository } = await import(path.join(root, 'apps/server/src/infrastructure/persistence/sqlite/SqliteBuildRepository.js'));
  const { createSearchEngine } = await import(path.join(root, 'apps/server/src/infrastructure/search/SearchEngineFactory.js'));
  const { ConfigUseCase } = await import(path.join(root, 'apps/server/src/core/usecases/ConfigUseCase.js'));
  const { BuildUseCase } = await import(path.join(root, 'apps/server/src/core/usecases/BuildUseCase.js'));
  const { loadConfig, syncConfigToDb } = await import(path.join(root, 'apps/server/src/services/configLoader.js'));

  // Ensure DB is initialized (getDb calls initDb internally)
  const db = getDb();

  // Sync config to DB
  const configPath = path.join(root, 'dockit.yaml');
  const config = loadConfig(configPath);
  syncConfigToDb(config);

  const entryRepo = new SqliteEntryRepository(db);
  const sourceRepo = new SqliteSourceRepository(db);
  const buildRepo = new SqliteBuildRepository(db);
  const searchEngine = await createSearchEngine(config.search?.engine);

  const configUseCase = new ConfigUseCase(entryRepo, sourceRepo);
  const buildUseCase = new BuildUseCase(buildRepo, sourceRepo, entryRepo, searchEngine);

  const entry = await configUseCase.getEntry(entryId);

  if (!entry) {
    console.error(`Entry not found: ${entryId}`);
    process.exit(1);
  }

  const entryWithSources = await configUseCase.getEntryWithSources(entryId);
  const sources = entryWithSources?.sources || [];
  if (sources.length === 0) {
    console.error(`Entry "${entry.name}" has no sources configured.`);
    process.exit(1);
  }

  console.log(`Building documentation for ${entry.name} ${entry.version}...`);
  console.log('');

  const result = await buildUseCase.build(entryId);
  console.log(`Build ${entryId}: ${result.status}`);
  if (result.status === 'error') {
    console.error(result.log);
    process.exit(1);
  }
}
