import type { ISearchEngine } from '../ports/ISearchEngine.js';
import type { SearchResult, GlobalSearchResult } from '../domain/types.js';

export class SearchUseCase {
  constructor(private readonly searchEngine: ISearchEngine) {}

  async searchEntry(entryId: string, query: string, limit = 20): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    return this.searchEngine.search(entryId, query, limit);
  }

  async globalSearch(query: string, limit = 30): Promise<GlobalSearchResult[]> {
    if (!query.trim()) return [];
    return this.searchEngine.globalSearch(query, limit);
  }
}
