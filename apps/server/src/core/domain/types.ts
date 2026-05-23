export type EntryStatus = 'pending' | 'building' | 'ready' | 'error';
export type SourceType = 'zip' | 'antora' | 'maven' | 'asciidoc' | 'github-markdown' | 'source-code';
export type SourceStatus = 'pending' | 'building' | 'ready' | 'error';
export type BuildStatus = 'pending' | 'building' | 'ready' | 'error';
export type SearchEngineType = 'json' | 'vector';

export interface Entry {
  id: string;
  name: string;
  version: string;
  description: string;
  status: EntryStatus;
  created_at: string;
  updated_at: string;
}

export interface ZipSourceConfig {
  url?: string;
  localPath?: string;
}

export interface AntoraSourceConfig {
  repoUrl?: string;
  zipPath?: string;
  localPath?: string;
  playbookOverrides?: Record<string, unknown>;
  graphifyEnabled?: boolean;
  graphifySourcePath?: string;
}

export interface MavenSourceConfig {
  groupId: string;
  artifactId: string;
  version: string;
  classifier?: string;
  useMavenCommand?: boolean;
  localJar?: string;
}

export interface AsciidocSourceConfig {
  repoUrl?: string;
  zipPath?: string;
  localPath?: string;
  sourcePath?: string;
  graphifyEnabled?: boolean;
  graphifySourcePath?: string;
}

export interface GithubMarkdownSourceConfig {
  repoUrl?: string;
  localPath?: string;
  sourcePath?: string;
  branch?: string;
  graphifyEnabled?: boolean;
  graphifySourcePath?: string;
}

export interface SourceCodeSourceConfig {
  repoUrl?: string;
  localPath?: string;
  zipPath?: string;
  sourcePath?: string;
  branch?: string;
  graphifySourcePath?: string;
}

export type SourceConfig = ZipSourceConfig | AntoraSourceConfig | MavenSourceConfig | AsciidocSourceConfig | GithubMarkdownSourceConfig | SourceCodeSourceConfig;

export interface Source {
  id: string;
  entry_id: string;
  type: SourceType;
  label: string;
  config: SourceConfig;
  status: SourceStatus;
  created_at: string;
}

export interface Build {
  id: string;
  entry_id: string;
  status: BuildStatus;
  log: string;
  started_at: string;
  finished_at: string;
}

export interface CreateEntryInput {
  id?: string;
  name: string;
  version: string;
  description?: string;
}

export interface UpdateEntryInput {
  name?: string;
  version?: string;
  description?: string;
}

export interface CreateSourceInput {
  type: SourceType;
  label: string;
  config: SourceConfig;
}

export interface UpdateSourceInput {
  label?: string;
  config?: SourceConfig;
}

export interface SearchResult {
  path: string;
  title: string;
  headings: string[];
  snippet: string;
}

export interface GlobalSearchResult extends SearchResult {
  entryId: string;
  entryName: string;
  entryVersion: string;
}

export interface HtmlFile {
  relativePath: string;
  fullPath: string;
}

export interface SearchConfig {
  engine: SearchEngineType;
}

export interface DockitConfig {
  entries: DockitEntryConfig[];
  search?: SearchConfig;
  mcp?: {
    toolPrefix?: string;
    maxSearchResults?: number;
    autoBuild?: boolean;
  };
}

export interface DockitEntryConfig {
  id: string;
  name: string;
  version: string;
  description?: string;
  sources: DockitSourceConfig[];
}

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
