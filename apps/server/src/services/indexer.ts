import path from 'node:path';
import fs from 'node:fs';
import { parse } from 'node-html-parser';

export interface SearchResult {
  path: string;
  title: string;
  headings: string[];
  snippet: string;
}

export function buildSearchIndex(
  htmlFiles: string[],
  outputPath: string,
  log: (msg: string) => void
): SearchResult[] {
  log(`Building search index for ${htmlFiles.length} files`);
  const index: SearchResult[] = [];

  const bundleRoot = path.join(path.dirname(outputPath), 'bundle');

  for (const filePath of htmlFiles) {
    try {
      const html = fs.readFileSync(filePath, 'utf-8');
      const root = parse(html);

      const title = root.querySelector('title')?.text.trim()
        || root.querySelector('h1')?.text.trim()
        || path.basename(filePath, '.html');

      const headings: string[] = [];
      root.querySelectorAll('h1, h2, h3, h4').forEach((el) => {
        const text = el.text.trim();
        if (text) headings.push(text);
      });

      const bodyEl = root.querySelector('body');
      const bodyText = bodyEl ? bodyEl.text.replace(/\s+/g, ' ').trim() : '';
      const snippet = bodyText.slice(0, 300);

      const relativePath = path.relative(bundleRoot, filePath);

      index.push({
        path: relativePath,
        title,
        headings,
        snippet,
      });
    } catch (err) {
      log(`  Warning: could not parse ${filePath}: ${(err as Error).message}`);
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2), 'utf-8');
  log(`Search index written to ${outputPath} with ${index.length} entries`);

  return index;
}

export function searchIndex(
  indexPath: string,
  query: string,
  maxResults: number = 20
): SearchResult[] {
  if (!fs.existsSync(indexPath)) return [];

  const index: SearchResult[] = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (terms.length === 0) return index.slice(0, maxResults);

  return index
    .map((item) => {
      const searchText = [item.title, ...item.headings, item.snippet].join(' ').toLowerCase();
      let score = 0;
      for (const term of terms) {
        let idx = searchText.indexOf(term);
        while (idx !== -1) {
          score += 1;
          idx = searchText.indexOf(term, idx + term.length);
        }
      }

      if (item.title.toLowerCase().includes(query.toLowerCase())) {
        score += 10;
      }

      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(({ item }) => item);
}
