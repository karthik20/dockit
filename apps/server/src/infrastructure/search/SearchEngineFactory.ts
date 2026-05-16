import type { ISearchEngine } from '../../core/ports/ISearchEngine.js';
import type { SearchEngineType } from '../../core/domain/types.js';
import { JsonSearchEngine } from './json/JsonSearchEngine.js';

export async function createSearchEngine(engine: SearchEngineType = 'vector'): Promise<ISearchEngine> {
  switch (engine) {
    case 'vector':
      return createVectorSearchEngine();
    case 'json':
    default:
      return new JsonSearchEngine();
  }
}

async function createVectorSearchEngine(): Promise<ISearchEngine> {
  try {
    // Verify LanceDB is available before instantiating
    await import('@lancedb/lancedb');
    const { VectorSearchEngine } = await import('./vector/VectorSearchEngine.js');
    return new VectorSearchEngine();
  } catch {
    console.error(
      '[dockit] Vector search engine is not available. ' +
      'Install @lancedb/lancedb and @dockit/embeddings, then set search.engine to "vector". ' +
      'Falling back to JSON search.'
    );
    return new JsonSearchEngine();
  }
}
