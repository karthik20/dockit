import type { ISearchEngine } from '../../core/ports/ISearchEngine.js';
import type { SearchEngineType } from '../../core/domain/types.js';
import { JsonSearchEngine } from './json/JsonSearchEngine.js';

export function createSearchEngine(engine: SearchEngineType = 'json'): ISearchEngine {
  switch (engine) {
    case 'json':
      return new JsonSearchEngine();
    case 'vector':
      return createVectorSearchEngine();
    default:
      return new JsonSearchEngine();
  }
}

function createVectorSearchEngine(): ISearchEngine {
  try {
    const { VectorSearchEngine } = require('./vector/VectorSearchEngine.js');
    return new VectorSearchEngine();
  } catch {
    console.error(
      '[dockit] Vector search engine is not available. ' +
      'Install @lancedb/lancedb and @dockit/embeddings, then set search.engine to "vector".'
    );
    return new JsonSearchEngine();
  }
}
