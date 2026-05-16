import type { ISourceProcessor } from '../../core/ports/ISourceProcessor.js';
import type { Source, MavenSourceConfig } from '../../core/domain/types.js';
import { downloadAndExtractMavenJar } from '../../services/maven.js';

export class MavenSourceProcessor implements ISourceProcessor {
  readonly sourceType = 'maven' as const;

  async process(source: Source, sourceDir: string, _entryDir: string, _entryId: string, log: (msg: string) => void): Promise<string> {
    await downloadAndExtractMavenJar(source.config as MavenSourceConfig, sourceDir, log);
    return sourceDir;
  }
}
