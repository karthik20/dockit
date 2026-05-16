import type Database from 'better-sqlite3';
import type { Entry, CreateEntryInput, UpdateEntryInput } from '../../../core/domain/types.js';
import type { IEntryRepository } from '../../../core/ports/IEntryRepository.js';
import { DomainError } from '../../../core/domain/errors.js';
import { getDb } from './connection.js';

export class SqliteEntryRepository implements IEntryRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDb();
  }

  async findAll(): Promise<(Entry & { source_count: number })[]> {
    return this.db.prepare(`
      SELECT e.*, COUNT(s.id) as source_count
      FROM entries e
      LEFT JOIN sources s ON s.entry_id = e.id
      GROUP BY e.id
      ORDER BY e.created_at DESC
    `).all() as (Entry & { source_count: number })[];
  }

  async findById(id: string): Promise<Entry | undefined> {
    return this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as Entry | undefined;
  }

  async save(entry: Entry): Promise<void> {
    this.db.prepare(
      'INSERT OR REPLACE INTO entries (id, name, version, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(entry.id, entry.name, entry.version, entry.description, entry.status, entry.created_at, entry.updated_at);
  }

  async update(id: string, input: UpdateEntryInput): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) return;
    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE entries SET name = ?, version = ?, description = ?, updated_at = ? WHERE id = ?'
    ).run(
      input.name ?? existing.name,
      input.version ?? existing.version,
      input.description ?? existing.description,
      now,
      id,
    );
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM entries WHERE id = ?').run(id);
  }

  async updateStatus(id: string, status: Entry['status']): Promise<void> {
    this.db.prepare('UPDATE entries SET status = ? WHERE id = ?').run(status, id);
  }

  async create(input: CreateEntryInput): Promise<Entry> {
    // Resolve unique ID:
    // - Use input.id if provided and available
    // - Fall back to random UUID if no id given
    // - If the provided id already exists, append -2, -3, etc.
    let id = input.id ?? crypto.randomUUID();
    if (input.id) {
      let suffix = 2;
      let candidateId = id;
      while (this.db.prepare('SELECT 1 FROM entries WHERE id = ?').get(candidateId)) {
        candidateId = `${id}-${suffix}`;
        suffix++;
      }
      id = candidateId;
    }

    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO entries (id, name, version, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, input.name, input.version, input.description ?? '', now, now);
    const entry = await this.findById(id);
    if (!entry) throw new DomainError('Failed to create entry', 'PERSISTENCE_ERROR');
    return entry;
  }
}
