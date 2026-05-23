export type EntryStatus = 'pending' | 'building' | 'ready' | 'error';
export type SourceType = 'zip' | 'antora' | 'maven' | 'asciidoc' | 'github-markdown' | 'source-code';
export type SourceStatus = 'pending' | 'building' | 'ready' | 'error';
export type BuildStatus = 'pending' | 'building' | 'ready' | 'error';

export interface Entry {
  id: string;
  name: string;
  version: string;
  description: string;
  status: EntryStatus;
  source_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  entry_id: string;
  type: SourceType;
  label: string;
  config: SourceConfig;
  status: SourceStatus;
  created_at: string;
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

export interface Build {
  id: string;
  entry_id: string;
  status: BuildStatus;
  log: string;
  started_at: string;
  finished_at: string;
}

export interface EntryDetail extends Entry {
  sources: Source[];
  latestBuild: Build | null;
}

export interface SearchResult {
  path: string;
  title: string;
  headings: string[];
  snippet: string;
}

export interface BuildStatusResponse {
  status: 'none' | BuildStatus;
  log: string;
  startedAt: string;
  finishedAt: string;
}
