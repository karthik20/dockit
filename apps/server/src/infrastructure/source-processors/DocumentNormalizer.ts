import type { IDocumentNormalizer } from '../../core/ports/IDocumentNormalizer.js';
import type { Source } from '../../core/domain/types.js';
import { normalizeDocs } from '../../services/normalizer.js';

export class DocumentNormalizer implements IDocumentNormalizer {
  normalize(sources: Array<{ label: string; dir: string }>, outputDir: string, log: (msg: string) => void): string[] {
    return normalizeDocs(sources, outputDir, log);
  }

  filterSources(sources: Array<{ label: string; dir: string }>, allSourceRecords: Source[]): Array<{ label: string; dir: string }> {
    const sourceCodeLabels = new Set(
      allSourceRecords.filter((s) => s.type === 'source-code').map((s) => s.label),
    );
    return sources.filter((s) => !sourceCodeLabels.has(s.label));
  }
}
