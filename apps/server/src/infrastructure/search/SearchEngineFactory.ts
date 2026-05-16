import type { ISearchEngine } from '../../core/ports/ISearchEngine.js';
import type { IEntryReadModel } from '../../core/ports/IEntryReadModel.js';
import type { SearchEngineType } from '../../core/domain/types.js';
import { JsonSearchEngine } from './json/JsonSearchEngine.js';

export async function createSearchEngine(
  entryReadModel: IEntryReadModel,
  engine: SearchEngineType = 'vector',
): Promise<ISearchEngine> {
  switch (engine) {
    case 'vector':
      return createVectorSearchEngine(entryReadModel);
    case 'json':
    default:
      return new JsonSearchEngine(entryReadModel);
  }
}

async function createVectorSearchEngine(entryReadModel: IEntryReadModel): Promise<ISearchEngine> {
  try {
    await import('@lancedb/lancedb');
    const { VectorSearchEngine } = await import('./vector/VectorSearchEngine.js');
    return new VectorSearchEngine(entryReadModel);
  } catch {
    console.error(
      '[dockit] Vector search engine is not available. ' +
      'Install @lancedb/lancedb and @dockit/embeddings, then set search.engine to "vector". ' +
      'Falling back to JSON search.'
    );
    return new JsonSearchEngine(entryReadModel);
  }
}
