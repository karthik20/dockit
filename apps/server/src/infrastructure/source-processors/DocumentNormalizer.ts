import type { IDocumentNormalizer } from '../../core/ports/IDocumentNormalizer.js';
import { normalizeDocs } from '../../services/normalizer.js';

export class DocumentNormalizer implements IDocumentNormalizer {
  normalize(sources: Array<{ label: string; dir: string }>, outputDir: string, log: (msg: string) => void): string[] {
    return normalizeDocs(sources, outputDir, log);
  }
}
