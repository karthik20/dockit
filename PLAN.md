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
  engine: vector    # 'vector' (default, hybrid semantic+keyword) | 'json' (TF-IDF fallback)
```

**Default:** `vector` — hybrid search combining cosine vector similarity + BM25 keyword scoring via Reciprocal Rank Fusion.

## Two Search Engines

| | JSON Engine | Vector Engine (Hybrid) |
|---|---|---|
| **Library** | None (custom TF-IDF) | LanceDB embedded + `@dockit/embeddings` |
| **Resource** | Minimal | ~400MB model + ~200MB RAM |
| **Build** | Extracts title/headings/snippet -> writes `index.json` | Chunks HTML by h1-h4 headings -> embeds via all-MiniLM-L6-v2 (cosine) + creates FTS index on searchText -> stores in LanceDB table per entry |
| **Search** | TF-IDF scoring (title 10x, headings 3x, snippet 1x) | **Hybrid**: parallel vector (cosine ANN) + BM25 FTS -> deduplicated per-page -> RRF (Reciprocal Rank Fusion) with dynamic FTS weighting |
| **Embed text** | N/A | `title (2x) + sectionHeading + sectionText` (up to 2000 chars) |
| **Fusion** | N/A | Deduplicate chunks by path -> RRF (k=25) -> dynamic FTS weight based on score distribution confidence -> title boosting (1.5x if query terms in title) |
| **Cross-platform** | Yes | Yes (ONNX native bindings via `onnxruntime-node` for Linux, macOS, WSL2) |

### Hybrid Search Architecture

```
query: "quarkus in memory cache caffeine"
  │
  ├─ Vector query: embed -> cosine ANN on vector index -> top 40
  │      Deduplicate per path (keep best _distance)
  │
  ├─ FTS query:   BM25 on searchText column (includes title 2x) -> top 40
  │      Deduplicate per path (keep best _score)
  │      Filter: drop results < 30% of max BM25 score
  │      Dynamic weight: if score gap > 1.3x, weight=2.0; else weight=0.7
  │
  └─ RRF Fusion:  RRF(path) = Σ[vec] 1/(k+rank) + weight * Σ[fts] 1/(k+rank)
                   Sort by RRF score descending -> deduplicate -> return top N
```

### Search Quality Benchmarks (quarkus entry)

| Query | JSON (TF-IDF) Top-5 Precision | Vector Hybrid Top-5 Precision |
|-------|------|------|
| `quarkus in memory cache caffeine` | 4/5 ✓ (main guide #1) | 2/5 (main guide #1 ✓, with section context) |
| `reactive rest endpoint` | 4/5 ✓ | 4/5 ✓ (Writing REST Services #1) |
| `@CacheResult annotation` | 1/5 (correct page #1) | 1/5 (correct page #1) |
| `configure datasource postgresql` | 2/5 ✓ | 2/5 ✓ |
| `native image build graalvm` | 2/5 ✓ | 3/5 ✓ (finds Tips for Native that JSON misses) |

**Key improvements over original vector-only search:**
- Main caching guide now reliably #1 (was missing from top 10 initially)
- Section-level headings in results provide better context for technical docs
- Hybrid FTS + RRF fusion recovers keyword precision that pure vector search loses
- Dynamic FTS weighting adapts to query specificity (specific terms → rely on FTS; generic queries → rely on vector)

## Tech Stack

```
packages/embeddings/
  @huggingface/transformers  # Auto-downloads ONNX model on first use (cached locally)
  all-MiniLM-L6-v2            # 384-dim sentence transformer (ONNX, ~23MB)

apps/server/
  @lancedb/lancedb            # Embedded vector DB (Rust native bindings)
  @dockit/embeddings          # Workspace dep (no external fetch at runtime)
```

## Enterprise Compatibility

- The embedding model downloads on first use via `@huggingface/transformers` (cached to `~/.cache/huggingface` or project-local `packages/embeddings/data/`)
- For air-gapped environments: pre-download via `npm run download-model -w packages/embeddings`
- `@lancedb/lancedb` ships prebuilt Rust native binaries for all platforms (linux x64/arm64, macOS x64/arm64, Windows x64/arm64)
- `npm install` provides the embedding library; model loads lazily on first `embed()` call

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
