import path from 'node:path';
import fs from 'node:fs';
import { parse } from 'node-html-parser';
import type { ISearchEngine } from '../../../core/ports/ISearchEngine.js';
import type { IEntryReadModel } from '../../../core/ports/IEntryReadModel.js';
import type { SearchResult, GlobalSearchResult, HtmlFile } from '../../../core/domain/types.js';
import { DATA_ROOT } from '../../../services/paths.js';

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

export class JsonSearchEngine implements ISearchEngine {
  readonly capability = 'json' as const;

  constructor(private readonly entryReadModel: IEntryReadModel) {}

  async buildIndex(entryId: string, htmlFiles: HtmlFile[], log: (msg: string) => void): Promise<void> {
    log(`Building search index for ${htmlFiles.length} files`);
    const entryDir = path.join(DATA_ROOT, entryId);
    const bundleDir = path.join(entryDir, 'bundle');
    const indexPath = path.join(entryDir, 'index.json');
    const index: SearchResult[] = [];

    for (const file of htmlFiles) {
      try {
        const html = fs.readFileSync(file.fullPath, 'utf-8');
        const root = parse(html);

        const title = root.querySelector('title')?.text.trim()
          || root.querySelector('h1')?.text.trim()
          || path.basename(file.relativePath, '.html');

        const headings: string[] = [];
        root.querySelectorAll('h1, h2, h3, h4').forEach((el) => {
          const text = el.text.trim();
          if (text) headings.push(text);
        });

        const bodyEl = root.querySelector('body');
        const bodyText = bodyEl ? bodyEl.text.replace(/\s+/g, ' ').trim() : '';
        const snippet = bodyText.slice(0, 300);

        index.push({
          path: file.relativePath,
          title,
          headings,
          snippet,
        });
      } catch (err) {
        log(`  Warning: could not parse ${file.relativePath}: ${(err as Error).message}`);
      }
    }

    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    log(`Search index written to ${indexPath} with ${index.length} entries`);
  }

  async search(entryId: string, query: string, limit = 20): Promise<SearchResult[]> {
    const indexPath = path.join(DATA_ROOT, entryId, 'index.json');
    if (!fs.existsSync(indexPath)) return [];

    const index: SearchResult[] = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    return this.scoreAndFilter(index, query, limit);
  }

  async globalSearch(query: string, limit = 30): Promise<GlobalSearchResult[]> {
    const readyEntries = await this.entryReadModel.listReadyEntries();

    const allResults: GlobalSearchResult[] = [];
    for (const entry of readyEntries) {
      const results = await this.search(entry.id, query, 10);
      for (const r of results) {
        allResults.push({
          ...r,
          entryId: entry.id,
          entryName: entry.name,
          entryVersion: entry.version,
        });
      }
    }

    allResults.sort((a, b) => ((b as any).score || 0) - ((a as any).score || 0));
    return allResults.slice(0, limit);
  }

  private scoreAndFilter(index: SearchResult[], query: string, maxResults: number): SearchResult[] {
    const allTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const terms = allTerms.filter((t) => !STOP_WORDS.has(t));

    if (terms.length === 0) return index.slice(0, maxResults);

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

          const titleCount = countOccurrences(titleLower, term);
          if (titleCount > 0) score += titleCount * idf * 10;

          let headingCount = 0;
          for (const heading of headingsLower) {
            if (heading.includes(term)) headingCount++;
          }
          if (headingCount > 0) score += Math.min(headingCount, 5) * idf * 3;

          const snippetCount = countOccurrences(snippetLower, term);
          if (snippetCount > 0) score += Math.log(1 + snippetCount) * idf;
        }

        const allTermsInTitle = terms.every((t) => titleLower.includes(t));
        if (allTermsInTitle) score += 20 * terms.length;

        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(({ item }) => item);
  }
}
