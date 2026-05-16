import path from 'node:path';
import type { ISourceProcessor } from '../../core/ports/ISourceProcessor.js';
import type { Source, AntoraSourceConfig } from '../../core/domain/types.js';
import { buildAntoraSource } from '../../services/antora.js';

export class AntoraSourceProcessor implements ISourceProcessor {
  readonly sourceType = 'antora' as const;

  async process(source: Source, _sourceDir: string, entryDir: string, entryId: string, log: (msg: string) => void): Promise<string> {
    const config = source.config as AntoraSourceConfig;
    const workDir = path.join(entryDir, 'antora', source.id);
    return buildAntoraSource(config, entryId, workDir, log);
  }
}
