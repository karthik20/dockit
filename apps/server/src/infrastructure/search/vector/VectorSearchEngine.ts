import path from 'node:path';
import fs from 'node:fs';
import { parse } from 'node-html-parser';
import type { ISearchEngine } from '../../../core/ports/ISearchEngine.js';
import type { SearchResult, GlobalSearchResult, HtmlFile } from '../../../core/domain/types.js';
import { DATA_ROOT } from '../../../services/paths.js';
import { getDb } from '../../persistence/sqlite/connection.js';
import { EmbeddingService } from './EmbeddingService.js';
import type { Connection, Table } from '@lancedb/lancedb';

const LANCE_DB_DIR = path.join(DATA_ROOT, '.lancedb');
const VECTOR_DIM = 384; // all-MiniLM-L6-v2

interface LanceDoc {
  path: string;
  title: string;
  content: string;
  headings: string;
  entryId: string;
  vector: Float32Array;
}

export class VectorSearchEngine implements ISearchEngine {
  readonly capability = 'vector' as const;
  private embeddingService = new EmbeddingService();
  private dbPromise: Promise<Connection> | null = null;

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

    // Drop existing table if present
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

    const docs: LanceDoc[] = [];

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

        // Combine title + headings + body for embedding
        const embedText = [title, ...headings, bodyText].join('. ');
        docs.push({
          path: file.relativePath,
          title,
          content: snippet,
          headings: headings.join(' | '),
          entryId,
          vector: new Float32Array(VECTOR_DIM), // placeholder, will be filled after embedding
        });
      } catch (err) {
        log(`  Warning: could not parse ${file.relativePath}: ${(err as Error).message}`);
      }
    }

    if (docs.length === 0) {
      log('No documents to index');
      return;
    }

    // Batch embed all documents
    log(`Embedding ${docs.length} documents...`);
    const textsToEmbed = docs.map((d) => [d.title, d.content].join('. '));
    const embeddings = await this.embeddingService.embed(textsToEmbed);

    for (let i = 0; i < docs.length; i++) {
      docs[i].vector = new Float32Array(embeddings[i]);
    }

    // Create LanceDB table
    const table = await db.createTable(tableName, docs as any[], {
      mode: 'overwrite',
    });
    log(`Created table ${tableName} with ${docs.length} rows`);

    // Create vector index for ANN search
    try {
      await table.createIndex('vector');
      log(`Created vector index on ${tableName}`);
    } catch (err) {
      log(`  Warning: could not create vector index: ${(err as Error).message}`);
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

    const queryEmbedding = await this.embeddingService.embed([query]);
    const queryVector = new Float32Array(queryEmbedding[0]);

    const results = await table
      .query()
      .nearestTo(queryVector)
      .limit(limit)
      .toArray();

    return results.map((row: any) => ({
      path: row.path,
      title: row.title,
      headings: row.headings ? row.headings.split(' | ') : [],
      snippet: row.content,
    }));
  }

  async globalSearch(query: string, limit = 30): Promise<GlobalSearchResult[]> {
    const db = await this.getDb();
    const sqliteDb = getDb();

    const readyEntries = sqliteDb.prepare(
      "SELECT id, name, version FROM entries WHERE status = 'ready' ORDER BY name"
    ).all() as { id: string; name: string; version: string }[];

    const queryEmbedding = await this.embeddingService.embed([query]);
    const queryVector = new Float32Array(queryEmbedding[0]);

    const allResults: (GlobalSearchResult & { distance: number })[] = [];

    for (const entry of readyEntries) {
      const tableName = this.sanitizeTableName(entry.id);
      let table: Table;
      try {
        table = await db.openTable(tableName);
      } catch {
        continue;
      }

      try {
        const results = await table
          .query()
          .nearestTo(queryVector)
          .limit(10)
          .toArray();

        for (const row of results as any[]) {
          allResults.push({
            path: row.path,
            title: row.title,
            headings: row.headings ? row.headings.split(' | ') : [],
            snippet: row.content,
            entryId: entry.id,
            entryName: entry.name,
            entryVersion: entry.version,
            distance: row._distance ?? 0,
          });
        }
      } catch {
        // Ignore errors for individual tables
      }
    }

    // Sort by distance (ascending = most similar)
    allResults.sort((a, b) => a.distance - b.distance);

    return allResults.slice(0, limit).map(({ distance, ...rest }) => rest);
  }

  private sanitizeTableName(entryId: string): string {
    // LanceDB table names must be valid identifiers
    return entryId.replace(/[^a-zA-Z0-9_]/g, '_');
  }
}
