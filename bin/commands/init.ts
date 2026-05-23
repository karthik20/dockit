import path from 'node:path';
import fs from 'node:fs';

export default async function init(root, positional, flags) {
  const sourcePath = path.resolve(flags.path || flags.dir || '.');
  const name = flags.name || path.basename(sourcePath);
  const version = flags.version || '1.0';
  const codePath = flags['code-path'] || '';
  const entryId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';

  if (!fs.existsSync(sourcePath)) {
    console.error(`Path not found: ${sourcePath}`);
    process.exit(1);
  }
  if (!fs.statSync(sourcePath).isDirectory()) {
    console.error(`Path must be a directory: ${sourcePath}`);
    process.exit(1);
  }

  console.log(`Initializing dockit for ${name} ${version}`);
  console.log(`  Source: ${sourcePath}`);
  console.log(`  Entry:  ${entryId}`);
  console.log('');

  const { getDb } = await import(path.join(root, 'apps/server/src/infrastructure/persistence/sqlite/connection.js'));
  const { SqliteEntryRepository } = await import(path.join(root, 'apps/server/src/infrastructure/persistence/sqlite/SqliteEntryRepository.js'));
  const { SqliteSourceRepository } = await import(path.join(root, 'apps/server/src/infrastructure/persistence/sqlite/SqliteSourceRepository.js'));
  const { SqliteBuildRepository } = await import(path.join(root, 'apps/server/src/infrastructure/persistence/sqlite/SqliteBuildRepository.js'));
  const { SqliteEntryReadModel } = await import(path.join(root, 'apps/server/src/infrastructure/persistence/sqlite/SqliteEntryReadModel.js'));
  const { createSearchEngine } = await import(path.join(root, 'apps/server/src/infrastructure/search/SearchEngineFactory.js'));
  const { ConfigUseCase } = await import(path.join(root, 'apps/server/src/core/usecases/ConfigUseCase.js'));
  const { BuildUseCase } = await import(path.join(root, 'apps/server/src/core/usecases/BuildUseCase.js'));
  const { GithubMarkdownSourceProcessor } = await import(path.join(root, 'apps/server/src/infrastructure/source-processors/GithubMarkdownSourceProcessor.js'));
  const { SourceCodeSourceProcessor } = await import(path.join(root, 'apps/server/src/infrastructure/source-processors/SourceCodeSourceProcessor.js'));
  const { DocumentNormalizer } = await import(path.join(root, 'apps/server/src/infrastructure/source-processors/DocumentNormalizer.js'));
  const { PathResolver } = await import(path.join(root, 'apps/server/src/infrastructure/source-processors/PathResolver.js'));
  const { ZipSourceProcessor } = await import(path.join(root, 'apps/server/src/infrastructure/source-processors/ZipSourceProcessor.js'));
  const { AntoraSourceProcessor } = await import(path.join(root, 'apps/server/src/infrastructure/source-processors/AntoraSourceProcessor.js'));
  const { AsciidocSourceProcessor } = await import(path.join(root, 'apps/server/src/infrastructure/source-processors/AsciidocSourceProcessor.js'));
  const { MavenSourceProcessor } = await import(path.join(root, 'apps/server/src/infrastructure/source-processors/MavenSourceProcessor.js'));
  const { loadConfig } = await import(path.join(root, 'apps/server/src/services/configLoader.js'));

  const db = getDb();
  const entryRepo = new SqliteEntryRepository(db);
  const sourceRepo = new SqliteSourceRepository(db);
  const buildRepo = new SqliteBuildRepository(db);
  const configUseCase = new ConfigUseCase(entryRepo, sourceRepo);

  const existing = await configUseCase.getEntry(entryId);
  if (existing) {
    console.log(`Removing existing entry "${entryId}"...`);
    const sources = await sourceRepo.findByEntryId(entryId);
    for (const s of sources) await sourceRepo.delete(s.id);
    await entryRepo.delete(entryId);
  }

  const now = new Date().toISOString();
  await entryRepo.save({
    id: entryId, name, version,
    description: `${name} source code and documentation`,
    status: 'pending', created_at: now, updated_at: now,
  });

  const label = path.basename(sourcePath);
  const sourceCodeId = `${entryId}-src-code`;
  const markdownId = `${entryId}-src-md`;

  await sourceRepo.save({
    id: sourceCodeId, entry_id: entryId,
    type: 'source-code', label: `${label} Code`,
    config: { localPath: sourcePath, sourcePath: codePath || undefined },
    status: 'pending', created_at: now,
  });
  console.log(`  + Source Code: ${codePath ? path.join(sourcePath, codePath) : sourcePath}`);

  await sourceRepo.save({
    id: markdownId, entry_id: entryId,
    type: 'github-markdown', label: `${label} Markdown`,
    config: { localPath: sourcePath },
    status: 'pending', created_at: now,
  });
  console.log(`  + Markdown Docs: ${sourcePath}`);

  console.log('');
  console.log('Building...');
  console.log('');

  const config = loadConfig(path.join(root, 'dockit.yaml'));
  const entryReadModel = new SqliteEntryReadModel(db);
  const searchEngine = await createSearchEngine(entryReadModel, config.search?.engine);

  const processors = [
    new ZipSourceProcessor(),
    new AntoraSourceProcessor(),
    new AsciidocSourceProcessor(),
    new MavenSourceProcessor(),
    new GithubMarkdownSourceProcessor(),
    new SourceCodeSourceProcessor(),
  ];
  const documentNormalizer = new DocumentNormalizer();
  const pathResolver = new PathResolver();
  const buildUseCase = new BuildUseCase(
    buildRepo, sourceRepo, entryRepo, searchEngine,
    processors, documentNormalizer, pathResolver,
  );

  const result = await buildUseCase.build(entryId);
  console.log(`Build ${entryId}: ${result.status}`);
  if (result.status === 'error') {
    console.error(result.log);
    process.exit(1);
  }

  console.log('');
  console.log(`Entry "${name}" (${entryId}) is ready.`);
  console.log('');
  console.log('Search docs:  dockit search ' + entryId + ' "<query>"');
  console.log('Graph query:  dockit graph query ' + entryId + ' "<query>"');
  console.log('God nodes:    dockit graph gods ' + entryId);
  console.log('Web UI:       http://localhost:5173/entries/' + entryId);
}
