# Dockit

> Built with [OpenCode](https://opencode.ai) and [DeepSeek](https://deepseek.com)

> **Local documentation hub** — aggregate, index, and search your project's documentation and source code.
> Runs entirely offline. Ships as a single CLI binary via npm.

## Why Dockit

Modern software teams juggle multiple documentation sources: auto-generated API docs, hand-written Markdown guides, AsciiDoc references, Antora sites, Maven Javadoc JARs, ZIP archives. Each source lives in its own silo with its own search bar. When an LLM coding agent needs to answer a framework question, it either hallucinates from training data or scrolls through GitHub.

Dockit solves this by ingesting **six documentation source types** and **source code** into a single, offline searchable index. It runs entirely on your machine — no cloud, no API keys, no internet required after the initial build.

### What it does

- **Indexes documentation** from ZIP bundles, Maven Javadoc, Antora sites, AsciiDoc repos, GitHub Markdown repos
- **Builds source code knowledge graphs** via Graphify (Tree-sitter AST) — traces imports, calls, and inheritance across 15+ languages
- **Searches with hybrid TF-IDF + vector semantic engine** — keyword precision + conceptual understanding
- **Exposes an MCP server** so AI coding agents (Claude, Cline, OpenCode) can query docs on-demand
- **Works completely offline** — LanceDB embedded vector DB, ONNX embeddings model, local SQLite

### Who it's for

| Role | Use case |
|------|----------|
| **LLM coding agents** | Query up-to-date framework docs instead of relying on stale training data |
| **Developers** | Search your project's docs + code structure from the terminal |
| **Teams** | Pre-build doc indexes once, share across the team |
| **Air-gapped environments** | Full offline operation with pre-seeded models and indexes |

---

## Installation

### Method 1: npm registry (recommended)

```bash
npm install -g @lon-ask/dockit
```

After global install, the `dockit` command is available in your PATH:

```bash
dockit --help
dockit list
```

### Method 2: npx (zero-install)

Run dockit on-demand without installing anything:

```bash
npx @lon-ask/dockit list
npx @lon-ask/dockit init --path ./my-project --code-path src
npx @lon-ask/dockit search my-project "authentication"
```

`npx` downloads the package to a temp cache and executes it. Perfect for one-off usage or CI pipelines. Set `DOCKIT_DATA_DIR` to persist data across invocations.

### Method 3: Build from source

```bash
git clone https://github.com/karthik20/dockit.git
cd dockit
npm install
npm run build
npm link                    # makes 'dockit' available globally

pip3 install graphify        # optional — for source code knowledge graphs
```

### Prerequisites

| Requirement | Needed for |
|-------------|-----------|
| Node.js 18+ | Runtime |
| Python 3.8+ & pip | Graphify source code graphs (optional) |
| Graphify (`pip install graphify`) | `source-code` source type, `graphifyEnabled` on doc sources |
| Maven (`mvn`) | Maven Javadoc source type |
| Antora CLI | Antora source type (auto-installed via npm dep) |
| Git | Cloning repos for AsciiDoc, Markdown, Source Code sources |

### Data storage

All operational data lives in `~/.dockit/` by default. Override with `DOCKIT_DATA_DIR`:

```bash
export DOCKIT_DATA_DIR=/path/to/custom/data
```

| Path | Contents |
|------|----------|
| `~/.dockit/dockit.db` | SQLite database (entries, sources, builds) |
| `~/.dockit/dockit.yaml` | Your config (auto-created by `dockit init`) |
| `~/.dockit/.lancedb/` | Vector search index (LanceDB) |
| `~/.dockit/models/` | ONNX embedding model cache |
| `~/.dockit/{entryId}/bundle/` | Built HTML docs per entry |
| `~/.dockit/{entryId}/graph.json` | Knowledge graph (source-code entries) |

---

## Quick Start

### Index your own project (30 seconds)

```bash
# From your project directory
npx @lon-ask/dockit init --code-path src

# This:
#   1. Scans all .md files → searchable docs
#   2. Runs Graphify on src/ → knowledge graph
#   3. Builds vector search index
#   4. Saves config to ~/.dockit/dockit.yaml
```

Now search:

```bash
npx @lon-ask/dockit search my-project "authentication"
npx @lon-ask/dockit graph gods my-project
npx @lon-ask/dockit graph path my-project "createApp" "startServer"
```

### Index framework docs

```bash
# Build pre-configured entries from dockit.yaml
dockit build quarkus          # 30 min, 3500+ AsciiDoc pages → ~800 MB vector index
dockit build react            # 2 min, 200+ Markdown pages
dockit build spring-boot      # 15 min, Antora site

# Search across all built entries
dockit search "configure cache"
```

### Use with an AI agent

Add dockit as an MCP server in your AI tool's config:

```json
// ~/.config/opencode/opencode.json
{
  "mcp": {
    "dockit": {
      "type": "local",
      "command": ["npx", "@lon-ask/dockit", "mcp"],
      "enabled": true
    }
  }
}
```

The agent can then call `dockit_search`, `dockit_graph_query`, etc. automatically.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `dockit init --path <dir> [--code-path <sub>]` | Index a local project (markdown + source code) |
| `dockit search [<entry>] <query>` | Search documentation |
| `dockit search [<entry>] <query> --get-top [N]` | Search + fetch full content for top N results |
| `dockit list` | List all entries |
| `dockit build <entry>` | Build/rebuild documentation for an entry |
| `dockit status <entry>` | Check build status |
| `dockit get <entry> <path>` | Fetch full document by path |
| `dockit graph query <entry> <query>` | Search knowledge graph nodes |
| `dockit graph path <entry> <from> <to>` | Find shortest dependency path |
| `dockit graph gods <entry>` | List most-connected nodes |
| `dockit graph explain <entry> <node>` | Show node details + connections |
| `dockit dev` | Start dev servers (Web UI on :5173 + API on :3001) |
| `dockit serve [--port <p>]` | Start production REST server |
| `dockit mcp` | Start MCP server for AI agents |

### Flags

| Flag | Applies to | Description |
|------|-----------|-------------|
| `--json` | search, list, status, graph | Output as JSON |
| `--limit <n>` | search, graph query, graph gods | Max results |
| `--get-top [N]` | search | Fetch full content for top N (default 3) |
| `--name <n>` | init | Entry display name |
| `--version <v>` | init | Entry version string |
| `--code-path <p>` | init | Subdirectory for source code scanning |
| `--port <p>` | serve, mcp --http | Custom port |

### Search workflow

```bash
# Step 1: Discover relevant entries
dockit search "cache"
# → [React] cache  [Quarkus] caching-guide  [Quarkus Core] Cache API

# Step 2: Deep-dive into one entry with full content
dockit search quarkus "cache" --get-top 3
# → Returns plain text of top 3 matching documents

# Step 3: JSON output for scripts
dockit search react "useState" --get-top 3 --json
```

### Knowledge graph workflow

```bash
# Find nodes matching a term
dockit graph query my-project "database" --limit 5

# See the most-connected nodes (entry points, god classes)
dockit graph gods my-project

# Trace how two modules are connected
dockit graph path my-project "app.ts" "database.ts"

# Inspect a node's connections
dockit graph explain my-project "createApp"
```

---

## Supported Documentation Sources

| Type | What it indexes | Remote | Local |
|------|----------------|--------|-------|
| **GitHub Markdown** | All `.md` files in a repo | `repoUrl`, `sourcePath`, `branch` | `localPath` |
| **AsciiDoc** | `.adoc` files via Asciidoctor | `repoUrl`, `sourcePath` | `localPath`, `zipPath` |
| **Antora** | Multi-page Antora documentation sites | `repoUrl` | `localPath`, `zipPath` |
| **ZIP Bundle** | Pre-built HTML in a ZIP archive | `url` | `localPath` |
| **Maven Javadoc** | Javadoc JAR from Maven Central | — | `localJar`, `useMavenCommand` |
| **Source Code** | Knowledge graph via Graphify Tree-sitter AST | `repoUrl`, `sourcePath`, `branch` | `localPath` |

### Source code knowledge graphs

The `source-code` source type runs [Graphify](https://github.com/safishamsi/graphify) which parses your code with Tree-sitter (AST) and produces a `graph.json` containing nodes (classes, functions, files) and edges (imports, calls, inherits). No LLM required — pure static analysis. Supports TypeScript, JavaScript, Python, Java, Go, Rust, C++, and 10 more languages.

Add `graphifyEnabled: true` to any doc source to also generate a graph alongside the docs:

```yaml
sources:
  - type: github-markdown
    label: "API Docs"
    repoUrl: "https://github.com/myorg/myrepo.git"
    sourcePath: "docs"              # where .md files live
    graphifyEnabled: true
    graphifySourcePath: "src"       # where source code lives
```

---

## Search Engine

Dockit ships two engines, toggled via `dockit.yaml`:

```yaml
search:
  engine: vector    # 'vector' (default) | 'json' (TF-IDF)
```

| | JSON (TF-IDF) | Vector (Hybrid) |
|---|---|---|
| **Storage** | ~300 KB per entry | ~32 MB per entry |
| **Memory** | Minimal | ~200 MB |
| **Build speed** | Fast | Slower (embeds all documents) |
| **Keyword match** | Exact term frequency | BM25 FTS (very high precision) |
| **Semantic match** | None | Yes (cosine ANN via all-MiniLM-L6-v2) |
| **Model** | None | 88 MB ONNX, bundled in package |
| **Offline** | Yes | Yes |

### How hybrid search works

```
query → [vector cosine ANN] + [BM25 full-text search] in parallel
         → deduplicate per document path
         → Reciprocal Rank Fusion combining both
         → dynamic FTS weighting: 2x for confident matches, 0.7x for uncertain
         → title match bonus: 1.5x when query terms appear in headings
```

---

## Config File (`dockit.yaml`)

After running `dockit init`, your config is at `~/.dockit/dockit.yaml`:

```yaml
entries:
  - id: my-project
    name: My Project
    version: "1.0"
    description: My project source code and documentation
    sources:
      - type: source-code
        label: "my-project Code"
        localPath: /home/user/projects/my-project
        sourcePath: src
      - type: github-markdown
        label: "my-project Markdown"
        localPath: /home/user/projects/my-project

search:
  engine: vector
```

Config resolution order:
1. `~/.dockit/dockit.yaml` — user home (created by `dockit init`)
2. `./dockit.yaml` — project root (development/backward compatibility)

---

## LLM Integration

Dockit is designed to be an **on-demand knowledge source for AI coding agents**. Instead of relying on stale training data or hallucinated API references, LLMs can query dockit at runtime for up-to-date, project-specific documentation and source code structure.

### How it works

Dockit ships with a **skill file** (`SKILL.md`) that teaches LLMs how to use the tool. When an LLM coding agent has access to dockit (via CLI, MCP, or shell commands), it follows this workflow:

```
User question → dockit search "query"      → discover relevant entries
              → dockit search <entry> "query" --get-top  → retrieve full docs
              → dockit graph query <entry> "node"        → trace code structure
              → Answer user with retrieved content as context
```

The skill file instructs the LLM to:
- Strip conversational filler from queries (keep only technical terms)
- Always scope searches to the right entry once identified
- Prefer dockit documentation over training data
- Use knowledge graph queries for source-code entries
- Show attribution (source type, repo, version) with answers

### OpenCode

OpenCode supports multiple integration modes:

**Skill mode** (recommended) — OpenCode reads `SKILL.md` automatically from the skill registry:

```bash
# When dockit is configured as a skill in ~/.config/opencode/skills/dockit/
# OpenCode loads SKILL.md instructions and invokes dockit CLI commands directly
opencode> "How do I configure cache in Quarkus?"
# OpenCode runs: dockit search quarkus "configure cache" --get-top
```

**MCP mode** — dockit exposes as an MCP server for structured tool calls:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dockit": {
      "type": "local",
      "command": ["npx", "@lon-ask/dockit", "mcp"],
      "enabled": true
    }
  }
}
```

**CLI mode** — dockit commands are shell commands the agent can execute:

```bash
dockit search react "useState" --get-top 3 --json
```

### Claude Code

Add dockit as an MCP server in Claude Code's config:

```json
{
  "mcpServers": {
    "dockit": {
      "command": "npx",
      "args": ["@lon-ask/dockit", "mcp"]
    }
  }
}
```

Claude can then call `dockit_search`, `dockit_get_doc`, `dockit_graph_query`, and all other MCP tools directly. The skill instructions in `SKILL.md` guide it to use the right tool for each query type.

**Claude Code with CLI fallback** — if MCP is unavailable, Claude can run dockit as a shell command:

```bash
npx @lon-ask/dockit search quarkus "reactive routes" --get-top 3 --json
```

### Cline (VS Code)

```json
{
  "mcpServers": {
    "dockit": {
      "command": "npx",
      "args": ["@lon-ask/dockit", "mcp"]
    }
  }
}
```

### General LLM Integration

Any LLM that can execute shell commands or make HTTP requests can use dockit:

**Via CLI (shell access)**:
```bash
# Build an entry
npx @lon-ask/dockit build react
# Search with full content
npx @lon-ask/dockit search react "hooks" --get-top 3 --json
# Query knowledge graph
npx @lon-ask/dockit graph gods my-project --json
```

**Via REST API** (when server is running):
```bash
dockit serve --port 3001 &
curl "http://localhost:3001/api/entries/react/search?q=hooks"
curl "http://localhost:3001/api/graph/my-project/query?q=database"
```

**Via HTTP MCP bridge**:
```bash
DOCKIT_MCP_HTTP_PORT=3456 npx @lon-ask/dockit mcp --http &
curl -X POST http://localhost:3456 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"dockit_search","arguments":{"entry":"react","query":"hooks"}}}'
```

### Skills Registry

Dockit's `SKILL.md` is also registered as a skill file. When placed in an LLM agent's skill directory, it provides:

1. **Tool instructions** — which commands to use and when
2. **Query refinement rules** — stripping filler, keeping technical terms
3. **Workflow patterns** — discover → search → retrieve → graph
4. **Attribution rules** — always cite source type, repo, version

To register dockit as a skill:
```bash
# For OpenCode
cp SKILL.md ~/.config/opencode/skills/dockit/SKILL.md

# For other agents that support skill files, place SKILL.md in their skills directory
```

### MCP Tools Reference

| Tool | Description |
|------|-------------|
| `dockit_list_entries` | List all configured entries |
| `dockit_find_entry` | Find entries by name/description |
| `dockit_search` | Search within a specific entry |
| `dockit_global_search` | Search across all entries |
| `dockit_get_doc` | Fetch full document content |
| `dockit_build` | Build documentation for an entry |
| `dockit_build_status` | Check build status |
| `dockit_graph_query` | Search knowledge graph nodes |
| `dockit_graph_path` | Find dependency path between two nodes |
| `dockit_graph_explain` | Show node details and connections |
| `dockit_graph_gods` | List most-connected (god) nodes |

---

## Web UI

Dockit includes a React-based graphical interface for managing entries, configuring sources, and browsing documentation. It runs alongside the API server.

### Starting the UI

```bash
# Development mode — starts both API server + Vite dev UI concurrently
npx @lon-ask/dockit dev
# API → http://localhost:3001
# UI  → http://localhost:5173

# Production mode — API server only (UI not served yet)
npx @lon-ask/dockit serve --port 3001
```

> **Note**: The first `npx` run downloads `tsx` and `vite` (if not locally cached). Subsequent runs use the cached versions and start within seconds.

### How it works under the hood

`dockit dev` spawns two processes in parallel:
- **API server** — `npx tsx watch apps/server/src/index.ts` (Express + TypeScript, hot reload)
- **Web UI** — `npx vite apps/client` (React dev server with HMR, port 5173)

The UI proxies `/api/*` requests to the API server at `localhost:3001`. Both processes terminate on Ctrl+C.

### What the UI provides

| Feature | Description |
|---------|-------------|
| **Entry management** | Create, edit, and delete documentation entries via a form |
| **Source configuration** | Add/remove/reorder sources per entry — supports all 6 source types (ZIP, Maven, Antora, AsciiDoc, GitHub Markdown, Source Code) |
| **Source form** | Mode selector (Git Repo / Local Dir / ZIP File), Graphify toggle with source path field |
| **Build triggering** | One-click build with live streaming logs |
| **Download script** | Export build as a self-contained `.sh` script (for CI/reproducible builds) |
| **Document viewer** | Browse built HTML docs in the browser |
| **Entry detail** | Shows all sources, graph status badge (Network icon when graphify is enabled), build history |
| **Status badges** | Quick visual indicators for entry status (pending/building/ready/error) per source |

### What it shows

The UI surfaces the same data as the CLI, but visually:

1. **Sidebar** — list of all entries with status badges
2. **Entry page** — entry metadata (name, version, description) + sources list + build controls
3. **Source editor** — configure type, URL/path, source path, graphify toggle
4. **Build log** — real-time output stream during builds
5. **Graph status** — which entries have knowledge graphs built

### Architecture

```
Browser (port 5173) ←→ API Server (port 3001)
                          ↓
                     SQLite DB  +  LanceDB  +  ~/.dockit/
```

The UI communicates with the Express API via REST endpoints (`/api/entries`, `/api/sources`, `/api/build`, etc.). All data CRUD, search, and build operations are done through the same API that the CLI and MCP server use.

---

## Offline / Air-Gapped Mode

Dockit is designed for full offline operation:

| Concern | Solution |
|---------|----------|
| **No internet** | All models bundled in npm package, LanceDB is embedded (Rust native) |
| **Corporate proxy** | Set `HTTP_PROXY`/`HTTPS_PROXY` env vars |
| **Pre-built indexes** | Build on connected machine, copy `~/.dockit/` to target |
| **Embedding model** | Ships as ONNX (~88 MB). Caches to `~/.dockit/models/` |
| **Source repos** | Clone once locally, reference via `localPath` in config |
| **Maven Javadoc** | Download JAR once, reference via `localJar` or use local Maven settings |

---

## Architecture

```
dockit/                          # npm package @lon-ask/dockit
├── bin/
│   ├── dockit.js                # CLI entry point (shebang node)
│   ├── dockit-cli.ts            # Command router
│   ├── commands/                # search, build, graph, init, get, list, dev, mcp
│   └── utils.ts                 # Shared CLI helpers
├── apps/
│   ├── server/                  # Express backend (port 3001)
│   │   └── src/
│   │       ├── core/            # Domain types, ports, use cases
│   │       ├── infrastructure/  # SQLite, LanceDB, Graphify, processors
│   │       ├── routes/          # REST API, graph endpoints, viewer
│   │       └── services/        # Config loader, text extractor, normalizer
│   └── client/                  # React + Vite web UI (port 5173)
├── packages/
│   └── embeddings/              # @lon-ask/dockit-embeddings
│       └── model/               # all-MiniLM-L6-v2 ONNX (88 MB)
├── scripts/
│   └── mcp-wrapper.sh           # MCP server launcher
├── dockit.yaml                  # Example config
└── SKILL.md                     # LLM agent instructions
```

Runtime data (auto-created):
```
~/.dockit/
├── dockit.db                    # SQLite (entries, sources, builds)
├── dockit.yaml                  # Your config
├── .lancedb/                    # Vector search index
├── models/                      # Embedding model cache
└── {entryId}/
    ├── bundle/                  # Normalized HTML docs
    ├── sources/                 # Raw processing artifacts
    └── graph.json              # Knowledge graph
```

---

## API Reference

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/entries` | List entries |
| `POST` | `/api/entries` | Create entry |
| `GET` | `/api/entries/:id` | Get entry detail |
| `PUT` | `/api/entries/:id` | Update entry |
| `DELETE` | `/api/entries/:id` | Delete entry |
| `POST` | `/api/entries/:id/sources` | Add source |
| `PUT` | `/api/sources/:id` | Update source |
| `DELETE` | `/api/sources/:id` | Remove source |
| `POST` | `/api/entries/:id/build` | Trigger build |
| `GET` | `/api/entries/:id/build-status` | Poll build |
| `GET` | `/api/entries/:id/cli-script` | Download CLI script |
| `GET` | `/api/graph/:entry/query?q=...` | Graph node search |
| `GET` | `/api/graph/:entry/path?from=...&to=...` | Graph path find |
| `GET` | `/api/graph/:entry/gods` | Graph god nodes |
| `GET` | `/api/entries/:id/search?q=term` | Search docs |
| `GET` | `/api/bundle/:entryId/*` | Serve HTML |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| CLI | Node.js, tsx (TypeScript runtime) |
| Backend | Express 4, TypeScript |
| Database | SQLite via better-sqlite3 |
| Vector Search | LanceDB (embedded Rust) |
| Embeddings | all-MiniLM-L6-v2 ONNX via @huggingface/transformers |
| Frontend | React 19, Vite 6, Tailwind CSS 4 |
| MCP | @modelcontextprotocol/server v2 |
| HTML/MD Parse | node-html-parser, marked |
| AsciiDoc | @asciidoctor/core |
| Antora | @antora/cli + @antora/site-generator |
| Archives | unzipper |
| Knowledge Graph | Graphify (Tree-sitter AST, 15+ languages) |

---

## Credits

Dockit was built with the assistance of the following LLMs and tools:

| Contributor | Role |
|------------|------|
| **[OpenCode](https://opencode.ai)** | Primary development agent — architecture, code generation, code review, CLI tooling, MCP server, graph features, npm publishing pipeline |
| **[DeepSeek](https://deepseek.com)** | Strategic architecture planning, feature design, documentation writing, test planning |

Special thanks to:

| Tool | Used for |
|------|---------|
| **[Graphify](https://github.com/safishamsi/graphify)** | Tree-sitter AST source code knowledge graphs |
| **[LanceDB](https://lancedb.com)** | Embedded vector search |
| **[OpenCode](https://opencode.ai)** | Interactive CLI agent framework that orchestrated the entire build pipeline |
