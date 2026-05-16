import path from 'node:path';
import { formatTable } from '../utils.js';

export default async function list(root, positional, flags) {
  const asJson = !!flags.json;

  const { getDb } = await import(path.join(root, 'apps/server/src/infrastructure/persistence/sqlite/connection.js'));
  const { SqliteEntryRepository } = await import(path.join(root, 'apps/server/src/infrastructure/persistence/sqlite/SqliteEntryRepository.js'));
  const { SqliteSourceRepository } = await import(path.join(root, 'apps/server/src/infrastructure/persistence/sqlite/SqliteSourceRepository.js'));

  const db = getDb();
  const entryRepo = new SqliteEntryRepository(db);
  const sourceRepo = new SqliteSourceRepository(db);

  const entries = await entryRepo.findAll();

  const output = [];
  for (const e of entries) {
    const sources = await sourceRepo.findByEntryId(e.id);
    output.push({
      id: e.id,
      name: e.name,
      version: e.version,
      description: e.description,
      status: e.status,
      sourceCount: sources.length,
    });
  }

  if (asJson) {
    console.log(JSON.stringify(output, null, 2));
  } else if (output.length === 0) {
    console.log('No documentation entries found.');
  } else {
    const headers = ['Name', 'Version', 'Status', 'Sources', 'ID'];
    const rows = output.map((e) => [
      e.name,
      e.version,
      e.status,
      String(e.sourceCount),
      e.id,
    ]);

    console.log(formatTable(headers, rows));
    console.log(`\n${output.length} entry/entries.`);
  }
}
