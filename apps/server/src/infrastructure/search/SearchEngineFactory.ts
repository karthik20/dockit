import type { ISearchEngine } from '../../core/ports/ISearchEngine.js';
import type { IEntryReadModel } from '../../core/ports/IEntryReadModel.js';
import type { IKnowledgeGraph } from '../../core/ports/IKnowledgeGraph.js';
import type { SearchEngineType } from '../../core/domain/types.js';
import { JsonSearchEngine } from './json/JsonSearchEngine.js';
import { GraphSearchDecorator } from '../graph/GraphSearchDecorator.js';

export async function createSearchEngine(
  entryReadModel: IEntryReadModel,
  engine: SearchEngineType = 'vector',
  knowledgeGraph?: IKnowledgeGraph,
): Promise<ISearchEngine> {
  let engine_ = engine;
  switch (engine_) {
    case 'vector':
      return wrapWithGraph(await createVectorSearchEngine(entryReadModel), knowledgeGraph);
    case 'json':
    default:
      return wrapWithGraph(new JsonSearchEngine(entryReadModel), knowledgeGraph);
  }
}

function wrapWithGraph(engine: ISearchEngine, knowledgeGraph?: IKnowledgeGraph): ISearchEngine {
  if (knowledgeGraph && knowledgeGraph.exists()) {
    return new GraphSearchDecorator(engine, knowledgeGraph);
  }
  return engine;
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
