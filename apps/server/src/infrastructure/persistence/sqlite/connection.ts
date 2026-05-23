import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { DATA_ROOT } from '../../../services/paths.js';

const DB_PATH = path.join(DATA_ROOT, 'dockit.db');
let db: Database.Database | null = null;

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

export function initDb(database: Database.Database): void {
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
      type TEXT NOT NULL CHECK(type IN ('zip', 'antora', 'maven', 'asciidoc', 'github-markdown', 'source-code')),
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
