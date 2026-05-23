---
name: dockit
description: Documentation index and search tool providing on-demand framework/library docs and source code knowledge graphs for LLM context
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: documentation
---

## What dockit does

Dockit is a local documentation hub. It indexes documentation from multiple sources (GitHub Markdown, AsciiDoc, Antora, Maven Javadoc, ZIP archives) and builds source code knowledge graphs (Tree-sitter AST via Graphify). It provides hybrid TF-IDF + vector semantic search across all indexed content.

Run it from the terminal — no server process required. No internet needed after build.

## Installation

```bash
npm install -g @lon-ask/dockit
```

Or use `npx` without installing:

```bash
npx @lon-ask/dockit <command>
```

All data is stored in `~/.dockit/` by default. Override with `DOCKIT_DATA_DIR`.

## When to use dockit

Use when you need:
- Up-to-date framework/library documentation instead of stale training data
- API reference, class docs, or configuration guides
- Source code structure analysis (imports, calls, inheritance graphs)
- To find which files/modules a function touches in a codebase

## ⚠️ dockit first, grep last

**Never use `grep`, `rg`, `find`, or raw text search for code structure or documentation questions when a dockit entry exists.** Dockit's graph and search tools understand code semantics — grep only understands text.

| Query type | Use | NOT |
|-----------|-----|-----|
| "What files import X?" | `dockit graph query <entry> "X"` | `grep "import.*X"` |
| "What does X depend on?" | `dockit graph explain <entry> "X"` | `grep "import"` on X |
| "Most critical modules?" | `dockit graph gods <entry>` | Manual guesswork |
| "How are A and B connected?" | `dockit graph path <entry> "A" "B"` | Tracing imports by hand |
| "Find docs for X" | `dockit search <entry> "X"` | `grep "X"` on docs |
| "Find all files about X" | `dockit search <entry> "X"` or `dockit graph query <entry> "X"` | `grep -r "X"` |

**Only use grep when:**
1. No dockit entry exists for the codebase (not yet built with `dockit init`)
2. You need the exact content of a specific file (reading, not searching)
3. Graph query returned nodes, but you need to see the actual implementation code inside the file

**If a source-code entry is built (status = ready), always use graph tools first for any structural question.** Grep is explicitly wrong — the graph already has imports, calls, and dependencies pre-parsed.

## Core Workflow

### Step 1: Discover available documentation

```bash
dockit list
# or
npx @lon-ask/dockit list
```

### Step 2: Global search (find the right entry)

```bash
dockit search "cache"
# Returns top result per built entry
```

### Step 3: Scoped search with full content

```bash
dockit search quarkus "configure cache" --get-top 3
```

The `--get-top` flag fetches full document text for the top N results. This is the primary command for LLMs — it combines search + retrieval in one invocation.

### Step 4: Knowledge graph queries (source-code entries)

For entries with `source-code` sources:

```bash
dockit graph query my-project "database" --limit 10     # find nodes by name/file/type
dockit graph gods my-project                            # most-connected nodes
dockit graph path my-project "app.ts" "database.ts"     # dependency path
dockit graph explain my-project "createApp"             # node details + connections
```

## CLI Reference

| Command | Purpose |
|---------|---------|
| `dockit list` | List all configured entries |
| `dockit search [<entry>] <query>` | Search docs (scoped or global) |
| `dockit search [<entry>] <query> --get-top [N]` | Search + full content for top N |
| `dockit get <entry> <path>` | Fetch specific document by path |
| `dockit build <entry>` | Build/rebuild documentation |
| `dockit status <entry>` | Check build status |
| `dockit init --path <dir> [--code-path <sub>]` | Index a local project |
| `dockit graph query <entry> <query>` | Search graph nodes |
| `dockit graph path <entry> <from> <to>` | Dependency path between nodes |
| `dockit graph gods <entry>` | Highest-degree (most connected) nodes |
| `dockit graph explain <entry> <node>` | Node details with edges |

## Query Refinement

Strip conversational filler. Keep only technical keywords:

| User question | Good query |
|---------------|------------|
| "How do I create a custom hook in React?" | `"create custom hook"` |
| "What's the Quarkus caching configuration?" | `"caching configuration"` |
| "How does the auth middleware work?" | `"auth middleware"` |
| "Find all files that import database.ts" | `graph query my-project "database.ts"` |

## Entry Types and Behavior

| Entry has | `dockit search` | `dockit graph` |
|-----------|----------------|-----------------|
| Docs only | Returns results | No graph available |
| Source code only | Returns empty | Use graph tools |
| Docs + code | Returns results (graph-boosted) | Graph tools work |

## Build Status

Entries start as `pending`. Build them before searching:

```bash
dockit build quarkus
dockit status quarkus    # wait for "ready"
```

If an entry shows `error`, check the build log via `dockit status <entry> --json`.

## MCP Tools

If configured as an MCP server, use these tools instead of CLI:

| MCP Tool | CLI Equivalent |
|----------|----------------|
| `dockit_list_entries` | `dockit list` |
| `dockit_find_entry` | — |
| `dockit_global_search` | `dockit search "query"` |
| `dockit_search` | `dockit search <entry> "query"` |
| `dockit_get_doc` | `dockit get <entry> <path>` |
| `dockit_build` | `dockit build <entry>` |
| `dockit_build_status` | `dockit status <entry>` |
| `dockit_graph_query` | `dockit graph query` |
| `dockit_graph_path` | `dockit graph path` |
| `dockit_graph_explain` | `dockit graph explain` |
| `dockit_graph_gods` | `dockit graph gods` |

## Key Constraints

- Documentation is plain text extracted from HTML
- Content is truncated at 50 KB per document
- Documents must be built before searchable (status = `ready`)
- Knowledge graph requires `graphify` Python package and source-code source type
- All data is local. No cloud, no API keys required
