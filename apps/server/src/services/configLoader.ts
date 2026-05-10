import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { getDb } from '../db/index.js';
import type { SourceType, SourceConfig } from '../types.js';

export interface DockitSourceConfig {
  type: SourceType;
  label: string;
  repoUrl?: string;
  zipPath?: string;
  url?: string;
  groupId?: string;
  artifactId?: string;
  version?: string;
  classifier?: string;
  sourcePath?: string;
  playbookOverrides?: Record<string, unknown>;
  branch?: string;
  localPath?: string;
  localJar?: string;
  useMavenCommand?: boolean;
}

export interface DockitEntryConfig {
  id: string;
  name: string;
  version: string;
  description?: string;
  sources: DockitSourceConfig[];
}

export interface DockitConfig {
  entries: DockitEntryConfig[];
  mcp?: {
    toolPrefix?: string;
    maxSearchResults?: number;
    autoBuild?: boolean;
    dataDir?: string;
  };
}

export function loadConfig(configPath: string): DockitConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Create a dockit.yaml file with your entries and sources.`);
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const config = loadYaml(content) as DockitConfig;

  if (!config.entries || !Array.isArray(config.entries) || config.entries.length === 0) {
    throw new Error('Config file must contain at least one entry under "entries:"');
  }

  for (const entry of config.entries) {
    if (!entry.id || !entry.name || !entry.version) {
      throw new Error(`Entry missing required fields (id/name/version): ${JSON.stringify(entry)}`);
    }
    if (!entry.sources || entry.sources.length === 0) {
      throw new Error(`Entry "${entry.id}" has no sources`);
    }
    for (const source of entry.sources) {
      if (!source.type || !source.label) {
        throw new Error(`Source in entry "${entry.id}" missing type or label`);
      }
      validateSourceConfig(source);
    }
  }

  return config;
}

function validateSourceConfig(source: DockitSourceConfig): void {
  switch (source.type) {
    case 'zip':
      if (!source.url && !source.localPath) {
        throw new Error(`ZIP source "${source.label}" requires "url" or "localPath"`);
      }
      break;
    case 'maven':
      if (!source.groupId || !source.artifactId || !source.version) {
        throw new Error(`Maven source "${source.label}" requires groupId, artifactId, and version`);
      }
      break;
    case 'antora':
      if (!source.repoUrl && !source.zipPath && !source.localPath) {
        throw new Error(`Antora source "${source.label}" requires repoUrl, localPath, or zipPath`);
      }
      break;
    case 'asciidoc':
      if (!source.repoUrl && !source.zipPath && !source.localPath) {
        throw new Error(`AsciiDoc source "${source.label}" requires repoUrl, localPath, or zipPath`);
      }
      break;
    default:
      throw new Error(`Unknown source type: "${source.type}" in source "${source.label}"`);
  }
}

export function syncConfigToDb(config: DockitConfig): string[] {
  const db = getDb();
  const entryIds: string[] = [];

  for (const entryConfig of config.entries) {
    db.prepare(`
      INSERT OR REPLACE INTO entries (id, name, version, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      entryConfig.id,
      entryConfig.name,
      entryConfig.version,
      entryConfig.description || '',
      'pending'
    );

    entryIds.push(entryConfig.id);

    for (const sourceConfig of entryConfig.sources) {
      const config = buildSourceConfig(sourceConfig);
      const sourceId = `${entryConfig.id}-src-${sourceConfig.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;

      db.prepare(`
        INSERT OR REPLACE INTO sources (id, entry_id, type, label, config, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(sourceId, entryConfig.id, sourceConfig.type, sourceConfig.label, JSON.stringify(config), 'pending');
    }
  }

  return entryIds;
}

function buildSourceConfig(source: DockitSourceConfig): SourceConfig {
  switch (source.type) {
    case 'zip':
      return { url: source.url, localPath: source.localPath };
    case 'maven':
      return {
        groupId: source.groupId!,
        artifactId: source.artifactId!,
        version: source.version!,
        classifier: source.classifier || 'javadoc',
        useMavenCommand: source.useMavenCommand,
        localJar: source.localJar,
      };
    case 'antora':
      return {
        repoUrl: source.repoUrl,
        zipPath: source.zipPath,
        localPath: source.localPath,
        playbookOverrides: source.playbookOverrides,
      };
    case 'asciidoc':
      return {
        repoUrl: source.repoUrl,
        zipPath: source.zipPath,
        localPath: source.localPath,
        sourcePath: source.sourcePath,
      };
  }
}
