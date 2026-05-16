# Hexagonal Architecture + Toggleable Search

## Architecture

```
apps/server/src/
├── core/
│   ├── domain/
│   │   ├── types.ts                # Entry, Source, Build, SearchResult (moved)
│   │   └── errors.ts               # Domain error classes
│   ├── ports/
│   │   ├── ISearchEngine.ts        # search(), globalSearch(), buildIndex(), capability()
│   │   ├── IDocumentStore.ts       # getDocument(), storeDocument()
│   │   ├── IEntryRepository.ts     # Entry CRUD
│   │   ├── ISourceRepository.ts    # Source CRUD
│   │   └── IBuildRepository.ts     # Build lifecycle
│   └── usecases/
│       ├── SearchUseCase.ts
│       ├── BuildUseCase.ts
│       └── ConfigUseCase.ts
├── infrastructure/
│   ├── search/
│   │   ├── SearchEngineFactory.ts       # Reads config, returns ISearchEngine
│   │   ├── json/
│   │   │   └── JsonSearchEngine.ts      # Existing TF-IDF (from indexer.ts)
│   │   └── vector/
│   │       ├── VectorSearchEngine.ts    # LanceDB + embeddings
│   │       └── EmbeddingService.ts      # Wraps @dockit/embeddings
│   ├── persistence/sqlite/
│   │   ├── SqliteEntryRepository.ts
│   │   ├── SqliteSourceRepository.ts
│   │   └── SqliteBuildRepository.ts
│   ├── filesystem/
│   │   └── FileSystemDocumentStore.ts
│   └── sources/                         # (mostly unchanged)
│       ├── asciidoc.ts, antora.ts, maven.ts, githubMarkdown.ts, zip.ts
│       └── normalizer.ts
├── application/
│   ├── index.ts                    # Express server (wires adapters -> use cases)
│   └── routes/                     # Routes call use cases, not services directly
└── mcp.ts                          # MCP (same wiring)
```

## Config Toggle (`dockit.yaml`)

```yaml
search:
  engine: json    # 'json' (default, low-resource) | 'vector' (LanceDB + embeddings)
```

## Two Search Engines

| | JSON Engine | Vector Engine |
|---|---|---|
| **Library** | None (custom TF-IDF) | LanceDB embedded + `@dockit/embeddings` |
| **Resource** | Minimal | ~400MB model + ~200MB RAM |
| **Build** | Extracts title/headings/snippet -> writes `index.json` | Chunks HTML into ~500-token segments -> embeds via all-MiniLM-L6-v2 -> stores in LanceDB collection per entry |
| **Search** | TF-IDF scoring | Embed query -> cosine similarity ANN in LanceDB |
| **Cross-platform** | Yes | Yes (ONNX native bindings via `onnxruntime-node` for Linux, macOS, WSL2) |

## Tech Stack

```
packages/embeddings/
  onnxruntime-node         # ONNX Runtime (npm, no external downloads)
  all-MiniLM-L6-v2.onnx    # Bundled model file (~23MB quantized)
  
apps/server/
  @lancedb/lancedb         # Embedded vector DB (Rust-based, runs in-process)
  @dockit/embeddings       # Workspace dep (no external fetch)
```

## Enterprise Compatibility

- The embedding model is bundled in `packages/embeddings/model/` (no HuggingFace fetch at runtime)
- `onnxruntime-node` ships native binaries for Linux x64/arm64, macOS x64/arm64, Windows x64
- `@lancedb/lancedb` ships prebuilt native binaries for all platforms
- `npm install` gets everything — zero external downloads at runtime

## Implementation Steps

### Step 1: Core domain (`core/domain/`)
- Move `types.ts` to `core/domain/types.ts`
- Create `core/domain/errors.ts` with domain error classes

### Step 2: Ports (`core/ports/`)
- `ISearchEngine` — search(), globalSearch(), buildIndex(), capability()
- `IDocumentStore` — getDocument(), storeDocument()
- `IEntryRepository` — findAll(), findById(), save(), delete()
- `ISourceRepository` — findByEntryId(), findById(), save(), delete()
- `IBuildRepository` — create(), update(), findLatest()

### Step 3: SQLite adapters (`infrastructure/persistence/sqlite/`)
- Extract DB code from `db/index.ts` into repository adapters
- Each adapter implements its port interface
- Database initialization stays in a shared module

### Step 4: JSON search adapter (`infrastructure/search/json/`)
- Move `indexer.ts` TF-IDF logic into `JsonSearchEngine`
- Implements `ISearchEngine` interface
- Zero new dependencies

### Step 5: FileSystem document store (`infrastructure/filesystem/`)
- `textExtractor.ts` logic -> `FileSystemDocumentStore`
- Implements `IDocumentStore` interface

### Step 6: SearchEngineFactory (`infrastructure/search/`)
- Reads `search.engine` from config
- Returns `ISearchEngine` (JsonSearchEngine or VectorSearchEngine)

### Step 7a: Embeddings package (`packages/embeddings/`)
- New workspace package with bundled ONNX model
- Tokenizer + embed() function
- Depends on `onnxruntime-node`

### Step 7b: Vector search adapter (`infrastructure/search/vector/`)
- `VectorSearchEngine` — LanceDB collections, per-entry
- `EmbeddingService` — wraps `@dockit/embeddings`
- Chunks documents, generates embeddings, stores in LanceDB

### Step 8: Use cases (`core/usecases/`)
- `SearchUseCase` — orchestrates search via injected ISearchEngine
- `BuildUseCase` — orchestrates build pipeline
- `ConfigUseCase` — manages entries/sources via repositories

### Step 9: Refactor application layer
- Routes call use cases with injected adapters
- MCP calls use cases with same wiring
- Source processors (asciidoc, antora, etc.) mostly unchanged

### Step 10: Config + dependencies
- Add `search.engine` to `dockit.yaml`
- Add new workspace to root `package.json`
- Add new dependencies to `apps/server/package.json`
