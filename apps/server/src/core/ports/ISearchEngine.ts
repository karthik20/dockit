import type { SearchResult, GlobalSearchResult, HtmlFile, SearchEngineType } from '../domain/types.js';

export interface ISearchEngine {
  readonly capability: SearchEngineType;

  buildIndex(entryId: string, htmlFiles: HtmlFile[], log: (msg: string) => void): Promise<void>;
  search(entryId: string, query: string, limit?: number): Promise<SearchResult[]>;
  globalSearch(query: string, limit?: number): Promise<GlobalSearchResult[]>;
}
