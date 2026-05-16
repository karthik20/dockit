# Dockit

Local documentation hub that aggregates multiple documentation source types (ZIP, Maven, Antora, AsciiDoc, GitHub Markdown) into a unified, searchable HTML bundle — useful as LLM context. Ships with two search engines: a lightweight **TF-IDF engine** and a **hybrid semantic+keyword engine** (LanceDB + all-MiniLM-L6-v2 embeddings) configurable via a single toggle.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/your-org/dockit.git
cd dockit
npm install

# 2. Make CLI available globally
npm link

# 3. Build docs (one-time per entry)
dockit build quarkus

# 4. Start searching
dockit search quarkus "configure cache"
```

That's it. Five entries are pre-configured in `dockit.yaml`. Entries start as `pending` — build one or more before searching.

## Pre-configured Documentation

Dockit ships with five entries ready to build:

| Entry | Version | Source Type | Description |
|-------|---------|-------------|-------------|
| **Quarkus** | 3.35 | AsciiDoc | Quarkus framework documentation |
| **Quarkus Core** | 3.35.2 | Maven Javadoc | Quarkus Core API reference |
| **React** | 19 | GitHub Markdown | React library documentation |
| **Spring Boot** | 3.5.x | Antora | Production-ready Spring applications |
| **Spring Framework** | 7.x | Antora | Core Spring ecosystem reference |

Add your own entries by editing `dockit.yaml` — see [Supported Sources](#supported-documentation-sources) below.

## Search Engine

Dockit ships two search engines toggleable via `dockit.yaml`:

```yaml
search:
  engine: vector    # 'vector' (default) | 'json' (TF-IDF fallback)
```

| | JSON (TF-IDF) | Vector (Hybrid) |
|---|---|---|
| **Storage per entry** | ~300 KB | ~32 MB (LanceDB) |
| **Runtime memory** | Minimal | ~200 MB |
| **Build time** | Fast | Slower (embeds docs via ONNX) |
| **Search method** | Term-frequency scoring (title 10x, headings 3x, body 1x) | Hybrid: parallel cosine ANN + BM25 FTS → RRF fusion |
| **Keyword precision** | High (exact term matches) | Very high (FTS component recovers keywords) |
| **Semantic matching** | None | Yes (finds conceptually related docs even without exact terms) |
| **Model** | None | `all-MiniLM-L6-v2` via `@huggingface/transformers` (~88 MB ONNX) |
| **Works offline** | Yes — zero dependencies | Yes — model bundles in npm package |

### How hybrid search works

```
query → vector (cosine ANN) + BM25 (FTS) in parallel
         → deduplicate per-path → RRF fusion → top N
```

- Vector search finds semantically related pages (e.g., "Ahead-of-Time Caching" for a cache query)
- FTS recovers exact keyword matches (e.g., "caffeine" in the Caching guide)
- Reciprocal Rank Fusion combines both with dynamic weighting: confident FTS gets 2x weight, uncertain FTS gets 0.7x
- Title matches in FTS results get an additional 1.5x boost

### When to use each

- **`json`**: Low-resource environments, fast builds, or when exact keyword matching is sufficient
- **`vector`** (default): Better discovery of non-obvious matches, section-level chunking with heading context in results, hybrid search that matches both keywords and concepts

## CLI Usage (Recommended)

The CLI is the primary way to interact with Dockit. Works from any directory, requires no server process, and is ideal for LLM agents that can execute shell commands.

### Commands

| Command | Description |
|---------|-------------|
| `dockit search [<entry>] <query>` | Search documentation |
| `dockit search <query>` | Global search — top result per entry |
| `dockit search [<entry>] <query> --get-top [N]` | Fetch full content for top N results (default 3) |
| `dockit list` | List all entries |
| `dockit build <entry>` | Build documentation for an entry |
| `dockit status <entry>` | Check build status |
| `dockit get <entry> <path>` | Fetch full document content |
| `dockit dev` | Start dev servers (web UI) |
| `dockit serve` | Start production server |
| `dockit mcp` | Start MCP server |

### Search Workflow

**Step 1: Global search** — discover which entries are relevant

```bash
dockit search "cache"
# Returns top result per entry:
#   [React] cache
#   [Quarkus] caching-guide
#   [Quarkus Core] Cache API
```

**Step 2: Scoped search** — dive deeper into the chosen entry

```bash
dockit search quarkus "cache" --get-top 3
# Returns full content for top 3 Quarkus cache documents
```

### Flags

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON (for search, list, status) |
| `--limit <n>` | Max search results (default 20) |
| `--get-top [N]` | Fetch full content for top N results (default 3) |
| `--port <port>` | Custom port (for serve, mcp --http) |

### Examples

```bash
# Global search — see which entries match
dockit search "hooks"

# Scoped search with full content
dockit search react "how to create a hook" --get-top

# JSON output for scripts/agents
dockit search react "useState" --get-top 3 --json

# Build documentation
dockit build quarkus
dockit status quarkus

# Fetch a specific document
dockit get react react-docs-markdown/reference/react/hooks.html
```

## MCP Server (Optional)

Dockit exposes an MCP (Model Context Protocol) server for AI tools like Claude Desktop, Cline, and OpenCode. This is an alternative to the CLI — use whichever fits your workflow.

### OpenCode

```json
// ~/.config/opencode/opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dockit": {
      "type": "local",
      "command": ["bash", "/path/to/dockit/scripts/mcp-wrapper.sh"],
      "enabled": true
    }
  }
}
```

### Claude Desktop / Cline

```json
// ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "dockit": {
      "command": "bash",
      "args": ["/path/to/dockit/scripts/mcp-wrapper.sh"]
    }
  }
}
```

### HTTP Transport

```bash
# Start HTTP bridge on port 3456
DOCKIT_MCP_HTTP_PORT=3456 ./scripts/mcp-wrapper.sh

# Or directly
npx tsx apps/server/src/mcp.ts

# Then curl:
curl -X POST http://localhost:3456 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `dockit_list_entries` | List all configured entries |
| `dockit_find_entry` | Find entries by name/description |
| `dockit_search` | Search within a specific entry |
| `dockit_global_search` | Search across all entries |
| `dockit_get_doc` | Fetch full document content |
| `dockit_build` / `dockit_build_status` | Build / check status |

## How LLMs Use Dockit

Dockit includes `SKILL.md` — a skill file that instructs LLMs how to use Dockit effectively. When an LLM has access to the `dockit` CLI or MCP tools, it follows this workflow:

1. **`dockit list`** / **`dockit_list_entries`** — discover available documentation
2. **`dockit search "query"`** — global search to find relevant entries
3. **`dockit search <entry> "query" --get-top`** — scoped search with full content
4. **Answer the user's question** using the retrieved documentation as context

The LLM strips conversational filler from queries, scopes searches to the right entry, and prefers Dockit documentation over training data.

## Supported Documentation Sources

| Type | Description | Remote Fields | Local/Offline Fields |
|------|-------------|---------------|---------------------|
| **ZIP Bundle** | Download or extract a ZIP of HTML documentation | `url` | `localPath` — path to pre-downloaded .zip |
| **Maven Artifact** | Download a documentation JAR (javadoc) from Maven Central | *(none extra)* | `useMavenCommand: true` — uses local Maven + settings.xml; `localJar` — path to pre-downloaded .jar |
| **Antora** | Build a multi-page HTML site with Antora | `repoUrl` | `localPath` — path to pre-cloned repo |
| **AsciiDoc** | Convert `.adoc` files to HTML | `repoUrl`, `sourcePath` (optional) | `localPath` — path to pre-cloned repo |
| **GitHub Markdown** | Clone a GitHub repo and convert `.md` files to HTML | `repoUrl`, `sourcePath` (optional), `branch` (optional) | `localPath` — path to pre-cloned repo |

## Offline / Proxy Mode

For environments behind corporate proxies or without internet access, Dockit supports multiple fallback mechanisms:

### Source Repositories (local clones)

Each source type supports local paths that take precedence over remote URLs:

```yaml
# dockit.yaml — local mode entries
entries:
  - id: quarkus-local
    name: Quarkus (Local)
    version: "3.35"
    sources:
      - type: asciidoc
        label: "Quarkus Docs"
        localPath: "/home/user/repos/quarkus"
        sourcePath: "docs/src/main/asciidoc"
```

### Embedding Model (air-gapped vector search)

The embedding model downloads on first `embed()` call by default. For air-gapped environments:

**Option A — Pre-seed on connected machine, then copy:**
```bash
# On connected machine
npm run download-model -w packages/embeddings

# Copy the model/ directory to the target machine
# Then call configure({ offline: true }) before first search
```

**Option B — Bundle in npm package (enterprise proxy):**
```ts
import { configure } from '@dockit/embeddings';

// Before first embed() call:
configure({ cacheDir: '/path/to/model', offline: true });
```

The model directory (`packages/embeddings/model/`) is excluded from git via `.gitignore` but is included in the npm tarball via the `files` field in `package.json`. This means `npm install` in an enterprise environment that uses a private npm registry gets the model automatically.

### Pre-built Index Bundling

For environments where even building is impractical, LanceDB and JSON indexes can be pre-built and bundled:

1. Build indexes on a connected machine:
   ```bash
   dockit build quarkus
   dockit build spring-boot
   # ... all desired entries
   ```
2. Package the `data/` directory (or specific `.lancedb/` + `index.json` files)
3. Deploy to target machines via the same `data/` path

### Proxy Configuration

Standard proxy environment variables:

```bash
export HTTP_PROXY=http://proxy.corp:8080
export HTTPS_PROXY=http://proxy.corp:8080
```

Or override the HuggingFace CDN host via code:

```ts
import { env } from '@huggingface/transformers';
env.remoteHost = 'https://internal-mirror.corp';  // point to internal mirror
```

### Native Binaries

`@lancedb/lancedb` ships prebuilt binaries for linux x64/arm64, macOS x64/arm64, and Windows x64/arm64 — no compilation needed.

### Additional offline fields

| Source Type | Fields (all take precedence over remote) |
|-------------|------------------------------------------|
| **ZIP** | `localPath` — path to pre-downloaded .zip |
| **Maven** | `useMavenCommand: true` — uses local `~/.m2/settings.xml` (proxies, mirrors); `localJar` — pre-downloaded .jar |
| **Antora** | `localPath` — pre-cloned repo |
| **AsciiDoc** | `localPath` — pre-cloned repo (kept, not cleaned up) |
| **GitHub Markdown** | `localPath` — pre-cloned repo |

## Web UI (Optional)

Dockit includes a web interface for managing entries, configuring sources, and browsing documentation.

```bash
# Start dev servers
dockit dev
# Or: npm run dev

# Frontend → http://localhost:5173
# Backend  → http://localhost:3001
```

1. Open http://localhost:5173 in your browser
2. Click **New Entry** in the sidebar
3. Add sources and click **Build Now** to process into a unified HTML bundle
4. Use the embedded viewer to browse, or search across indexed content

### Build Modes

- **Build Now** — server-side processing with live log output
- **Download Script** — exports a self-contained `.sh` script with all curl commands

## Architecture

```
dockit/
├── apps/
│   ├── server/          Express + TypeScript backend (port 3001)
│   └── client/          React + Vite + Tailwind CSS frontend (port 5173)
├── bin/                 CLI entry point and commands
├── packages/
│   └── embeddings/      @dockit/embeddings — ONNX model wrapper (@huggingface/transformers)
├── data/                Runtime data (SQLite DB, extracted sources, HTML bundles, LanceDB indexes)
├── dockit.yaml          Entries/sources config
├── SKILL.md             LLM skill instructions
├── PLAN.md              Full architecture document
├── LOCAL_MODE_PLAN.md   Offline/proxy mode plan
└── package.json         npm workspace root
```

## API Overview

| Method | Path | Purpose |
|--------|------|---------|
| `GET`    | `/api/entries`                    | List entries |
| `POST`   | `/api/entries`                    | Create entry |
| `GET`    | `/api/entries/:id`                | Get entry detail + sources |
| `PUT`    | `/api/entries/:id`                | Update entry |
| `DELETE` | `/api/entries/:id`                | Delete entry + all data |
| `POST`   | `/api/entries/:id/sources`        | Add source to entry |
| `PUT`    | `/api/sources/:id`                | Update source |
| `DELETE` | `/api/sources/:id`                | Remove source |
| `POST`   | `/api/entries/:id/build`          | Trigger build |
| `GET`    | `/api/entries/:id/build-status`   | Poll build progress |
| `GET`    | `/api/entries/:id/cli-script`     | Download CLI script |
| `GET`    | `/api/entries/:id/search?q=term`  | Search built docs |
| `GET`    | `/api/bundle/:entryId/*`          | Serve bundled HTML |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, React Router 7 |
| Backend | Express 4, TypeScript, tsx |
| Database | SQLite via better-sqlite3 |
| MCP | @modelcontextprotocol/server 2.0.0-alpha.2 |
| HTML Parsing | node-html-parser |
| AsciiDoc | @asciidoctor/core |
| Archives | unzipper |
| Build Pipeline | Antora CLI, Git, Maven dependency plugin |
| Markdown | marked |
| Vector Search | LanceDB embedded (Rust native), all-MiniLM-L6-v2 via @huggingface/transformers |
