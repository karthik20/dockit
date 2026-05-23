import type { Source } from '../domain/types.js';

export interface IDocumentNormalizer {
  normalize(sources: Array<{ label: string; dir: string }>, outputDir: string, log: (msg: string) => void): string[];
  filterSources(sources: Array<{ label: string; dir: string }>, allSourceRecords: Source[]): Array<{ label: string; dir: string }>;
}
