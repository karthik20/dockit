import type { ISourceProcessor } from '../../core/ports/ISourceProcessor.js';
import type { Source, ZipSourceConfig } from '../../core/domain/types.js';
import { downloadAndExtractZip } from '../../services/zip.js';

export class ZipSourceProcessor implements ISourceProcessor {
  readonly sourceType = 'zip' as const;

  async process(source: Source, sourceDir: string, _entryDir: string, _entryId: string, log: (msg: string) => void): Promise<string> {
    await downloadAndExtractZip(source.config as ZipSourceConfig, sourceDir, log);
    return sourceDir;
  }
}
