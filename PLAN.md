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
**Resource** for Vector Engine: ~88 MB (embedding model) + ~32 MB/entry (LanceDB index) + ~200 MB RAM at runtime
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
  @huggingface/transformers  # Pipeline API for tokenization + ONNX inference across platforms
  all-MiniLM-L6-v2            # 384-dim sentence transformer (~88 MB ONNX model + tokenizers/configs)
  
apps/server/
  @lancedb/lancedb            # Embedded vector DB (Rust native bindings)
  @dockit/embeddings          # Workspace dep (no external fetch at runtime)
```

## Embedding Model Configuration

`@huggingface/transformers` exposes a global `env` object at `@huggingface/transformers` for controlling model loading. The following options are relevant for bundling/offline use:

| Option | Default | Purpose |
|--------|---------|---------|
| `env.cacheDir` | `./.cache/` | Directory where models are stored. Set to project-local path for bundling. |
| `env.allowRemoteModels` | `true` | Set to `false` to prevent any HuggingFace CDN downloads (offline mode). |
| `env.allowLocalModels` | `true` (Node.js) | Whether to check the local filesystem in `cacheDir`. |
| `env.localModelPath` | `/models/` | Alternate local path to search for model files. |
| `env.remoteHost` | `huggingface.co` | CDN host. Changeable for proxy/mirror environments. |
| `env.useFSCache` | `true` (Node.js) | Whether to cache files to disk via `cacheDir`. |

### Bundle mode (offline, enterprise-ready)

```ts
import { pipeline, env } from '@huggingface/transformers';

// Point cacheDir to the bundled model directory
env.cacheDir = path.join(__dirname, '..', 'model');   // packages/embeddings/model/
env.allowRemoteModels = false;                          // block all CDN fetches

const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
  dtype: 'q8',
});
```

The model must be pre-populated in `cacheDir` following the HuggingFace Hub cache format:

```
<cacheDir>/
  models--<org>--<model-name>/           # e.g., models--sentence-transformers--all-MiniLM-L6-v2
    blobs/                                # Content-addressed: actual ONNX + config files
      53aa5117...  (87 MB ONNX model)
      58d4a9a4...  (11 KB README)
      cb202bfe...  (456 KB tokenizer)
      ...          (~500 KB total configs)
    refs/
      main          (file containing snapshot commit hash)
    snapshots/
      <commit-hash>/                     # Symlinks → ../../blobs/<hash>
        config.json -> ../../blobs/<hash>
        tokenizer.json -> ../../blobs/<hash>
        model.safetensors -> ../../blobs/<hash>
        ...
```

### Download mode (connected environments)

The model can also be pre-seeded by running:

```
npm run download-model -w packages/embeddings
```

This calls `pipeline()` once (with `allowRemoteModels = true`), which downloads and caches the model to the configured `cacheDir`. After this, `allowRemoteModels` can be set to `false` for subsequent runs.

### Proxy environment configuration

If behind an HTTP proxy (common in enterprises), HuggingFace downloads respect standard proxy environment variables:

```bash
export HTTP_PROXY=http://proxy.corp:8080
export HTTPS_PROXY=http://proxy.corp:8080
```

Or override the CDN host via `env.remoteHost` to point at an internal mirror.

## Enterprise Compatibility

### Embedding Model

- **Bundled mode** (recommended for air-gapped): Set `env.cacheDir` to `packages/embeddings/model/` and `env.allowRemoteModels = false`. The 88 MB model (ONNX + tokenizers + configs) ships inside the npm tarball. Zero external fetches at runtime.
- **Download mode**: Model downloads on first `embed()` call from HuggingFace CDN, cached to `env.cacheDir`. Respects `HTTP_PROXY`/`HTTPS_PROXY`.
- **Pre-seed**: Run `npm run download-model -w packages/embeddings` once on a connected machine, then copy the `model/` directory to target machines.
- `@lancedb/lancedb` ships prebuilt Rust native binaries for all platforms (linux x64/arm64, macOS x64/arm64, Windows x64/arm64)

## Pre-built Index Bundling

Pre-built indexes can be bundled in the npm package for zero-network operation. This is distinct from runtime builds — indexes are frozen from a build machine and shipped alongside the code.

### Storage Layout

```
packages/indexes/                     # @dockit/indexes workspace (future: separate package per entry)
  package.json
  entries.json                        # manifest: entry IDs, versions, build timestamps
  quarkus/
    index.json                        # JSON index (~300 KB)
    .lancedb/quarkus.lance/           # LanceDB table (~32 MB)
    bundle.tar.gz                     # HTML bundle (optional, for get_doc without build)
  spring-boot/
    ...                               # (same per entry)

packages/embeddings/
  model/                              # ONNX model cache (gitignored, included in npm tarball)
    ...                               # HuggingFace Hub cache format
  src/
  package.json                        # "files": ["dist/", "model/", ...] ensures model is in tarball
```

### How it works

```yaml
# .gitignore excludes binary artifacts:
packages/embeddings/model/

# packages/embeddings/package.json includes them in npm:
files: ["dist/", "model/", "scripts/", "src/"]
```

- **Git**: model/ and index binaries excluded (`.gitignore`)
- **npm publish**: included via `package.json#files` — `npm install` in enterprise environments gets everything
- **Runtime**: `EmbeddingService` calls `mod.configure()` which sets `env.cacheDir` to `packages/embeddings/model/`; model loads from local path with zero network
- **Air-gapped setup**: `npm run download-model -w packages/embeddings` seeds the cache; `mod.configure({ offline: true })` blocks remote fetches

### Freeze workflow

```bash
# On connected machine with git repo:
npm install
npm run download-model -w packages/embeddings    # seed model cache
dockit build quarkus                              # build indexes
dockit build spring-boot
# ...
npm publish                                       # everything bundled in tarball
```

### Per-entry sizes

| Component | Size | Bundled? |
|-----------|------|:--------:|
| Embedding model (ONNX) | 88 MB | npm tarball |
| LanceDB index per entry | ~32 MB | npm tarball or data dir |
| JSON index per entry | ~300 KB | npm tarball |
| HTML bundle per entry (gzipped) | ~5 MB | optional in tarball |
| Source code | < 1 MB | git |

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
- Workspace package wrapping `@huggingface/transformers`
- `embed()` function: tokenize → ONNX inference → pooling → normalize → output 384-dim vectors
- Model: `all-MiniLM-L6-v2` (88 MB, quantized q8)
- Configurable via `env.cacheDir` and `env.allowRemoteModels` for offline/bundled use
- Download script: `scripts/download-model.mjs` — pre-seeds model cache

### Step 7b: Vector search adapter (`infrastructure/search/vector/`)
- `VectorSearchEngine` — implements `ISearchEngine`, wraps LanceDB + `EmbeddingService`
- `EmbeddingService` — lazy-loads `@dockit/embeddings`, caches pipeline in memory
- **Build**: Chunks HTML by h1-h4 headings → embeds sections (2000 char max) → stores in LanceDB table + creates cosine vector index + FTS index on searchText column
- **Search**: Hybrid — parallel vector cosine ANN + BM25 FTS → dedup per-path → RRF fusion with dynamic FTS weighting + title boost
- LanceDB data stored in `data/.lancedb/<entryId>.lance/` per entry

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
