import path from 'node:path';
import fs from 'node:fs';

export default async function getDoc(root, positional, flags) {
  const entryId = positional[0];
  const docPath = positional[1];

  if (!entryId || !docPath) {
    console.error('Error: entry ID and document path are required');
    console.error('Usage: dockit get <entry> <path>');
    console.error('Example: dockit get react asciidoc/getting-started.html');
    process.exit(1);
  }

  const asJson = !!flags.json;

  const { DATA_ROOT } = await import(path.join(root, 'apps/server/src/services/paths.js'));
  const { extractTextFromHtml } = await import(path.join(root, 'apps/server/src/services/textExtractor.js'));

  const filePath = path.join(DATA_ROOT, entryId, 'bundle', docPath);

  if (!fs.existsSync(filePath)) {
    console.error(`Document not found: ${docPath}`);
    console.error(`Has the entry "${entryId}" been built?`);
    process.exit(1);
  }

  const html = fs.readFileSync(filePath, 'utf-8');
  const text = extractTextFromHtml(html);

  if (asJson) {
    console.log(JSON.stringify({ entryId, path: docPath, content: text }, null, 2));
  } else {
    console.log(text);
  }
}
