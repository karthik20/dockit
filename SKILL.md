---
name: dockit
description: Documentation index and search tool that provides on-demand access to up-to-date framework and library documentation for LLM context
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: documentation
---

## What I do
- Search and retrieve documentation for frameworks and libraries (e.g., Quarkus, Spring Boot, React)
- Provide API documentation, class references, and configuration guides
- Fetch full document content for LLM context via CLI or MCP tools

## When to use me
Use this skill when the user asks about:
- How to use a specific framework or library
- API documentation, class references, or configuration reference
- Any technology listed in available dockit entries

## Primary Method: CLI Commands

The `dockit` CLI is the recommended way to search and retrieve documentation.

### `dockit list`
Lists all configured documentation entries. Run this first to discover what's available.

### `dockit search [<entry>] <query>`
Searches documentation. Always provide the entry name as the first argument when you know which framework the question is about.

```bash
# Scoped to a specific entry (recommended)
dockit search react "how to create a hook"
dockit search quarkus "configure cache"

# Global search — top result per entry (when unsure which entry)
dockit search "cache"
```

### `dockit search [<entry>] <query> --get-top [N]`
Searches and fetches full document content for the top N results (default 3). This is the **primary command for LLMs** — it combines search + content retrieval in one step.

```bash
# Get full content for top 3 results
dockit search react "useState" --get-top

# Get full content for top 5 results, as JSON
dockit search react "hooks" --get-top 5 --json
```

### `dockit get <entry> <path>`
Fetches full content of a specific document by path (from search results).

### `dockit build <entry>` / `dockit status <entry>`
Builds documentation or checks build status.

## Recommended Workflow

### Step 1: Identify the entry
Determine which documentation entry is relevant:
- "How do I use useState in React?" → entry: `react`
- "How to configure cache in Quarkus?" → entry: `quarkus`

If unsure, run `dockit list` to see available entries.

### Step 2: Search pattern
**Global search** (no entry) — returns top result per entry:
```bash
dockit search "cache"
```

**Scoped search** (with entry) — dive deeper:
```bash
dockit search quarkus "cache" --get-top 3
```

Always scope to the entry once you know which framework the user is asking about.

### Step 3: Refine the query
Strip conversational filler. Keep only technical terms:

| User Question | Good Query |
|---------------|------------|
| "How do I create a custom hook in React?" | `"create custom hook"` |
| "What is the latest Quarkus feature for caching?" | `"cache latest feature"` |

### Step 4: Handle missing builds
If an entry shows status `pending` or `error`, build it first:
```bash
dockit build react
dockit status react
```

## Alternative: MCP Tools

If Dockit is configured as an MCP server, use `dockit_*` tools instead of CLI commands:

| MCP Tool | CLI Equivalent |
|----------|----------------|
| `dockit_list_entries` | `dockit list` |
| `dockit_global_search` | `dockit search "query"` |
| `dockit_search` | `dockit search <entry> "query"` |
| `dockit_get_doc` | `dockit get <entry> <path>` |
| `dockit_build` / `dockit_build_status` | `dockit build` / `dockit status` |

## Notes
- Documentation is plain text extracted from HTML
- Content is truncated at 50KB per document
- Entries start as `pending` and must be built before searchable

## Always Show Source

After answering with documentation content, always display the source in a table at the end:

| Field | Value |
|-------|-------|
| **Type** | `<source type>` |
| **Label** | `<source label>` |
| **Repo** | `<repoUrl>` |
| **Source Path** | `<sourcePath>` |
| **Version** | `<entry version>` |

To get source details, use `--json` flag with search or check `dockit list --json`. Source fields come from the entry's `sources` array in `dockit.yaml`:
- `type` — source type (e.g., `github-markdown`, `asciidoc`, `maven`)
- `label` — human-readable label
- `repoUrl` or `localPath` — repository URL or local path
- `sourcePath` — path within the repo
- Entry `version` — the version of the documentation entry
