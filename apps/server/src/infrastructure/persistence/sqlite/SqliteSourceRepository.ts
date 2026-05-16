import type Database from 'better-sqlite3';
import type { Source, CreateSourceInput, UpdateSourceInput } from '../../../core/domain/types.js';
import type { ISourceRepository } from '../../../core/ports/ISourceRepository.js';
import { getDb } from './connection.js';

function parseSource(row: Record<string, unknown>): Source {
  return {
    ...row,
    config: JSON.parse(row.config as string),
  } as Source;
}

export class SqliteSourceRepository implements ISourceRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDb();
  }

  async findByEntryId(entryId: string): Promise<Source[]> {
    const rows = this.db.prepare(
      'SELECT * FROM sources WHERE entry_id = ? ORDER BY created_at DESC'
    ).all(entryId) as (Omit<Source, 'config'> & { config: string })[];
    return rows.map(parseSource);
  }

  async findById(id: string): Promise<Source | undefined> {
    const row = this.db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as (Omit<Source, 'config'> & { config: string }) | undefined;
    return row ? parseSource(row) : undefined;
  }

  async save(source: Source): Promise<void> {
    this.db.prepare(
      'INSERT OR REPLACE INTO sources (id, entry_id, type, label, config, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(source.id, source.entry_id, source.type, source.label, JSON.stringify(source.config), source.status, source.created_at);
  }

  async create(entryId: string, input: CreateSourceInput): Promise<Source> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO sources (id, entry_id, type, label, config, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, entryId, input.type, input.label, JSON.stringify(input.config), now);
    const source = await this.findById(id);
    if (!source) throw new Error('Failed to create source');
    return source;
  }

  async update(id: string, input: UpdateSourceInput): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) return;
    const newConfig = input.config ?? existing.config;
    this.db.prepare(
      'UPDATE sources SET label = ?, config = ? WHERE id = ?'
    ).run(input.label ?? existing.label, JSON.stringify(newConfig), id);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM sources WHERE id = ?').run(id);
  }

  async updateStatus(id: string, status: Source['status']): Promise<void> {
    this.db.prepare('UPDATE sources SET status = ? WHERE id = ?').run(status, id);
  }
}
