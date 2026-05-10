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

### `dockit_find_entry`
Finds entries by name or description without needing the entry ID. Useful when the user mentions a framework by name.

Input:
- `query` (required): Substring to match against entry name or description

Output: Array of matching `{ id, name, version, description, status }`

### `dockit_search`
Searches the built documentation for a **specific** entry. Returns matching document paths, titles, and text snippets.

Input:
- `entry` (required): Entry ID to search
- `query` (required): Search query string (case-insensitive keyword matching)
- `maxResults` (optional): Max results 1-20, default 10

Output: Array of `{ path, title, headings, snippet }`

### `dockit_global_search`
Searches across **all** built documentation entries at once. No entry ID required. This is the preferred starting point for most user questions.

Input:
- `query` (required): Search query string
- `maxResults` (optional): Max total results 1-50, default 20

Output: Array of `{ entryId, entryName, entryVersion, path, title, headings, snippet }`

### `dockit_get_doc`
Retrieves the full text content of a specific documentation file as plain text (stripped HTML, markdown-style headings preserved).

Input:
- `entry` (required): Entry ID
- `path` (required): Document path from search results (e.g. `asciidoc/rest-json.html`)

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

### Best Practice for General Questions (Recommended)

1. **Global search**: Start with `dockit_global_search` using the user's question keywords. No entry ID needed.
2. **Select relevant docs**: Review snippets and pick 2-5 most relevant results
3. **Fetch full content**: Call `dockit_get_doc` for each selected document (using `entryId` from global results)
4. **Answer**: Use the document text as authoritative context to answer the user's question

### Alternative: Entry-Specific Search

If you already know the entry ID or need to search within a specific framework:

1. **Find entry** (optional): Call `dockit_find_entry` with the framework name to get the ID
2. **Search**: Use `dockit_search` with the entry ID and relevant keywords
3. **Fetch + answer**: Same as above

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
