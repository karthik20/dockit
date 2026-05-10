import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { DATA_ROOT } from '../services/paths.js';
import type { Source } from '../types.js';

const DB_PATH = path.join(DATA_ROOT, 'dockit.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initDb(db);
  }
  return db;
}

export function getSources(entryId: string): Source[] {
  const database = getDb();
  const rows = database.prepare(
    'SELECT * FROM sources WHERE entry_id = ? ORDER BY created_at DESC'
  ).all(entryId) as (Omit<Source, 'config'> & { config: string })[];
  return rows.map((r) => ({ ...r, config: JSON.parse(r.config) }));
}

export function getSource(id: string): Source | undefined {
  const database = getDb();
  const row = database.prepare('SELECT * FROM sources WHERE id = ?').get(id) as (Omit<Source, 'config'> & { config: string }) | undefined;
  if (!row) return undefined;
  return { ...row, config: JSON.parse(row.config) };
}

function initDb(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'building', 'ready', 'error')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('zip', 'antora', 'maven', 'asciidoc', 'github-markdown')),
      label TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'building', 'ready', 'error')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS builds (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'building', 'ready', 'error')),
      log TEXT DEFAULT '',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT
    );
  `);
}
