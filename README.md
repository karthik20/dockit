# Dockit

Local documentation hub that aggregates multiple documentation source types (ZIP, Maven, Antora, AsciiDoc) into a unified, searchable HTML bundle — useful as LLM context.

## Quick Start

```bash
# Install dependencies (requires Node.js >= 24 LTS)
npm install

# Run both backend and frontend
npm run dev

# Or run individually
npm run dev:server   # Backend  → http://localhost:3001
npm run dev:client   # Frontend → http://localhost:5173

# MCP server (for Claude/Cline AI tools)
npm run -w apps/server mcp
```

## Supported Documentation Sources

| Type | Description | Remote Fields | Local/Offline Fields |
|------|-------------|---------------|---------------------|
| **ZIP Bundle** | Download or extract a ZIP of HTML documentation | `url` | `localPath` — path to pre-downloaded .zip |
| **Maven Artifact** | Download a documentation JAR (javadoc) from Maven Central | *(none extra)* | `useMavenCommand: true` — uses local Maven + settings.xml; `localJar` — path to pre-downloaded .jar |
| **Antora** | Build a multi-page HTML site with Antora | `repoUrl` | `localPath` — path to pre-cloned repo |
| **AsciiDoc** | Convert `.adoc` files to HTML | `repoUrl`, `sourcePath` (optional) | `localPath` — path to pre-cloned repo |

## Offline / Proxy Mode

For environments behind corporate proxies or without internet access, use local alternatives to remote URLs. Each source type supports local paths that take precedence over URLs:

```yaml
# dockit.yaml — local mode entries
entries:
  - id: quarkus-local
    name: Quarkus (Local)
    version: "3.35"
    sources:
      - type: asciidoc
        label: "Quarkus Docs"
        localPath: "/home/user/repos/quarkus"        # pre-cloned repo
        sourcePath: "docs/src/main/asciidoc"

  - id: quarkus-mvn
    name: Quarkus Core (Maven CLI)
    version: "3.35.2"
    sources:
      - type: maven
        label: "Quarkus Core Javadoc"
        groupId: "io.quarkus"
        artifactId: "quarkus-core"
        version: "3.35.2"
        useMavenCommand: true    # resolves via ~/.m2/settings.xml
```

**Maven `useMavenCommand`** spawns `mvn org.apache.maven.plugins:maven-dependency-plugin:3.10.0:copy`, respecting your local `~/.m2/settings.xml` (proxies, mirrors, private repos). Requires Maven installed and in `PATH`.

**`localPath`** fields are validated at build time (not config sync), so files can be mounted later (e.g., Docker volumes).

## MCP Server

Dockit exposes an MCP (Model Context Protocol) stdio server for AI tools like Claude Desktop and Cline. Configure it to search and fetch documentation on demand.

### Configuration (Claude Desktop)

```json
// ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "dockit": {
      "command": "npx",
      "args": ["tsx", "apps/server/src/mcp.ts"],
      "cwd": "/path/to/dockit"
    }
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `dockit_list_entries` | List all configured documentation entries |
| `dockit_search` | Search built docs by keyword (entry + query) |
| `dockit_get_doc` | Fetch full plain-text content of a document |
| `dockit_build` | Build/rebuild documentation for an entry |
| `dockit_build_status` | Check build status |

See `SKILL.md` for LLM instructions on how to use these tools effectively.

## Usage

1. Open http://localhost:5173 in your browser
2. Click **New Entry** in the sidebar
3. Give the entry a name and version (e.g. "Quarkus", "3.8.0")
4. Open the entry and click **Add Source** — select the source type, toggle remote/local mode, and fill in the fields
5. Click **Build Now** to process all sources into a unified HTML bundle
6. Use the embedded viewer to browse the documentation, or search across indexed content

### Build Modes

- **Build Now** — server-side processing with live log output
- **Download Script** — exports a self-contained `.sh` script with all curl commands; inspect, modify, and run locally

## Architecture

```
dockit/
├── apps/
│   ├── server/          Express + TypeScript backend (port 3001)
│   └── client/          React + Vite + Tailwind CSS frontend (port 5173)
├── data/                Runtime data (SQLite DB, extracted sources, HTML bundles)
├── dockit.yaml          MCP entries/sources config
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
| MCP | @modelcontextprotocol/sdk 1.29 |
| HTML Parsing | node-html-parser |
| AsciiDoc | @asciidoctor/core |
| Archives | unzipper |
| Build Pipeline | Antora CLI, Git, Maven dependency plugin |
