---
name: dockit
description: Documentation index and search tool providing on-demand framework/library docs and source code knowledge graphs for LLM context
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: documentation
---

# ⚠️ CRITICAL: USE DOCKIT, NOT GREP

**When a dockit entry exists for the codebase, dockit's graph and search tools MUST be used for ALL structural queries. Do NOT use grep, rg, find, glob, or any text search tool for questions about code imports, dependencies, structure, architecture, or relationships.**

Dockit's knowledge graph (Graphify Tree-sitter AST) has already parsed every import, call, and inheritance edge. Using grep for structural questions is slower AND less accurate. You are discarding pre-parsed structural data to re-parse text — this is wasteful and produces worse results.

| Question | ✅ Use dockit | ❌ Do NOT use |
|----------|------------|-------------|
| "What files import X?" | `dockit graph query <entry> "X"` | `grep`, `rg`, `glob` |
| "What does X depend on?" | `dockit graph explain <entry> "X"` | Reading files, `grep "import"` |
| "Does UI import server code?" | `dockit graph path <entry> "A" "B"` | Manually checking imports |
| "Most critical modules?" | `dockit graph gods <entry>` | Guessing, `ls`, `wc -l` |
| "How are A and B connected?" | `dockit graph path <entry> "A" "B"` | Tracing imports across files |
| "Docs for X?" | `dockit search <entry> "X"` | `grep "X"` on docs |
| "Find all files about X" | `dockit search <entry> "X"` or `dockit graph query <entry> "X"` | `grep -r "X"` |

**Only use grep / glob when:**
1. No dockit entry exists for the target codebase (not yet built)
2. You have already found the right files via dockit and now need to read their content
3. The question is about raw text patterns, not code structure

**If a source-code entry is built (status = ready): graph tools get priority. Every time. No exceptions.**

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
