import type { ISourceProcessor } from '../../core/ports/ISourceProcessor.js';
import type { Source, AsciidocSourceConfig } from '../../core/domain/types.js';
import { buildAsciidocSource } from '../../services/asciidoc.js';

export class AsciidocSourceProcessor implements ISourceProcessor {
  readonly sourceType = 'asciidoc' as const;

  async process(source: Source, sourceDir: string, _entryDir: string, _entryId: string, log: (msg: string) => void): Promise<string> {
    await buildAsciidocSource(source.config as AsciidocSourceConfig, sourceDir, log);
    return sourceDir;
  }
}
