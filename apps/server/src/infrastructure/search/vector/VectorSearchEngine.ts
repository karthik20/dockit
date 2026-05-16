import path from 'node:path';
import fs from 'node:fs';
import { parse, HTMLElement } from 'node-html-parser';
import type { ISearchEngine } from '../../../core/ports/ISearchEngine.js';
import type { IEntryReadModel } from '../../../core/ports/IEntryReadModel.js';
import type { SearchResult, GlobalSearchResult, HtmlFile } from '../../../core/domain/types.js';
import { DATA_ROOT } from '../../../services/paths.js';
import { EmbeddingService } from './EmbeddingService.js';
import type { Connection, Table } from '@lancedb/lancedb';

const LANCE_DB_DIR = path.join(DATA_ROOT, '.lancedb');
const VECTOR_DIM = 384;
const MAX_EMBED_CHARS = 2000;
const MAX_SNIPPET_CHARS = 500;
const MIN_CHUNK_CHARS = 50;
const RRF_K = 25;
const FTS_WEAK_WEIGHT = 0.7;
const FTS_STRONG_WEIGHT = 2.0;
const FTS_MIN_SCORE_RATIO = 0.3;
const FTS_CONFIDENCE_RATIO = 1.3;
const PARALLEL_QUERY_LIMIT = 40;

interface Chunk {
  primaryTitle: string;
  sectionTitle: string;
  text: string;
  headingPath: string[];
}

interface LanceDoc {
  path: string;
  primaryTitle: string;
  sectionTitle: string;
  content: string;
  searchText: string;
  embedText: string;
  headings: string;
  entryId: string;
  vector: Float32Array;
}

interface LanceDbQueryResult {
  path: string;
  primaryTitle: string;
  sectionTitle: string;
  content: string;
  headings: string;
  entryId: string;
  vector: Float32Array;
  _distance: number;
  _score?: number;
  _query?: string;
}

export class VectorSearchEngine implements ISearchEngine {
  readonly capability = 'vector' as const;
  private embeddingService: EmbeddingService;
  private dbPromise: Promise<Connection> | null = null;
  private entryReadModel: IEntryReadModel;

  constructor(entryReadModel: IEntryReadModel, embeddingService?: EmbeddingService) {
    this.entryReadModel = entryReadModel;
    this.embeddingService = embeddingService ?? new EmbeddingService();
  }

  private async getDb(): Promise<Connection> {
    if (!this.dbPromise) {
      const lancedb = await import('@lancedb/lancedb');
      this.dbPromise = lancedb.connect(LANCE_DB_DIR);
    }
    return this.dbPromise;
  }

  async buildIndex(entryId: string, htmlFiles: HtmlFile[], log: (msg: string) => void): Promise<void> {
    log(`Building vector search index for ${htmlFiles.length} files`);
    const db = await this.getDb();

    const tableName = this.sanitizeTableName(entryId);
    try {
      const names = await db.tableNames();
      if (names.includes(tableName)) {
        await db.dropTable(tableName);
        log(`Dropped existing table ${tableName}`);
      }
    } catch {
      // Table may not exist
    }

    const allChunks: LanceDoc[] = [];

    for (const file of htmlFiles) {
      try {
        const html = fs.readFileSync(file.fullPath, 'utf-8');
        const root = parse(html);

        const primaryTitle = root.querySelector('title')?.text.trim()
          || root.querySelector('h1')?.text.trim()
          || path.basename(file.relativePath, '.html');

        const chunks = chunkDocument(root, primaryTitle);

        if (chunks.length === 0) {
          // No sections found, treat whole document as one chunk
          const bodyEl = root.querySelector('body');
          const bodyText = bodyEl ? bodyEl.text.replace(/\s+/g, ' ').trim() : '';
          const embedText = `${primaryTitle}. ${primaryTitle}. ${bodyText.replace(/\s+/g, ' ').trim()}`.substring(0, MAX_EMBED_CHARS);
          const snippet = bodyText.substring(0, MAX_SNIPPET_CHARS);

          allChunks.push({
            path: file.relativePath,
            primaryTitle,
            sectionTitle: primaryTitle,
            content: snippet,
            searchText: `${primaryTitle}. ${primaryTitle}. ${bodyText.replace(/\s+/g, ' ').trim()}`,
            embedText,
            headings: primaryTitle,
            entryId,
            vector: new Float32Array(VECTOR_DIM),
          });
        } else {
          for (const chunk of chunks) {
            const embedText = `${primaryTitle}. ${primaryTitle}. ${chunk.sectionTitle}. ${chunk.text.replace(/\s+/g, ' ').trim()}`
              .substring(0, MAX_EMBED_CHARS);
            const searchText = `${primaryTitle}. ${primaryTitle}. ${chunk.sectionTitle}. ${chunk.text.replace(/\s+/g, ' ').trim()}`;
            const snippet = chunk.text.replace(/\s+/g, ' ').trim().substring(0, MAX_SNIPPET_CHARS);

            allChunks.push({
              path: file.relativePath,
              primaryTitle,
              sectionTitle: chunk.sectionTitle,
              content: snippet,
              searchText,
              embedText,
              headings: [...chunk.headingPath, chunk.sectionTitle].join(' | '),
              entryId,
              vector: new Float32Array(VECTOR_DIM),
            });
          }
        }
      } catch (err) {
        log(`  Warning: could not parse ${file.relativePath}: ${(err as Error).message}`);
      }
    }

    if (allChunks.length === 0) {
      log('No documents to index');
      return;
    }

    log(`Created ${allChunks.length} chunks across ${htmlFiles.length} files`);

    // Batch embed all chunks
    const batchSize = 32;
    const totalChunks = allChunks.length;

    for (let i = 0; i < totalChunks; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      const texts = batch.map((d) => d.embedText);
      const embeddings = await this.embeddingService.embed(texts);
      for (let j = 0; j < batch.length; j++) {
        batch[j].vector = new Float32Array(embeddings[j]);
      }
      if (i % 128 === 0 || i + batchSize >= totalChunks) {
        log(`Embedded ${Math.min(i + batchSize, totalChunks)}/${totalChunks} chunks`);
      }
    }

    // Create LanceDB table
    // LanceDB types require Record<string, unknown> for createTable; Float32Array vectors don't satisfy this
    const table = await db.createTable(tableName, allChunks as any[], {
      mode: 'overwrite',
    });
    log(`Created table ${tableName} with ${allChunks.length} rows`);

    // Create vector index with cosine distance
    try {
      const lancedb = await import('@lancedb/lancedb');
      await table.createIndex('vector', {
        config: lancedb.Index.ivfPq({ distanceType: 'cosine' }),
      });
      log(`Created vector index (cosine) on ${tableName}`);
    } catch (err) {
      log(`  Warning: could not create vector index: ${(err as Error).message}`);
    }

    // Create FTS index on searchText column (includes title for better keyword matching)
    try {
      const lancedb = await import('@lancedb/lancedb');
      await table.createIndex('searchText', {
        config: lancedb.Index.fts(),
      });
      log(`Created FTS index on ${tableName}`);
    } catch (err) {
      log(`  Warning: could not create FTS index: ${(err as Error).message}`);
    }
  }

  async search(entryId: string, query: string, limit = 20): Promise<SearchResult[]> {
    const db = await this.getDb();
    const tableName = this.sanitizeTableName(entryId);

    let table: Table;
    try {
      table = await db.openTable(tableName);
    } catch {
      return [];
    }

    const results = await this.hybridSearch(table, query, limit);
    return results;
  }

  async globalSearch(query: string, limit = 30): Promise<GlobalSearchResult[]> {
    const db = await this.getDb();
    const readyEntries = await this.entryReadModel.listReadyEntries();

    if (readyEntries.length === 0) return [];

    // Search all entries in parallel
    const fetchLimit = Math.min(5, Math.ceil(limit / readyEntries.length));
    const perEntry = Math.max(5, fetchLimit);

    const entryResults = await Promise.all(
      readyEntries.map(async (entry) => {
        try {
          const table = await db.openTable(this.sanitizeTableName(entry.id));
          const results = await this.hybridSearch(table, query, perEntry);
          return results.map((r) => ({
            ...r,
            entryId: entry.id,
            entryName: entry.name,
            entryVersion: entry.version,
          }));
        } catch {
          return [] as GlobalSearchResult[];
        }
      })
    );

    // Flatten and re-sort by RRF methodology
    // All results already have internal ordering, just merge and limit
    const allResults = entryResults.flat();
    return this.deduplicateByPath(allResults).slice(0, limit);
  }

  private async hybridSearch(table: Table, query: string, limit: number): Promise<SearchResult[]> {
    const queryEmbedding = await this.embeddingService.embed([query]);
    const queryVector = new Float32Array(queryEmbedding[0]);

    // Run vector and FTS queries in parallel
    const [vecResults, ftsResults] = await Promise.allSettled([
      table
        .query()
        .nearestTo(queryVector)
        .distanceType('cosine')
        .limit(PARALLEL_QUERY_LIMIT)
        .toArray(),
      table
        .query()
        .fullTextSearch(query, { columns: ['searchText'] })
        .limit(PARALLEL_QUERY_LIMIT)
        .toArray(),
    ]);

    const vec = vecResults.status === 'fulfilled' ? (vecResults.value as LanceDbQueryResult[]) : [];
    const fts = ftsResults.status === 'fulfilled' ? (ftsResults.value as LanceDbQueryResult[]) : [];

    if (vec.length === 0 && fts.length === 0) return [];

    // If only one query succeeded, use its results directly
    if (vec.length === 0) {
      return this.deduplicateByPath(
        fts.map((r: LanceDbQueryResult) => ({
          path: r.path,
          title: r.primaryTitle || r.sectionTitle,
          headings: r.headings ? r.headings.split(' | ') : [],
          snippet: r.content,
        }))
      ).slice(0, limit);
    }

    if (fts.length === 0) {
      return this.deduplicateByPath(
        vec.map((r: LanceDbQueryResult) => ({
          path: r.path,
          title: r.primaryTitle || r.sectionTitle,
          headings: r.headings ? r.headings.split(' | ') : [],
          snippet: r.content,
        }))
      ).slice(0, limit);
    }

    // Hybrid fusion: Reciprocal Rank Fusion
    const fused = this.hybridFuse(vec, fts, limit);
    return fused;
  }

  private hybridFuse(vecResults: LanceDbQueryResult[], ftsResults: LanceDbQueryResult[], limit: number): SearchResult[] {
    // Deduplicate: keep only best chunk per path BEFORE RRF fusion.
    const dedupVec = this.dedupBest(vecResults, (r) => r._distance ?? Infinity, 'asc');
    let dedupFts = this.dedupBest(ftsResults, (r) => r._score ?? 0, 'desc');

    // Filter FTS results by minimum relevance threshold
    if (dedupFts.length > 0) {
      const maxScore = dedupFts[0]._score ?? 0;
      const minScore = maxScore * FTS_MIN_SCORE_RATIO;
      dedupFts = dedupFts.filter((r) => (r._score ?? 0) >= minScore);
    }

    // Dynamic FTS weight: if FTS is confident (clear score gap between #1 and others),
    // weight FTS higher. If scores are similar, FTS is uncertain, rely more on vector.
    let ftsWeight = FTS_WEAK_WEIGHT;
    if (dedupFts.length >= 2) {
      const maxScore = dedupFts[0]._score ?? 0;
      const secondScore = dedupFts[1]._score ?? 0;
      if (secondScore > 0 && maxScore / secondScore > FTS_CONFIDENCE_RATIO) {
        ftsWeight = FTS_STRONG_WEIGHT;
      }
    } else if (dedupFts.length === 1) {
      ftsWeight = FTS_STRONG_WEIGHT; // Single result = high confidence
    }

    const scores = new Map<string, { path: string; title: string; headings: string[]; snippet: string; score: number }>();

    // Apply RRF from vector results
    dedupVec.forEach((r, i) => {
      const path = r.path as string;
      const rrfScore = 1 / (RRF_K + i + 1);
      this.addScore(scores, path, r.primaryTitle || r.sectionTitle, r.headings, r.content, rrfScore);
    });

    // Apply RRF from FTS results (dynamically weighted, with title match boosting)
    dedupFts.forEach((r, i) => {
      const path = r.path as string;
      let rrfScore = ftsWeight / (RRF_K + i + 1);

      // Title match boost: if query terms appear in title, extra 50%
      const queryTerms = (r._query || '').toLowerCase().split(/\s+/).filter((t: string) => t.length > 2);
      const sectionTitle = (r.sectionTitle || '').toLowerCase();
      const primaryTitle = (r.primaryTitle || '').toLowerCase();
      const titleMatch = queryTerms.some(
        (t: string) => sectionTitle.includes(t) || primaryTitle.includes(t)
      );
      if (titleMatch) {
        rrfScore *= 1.5;
      }

      this.addScore(scores, path, r.primaryTitle || r.sectionTitle, r.headings, r.content, rrfScore);
    });

    // Sort by fused RRF score descending
    return [...scores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, ...rest }) => rest);
  }

  private addScore(
    map: Map<string, { path: string; title: string; headings: string[]; snippet: string; score: number }>,
    path: string,
    title: string,
    headings: string,
    snippet: string,
    score: number,
  ): void {
    const current = map.get(path);
    if (!current) {
      map.set(path, {
        path,
        title,
        headings: headings ? headings.split(' | ') : [],
        snippet,
        score,
      });
    } else {
      current.score += score;
      // Use FTS-chosen content (more likely to have keyword match in snippet)
      if (score > 0 && snippet) {
        current.snippet = snippet;
        current.title = title;
      }
    }
  }

  private dedupBest<T extends { path: string }>(
    results: T[],
    scoreFn: (r: T) => number,
    order: 'asc' | 'desc',
  ): T[] {
    const best = new Map<string, { item: T; score: number }>();
    for (const r of results) {
      const s = scoreFn(r);
      const existing = best.get(r.path);
      if (
        !existing ||
        (order === 'asc' && s < existing.score) ||
        (order === 'desc' && s > existing.score)
      ) {
        best.set(r.path, { item: r, score: s });
      }
    }
    return [...best.values()].map((v) => v.item);
  }

  private deduplicateByPath<T extends { path: string }>(results: T[]): T[] {
    const seen = new Set<string>();
    return results.filter((r) => {
      if (seen.has(r.path)) return false;
      seen.add(r.path);
      return true;
    });
  }

  private sanitizeTableName(entryId: string): string {
    return entryId.replace(/[^a-zA-Z0-9_]/g, '_');
  }
}

function chunkDocument(root: ReturnType<typeof parse>, pageTitle: string): Chunk[] {
  const chunks: Chunk[] = [];
  const body = root.querySelector('body');
  if (!body) return chunks;

  const headingStack: string[] = [];
  let currentSectionHeading = pageTitle;
  let currentText = '';

  const headingSelector = 'h1, h2, h3, h4';

  // Collect all heading and text elements in document order
  const elements = body.querySelectorAll(
    `${headingSelector}, p, div, section, article, ul, ol, dl, pre, blockquote, table, figure`
  );

  for (const el of elements) {
    const tagName = el.tagName?.toLowerCase();
    const headingMatch = tagName?.match(/^h([1-4])$/);

    if (headingMatch) {
      // Save previous chunk if it has enough content
      if (currentText.trim().length >= MIN_CHUNK_CHARS) {
        chunks.push({
          primaryTitle: pageTitle,
          sectionTitle: currentSectionHeading,
          text: currentText.replace(/\s+/g, ' ').trim().substring(0, MAX_EMBED_CHARS),
          headingPath: [...headingStack],
        });
      }

      // Start new section
      const level = parseInt(headingMatch[1]);
      const headingText = el.text.trim();
      currentSectionHeading = headingText || currentSectionHeading;

      // Adjust heading stack
      while (headingStack.length >= level) headingStack.pop();
      headingStack.push(headingText || pageTitle);

      currentText = '';
    } else {
      // Accumulate text
      const text = el.text?.trim();
      if (text) {
        currentText += ' ' + text;
      }
    }
  }

  // Save the last chunk
  if (currentText.trim().length >= MIN_CHUNK_CHARS) {
    chunks.push({
      primaryTitle: pageTitle,
      sectionTitle: currentSectionHeading,
      text: currentText.replace(/\s+/g, ' ').trim().substring(0, MAX_EMBED_CHARS),
      headingPath: [...headingStack],
    });
  }

  return chunks;
}
