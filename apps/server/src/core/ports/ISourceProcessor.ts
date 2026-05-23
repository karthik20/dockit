import type { SourceType, Source } from '../domain/types.js';

export interface ISourceProcessor {
  readonly sourceType: SourceType;
  process(source: Source, sourceDir: string, entryDir: string, entryId: string, log: (msg: string) => void): Promise<string>;
  runGraphify?(config: Record<string, unknown>, entryDir: string, log: (msg: string) => void): Promise<void>;
}
