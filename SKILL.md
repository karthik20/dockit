# Dockit Skill

Dockit is a documentation index and search tool that provides on-demand access to up-to-date framework and library documentation for LLM context.

## When to Use Dockit

Use dockit whenever the user asks about:
- How to use a specific framework or library (e.g., Quarkus, Spring Boot)
- API documentation, class references, or configuration reference
- Any technology listed in the available dockit entries

## Available Tools

### `dockit_list_entries`
Lists all documentation entries that have been configured. Use this first to discover what documentation is available.

Input: none
Output: Array of `{ id, name, version, description, status, sourceCount }`

### `dockit_search`
Searches the built documentation for an entry. Returns matching document paths, titles, and text snippets.

Input:
- `entry` (required): Entry ID to search
- `query` (required): Search query string (case-insensitive keyword matching)
- `maxResults` (optional): Max results 1-20, default 10

Output: Array of `{ path, title, headings, snippet }`

### `dockit_get_doc`
Retrieves the full text content of a specific documentation file as plain text (stripped HTML, markdown-style headings preserved).

Input:
- `entry` (required): Entry ID
- `path` (required): Document path from `dockit_search` results (e.g. `asciidoc/rest-json.html`)

Output: Full document text (max 50KB, truncated at paragraph boundary if longer)

### `dockit_build`
Triggers a build or rebuild of documentation for an entry. This clones repositories, downloads artifacts, and converts sources to HTML.

Input:
- `entry` (required): Entry ID to build

Output: `{ entry, status: "building", message }`

### `dockit_build_status`
Checks the build status of an entry.

Input:
- `entry` (required): Entry ID

Output: `{ status, startedAt, finishedAt, log }`

## Workflow

### Best Practice: Query → Search → Fetch

1. **List entries**: If unsure what docs are available, call `dockit_list_entries` first
2. **Search**: Use `dockit_search` with relevant keywords for the user's question
3. **Select relevant docs**: Review snippets and pick 2-5 most relevant results
4. **Fetch full content**: Call `dockit_get_doc` for each selected document
5. **Answer**: Use the document text as authoritative context to answer the user's question

### Status Checking

- If an entry has status `"ready"` → docs are built and searchable
- If an entry has status `"building"` → wait or check with `dockit_build_status`
- If an entry has status `"pending"` or `"error"` → call `dockit_build` to build it, then wait for completion before searching

### Search Strategy

- Use specific technical terms from the user's question (e.g., "resteasy reactive", "cdi interceptor", "mongodb panache")
- Check snippets for relevance before fetching full documents
- Don't fetch every result — pick the 2-5 most relevant ones
- If first query returns poor results, try alternative terminology

### Context Usage

- Cite the document titles in your answer (e.g., "According to the Writing REST Services guide...")
- Prefer dockit documentation over training data when they conflict
- If the user's question isn't well covered by available documentation, say so and fall back to general knowledge

## Notes

- Documentation is plain text extracted from HTML — code examples, tables, and formatting may be simplified
- Content is truncated at 50KB per document to stay within context windows
- The path field in dockit_search uses the HTML filename (e.g., `asciidoc/rest-json.html`) — use this exact path in `dockit_get_doc`
