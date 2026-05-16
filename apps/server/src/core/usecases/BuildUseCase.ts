import path from 'node:path';
import type { IBuildRepository } from '../../core/ports/IBuildRepository.js';
import type { ISourceRepository } from '../../core/ports/ISourceRepository.js';
import type { IEntryRepository } from '../../core/ports/IEntryRepository.js';
import type { ISearchEngine } from '../../core/ports/ISearchEngine.js';
import type { IPathResolver } from '../../core/ports/IPathResolver.js';
import type { ISourceProcessor } from '../../core/ports/ISourceProcessor.js';
import type { IDocumentNormalizer } from '../../core/ports/IDocumentNormalizer.js';
import type { Source, HtmlFile } from '../../core/domain/types.js';
import { BuildError } from '../../core/domain/errors.js';

export interface BuildResult {
  buildId: string;
  entryId: string;
  status: 'ready' | 'error';
  log: string;
}

export class BuildUseCase {
  constructor(
    private readonly buildRepo: IBuildRepository,
    private readonly sourceRepo: ISourceRepository,
    private readonly entryRepo: IEntryRepository,
    private readonly searchEngine: ISearchEngine,
    private readonly processors: ISourceProcessor[],
    private readonly documentNormalizer: IDocumentNormalizer,
    private readonly pathResolver: IPathResolver,
  ) {}

  async build(entryId: string): Promise<BuildResult> {
    const sources = await this.sourceRepo.findByEntryId(entryId);
    if (sources.length === 0) throw new BuildError('Entry has no sources', entryId);

    await this.entryRepo.updateStatus(entryId, 'building');
    const build = await this.buildRepo.create(entryId);
    const logLines: string[] = [];
    const log = (msg: string) => logLines.push(`[${new Date().toISOString()}] ${msg}`);
    log('Build started');

    const entryDir = path.join(this.pathResolver.dataRoot, entryId);
    const bundleDir = path.join(entryDir, 'bundle');

    try {
      const normalizedSources: Array<{ label: string; dir: string }> = [];

      for (const source of sources) {
        const sourceDir = path.join(entryDir, 'sources', source.id);
        log(`Processing source [${source.type}]: ${source.label}`);

        await this.sourceRepo.updateStatus(source.id, 'building');

        try {
          const processor = this.processors.find((p) => p.sourceType === source.type);
          if (!processor) throw new BuildError(`No processor for source type: ${source.type}`, entryId);
          const outputDir = await processor.process(source, sourceDir, entryDir, entryId, log);
          normalizedSources.push({ label: source.label, dir: outputDir });
          await this.sourceRepo.updateStatus(source.id, 'ready');
        } catch (err) {
          await this.sourceRepo.updateStatus(source.id, 'error');
          const message = err instanceof Error ? err.message : String(err);
          log(`  ERROR processing source ${source.label}: ${message}`);
          throw err;
        }
      }

      log('Normalizing documentation bundle');
      const htmlFiles = this.documentNormalizer.normalize(normalizedSources, bundleDir, log);

      log('Building search index');
      await this.searchEngine.buildIndex(
        entryId,
        htmlFiles.map((f): HtmlFile => ({ relativePath: f, fullPath: path.join(bundleDir, f) })),
        log,
      );

      const fullLog = logLines.join('\n');
      await this.buildRepo.update(build.id, 'ready', fullLog);
      await this.entryRepo.updateStatus(entryId, 'ready');

      return { buildId: build.id, entryId, status: 'ready', log: fullLog };
    } catch (err) {
      const fullLog = logLines.join('\n');
      await this.buildRepo.update(build.id, 'error', fullLog);
      await this.entryRepo.updateStatus(entryId, 'error');
      return { buildId: build.id, entryId, status: 'error', log: fullLog };
    }
  }
}
