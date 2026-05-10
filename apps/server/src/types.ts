export type EntryStatus = 'pending' | 'building' | 'ready' | 'error';
export type SourceType = 'zip' | 'antora' | 'maven' | 'asciidoc';
export type SourceStatus = 'pending' | 'building' | 'ready' | 'error';
export type BuildStatus = 'pending' | 'building' | 'ready' | 'error';

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
}

export type SourceConfig = ZipSourceConfig | AntoraSourceConfig | MavenSourceConfig | AsciidocSourceConfig;

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
