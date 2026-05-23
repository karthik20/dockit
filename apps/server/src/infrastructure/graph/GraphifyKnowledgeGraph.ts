import fs from 'node:fs';
import path from 'node:path';
import type { IKnowledgeGraph } from '../../core/ports/IKnowledgeGraph.js';
import type {
  GraphNode,
  GraphEdge,
  GraphMetadata,
  GraphQueryResult,
  GraphPathResult,
  KnowledgeGraphData,
} from '../../core/domain/knowledge-graph.js';

export class GraphifyKnowledgeGraph implements IKnowledgeGraph {
  private data: KnowledgeGraphData | null = null;
  private adjacency: Map<string, Map<string, GraphEdge[]>> = new Map();

  constructor(entryDir: string) {
    const graphPath = path.join(entryDir, 'graph.json');
    if (fs.existsSync(graphPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
        this.data = this.normalizeGraphData(raw);
        this.buildAdjacency();
      } catch {
        this.data = null;
      }
    }
  }

  private normalizeGraphData(raw: Record<string, unknown>): KnowledgeGraphData {
    const rawNodes = (raw.nodes as Record<string, unknown>[]) || [];
    const rawEdges = (raw.edges as Record<string, unknown>[]) || (raw.links as Record<string, unknown>[]) || [];
    const meta = (raw.metadata as Record<string, unknown>) || {};

    const nodes: GraphNode[] = rawNodes.map((n) => ({
      id: n.id as string,
      name: (n.name ?? n.label ?? n.norm_label ?? n.id) as string,
      file: (n.file ?? n.source_file ?? '') as string,
      type: (n.type ?? n.file_type ?? '') as string,
      line: (n.line ?? 0) as number,
      community: (n.community as number) ?? 0,
    }));

    const edges: GraphEdge[] = rawEdges.map((e) => ({
      source: (e.source as string) ?? (e.source as any)?.id ?? '',
      target: (e.target as string) ?? (e.target as any)?.id ?? '',
      type: (e.type as string) ?? 'depends',
      id: (e.id as string) ?? `${e.source}-${e.target}`,
    }));

    return {
      nodes,
      edges,
      metadata: {
        nodeCount: (meta.nodeCount as number) || nodes.length,
        edgeCount: (meta.edgeCount as number) || edges.length,
        communityCount: (meta.communityCount as number) || 0,
        godNodes: (meta.godNodes as number) || 0,
        languages: (meta.languages as string[]) || [],
      },
    };
  }

  private buildAdjacency(): void {
    if (!this.data) return;
    for (const node of this.data.nodes) {
      this.adjacency.set(node.id, new Map());
    }
    for (const edge of this.data.edges) {
      const srcMap = this.adjacency.get(edge.source);
      if (srcMap) {
        const existing = srcMap.get(edge.target) || [];
        existing.push(edge);
        srcMap.set(edge.target, existing);
      }
    }
  }

  exists(): boolean {
    return this.data !== null && this.data.nodes.length > 0;
  }

  query(query: string, limit = 20): GraphQueryResult {
    if (!this.data) return { nodes: [], edges: [], totalNodes: 0, totalEdges: 0 };

    const q = query.toLowerCase();
    const matchedNodes = this.data.nodes.filter(
      (n) =>
        (n.name || '').toLowerCase().includes(q) ||
        (n.file || '').toLowerCase().includes(q) ||
        (n.type || '').toLowerCase().includes(q),
    );

    const nodeIds = new Set(matchedNodes.map((n) => n.id));
    const matchedEdges = this.data.edges.filter(
      (e) => nodeIds.has(e.source) || nodeIds.has(e.target),
    );

    return {
      nodes: matchedNodes.slice(0, limit),
      edges: matchedEdges.slice(0, limit * 2),
      totalNodes: matchedNodes.length,
      totalEdges: matchedEdges.length,
    };
  }

  findPath(from: string, to: string): GraphPathResult {
    if (!this.data) return { found: false, nodes: [], edges: [], length: 0 };

    const startNode = this.findNodeByName(from);
    const endNode = this.findNodeByName(to);
    if (!startNode || !endNode) return { found: false, nodes: [], edges: [], length: 0 };

    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: startNode.id, path: [startNode.id] }];
    visited.add(startNode.id);

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;
      if (nodeId === endNode.id) {
        const pathNodes = path.map((id) => this.data!.nodes.find((n) => n.id === id)!).filter(Boolean);
        const pathEdges: GraphEdge[] = [];
        for (let i = 0; i < path.length - 1; i++) {
          const edges = this.adjacency.get(path[i])?.get(path[i + 1]);
          if (edges) pathEdges.push(edges[0]);
        }
        return { found: true, nodes: pathNodes, edges: pathEdges, length: path.length - 1 };
      }
      const neighbors = this.adjacency.get(nodeId);
      if (neighbors) {
        for (const [neighborId] of neighbors) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push({ nodeId: neighborId, path: [...path, neighborId] });
          }
        }
      }
    }

    return { found: false, nodes: [], edges: [], length: 0 };
  }

  findGodNodes(limit = 10): GraphNode[] {
    if (!this.data) return [];
    const degreeMap = new Map<string, number>();
    for (const edge of this.data.edges) {
      degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
      degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
    }
    return this.data.nodes
      .map((n) => ({ ...n, degree: degreeMap.get(n.id) || 0 }))
      .sort((a, b) => (b.degree || 0) - (a.degree || 0))
      .slice(0, limit);
  }

  getMetadata(): GraphMetadata {
    if (!this.data) return { nodeCount: 0, edgeCount: 0, communityCount: 0, godNodes: 0, languages: [] };
    return { ...this.data.metadata };
  }

  getNode(id: string): GraphNode | undefined {
    return this.data?.nodes.find((n) => n.id === id);
  }

  private findNodeByName(name: string): GraphNode | undefined {
    if (!this.data) return undefined;
    return (
      this.data.nodes.find((n) => n.id === name || n.name === name) ||
      this.data.nodes.find((n) => n.name.toLowerCase().includes(name.toLowerCase()))
    );
  }
}
