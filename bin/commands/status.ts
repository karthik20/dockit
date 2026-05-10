import path from 'node:path';

export default async function status(root, positional, flags) {
  const entryId = positional[0];
  if (!entryId) {
    console.error('Error: entry ID is required');
    console.error('Usage: dockit status <entry>');
    process.exit(1);
  }

  const { getDb } = await import(path.join(root, 'apps/server/src/db/index.js'));
  const asJson = !!flags.json;

  const db = getDb();
  const build = db.prepare('SELECT * FROM builds WHERE entry_id = ? ORDER BY started_at DESC LIMIT 1').get(entryId);

  if (!build) {
    if (asJson) {
      console.log(JSON.stringify({ status: 'none', message: 'No builds found' }, null, 2));
    } else {
      console.log(`No builds found for entry: ${entryId}`);
    }
    return;
  }

  if (asJson) {
    console.log(JSON.stringify({
      status: build.status,
      startedAt: build.started_at,
      finishedAt: build.finished_at,
      log: build.log.slice(-2000),
    }, null, 2));
  } else {
    console.log(`Entry: ${entryId}`);
    console.log(`Status: ${build.status}`);
    console.log(`Started: ${build.started_at}`);
    console.log(`Finished: ${build.finished_at || 'N/A'}`);
    console.log('');
    console.log('Last 2000 chars of build log:');
    console.log('---');
    console.log(build.log.slice(-2000));
  }
}
