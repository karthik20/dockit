import type { ISearchEngine } from '../../core/ports/ISearchEngine.js';
import type { IKnowledgeGraph } from '../../core/ports/IKnowledgeGraph.js';
import type { SearchResult, GlobalSearchResult, HtmlFile, SearchEngineType } from '../../core/domain/types.js';

export class GraphSearchDecorator implements ISearchEngine {
  readonly capability: SearchEngineType;

  constructor(
    private readonly engine: ISearchEngine,
    private readonly knowledgeGraph: IKnowledgeGraph,
  ) {
    this.capability = engine.capability;
  }

  async buildIndex(entryId: string, htmlFiles: HtmlFile[], log: (msg: string) => void): Promise<void> {
    return this.engine.buildIndex(entryId, htmlFiles, log);
  }

  async search(entryId: string, query: string, limit = 10): Promise<SearchResult[]> {
    const results = await this.engine.search(entryId, query, limit);
    if (!this.knowledgeGraph.exists() || results.length === 0) return results;

    const graphResult = this.knowledgeGraph.query(query);
    if (graphResult.totalNodes === 0) return results;

    const graphNames = new Set(graphResult.nodes.map((n) => n.name.toLowerCase()));
    const scored = results.map((r) => {
      let boost = 0;
      const titleWords = r.title.toLowerCase().split(/\s+/);
      const snippetWords = r.snippet.toLowerCase().split(/\s+/);
      for (const word of titleWords) {
        if (graphNames.has(word)) boost += 0.3;
      }
      for (const word of snippetWords) {
        if (graphNames.has(word)) boost += 0.1;
      }
      return { ...r, _score: boost };
    });

    scored.sort((a, b) => (b._score || 0) - (a._score || 0));
    return scored.slice(0, limit);
  }

  async globalSearch(query: string, limit = 20): Promise<GlobalSearchResult[]> {
    return this.engine.globalSearch(query, limit);
  }
}

declare module '../../core/domain/types.js' {
  interface SearchResult {
    _score?: number;
  }
}
