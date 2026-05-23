# Source Code Source Type for Dockit (Powered by Graphify)

**Status**: Draft Plan  
**Branch**: `feat/graphify-source-plan`  
**Date**: 2026-05-23  
**Base**: `main`

---

## 1. Motivation

Dockit currently handles 5 documentation source types (`zip`, `antora`, `maven`, `asciidoc`, `github-markdown`). All produce **HTML documentation** that gets indexed for text search. None handle raw source code.

A previous branch (`feat/graphify-integration`) integrated Graphify as an optional post-build step, running it on the HTML bundle or re-cloning source repos. This had low value because:
- Running on HTML docs → empty graph (no code for Tree-sitter)
- Running on re-cloned repos → wasteful re-cloning, weak doc-topic relevance

**The insight**: Dockit should treat source code as a **first-class source type**. When a user adds a source code repo, Graphify runs directly during source processing (not as an optional add-on), producing a knowledge graph that becomes the primary query mechanism.

This gives real value:
- Graphify's Tree-sitter AST pass parses Java, JS, TS, Python, Go, and 13+ other languages — producing structural edges (*calls*, *imports*, *inherits*) without any LLM
- The knowledge graph captures class hierarchies, function dependencies, module structure
- Developers can query: "what classes implement this interface?", "what does this function call?", "find the dependency path between these two modules"
- The UI can display a "powered by Graphify" badge + graph metadata

---

## 2. Architecture: New Source Type

### 2a. Domain Types (`core/domain/types.ts`)

```typescript
export type SourceType = 'zip' | 'antora' | 'maven' | 'asciidoc' | 'github-markdown' | 'source-code';

export interface SourceCodeSourceConfig {
  repoUrl?: string;
  localPath?: string;
  zipPath?: string;
  sourcePath?: string;
  branch?: string;
}

export type SourceConfig = ZipSourceConfig | AntoraSourceConfig | MavenSourceConfig
  | AsciidocSourceConfig | GithubMarkdownSourceConfig | SourceCodeSourceConfig;
```

Also add to `services/configLoader.ts` for YAML schema parsing.

### 2b. New Source Processor (`infrastructure/source-processors/SourceCodeSourceProcessor.ts`)

```
class SourceCodeSourceProcessor implements ISourceProcessor {
  readonly sourceType = 'source-code';

  async process(source, sourceDir, entryDir, entryId, log):
    1. Clone repo (or copy localPath / extract zipPath) into sourceDir
    2. If sourcePath specified, narrow to that subdirectory
    3. Auto-install Graphify if not on PATH
    4. Run `graphify <targetDir>` (with timeout)
    5. Copy graph.json → entryDir/graph.json
    6. Copy graph.html → entryDir/graph.html (for UI visualization)
    7. Log graph metadata (node count, edge count, communities)
    8. Return sourceDir (for normalization step — see §2d)
}
```

### 2c. Build Pipeline — What Changes

**Remove** (cleanup from `feat/graphify-integration`):

| Component | Reason |
|-----------|--------|
| `core/ports/IKnowledgeGraphBuilder` | No longer needed — source processor produces graph directly |
| `infrastructure/graph/GraphifyKnowledgeGraphBuilder` | Logic subsumed by SourceCodeSourceProcessor |
| `graph:` config section (`dockit.yaml` + `DockitConfig`) | No longer needed — graph is automatic for source-code sources |
| `search.graphBoost` config flag | No longer needed — decorator checks `graph.json` at runtime |
| `graphBuilder` parameter from `BuildUseCase` | Graph production is a source processing concern, not a build-pipeline concern |

**Preserve** (from `feat/graphify-integration`):

| Component | Reason |
|-----------|--------|
| `core/domain/knowledge-graph.ts` | All graph domain types (GraphNode, GraphEdge, etc.) |
| `core/ports/IKnowledgeGraph.ts` | Graph query port interface |
| `infrastructure/graph/GraphifyKnowledgeGraph.ts` | Reads graph.json, implements queries, BFS pathfinding |
| `infrastructure/graph/GraphSearchDecorator.ts` | ISearchEngine decorator using IKnowledgeGraph |
| 4 graph MCP tools in `mcp.ts` | `graph_query`, `graph_path`, `graph_explain`, `graph_gods` |

### 2d. Normalization Skip (`infrastructure/source-processors/DocumentNormalizer.ts`)

```typescript
for (const source of normalizedSources) {
  if (source.type === 'source-code') continue;  // no HTML to normalize
  // existing logic
}
```

### 2e. Search Behavior

| Scenario | Behavior |
|----------|----------|
| Entry with only `source-code` sources | `dockit_search` → empty (no HTML). Query via `dockit_graph_*` tools |
| Entry with mixed sources (HTML + code) | Search works normally on HTML. Graph boost from code graph re-ranks |
| Global search | Skips entries with no search index. Graph tools work per-entry |

Simplify `SearchEngineFactory`: remove `graphBoost` config flag. The decorator checks `graph.exists()` at runtime:

```typescript
export async function createSearchEngine(
  entryReadModel: IEntryReadModel,
  knowledgeGraph?: IKnowledgeGraph,
): Promise<ISearchEngine> {
  let engine = await createVectorSearchEngine(entryReadModel);
  if (knowledgeGraph) {
    engine = new GraphSearchDecorator(engine, knowledgeGraph);
  }
  return engine;
}
```

### 2f. Configuration (`dockit.yaml`)

```yaml
entries:
  - id: quarkus-code
    name: Quarkus Source Code
    version: "3.35"
    description: "Quarkus framework source code — knowledge graph"
    sources:
      - type: source-code
        label: "Quarkus Core"
        repoUrl: "https://github.com/quarkusio/quarkus.git"
        sourcePath: "core/src/main/java"

  - id: quarkus-combined
    name: Quarkus (Docs + Code)
    version: "3.35"
    sources:
      - type: asciidoc
        label: "Quarkus Docs"
        repoUrl: "https://github.com/quarkusio/quarkus.git"
        sourcePath: "docs/src/main/asciidoc"
      - type: source-code
        label: "Quarkus Core"
        repoUrl: "https://github.com/quarkusio/quarkus.git"
        sourcePath: "core/src/main/java"
```

---

## 3. Files Changed

### Add
| File | Purpose |
|------|---------|
| `GRAPHIFY_SOURCE_PLAN.md` | This document |
| `infrastructure/source-processors/SourceCodeSourceProcessor.ts` | New source processor |

### Remove
| File | Reason |
|------|--------|
| `core/ports/IKnowledgeGraphBuilder.ts` | Port no longer needed |
| `infrastructure/graph/GraphifyKnowledgeGraphBuilder.ts` | Logic subsumed by SourceCodeSourceProcessor |

### Modify
| File | Change |
|------|--------|
| `core/domain/types.ts` | Add `'source-code'` to `SourceType`, add `SourceCodeSourceConfig` |
| `core/usecases/BuildUseCase.ts` | Remove `IKnowledgeGraphBuilder` import, injection, build call |
| `infrastructure/source-processors/DocumentNormalizer.ts` | Skip `source-code` sources |
| `infrastructure/search/SearchEngineFactory.ts` | Accept `IKnowledgeGraph` directly (no `SearchConfig`), remove `graphBoost` |
| `services/configLoader.ts` | Add source-code YAML parsing |
| `apps/server/src/mcp.ts` | Register SourceCodeSourceProcessor, simplify graph wiring |
| `apps/server/src/index.ts` | Register new processor, simplify graph wiring |
| `bin/commands/build.ts` | Remove graphBuilder wiring |
| `bin/commands/search.ts` | Simplify config passing |
| `dockit.yaml` | Remove `graph:` and `search.graphBoost`, add source-code example |
| `SKILL.md` + `.claude/` + `.opencode/` skills | Document graph tools as primary query for source-code entries |

---

## 4. UI Changes (Web Client)

### 4a. New Source Type Form Entry
Add "Source Code" to the source type dropdown. Show fields:
- Label
- Repository URL (for `repoUrl`)
- Local Path (for `localPath`)
- ZIP Path (for `zipPath`)
- Source Path (optional subdirectory)
- Branch (optional)

### 4b. "Powered by Graphify" Badge
On entry cards with `source-code` sources, show:

```
┌─────────────────────────────────────────┐
│  Quarkus Source Code  v3.35   [⚡ Code]│
│  Quarkus framework source code          │
│  ┌─────────────────────────────────┐    │
│  │  Nodes: 1,247  │  Edges: 3,890  │    │
│  │  Communities: 12 │  God Nodes: 5 │    │
│  │  ⚡ powered by Graphify          │    │
│  └─────────────────────────────────┘    │
│  [Build Now] [Browse Graph →]           │
└─────────────────────────────────────────┘
```

Metadata (nodes, edges, communities) read from built `graph.json`.

### 4c. Graph Browser
"Browse Graph" opens an embedded viewer for Graphify's interactive `graph.html`.

---

## 5. Implementation Order

| Step | Description | Files | Est. |
|------|-------------|-------|------|
| 1 | Remove `IKnowledgeGraphBuilder` + `GraphifyKnowledgeGraphBuilder` | 2 files | 15 min |
| 2 | Remove `graphBuilder` from `BuildUseCase`, `config.graph` from types/yaml | 4 files | 15 min |
| 3 | Add `source-code` to `SourceType` + `SourceCodeSourceConfig` | `types.ts`, `configLoader.ts` | 10 min |
| 4 | Create `SourceCodeSourceProcessor` | 1 file | 2 hr |
| 5 | Register processor in `mcp.ts`, `index.ts`, `bin/commands/build.ts` | 3 files | 20 min |
| 6 | Update `DocumentNormalizer` | 1 file | 10 min |
| 7 | Simplify `SearchEngineFactory` | 1 file | 20 min |
| 8 | Update `dockit.yaml` | 1 file | 10 min |
| 9 | Update skills + docs | 4 files | 20 min |
| 10 | UI changes (separate PR if desired) | client/ | 4 hr |
| 11 | Test end-to-end | — | 1 hr |

**Total code**: ~8 modified + 1 new + 2 removed = ~5 hr  
**UI**: ~4 hr (can be separate PR)

---

## 6. Verification

```bash
# Build source-code only entry
dockit build quarkus-code
# → Clones repo, runs graphify, produces graph.json with real code nodes

# Query the graph
dockit_graph_query quarkus-code "CaffeineCache"
# → Returns node details + edge explanations

# Path finding
dockit_graph_path quarkus-code "CacheManager" "CaffeineCache"
# → 1 hop: CacheManager delegates to CaffeineCache

# God nodes (most connected classes)
dockit_graph_gods quarkus-code
# → Top 10 highest-degree classes

# Search returns empty (no HTML docs)
dockit search quarkus-code "cache"
# → No results

# Mixed entry (docs + code)
dockit build quarkus-combined
# → Search works on docs, graph query works on code, search results graph-boosted
```

---

## 7. Open Questions

1. **Should a `source-code` entry also support `dockit search` via text-indexed source files?** Currently "no" — graph tools are the query mechanism. Could be a follow-up.

2. **`source-code` + existing doc source in same entry?** Yes. The doc provides text search, the code provides graph querying. Search results are graph-boosted automatically.

3. **ZIP source handling** — Extract ZIP to a temp dir, then run graphify on the extracted directory. Works fine.

4. **Large repos** — `git clone --depth 1` is fast. Graphify scans all files but skips build artifacts via its `detect` phase. Default 10-min timeout should suffice.

5. **Docker / Production** — `Dockerfile` needs `python3`, `python3-pip`, `git`. Graphify auto-installs via pip if missing.

---

## 8. Dependency on Previous Branch

This plan depends on the graph infrastructure from `feat/graphify-integration`:
- `core/domain/knowledge-graph.ts` — domain types
- `core/ports/IKnowledgeGraph.ts` — query port
- `infrastructure/graph/GraphifyKnowledgeGraph.ts` — JSON graph reader
- `infrastructure/graph/GraphSearchDecorator.ts` — search re-ranking
- 4 MCP tools in `mcp.ts` — graph_query, graph_path, graph_explain, graph_gods

The previous branch's code modifications to `mcp.ts`, `index.ts`, `SearchEngineFactory.ts`, `BuildUseCase.ts`, `types.ts`, and `dockit.yaml` are partially **reverted** in this plan (the graph builder injection, config flags) and partially **preserved** (the graph port, adapter, MCP tools, decorator).
