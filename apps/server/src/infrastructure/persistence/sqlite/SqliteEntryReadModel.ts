import type Database from 'better-sqlite3';
import type { IEntryReadModel, EntryReadModelItem } from '../../../core/ports/IEntryReadModel.js';
import { getDb } from './connection.js';

export class SqliteEntryReadModel implements IEntryReadModel {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db ?? getDb();
  }

  async listReadyEntries(): Promise<EntryReadModelItem[]> {
    return this.db.prepare(
      "SELECT id, name, version FROM entries WHERE status = 'ready' ORDER BY name"
    ).all() as EntryReadModelItem[];
  }
}
