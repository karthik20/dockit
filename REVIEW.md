# Dockit Architecture Review

**Date**: 2026-05-16  
**Branch**: `feat/hexagonal-search`  
**Reviewer**: DDD Architect (automated)

---

## Overall Score: **7.0 / 10**

The hexagonal architecture refactor is a solid foundation. The core domain types, port interfaces, and use cases are well-structured. The hybrid vector+FTS search with RRF fusion is genuinely impressive. However, several architectural violations and legacy remnants prevent this from being a clean hexagonal implementation.

---

## Summary Table

| Category | Score | Verdict |
|----------|-------|---------|
| Domain Model | 5/10 | Anemic data bags, no invariants, no behavior |
| Port Interfaces | 7/10 | Clean segregation, minor leaks |
| Use Cases | 6/10 | SearchUseCase is gold standard; BuildUseCase violates dependency inversion |
| Infrastructure Adapters | 7/10 | Good implementations, but both search engines import SQLite directly |
| Legacy Cleanup | 4/10 | Duplicate types, duplicate DB singletons, dead code in services/ |
| Search Quality | 9/10 | Hybrid RRF with dynamic weighting is excellent |
| Error Handling | 5/10 | Domain errors defined but never thrown |
| Type Safety | 6/10 | `any` casts in vector search, `Record<string, unknown>` escape hatches |

---

## 🔴 Critical Issues

### 1. BuildUseCase imports from infrastructure — Dependency Inversion Violation

**File**: `core/usecases/BuildUseCase.ts:8-14`

```typescript
import { DATA_ROOT } from '../../services/paths.js';
import { downloadAndExtractZip } from '../../services/zip.js';
import { buildAntoraSource } from '../../services/antora.js';
import { buildAsciidocSource } from '../../services/asciidoc.js';
import { buildGithubMarkdownSource } from '../../services/githubMarkdown.js';
import { downloadAndExtractMavenJar } from '../../services/maven.js';
import { normalizeDocs } from '../../services/normalizer.js';
```

The core layer directly imports from `services/` — which is infrastructure (file system, shell commands, HTTP). This is the single biggest architectural violation. In hexagonal architecture, the core must have zero dependencies on infrastructure.

**Fix**: Define an `ISourceProcessor` port and inject implementations:

```typescript
// core/ports/ISourceProcessor.ts
export interface ISourceProcessor {
  readonly sourceType: SourceType;
  process(config: SourceConfig, workDir: string, log: (msg: string) => void): Promise<string>;
}

// core/ports/IDocumentNormalizer.ts
export interface IDocumentNormalizer {
  normalize(sources: Array<{label: string; dir: string}>, outputDir: string, log: (msg: string) => void): Promise<string[]>;
}

// core/ports/IPathResolver.ts
export interface IPathResolver {
  readonly dataRoot: string;
}
```

Then `BuildUseCase.processSource()` becomes:

```typescript
const processor = this.processors.find(p => p.sourceType === source.type);
if (!processor) throw new BuildError(`No processor for: ${source.type}`, entryId);
return processor.process(source.config, sourceDir, log);
```

### 2. Search engines import SQLite directly — Port bypass

**Files**:
- `infrastructure/search/json/JsonSearchEngine.ts:7` → `import { getDb } from '../../persistence/sqlite/connection.js'`
- `infrastructure/search/vector/VectorSearchEngine.ts:7` → `import { getDb } from '../../persistence/sqlite/connection.js'`

Both search engines bypass the repository layer to query `entries` directly for `globalSearch()`:

```typescript
const db = getDb();
const readyEntries = db.prepare(
  "SELECT id, name, version FROM entries WHERE status = 'ready' ORDER BY name"
).all();
```

This tightly couples search engines to SQLite. If you switch to PostgreSQL or add a caching layer, both break.

**Fix**: Inject `IEntryRepository` (or a simpler read-model interface) into search engines:

```typescript
interface IEntryReadModel {
  listReadyEntries(): Promise<Array<{id: string; name: string; version: string}>>;
}
```

### 3. Duplicate type definitions

**Files**:
- `core/domain/types.ts` — 154 lines, canonical
- `src/types.ts` — 93 lines, legacy subset

Both define `Entry`, `Source`, `Build`, all `*Config` interfaces, and all union types. The legacy file is still imported by:
- `services/configLoader.ts`
- `services/buildPipeline.ts`
- `services/zip.ts`
- `services/antora.ts`
- `services/asciidoc.ts`
- `services/maven.ts`
- `services/githubMarkdown.ts`
- `db/index.ts`

**Fix**: Delete `src/types.ts`. Update all imports to `core/domain/types.ts`. This is a one-time mechanical change.

### 4. Duplicate SQLite connection singletons

**Files**:
- `db/index.ts` — old singleton, used by `configLoader.ts` and `buildPipeline.ts`
- `infrastructure/persistence/sqlite/connection.ts` — new singleton, used by repositories

Two separate `getDb()` functions create two separate SQLite connections. This means:
- `configLoader.ts` writes via one connection
- Repositories read via another
- WAL mode mitigates corruption risk, but the two connections can see different transaction states

**Fix**: Delete `db/index.ts`. Migrate `configLoader.ts` to use `IEntryRepository` and `ISourceRepository` instead of raw SQL.

### 5. Route bypasses port/use case layer

**File**: `routes/build.ts:32-35`

```typescript
const db = (await import('../infrastructure/persistence/sqlite/connection.js')).getDb();
const build = db.prepare('SELECT * FROM builds WHERE entry_id = ? ORDER BY started_at DESC LIMIT 1').get(entryId);
```

The `build-status` endpoint directly queries SQLite, bypassing `IBuildRepository` and any use case.

**Fix**: Add `getBuildStatus(entryId)` to a use case or expose `IBuildRepository.findLatest()` through `ConfigUseCase`.

---

## 🟡 Major Issues

### 6. Anemic domain model — no behavior, no invariants

All domain types are plain interfaces with no methods, no invariants, no encapsulation:

```typescript
export interface Entry {
  id: string;
  name: string;
  status: EntryStatus;  // can be set to anything, no transition rules
  created_at: string;    // snake_case leaks DB naming
}
```

- No status transition validation (can go from `ready` → `pending` directly)
- `generateEntryId()` lives in `ConfigUseCase` instead of the domain
- No factory method for `Entry` creation
- `snake_case` field names mirror SQLite columns, coupling domain to DB

**Fix**: At minimum, add a domain module with pure functions:

```typescript
// core/domain/entry.ts
export function canTransitionTo(current: EntryStatus, next: EntryStatus): boolean {
  const transitions: Record<EntryStatus, EntryStatus[]> = {
    pending: ['building'],
    building: ['ready', 'error'],
    ready: ['building'],
    error: ['building'],
  };
  return transitions[current]?.includes(next) ?? false;
}

export function generateEntryId(name: string, version: string): string { ... }
```

### 7. Domain errors defined but never thrown

**File**: `core/domain/errors.ts` defines `NotFoundError`, `ValidationError`, `BuildError`

But throughout the codebase:
- `BuildUseCase.ts:33` → `throw new Error('Entry has no sources')` (should be `BuildError`)
- `SqliteEntryRepository.ts:84` → `throw new Error('Failed to create entry')` (should be domain error)
- Routes manually check `if (!entry)` and return 404 (should throw `NotFoundError` from use case)
- `update()` and `delete()` silently succeed on non-existent entries

**Fix**: Use domain errors consistently:

```typescript
// In use cases:
if (sources.length === 0) throw new BuildError('Entry has no sources', entryId);
if (!entry) throw new NotFoundError('Entry', entryId);

// In routes, use a global error handler:
app.use((err, req, res, next) => {
  if (err instanceof NotFoundError) return res.status(404).json({ error: err.message, code: err.code });
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message, code: err.code });
  ...
});
```

### 8. `IEntryRepository` leaks presentation and SQL concerns

**File**: `core/ports/IEntryRepository.ts`

```typescript
findAll(): Promise<(Entry & { source_count: number })[]>;  // presentation concern
upsert(id: string, name: string, version: string, description: string): Promise<void>;  // SQL concept
update(id: string, input: UpdateEntryInput): Promise<void>;  // silently no-ops on missing
updateStatus(id: string, status: Entry['status']): Promise<void>;  // bypasses domain invariants
```

- `source_count` is a view/aggregation concern, not a repository concern
- `upsert` with positional string params is fragile and mirrors `INSERT OR REPLACE`
- `update` returns `void` so callers can't know if the entry existed
- `updateStatus` bypasses any state machine validation

**Fix**:

```typescript
export interface IEntryRepository {
  findAll(): Promise<Entry[]>;  // let use case compose source_count
  findById(id: string): Promise<Entry | undefined>;
  create(input: CreateEntryInput): Promise<Entry>;
  save(entry: Entry): Promise<void>;  // full aggregate save, handles create+update
  delete(id: string): Promise<boolean>;  // return whether it existed
}
```

### 9. `configLoader.ts` is un-migrated legacy code

**File**: `services/configLoader.ts`

This file:
- Imports from `../db/index.js` (old singleton)
- Imports types from `../types.js` (old types file)
- Directly executes SQL via `db.prepare().run()` instead of using repositories
- Contains `DockitSourceConfig` / `DockitEntryConfig` / `DockitConfig` types that duplicate `core/domain/types.ts`
- Contains `buildSourceConfig()` which duplicates the source config mapping logic

**Fix**: Rewrite as a use case that uses `IEntryRepository` and `ISourceRepository`. The `DockitConfig` types can stay as a YAML-specific DTO, but should import from `core/domain/types.ts`.

### 10. `services/buildPipeline.ts` is dead code

**File**: `services/buildPipeline.ts` (117 lines)

This is a near-complete duplicate of `BuildUseCase` that:
- Directly accesses SQLite via `getDb()`
- Directly calls `buildSearchIndex()` (old JSON indexer)
- Uses old `Entry` type from `src/types.ts`
- Is not imported by any route or CLI command

**Fix**: Delete this file. All build logic now goes through `BuildUseCase`.

### 11. `services/indexer.ts` is dead code

**File**: `services/indexer.ts` (160 lines)

Contains `buildSearchIndex()` and `searchIndex()` — the old JSON search implementation. Both `JsonSearchEngine` and `VectorSearchEngine` have their own implementations. The `buildPipeline.ts` imports this, but `buildPipeline.ts` itself is dead code.

**Fix**: Delete this file. The `JsonSearchEngine` class has its own self-contained implementation.

---

## 🟡 Minor Issues

### 12. `snake_case` domain fields couple domain to SQLite

```typescript
created_at: string;  // should be createdAt
entry_id: string;    // should be entryId
updated_at: string;  // should be updatedAt
started_at: string;  // should be startedAt
finished_at: string; // should be finishedAt
```

The domain types mirror SQLite column names. Repository adapters should map between DB naming and domain naming.

### 13. `Record<string, unknown>` in `AntoraSourceConfig.playbookOverrides`

```typescript
playbookOverrides?: Record<string, unknown>;
```

This is an untyped escape hatch. If the structure is known (Antora playbook YAML), define at least a partial interface. If truly arbitrary, add a JSDoc comment explaining why.

### 14. `as any` casts in VectorSearchEngine

**File**: `infrastructure/search/vector/VectorSearchEngine.ts`

- Line 150: `db.createTable(tableName, allChunks as any[])` — LanceDB doesn't have great TS types
- Line 249-250: `vecResults.value as any[]`, `ftsResults.value as any[]` — `Promise.allSettled` returns `unknown`
- Line 257-263: `r.primaryTitle`, `r._distance`, `r._score`, `r._query` — all untyped

**Fix**: Define a `LanceDbResult` interface and use type guards:

```typescript
interface LanceDbVectorResult {
  path: string;
  primaryTitle: string;
  sectionTitle: string;
  content: string;
  headings: string;
  entryId: string;
  _distance: number;
}

interface LanceDbFtsResult extends LanceDbVectorResult {
  _score: number;
  _query: string;
}
```

### 15. `log` callback in `ISearchEngine.buildIndex` mixes concerns

```typescript
buildIndex(entryId: string, htmlFiles: HtmlFile[], log: (msg: string) => void): Promise<void>;
```

Progress reporting is orthogonal to search. Consider:
- Return `AsyncIterable<BuildEvent>` for streaming progress
- Or accept an optional `onProgress` callback in an options object

### 16. `EmbeddingService` eagerly instantiates

```typescript
export class VectorSearchEngine implements ISearchEngine {
  private embeddingService = new EmbeddingService();
```

This creates the service at construction time, making it hard to inject a mock for testing. Consider constructor injection.

### 17. `FileSystemDocumentStore` doesn't validate paths

```typescript
async getDocument(entryId: string, docPath: string): Promise<string> {
  const filePath = path.join(DATA_ROOT, entryId, 'bundle', docPath);
```

No path traversal check. A malicious `docPath` like `../../etc/passwd` could read arbitrary files.

**Fix**: Add validation:

```typescript
const resolved = path.resolve(DATA_ROOT, entryId, 'bundle', docPath);
if (!resolved.startsWith(path.resolve(DATA_ROOT))) {
  throw new Error('Invalid document path');
}
```

### 18. `sanitizeTableName` is too aggressive

```typescript
private sanitizeTableName(entryId: string): string {
  return entryId.replace(/[^a-zA-Z0-9_]/g, '_');
}
```

Entry IDs like `spring-framework-7x` become `spring_framework_7x`. This is fine for LanceDB, but the mapping between entry ID and table name is implicit and undocumented. If someone queries LanceDB directly, they won't know the table name.

### 19. `BuildResult` type is duplicated

Defined in both:
- `core/usecases/BuildUseCase.ts:16-21`
- `services/buildPipeline.ts:14-19`

Should be in `core/domain/types.ts`.

### 20. No input validation in `ConfigUseCase`

```typescript
async createEntry(input: CreateEntryInput): Promise<Entry> {
  const id = input.id ?? generateEntryId(input.name, input.version);
  return this.entryRepo.create({ ...input, id });
}
```

No validation that `name` and `version` are non-empty, that `id` doesn't contain special characters, etc.

### 21. `ValidationError` should carry field context

```typescript
export class ValidationError extends DomainError {
  constructor(message: string) {  // no field, no value
```

Should be:

```typescript
constructor(message: string, public readonly field?: string, public readonly value?: unknown)
```

### 22. Missing `ConflictError` domain error

`SqliteEntryRepository.create()` silently appends `-2`, `-3` on ID collision. The domain should model this as a `ConflictError` and let the caller decide how to handle it.

---

## ✅ What's Done Well

| Area | Details |
|------|---------|
| **SearchUseCase** | Perfect hexagonal use case: thin, validated, injected dependency only. Gold standard. |
| **Port segregation** | Five focused port interfaces, each with single responsibility. No god-interfaces. |
| **Error class hierarchy** | `DomainError` → `NotFoundError`, `ValidationError`, `BuildError`. Good structure (just needs consistent use). |
| **Discriminated union types** | `SourceType` + `SourceConfig` union gives good TypeScript narrowing. |
| **SearchEngineFactory** | Async factory with dynamic `import()` for ESM compatibility. Graceful fallback to JSON. |
| **Hybrid search** | Parallel vector cosine ANN + BM25 FTS → RRF fusion with dynamic FTS weighting. Sophisticated and effective. |
| **Document chunking** | Heading-based chunking (h1-h4) with title 2x boosting in embed text. Good semantic capture. |
| **EmbeddingService** | Lazy init, `configure()` for offline mode, clean separation from search engine. |
| **Repository pattern** | Clean `implements` on port interfaces. Constructor injection of `Database` for testability. |
| **Config validation** | `configLoader.ts` validates source configs per type. Good defensive programming. |
| **LanceDB cosine distance** | Explicit `distanceType: 'cosine'` instead of default L2. Correct for semantic search. |
| **FTS confidence weighting** | Dynamic FTS weight (0.7x uncertain, 2.0x confident) based on score gap ratio. Clever heuristic. |

---

## Architecture Dependency Graph (Current — Problematic)

```
┌─────────────────────────────────────────────────────────────┐
│  core/usecases/BuildUseCase.ts                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ IMPORTS FROM INFRASTRUCTURE:                            │ │
│  │  services/paths.js (DATA_ROOT)                           │ │
│  │  services/zip.js (downloadAndExtractZip)                 │ │
│  │  services/antora.js (buildAntoraSource)                  │ │
│  │  services/asciidoc.js (buildAsciidocSource)              │ │
│  │  services/githubMarkdown.js (buildGithubMarkdownSource) │ │
│  │  services/maven.js (downloadAndExtractMavenJar)          │ │
│  │  services/normalizer.js (normalizeDocs)                  │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  infrastructure/search/json/JsonSearchEngine.ts              │
│  infrastructure/search/vector/VectorSearchEngine.ts          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ IMPORTS FROM INFRASTRUCTURE:                            │ │
│  │  persistence/sqlite/connection.js (getDb)                │ │
│  │  services/paths.js (DATA_ROOT)                           │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Target Architecture (Clean Hexagonal)

```
                    ┌──────────────┐
                    │   Routes /   │
                    │   CLI / MCP  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Use Cases    │  ← NO infrastructure imports
                    │  (core/)      │
                    └──────┬───────┘
                           │ depends on
                    ┌──────▼───────┐
                    │  Port         │  ← interfaces only
                    │  Interfaces   │
                    └──────┬───────┘
                           │ implemented by
          ┌────────────────┼────────────────┐
          │                 │                │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
   │ SQLite      │  │ LanceDB     │  │ FileSystem  │
   │ Repos       │  │ Search      │  │ Doc Store   │
   └─────────────┘  └─────────────┘  └─────────────┘
```

---

## Recommended Priority Order

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| **P0** | #1 BuildUseCase imports from infrastructure | Medium | Architecture integrity |
| **P0** | #3 Delete duplicate `types.ts` | Low | Maintenance risk |
| **P0** | #4 Delete duplicate DB singleton | Low | Data consistency risk |
| **P1** | #2 Search engines import SQLite directly | Medium | Portability |
| **P1** | #5 Route bypasses use case layer | Low | Architecture integrity |
| **P1** | #10 Delete `buildPipeline.ts` dead code | Low | Maintenance |
| **P1** | #11 Delete `indexer.ts` dead code | Low | Maintenance |
| **P2** | #7 Use domain errors consistently | Medium | Error handling quality |
| **P2** | #9 Migrate `configLoader.ts` to use repositories | Medium | Architecture integrity |
| **P2** | #8 Clean up `IEntryRepository` interface | Medium | API quality |
| **P3** | #6 Add domain invariants (status transitions) | Medium | Business rule enforcement |
| **P3** | #12 `snake_case` → `camelCase` in domain types | Medium | Naming consistency |
| **P3** | #14 Type LanceDB results | Low | Type safety |
| **P3** | #17 Path traversal check in FileSystemDocumentStore | Low | Security |
| **P3** | #16 Constructor-inject EmbeddingService | Low | Testability |

---

## File Inventory: What to Keep, Delete, Refactor

| File | Action | Reason |
|------|--------|--------|
| `core/domain/types.ts` | **Keep** | Canonical domain types |
| `core/domain/errors.ts` | **Keep** | Domain error hierarchy |
| `core/ports/*.ts` | **Keep** | Port interfaces (clean up `IEntryRepository`) |
| `core/usecases/SearchUseCase.ts` | **Keep** | Gold standard use case |
| `core/usecases/ConfigUseCase.ts` | **Keep** | Add validation, use domain errors |
| `core/usecases/BuildUseCase.ts` | **Refactor** | Remove all `services/` imports, inject `ISourceProcessor[]` |
| `src/types.ts` | **Delete** | Duplicate of `core/domain/types.ts` |
| `src/db/index.ts` | **Delete** | Duplicate of `infrastructure/persistence/sqlite/connection.ts` |
| `src/services/buildPipeline.ts` | **Delete** | Dead code, replaced by `BuildUseCase` |
| `src/services/indexer.ts` | **Delete** | Dead code, replaced by `JsonSearchEngine` |
| `src/services/configLoader.ts` | **Refactor** | Use repositories instead of raw SQL |
| `src/services/paths.ts` | **Keep** (for now) | Move to `IPathResolver` port later |
| `src/services/zip.ts` | **Keep** (for now) | Will become `ZipSourceProcessor` adapter |
| `src/services/antora.ts` | **Keep** (for now) | Will become `AntoraSourceProcessor` adapter |
| `src/services/asciidoc.ts` | **Keep** (for now) | Will become `AsciidocSourceProcessor` adapter |
| `src/services/maven.ts` | **Keep** (for now) | Will become `MavenSourceProcessor` adapter |
| `src/services/githubMarkdown.ts` | **Keep** (for now) | Will become `GithubMarkdownSourceProcessor` adapter |
| `src/services/normalizer.ts` | **Keep** (for now) | Will become `DocumentNormalizer` adapter |
| `src/services/textExtractor.ts` | **Keep** | Used by search engines |
| `infrastructure/search/json/JsonSearchEngine.ts` | **Refactor** | Remove `getDb()` import, inject `IEntryReadModel` |
| `infrastructure/search/vector/VectorSearchEngine.ts` | **Refactor** | Remove `getDb()` import, inject `IEntryReadModel`; type LanceDB results |
| `infrastructure/search/vector/EmbeddingService.ts` | **Refactor** | Constructor-inject instead of field-init |
| `infrastructure/persistence/sqlite/connection.ts` | **Keep** | Canonical DB connection |
| `infrastructure/persistence/sqlite/Sqlite*.ts` | **Keep** | Clean repository implementations |
| `infrastructure/filesystem/FileSystemDocumentStore.ts` | **Refactor** | Add path traversal check |
| `routes/build.ts` | **Refactor** | Remove direct DB query, use use case |

---

*End of review.*