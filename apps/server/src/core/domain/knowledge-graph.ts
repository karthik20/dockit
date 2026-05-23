export interface GraphNode {
  id: string;
  name: string;
  type: string;
  file: string;
  line: number;
  community?: number;
  degree?: number;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight?: number;
}

export interface GraphMetadata {
  nodeCount: number;
  edgeCount: number;
  communityCount: number;
  godNodes: number;
  languages: string[];
}

export interface GraphPathResult {
  found: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  length: number;
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalNodes: number;
  totalEdges: number;
}

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    nodeCount: number;
    edgeCount: number;
    communityCount: number;
    godNodes: number;
    languages: string[];
  };
}
