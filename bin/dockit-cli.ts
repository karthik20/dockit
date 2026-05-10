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

Examples:
  dockit search react "how to create a hook"
  dockit search quarkus "configure cache"
  dockit search "react hooks" --get-top
  dockit search "react hooks" --get-top 3 --json
  dockit list
  dockit build quarkus
  dockit status quarkus
  dockit get react asciidoc/getting-started.html
  dockit serve --port 8080
`);
}
