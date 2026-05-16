import type Database from 'better-sqlite3';
import type { Build } from '../../../core/domain/types.js';
import type { IBuildRepository } from '../../../core/ports/IBuildRepository.js';
import { getDb } from './connection.js';

export class SqliteBuildRepository implements IBuildRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDb();
  }

  async create(entryId: string): Promise<Build> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO builds (id, entry_id, status, started_at) VALUES (?, ?, ?, ?)'
    ).run(id, entryId, 'building', now);
    return this.findLatest(entryId) as Promise<Build>;
  }

  async update(buildId: string, status: Build['status'], log: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE builds SET status = ?, log = ?, finished_at = ? WHERE id = ?'
    ).run(status, log, now, buildId);
  }

  async findLatest(entryId: string): Promise<Build | undefined> {
    return this.db.prepare(
      'SELECT * FROM builds WHERE entry_id = ? ORDER BY started_at DESC LIMIT 1'
    ).get(entryId) as Build | undefined;
  }
}
