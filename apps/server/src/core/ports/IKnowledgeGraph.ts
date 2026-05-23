import type { GraphQueryResult, GraphPathResult, GraphNode, GraphMetadata } from '../domain/knowledge-graph.js';

export interface IKnowledgeGraph {
  exists(): boolean;
  query(query: string, limit?: number): GraphQueryResult;
  findPath(from: string, to: string): GraphPathResult;
  findGodNodes(limit?: number): GraphNode[];
  getMetadata(): GraphMetadata;
  getNode(id: string): GraphNode | undefined;
}
