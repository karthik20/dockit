import path from 'node:path';
import { formatTable } from '../utils.js';

export default async function list(root, positional, flags) {
  const asJson = !!flags.json;

  const { getDb } = await import(path.join(root, 'apps/server/src/db/index.js'));
  const { getSources } = await import(path.join(root, 'apps/server/src/db/index.js'));

  const db = getDb();
  const entries = db.prepare('SELECT id, name, version, description, status FROM entries ORDER BY name').all();

  const output = entries.map((e) => {
    const sources = getSources(e.id);
    return {
      id: e.id,
      name: e.name,
      version: e.version,
      description: e.description,
      status: e.status,
      sourceCount: sources.length,
    };
  });

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
