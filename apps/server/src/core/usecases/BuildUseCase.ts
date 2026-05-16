import path from 'node:path';
import type { IBuildRepository } from '../../core/ports/IBuildRepository.js';
import type { ISourceRepository } from '../../core/ports/ISourceRepository.js';
import type { IEntryRepository } from '../../core/ports/IEntryRepository.js';
import type { ISearchEngine } from '../../core/ports/ISearchEngine.js';
import type { Source, HtmlFile } from '../../core/domain/types.js';
import type { ZipSourceConfig, AntoraSourceConfig, MavenSourceConfig, AsciidocSourceConfig, GithubMarkdownSourceConfig } from '../../core/domain/types.js';
import { DATA_ROOT } from '../../services/paths.js';
import { downloadAndExtractZip } from '../../services/zip.js';
import { buildAntoraSource } from '../../services/antora.js';
import { buildAsciidocSource } from '../../services/asciidoc.js';
import { buildGithubMarkdownSource } from '../../services/githubMarkdown.js';
import { downloadAndExtractMavenJar } from '../../services/maven.js';
import { normalizeDocs } from '../../services/normalizer.js';

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
  ) {}

  async build(entryId: string): Promise<BuildResult> {
    const sources = await this.sourceRepo.findByEntryId(entryId);
    if (sources.length === 0) throw new Error('Entry has no sources');

    await this.entryRepo.updateStatus(entryId, 'building');
    const build = await this.buildRepo.create(entryId);
    const logLines: string[] = [];
    const log = (msg: string) => logLines.push(`[${new Date().toISOString()}] ${msg}`);
    log('Build started');

    const entryDir = path.join(DATA_ROOT, entryId);
    const bundleDir = path.join(entryDir, 'bundle');

    try {
      const normalizedSources: Array<{ label: string; dir: string }> = [];

      for (const source of sources) {
        const sourceDir = path.join(entryDir, 'sources', source.id);
        log(`Processing source [${source.type}]: ${source.label}`);

        await this.sourceRepo.updateStatus(source.id, 'building');

        try {
          const outputDir = await this.processSource(source, sourceDir, entryDir, entryId, log);
          normalizedSources.push({ label: source.label, dir: outputDir });
          await this.sourceRepo.updateStatus(source.id, 'ready');
        } catch (err) {
          await this.sourceRepo.updateStatus(source.id, 'error');
          log(`  ERROR processing source ${source.label}: ${(err as Error).message}`);
          throw err;
        }
      }

      log('Normalizing documentation bundle');
      const htmlFiles = normalizeDocs(normalizedSources, bundleDir, log);

      log('Building search index');
      await this.searchEngine.buildIndex(
        entryId,
        htmlFiles.map((f) => ({ relativePath: f, fullPath: path.join(bundleDir, f) })),
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

  private async processSource(
    source: Source,
    sourceDir: string,
    entryDir: string,
    entryId: string,
    log: (msg: string) => void,
  ): Promise<string> {
    switch (source.type) {
      case 'zip': {
        const config = source.config as ZipSourceConfig;
        await downloadAndExtractZip(config, sourceDir, log);
        return sourceDir;
      }
      case 'maven': {
        const config = source.config as MavenSourceConfig;
        await downloadAndExtractMavenJar(config, sourceDir, log);
        return sourceDir;
      }
      case 'antora': {
        const config = source.config as AntoraSourceConfig;
        const workDir = path.join(entryDir, 'antora', source.id);
        return buildAntoraSource(config, entryId, workDir, log);
      }
      case 'asciidoc': {
        const config = source.config as AsciidocSourceConfig;
        await buildAsciidocSource(config, sourceDir, log);
        return sourceDir;
      }
      case 'github-markdown': {
        const config = source.config as GithubMarkdownSourceConfig;
        await buildGithubMarkdownSource(config, sourceDir, log);
        return sourceDir;
      }
    }
  }
}
