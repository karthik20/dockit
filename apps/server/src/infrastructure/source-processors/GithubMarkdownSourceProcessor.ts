import type { ISourceProcessor } from '../../core/ports/ISourceProcessor.js';
import type { Source, GithubMarkdownSourceConfig } from '../../core/domain/types.js';
import { buildGithubMarkdownSource } from '../../services/githubMarkdown.js';

export class GithubMarkdownSourceProcessor implements ISourceProcessor {
  readonly sourceType = 'github-markdown' as const;

  async process(source: Source, sourceDir: string, _entryDir: string, _entryId: string, log: (msg: string) => void): Promise<string> {
    await buildGithubMarkdownSource(source.config as GithubMarkdownSourceConfig, sourceDir, log);
    return sourceDir;
  }
}
