#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, resolveProjectRoot } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { command, positional, flags } = parseArgs(process.argv);

const commands = {
  dev: () => import('./commands/dev.js'),
  serve: () => import('./commands/serve.js'),
  mcp: () => import('./commands/mcp.js'),
  search: () => import('./commands/search.js'),
  list: () => import('./commands/list.js'),
  build: () => import('./commands/build.js'),
  status: () => import('./commands/status.js'),
  get: () => import('./commands/get.js'),
  graph: () => import('./commands/graph.js'),
  init: () => import('./commands/init.js'),
};

if (command && commands[command]) {
  const root = resolveProjectRoot();
  const mod = await commands[command]();
  mod.default(root, positional, flags);
} else if (command === 'help' || command === '--help' || command === '-h') {
  showHelp();
} else if (command) {
  console.error(`Unknown command: ${command}\n`);
  showHelp();
  process.exit(1);
} else {
  showHelp();
}

function showHelp() {
  console.log(`
Dockit - Local documentation hub

Usage:
  dockit <command> [options]

Commands:
  dev                     Start dev servers (client + server)
  serve [--port <port>]   Start production server
  mcp [--http] [--port <port>]  Start MCP server
  search [<entry>] <query>  Search documentation (scoped to entry if provided)
    Without entry: shows top result per entry to help pick the right one
    With entry: shows all matching results within that entry
    --limit <n>           Max results (default 20)
    --get-top [N]         Fetch full content for top N results (default 3)
    --json                Output as JSON
  list                    List all documentation entries
    --json                Output as JSON
  build <entry>           Build documentation for an entry
  status <entry>          Check build status
    --json                Output as JSON
  get <entry> <path>      Fetch full document content
    --json                Output as JSON
  graph query <entry> <query>  Search knowledge graph nodes
    --limit <n>           Max results (default 20)
    --json                Output as JSON
  graph path <entry> <from> <to>  Find shortest path between two nodes
    --json                Output as JSON
  graph gods <entry>      List most connected (god) nodes
    --limit <n>           Max nodes (default 10)
    --json                Output as JSON
  graph explain <entry> <node>  Show node details and connections
    --json                Output as JSON
  init [--path <dir>] [--name <name>]  Initialize a project as a dockit source
    --path <dir>          Path to source directory (default: .)
    --name <name>         Entry name (default: directory name)
    --version <ver>       Version string (default: 1.0)
    --code-path <path>    Subdirectory for source code scanning (optional)

Examples:
  dockit search react "how to create a hook"
  dockit search quarkus "configure cache"
  dockit search "react hooks" --get-top
  dockit search "react hooks" --get-top 3 --json
  dockit list
  dockit build quarkus
  dockit status quarkus
  dockit get react asciidoc/getting-started.html
  dockit graph query dockit-code "SourceCodeSourceProcessor"
  dockit graph gods dockit-code
  dockit graph path dockit-code "BuildUseCase" "SourceCodeSourceProcessor"
  dockit serve --port 8080
`);
}
