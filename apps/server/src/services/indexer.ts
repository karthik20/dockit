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

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'doing', 'have', 'has', 'had', 'having', 'will', 'would', 'shall',
  'should', 'can', 'could', 'may', 'might', 'must', 'to', 'of', 'in', 'for', 'on', 'with',
  'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'what', 'which', 'who', 'whom', 'this', 'that',
  'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you',
  'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her',
  'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'not', 'no', 'nor', 'so', 'if', 'about', 'up', 'down', 'just', 'only', 'own', 'same',
  'than', 'too', 'very', 'some', 'any', 'each', 'every', 'all', 'both', 'few', 'more',
  'most', 'other', 'such', 'also', 'get', 'got', 'like', 'make', 'made', 'use', 'used',
  'using', 'create', 'new', 'way', 'need', 'want', 'know', 'tell', 'say', 'said', 'go',
  'went', 'come', 'see', 'look', 'find', 'give', 'take', 'put', 'set', 'let', 'keep',
  'work', 'call', 'try', 'ask', 'show', 'think', 'help', 'run', 'move', 'live', 'believe',
]);

function countOccurrences(text: string, term: string): number {
  let count = 0;
  let idx = text.indexOf(term);
  while (idx !== -1) {
    count++;
    idx = text.indexOf(term, idx + term.length);
  }
  return count;
}

export function searchIndex(
  indexPath: string,
  query: string,
  maxResults: number = 20
): SearchResult[] {
  if (!fs.existsSync(indexPath)) return [];

  const index: SearchResult[] = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const allTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const terms = allTerms.filter((t) => !STOP_WORDS.has(t));

  if (terms.length === 0) return index.slice(0, maxResults);

  // Calculate document frequency for IDF scoring
  const docFreq: Record<string, number> = {};
  const totalDocs = index.length;
  for (const term of terms) {
    docFreq[term] = 0;
    for (const item of index) {
      const searchText = [item.title, ...item.headings, item.snippet].join(' ').toLowerCase();
      if (searchText.includes(term)) {
        docFreq[term]++;
      }
    }
  }

  return index
    .map((item) => {
      const titleLower = item.title.toLowerCase();
      const headingsLower = item.headings.map((h) => h.toLowerCase());
      const snippetLower = item.snippet.toLowerCase();

      let score = 0;

      for (const term of terms) {
        const idf = Math.log(totalDocs / (1 + docFreq[term]));

        // Title match (highest weight, uncapped)
        const titleCount = countOccurrences(titleLower, term);
        if (titleCount > 0) {
          score += titleCount * idf * 10;
        }

        // Heading match (capped per term to prevent spam from pages with many headings)
        let headingCount = 0;
        for (const heading of headingsLower) {
          if (heading.includes(term)) headingCount++;
        }
        if (headingCount > 0) {
          score += Math.min(headingCount, 5) * idf * 3;
        }

        // Snippet match (logarithmic, naturally capped)
        const snippetCount = countOccurrences(snippetLower, term);
        if (snippetCount > 0) {
          score += Math.log(1 + snippetCount) * idf;
        }
      }

      // Bonus: if all query terms appear in the title
      const allTermsInTitle = terms.every((t) => titleLower.includes(t));
      if (allTermsInTitle) {
        score += 20 * terms.length;
      }

      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(({ item }) => item);
}
