# Dockit Test Plan

Comprehensive test suite for dockit. No test infrastructure currently exists (0 test files, 0 CI). This plan defines the test architecture and all test cases.

## Test Infrastructure

```
dockit/
├── tests/
│   ├── vitest.config.ts          # Vitest config (use vitest — fast, ESM-native, Vite-compatible)
│   ├── setup.ts                   # Global setup: temp dirs, mock DB, env vars
│   ├── unit/                      # Module-level unit tests
│   │   ├── paths.test.ts
│   │   ├── utils.test.ts
│   │   ├── configLoader.test.ts
│   │   ├── graphifyKnowledgeGraph.test.ts
│   │   ├── fileSystemDocumentStore.test.ts
│   │   ├── viewer.test.ts
│   │   ├── jsonSearchEngine.test.ts
│   │   └── vectorSearchEngine.test.ts
│   ├── integration/               # Cross-module integration tests
│   │   ├── buildPipeline.test.ts
│   │   ├── searchEndToEnd.test.ts
│   │   ├── graphEndToEnd.test.ts
│   │   └── mcpTools.test.ts
│   └── cli/                       # CLI command tests
│       ├── list.test.ts
│       ├── search.test.ts
│       ├── get.test.ts
│       ├── build.test.ts
│       ├── graph.test.ts
│       └── init.test.ts
```

Add to root `package.json`:
```json
"devDependencies": { "vitest": "^1.x" },
"scripts": { "test": "vitest run", "test:watch": "vitest" }
```

---

## Unit Tests

### 1. `paths.test.ts` — `apps/server/src/services/paths.ts`

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1.1 | Default path | No env | `os.homedir()/.dockit` |
| 1.2 | Custom env | `DOCKIT_DATA_DIR=/custom` | `/custom` |
| 1.3 | Empty homedir | `os.homedir()=''` | `process.cwd()/.dockit` |
| 1.4 | Env overrides empty home | `DOCKIT_DATA_DIR=/x`, `homedir()=''` | `/x` |
| 1.5 | Path.join with spaces | `homedir()='/Users/John Doe'` | `/Users/John Doe/.dockit` |

### 2. `utils.test.ts` — `bin/utils.ts`

| # | Test | Input | Expected |
|---|------|-------|----------|
| 2.1 | `resolveDockitHome()` default | No env | `homedir()/.dockit` |
| 2.2 | `resolveDockitHome()` custom | `DOCKIT_DATA_DIR=/x` | `/x` |
| 2.3 | `resolveDockitHome()` empty home | `homedir()=''` | `cwd()/.dockit` |
| 2.4 | `resolveConfigPath()` home first | `~/.dockit/dockit.yaml` exists | Returns home path |
| 2.5 | `resolveConfigPath()` project fallback | Only project `dockit.yaml` exists | Returns project path |
| 2.6 | `resolveConfigPath()` neither exists | Neither exists | Returns home path |
| 2.7 | `resolveConfigPath()` both exist | Both exist | Returns home path (preferred) |
| 2.8 | `resolveProjectRoot()` normal | `__dirname` is `bin/` | Project root dir |
| 2.9 | `resolveProjectRoot()` not found | No `package.json` in path | Throws error |
| 2.10 | `formatTable()` basic | 2 cols, 2 rows | Properly aligned table |
| 2.11 | `formatTable()` variable widths | Mixed length cells | Properly padded |

### 3. `configLoader.test.ts` — `apps/server/src/services/configLoader.ts`

| # | Test | Input | Expected |
|---|------|-------|----------|
| 3.1 | Valid config | `dockit.yaml` with entries | Parsed config object |
| 3.2 | Missing file | Non-existent path | Throws with message |
| 3.3 | Empty entries | `entries: []` | Throws validation error |
| 3.4 | Missing required fields | Entry without `name` | Throws validation error |
| 3.5 | Unknown source type | `type: bogo` | Throws validation error |
| 3.6 | ZIP missing url/localPath | Zip source without url/path | Throws |
| 3.7 | Maven missing fields | Maven without groupId | Throws |
| 3.8 | Source code source config | Full source-code config | Parsed correctly |
| 3.9 | Graphify enabled on markdown | `graphifyEnabled: true` | Parsed with flag |
| 3.10 | Graphify source path | `graphifySourcePath: "src"` | Parsed correctly |
| 3.11 | `mcp.dataDir` ignored | Old config with `dataDir` | Silently ignored (no error) |
| 3.12 | Search engine vector | `search.engine: vector` | Parsed |
| 3.13 | Search engine json | `search.engine: json` | Parsed |
| 3.14 | Search engine default | No `search.engine` | Undefined |

### 4. `graphifyKnowledgeGraph.test.ts` — Graph loading and querying

| # | Test | Input | Expected |
|---|------|-------|----------|
| 4.1 | No graph file | Entry dir without `graph.json` | `exists()=false` |
| 4.2 | Valid D3-format graph | graph.json with `nodes`/`links` | Parsed correctly |
| 4.3 | Query by name | `kg.query("BuildUseCase")` | Matching nodes + edges |
| 4.4 | Query by file | `kg.query("server/src")` | Nodes in that path |
| 4.5 | Query by type | `kg.query("code")` | Type-filtered nodes |
| 4.6 | Query case insensitive | `kg.query("buildusecase")` | Same as case match |
| 4.7 | Find path found | Two connected nodes | Found with nodes/edges |
| 4.8 | Find path not found | Two unconnected nodes | `found=false` |
| 4.9 | Find path same node | Same `from` and `to` | `found=true, length=0` |
| 4.10 | Find path fuzzy name | Partial name match | Finds closest node |
| 4.11 | God nodes sorted | `kg.findGodNodes(5)` | Sorted by degree desc |
| 4.12 | God nodes limit | `kg.findGodNodes(1)` | Exactly 1 node |
| 4.13 | Metadata | `kg.getMetadata()` | Correct counts |
| 4.14 | Malformed JSON | Invalid JSON file | `exists()=false` |
| 4.15 | Normalize old format | `label`/`source_file` format | Correctly mapped to `name`/`file` |
| 4.16 | Null node fields | Node with `name: null` | Doesn't crash on `.toLowerCase()` |

### 5. `fileSystemDocumentStore.test.ts` — Path traversal guard

| # | Test | Input | Expected |
|---|------|-------|----------|
| 5.1 | Valid path | `entryId`, `doc.html` | Reads content |
| 5.2 | Traversal attempt | `../../../etc/passwd` | Throws `Invalid document path` |
| 5.3 | Symlink escape | Symlink to outside DATA_ROOT | Throws (if guard works) |
| 5.4 | Document not found | Non-existent file | Throws `Document not found` |
| 5.5 | documentExists valid | Existing file | `true` |
| 5.6 | documentExists invalid | Non-existent file | `false` |
| 5.7 | documentExists traversal | `../` path | `false` |

### 6. `viewer.test.ts` — Express viewer route

| # | Test | Input | Expected |
|---|------|-------|----------|
| 6.1 | Valid path | `GET /api/bundle/dockit/index.html` | 200 or 404 (if not built) |
| 6.2 | Traversal attempt | `GET /api/bundle/dockit/../../../etc/passwd` | 403 |
| 6.3 | Missing file | `GET /api/bundle/dockit/nonexistent.html` | 404 |
| 6.4 | No entry | `GET /api/bundle/` | Express 404 (no match) |

### 7. `jsonSearchEngine.test.ts` — TF-IDF search

| # | Test | Input | Expected |
|---|------|-------|----------|
| 7.1 | Build index | Valid HTML files | Creates `index.json` |
| 7.2 | Search exact match | "hooks" term | Results with hooks |
| 7.3 | Search stop words | "the" only | Empty results |
| 7.4 | Search mixed | "react hooks" | Title-boosted results |
| 7.5 | Search no results | "zzzzzzzzz" | Empty array |
| 7.6 | Search limit | `limit=3` | Max 3 results |
| 7.7 | Global search | Multi-entry setup | Results from all ready entries |
| 7.8 | Index path | `DATA_ROOT/{entryId}/index.json` | Correct path |
| 7.9 | Empty index | No built docs | Empty results |

### 8. `vectorSearchEngine.test.ts` — Hybrid search (if LanceDB available)

| # | Test | Input | Expected |
|---|------|-------|----------|
| 8.1 | Build index | Valid HTML files | LanceDB table created |
| 8.2 | Semantic match | "ahead of time compilation" | Finds "AOT" docs |
| 8.3 | FTS keyword match | "caffeine" exact term | High rank due to FTS |
| 8.4 | Hybrid fusion | Terms in both vector + FTS | RRF combined results |
| 8.5 | Chunk dedup | Same path, multiple chunks | One result per path |
| 8.6 | FTS title boost | Query terms in section title | 1.5x boost |
| 8.7 | LanceDB fallback | No LanceDB installed | Falls back to JSON search |
| 8.8 | Embedding dimension | Any text | 384-dim Float32Array |

---

## Integration Tests

### 9. `buildPipeline.test.ts`

| # | Test | Setup | Expected |
|---|------|-------|----------|
| 9.1 | Build GitHub markdown | Local md file | Normalized HTML in bundle |
| 9.2 | Build AsciiDoc | Local .adoc file | Normalized HTML |
| 9.3 | Build ZIP bundle | Local .zip with HTML | Extracted HTML |
| 9.4 | Build source code | Local source dir | graph.json created |
| 9.5 | Build with graphify enabled | Markdown + code dir | graph.json + HTML docs |
| 9.6 | Build status tracking | Start build | pending → building → ready |
| 9.7 | Build error handling | Invalid source | Status = error, log captured |
| 9.8 | Build output path | Build with DOCKIT_DATA_DIR | Output in custom path |
| 9.9 | Build entry dir structure | Successful build | bundle/, sources/, index.json |

### 10. `searchEndToEnd.test.ts`

| # | Test | Setup | Expected |
|---|------|-------|----------|
| 10.1 | Scoped search | Build react, search "hooks" | Returns react results |
| 10.2 | Global search | Build 2+ entries, search "api" | Results from all entries |
| 10.3 | Search not-built entry | Entry status=pending | Error message |
| 10.4 | get-top flag | search --get-top 2 | Full content in results |
| 10.5 | JSON output | search --json | Valid JSON |

### 11. `graphEndToEnd.test.ts`

| # | Test | Setup | Expected |
|---|------|-------|----------|
| 11.1 | Graph query after build | Build source-code entry | Graph nodes returned |
| 11.2 | God nodes after build | Build source-code entry | Top connected nodes |
| 11.3 | Graph path between nodes | Build source-code entry | Found/not found path |
| 11.4 | Graph no entry | Query non-existent entry | Error message |

### 12. `mcpTools.test.ts`

| # | Test | Tool | Expected |
|---|------|------|----------|
| 12.1 | List entries | `dockit_list_entries` | JSON array of entries |
| 12.2 | Find entry | `dockit_find_entry` | Matching entry |
| 12.3 | Search within entry | `dockit_search` | Search results JSON |
| 12.4 | Global search | `dockit_global_search` | Cross-entry results |
| 12.5 | Get document | `dockit_get_doc` | Plain text content |
| 12.6 | Build entry | `dockit_build` | Building status |
| 12.7 | Build status | `dockit_build_status` | Status + log |
| 12.8 | Graph query | `dockit_graph_query` | Graph nodes |
| 12.9 | Graph path | `dockit_graph_path` | Path result |
| 12.10 | Graph explain | `dockit_graph_explain` | Node details |
| 12.11 | Graph gods | `dockit_graph_gods` | God nodes list |

---

## CLI Tests

### 13. `cli/list.test.ts`

| # | Test | Command | Expected |
|---|------|---------|----------|
| 13.1 | List entries | `dockit list` | Table output |
| 13.2 | List JSON | `dockit list --json` | Valid JSON array |
| 13.3 | List empty | No entries in DB | Empty array |

### 14. `cli/search.test.ts`

| # | Test | Command | Expected |
|---|------|---------|----------|
| 14.1 | Scoped search | `dockit search react "hooks"` | Results for react |
| 14.2 | Global search | `dockit search "hooks"` | Top result per entry |
| 14.3 | Missing query | `dockit search` | Error message |
| 14.4 | Bad entry | `dockit search nonexistent "x"` | Error message |
| 14.5 | --get-top | `dockit search react "hooks" --get-top 2` | Full content |
| 14.6 | --json | `dockit search react "hooks" --json` | Valid JSON |
| 14.7 | --limit | `dockit search react "hooks" --limit 1` | Max 1 result |

### 15. `cli/get.test.ts`

| # | Test | Command | Expected |
|---|------|---------|----------|
| 15.1 | Get doc | `dockit get react path.html` | Text content |
| 15.2 | Missing doc | `dockit get react nonexistent` | Error |
| 15.3 | --json | `dockit get react path.html --json` | JSON with content |
| 15.4 | Missing args | `dockit get` | Usage error |

### 16. `cli/build.test.ts`

| # | Test | Command | Expected |
|---|------|---------|----------|
| 16.1 | Build entry | `dockit build quarkus` | builds |
| 16.2 | Missing arg | `dockit build` | Error |
| 16.3 | Bad entry | `dockit build nonexistent` | Error |
| 16.4 | Status | `dockit status quarkus` | Status output |
| 16.5 | Status JSON | `dockit status quarkus --json` | JSON |

### 17. `cli/graph.test.ts`

| # | Test | Command | Expected |
|---|------|---------|----------|
| 17.1 | Query | `dockit graph query dockit "Build"` | Table output |
| 17.2 | Query JSON | `dockit graph query dockit "Build" --json` | Valid JSON |
| 17.3 | Gods | `dockit graph gods dockit` | Table of god nodes |
| 17.4 | Gods limit | `dockit graph gods dockit --limit 3` | 3 nodes |
| 17.5 | Path | `dockit graph path dockit A B` | Path or not found |
| 17.6 | Explain | `dockit graph explain dockit BuildUseCase` | Node details |
| 17.7 | Missing subcommand | `dockit graph` | Usage |
| 17.8 | Missing entry | `dockit graph query` | Error |
| 17.9 | Bad entry | `dockit graph query nonexistent "x"` | Error |

### 18. `cli/init.test.ts`

| # | Test | Command | Expected |
|---|------|---------|----------|
| 18.1 | Init with path | `dockit init --path /tmp/testdir` | Entry created + built |
| 18.2 | Init with code path | `dockit init --path /tmp/testdir --code-path src` | sourcePath set |
| 18.3 | Init writes config | After init | `~/.dockit/dockit.yaml` created |
| 18.4 | Init re-init | Same path twice | Replaces existing entry |
| 18.5 | Init bad path | `dockit init --path /nonexistent` | Error |
| 18.6 | Init file path | `dockit init --path /etc/hosts` | Error (not a dir) |
| 18.7 | Init special chars path | Path with spaces | Handles correctly |
| 18.8 | Init YAML safety | Path with `#` | js-yaml escapes it |
| 18.9 | Init merge config | Existing dockit.yaml | Merges without data loss |

---

## Edge Case / Regression Tests

| # | Test | Setup | Expected |
|---|------|-------|----------|
| 19.1 | Empty homedir (Docker) | `os.homedir() = ''` | Falls back to `cwd()/.dockit` |
| 19.2 | DOCKIT_DATA_DIR env | Set env var | Data goes to custom path |
| 19.3 | First run (mkdir) | Delete `~/.dockit/` | Auto-created on first operation |
| 19.4 | Backward compat | DOCKIT_DATA_DIR=./data | Old data works |
| 19.5 | Config in project root | No `~/.dockit/dockit.yaml` | Falls back to project config |
| 19.6 | Config in home dir | `~/.dockit/dockit.yaml` exists | Preferred over project |
| 19.7 | Path with spaces | `localPath: /path/with spaces` | Processed correctly |
| 19.8 | Path with unicode | `localPath: /home/用户/code` | Processed correctly |
| 19.9 | Concurrent builds | Two builds of same entry | One wins, no corruption |
| 19.10 | Large repo (graphify) | 10k+ files source | Graphify completes |
| 19.11 | MCP with empty DB | No entries in DB | Tools return empty/error gracefully |
| 19.12 | Graphify not installed | source-code without graphify | Clear error message |
| 19.13 | Port already in use | Server on occupied port | Clear error |
| 19.14 | Thread safety | Multiple MCP requests | No corruption |

---

## Test Fixture Structure

```
tests/fixtures/
├── dockit-valid.yaml
├── dockit-invalid-type.yaml
├── dockit-missing-name.yaml
├── graph.json                    # D3-format graph with 10 nodes, 15 edges
├── graph-malformed.json
├── graph-old-format.json         # label/source_file format
├── sample-docs/
│   ├── index.html
│   ├── guide.html
│   └── api.html
├── markdown-repo/
│   ├── README.md
│   └── docs/
│       └── guide.md
└── source-code/
    ├── index.ts
    └── utils.ts
```

---

## CI Configuration (Future)

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22, 24]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ matrix.node-version }}' }
      - run: npm ci
      - run: npm test
```

---

## Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Specific file
npx vitest run tests/unit/paths.test.ts

# Coverage
npx vitest run --coverage

# CLI integration tests (require real server)
DOCKIT_DATA_DIR=/tmp/dockit-test npm run test:cli
```
