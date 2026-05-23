import fs from 'node:fs';
import { load as loadYaml } from 'js-yaml';
import type { IEntryRepository } from '../core/ports/IEntryRepository.js';
import type { ISourceRepository } from '../core/ports/ISourceRepository.js';
import type { SourceType, SourceConfig } from '../core/domain/types.js';

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
  graphifyEnabled?: boolean;
  graphifySourcePath?: string;
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
  search?: {
    engine?: 'json' | 'vector';
  };
  mcp?: {
    toolPrefix?: string;
    maxSearchResults?: number;
    autoBuild?: boolean;
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
    case 'github-markdown':
      if (!source.repoUrl && !source.localPath) {
        throw new Error(`GitHub Markdown source "${source.label}" requires repoUrl or localPath`);
      }
      break;
    case 'source-code':
      if (!source.repoUrl && !source.localPath && !source.zipPath) {
        throw new Error(`Source code source "${source.label}" requires repoUrl, localPath, or zipPath`);
      }
      break;
    default:
      throw new Error(`Unknown source type: "${source.type}" in source "${source.label}"`);
  }
}

export async function syncConfigToDb(config: DockitConfig, entryRepo: IEntryRepository, sourceRepo: ISourceRepository): Promise<string[]> {
  const entryIds: string[] = [];

  for (const entryConfig of config.entries) {
    // Preserve existing status if entry already exists
    const existing = await entryRepo.findById(entryConfig.id);
    const now = new Date().toISOString();
    const created_at = existing?.created_at ?? now;

    await entryRepo.save({
      id: entryConfig.id,
      name: entryConfig.name,
      version: entryConfig.version,
      description: entryConfig.description || '',
      status: existing?.status ?? 'pending',
      created_at,
      updated_at: now,
    });

    entryIds.push(entryConfig.id);

    for (const sourceConfig of entryConfig.sources) {
      const config = buildSourceConfig(sourceConfig);
      const sourceId = `${entryConfig.id}-src-${sourceConfig.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;

      // Preserve existing source status if it already exists
      const existingSource = await sourceRepo.findById(sourceId);

      await sourceRepo.save({
        id: sourceId,
        entry_id: entryConfig.id,
        type: sourceConfig.type,
        label: sourceConfig.label,
        config,
        status: existingSource?.status ?? 'pending',
        created_at: existingSource?.created_at ?? now,
      });
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
        graphifyEnabled: source.graphifyEnabled,
        graphifySourcePath: source.graphifySourcePath,
      };
    case 'asciidoc':
      return {
        repoUrl: source.repoUrl,
        zipPath: source.zipPath,
        localPath: source.localPath,
        sourcePath: source.sourcePath,
        graphifyEnabled: source.graphifyEnabled,
        graphifySourcePath: source.graphifySourcePath,
      };
    case 'github-markdown':
      return {
        repoUrl: source.repoUrl,
        localPath: source.localPath,
        sourcePath: source.sourcePath,
        branch: source.branch,
        graphifyEnabled: source.graphifyEnabled,
        graphifySourcePath: source.graphifySourcePath,
      };
    case 'source-code':
      return {
        repoUrl: source.repoUrl,
        localPath: source.localPath,
        zipPath: source.zipPath,
        sourcePath: source.sourcePath,
        branch: source.branch,
        graphifySourcePath: source.graphifySourcePath,
      };
  }
}
