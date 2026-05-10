import path from 'node:path';
import fs from 'node:fs';

export default async function search(root, positional, flags) {
  let entryId = flags.entry || null;
  let query = positional[0];

  if (positional.length >= 2 && !flags.entry) {
    entryId = positional[0];
    query = positional.slice(1).join(' ');
  }

  if (!query) {
    console.error('Error: search query is required');
    console.error('Usage: dockit search [<entry>] <query> [--json] [--limit <n>] [--get-top <N>]');
    console.error('');
    console.error('Examples:');
    console.error('  dockit search react "how to create a hook"');
    console.error('  dockit search quarkus "configure cache"');
    console.error('  dockit search "react hooks"');
    process.exit(1);
  }

  const limit = parseInt(flags.limit || '20', 10);
  const asJson = !!flags.json;
  const getTop = flags['get-top'] === true ? 3 : parseInt(String(flags['get-top']), 10);

  const { getDb } = await import(path.join(root, 'apps/server/src/db/index.js'));
  const { searchIndex } = await import(path.join(root, 'apps/server/src/services/indexer.js'));
  const { DATA_ROOT } = await import(path.join(root, 'apps/server/src/services/paths.js'));
  const { extractTextFromHtml } = await import(path.join(root, 'apps/server/src/services/textExtractor.js'));

  let results: any[] = [];
  let scoped = false;

  if (entryId) {
    scoped = true;
    const indexPath = path.join(DATA_ROOT, entryId, 'index.json');
    if (!fs.existsSync(indexPath)) {
      console.error(`Entry "${entryId}" not found or not built.`);
      console.error('Run "dockit list" to see available entries.');
      process.exit(1);
    }
    results = searchIndex(indexPath, query, limit).map((r) => ({
      entryId,
      ...r,
    }));
  } else {
    const db = getDb();
    const entries = db.prepare("SELECT id, name, version FROM entries WHERE status = 'ready' ORDER BY name").all();

    // Global search: return top result per entry so LLM can pick the right one
    for (const entry of entries) {
      const indexPath = path.join(DATA_ROOT, entry.id, 'index.json');
      const entryResults = searchIndex(indexPath, query, 1);
      if (entryResults.length > 0) {
        results.push({
          entryId: entry.id,
          entryName: entry.name,
          entryVersion: entry.version,
          ...entryResults[0],
        });
      }
    }

    results.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  if (getTop) {
    for (let i = 0; i < Math.min(getTop, results.length); i++) {
      const r = results[i];
      const filePath = path.join(DATA_ROOT, r.entryId, 'bundle', r.path);
      if (fs.existsSync(filePath)) {
        const html = fs.readFileSync(filePath, 'utf-8');
        r.content = extractTextFromHtml(html);
      } else {
        r.content = null;
      }
    }
  }

  if (asJson) {
    if (getTop) {
      const output = results.slice(0, getTop).map((r, i) => ({
        rank: i + 1,
        entryId: r.entryId,
        entryName: r.entryName,
        title: r.title,
        path: r.path,
        score: r.score,
        content: r.content,
      }));
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(JSON.stringify(results, null, 2));
    }
  } else if (results.length === 0) {
    console.log('No results found.');
  } else {
    const scope = entryId ? ` [${entryId}]` : '';
    console.log(`Search${scope}: "${query}" — ${results.length} result(s)\n`);

    if (getTop) {
      console.log(`Showing full content for top ${Math.min(getTop, results.length)} result(s).\n`);

      for (let i = 0; i < Math.min(getTop, results.length); i++) {
        const r = results[i];
        const entryLabel = r.entryName || r.entryId;
        const title = r.title || '(no title)';

        console.log(`[${i + 1}] [${entryLabel}] ${title}`);
        console.log(`  Path: ${r.path || ''}`);
        console.log('  ─────────────────────────────────────────────');
        if (r.content) {
          console.log(r.content);
        } else {
          console.log('  (content not available — entry may not be built)');
        }
        console.log('  ─────────────────────────────────────────────');
        console.log('');
      }
    } else if (!scoped) {
      // Global search: show top result per entry with hint to scope
      for (const r of results) {
        const entryLabel = r.entryName || r.entryId;
        const title = r.title || '(no title)';
        const snippet = r.snippet ? `\n  ${extractSnippet(query, r.snippet)}` : '';

        console.log(`[${entryLabel}] ${title}`);
        console.log(`  Path: ${r.path || ''}${snippet}`);
        console.log('');
      }

      console.log(`Use 'dockit search <entry> "<query>"' to search within a specific entry.`);
      console.log(`Use 'dockit search <entry> "<query>" --get-top' to fetch full content.`);
    } else {
      for (const r of results) {
        const entryLabel = r.entryName || r.entryId;
        const title = r.title || '(no title)';
        const headings = r.headings && r.headings.length > 0 ? `\n  Headings: ${r.headings.slice(0, 3).join(' > ')}` : '';
        const snippet = r.snippet ? `\n  ${extractSnippet(query, r.snippet)}` : '';

        console.log(`[${entryLabel}] ${title}`);
        console.log(`  Path: ${r.path || ''}${headings}${snippet}`);
        console.log('');
      }

      console.log(`Use 'dockit search ${entryId} "<query>" --get-top [N]' to fetch full content.`);
    }
  }
}

function extractSnippet(query: string, fullSnippet: string, contextLength: number = 150): string {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = fullSnippet.toLowerCase();

  let bestStart = 0;
  let bestScore = 0;

  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx !== -1) {
      const start = Math.max(0, idx - 30);
      const score = terms.filter((t) => lower.slice(start, start + contextLength).includes(t)).length;
      if (score > bestScore) {
        bestScore = score;
        bestStart = start;
      }
    }
  }

  const start = Math.max(0, bestStart);
  const end = Math.min(fullSnippet.length, start + contextLength);
  let snippet = fullSnippet.slice(start, end).replace(/\s+/g, ' ').trim();

  if (start > 0) snippet = '...' + snippet;
  if (end < fullSnippet.length) snippet = snippet + '...';

  return snippet;
}