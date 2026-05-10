import path from 'node:path';

export default async function build(root, positional, flags) {
  const entryId = positional[0];
  if (!entryId) {
    console.error('Error: entry ID is required');
    console.error('Usage: dockit build <entry>');
    process.exit(1);
  }

  const { getDb } = await import(path.join(root, 'apps/server/src/db/index.js'));
  const { buildEntry } = await import(path.join(root, 'apps/server/src/services/buildPipeline.js'));
  const { getSources } = await import(path.join(root, 'apps/server/src/db/index.js'));

  const db = getDb();
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId);

  if (!entry) {
    console.error(`Entry not found: ${entryId}`);
    process.exit(1);
  }

  const sources = getSources(entryId);
  if (sources.length === 0) {
    console.error(`Entry "${entry.name}" has no sources configured.`);
    process.exit(1);
  }

  console.log(`Building documentation for ${entry.name} ${entry.version}...`);
  console.log('');

  const result = await buildEntry(entryId);
  console.log(`Build ${entryId}: ${result.status}`);
}
