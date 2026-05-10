#!/usr/bin/env node
/**
 * Dockit MCP HTTP Bridge
 * Proxies JSON-RPC requests over HTTP to the Dockit MCP stdio server.
 *
 * Usage:
 *   node --import=tsx apps/server/src/mcp-http.ts [port]
 *   DOCKIT_MCP_HTTP_PORT=3456 npx tsx apps/server/src/mcp-http.ts
 *
 * Then curl:
 *   curl -X POST http://localhost:3456 \
 *     -H "Content-Type: application/json" \
 *     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_SCRIPT = path.join(__dirname, 'mcp.ts');
const PORT = parseInt(process.env.DOCKIT_MCP_HTTP_PORT || process.argv[2] || '3456', 10);

// Spawn the stdio MCP server
const mcp = spawn('npx', ['tsx', MCP_SCRIPT], {
  cwd: path.join(__dirname, '..', '..', '..'),
  env: { ...process.env, PATH: process.env.PATH },
});

let buffer = '';
const pending = new Map<number | string, (response: object) => void>();

mcp.stdout.on('data', (data: Buffer) => {
  buffer += data.toString('utf-8');
  let lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)!(msg);
        pending.delete(msg.id);
      }
    } catch {
      // ignore non-JSON lines
    }
  }
});

mcp.stderr.on('data', (data: Buffer) => {
  process.stderr.write(data);
});

mcp.on('exit', (code) => {
  console.error(`[mcp-http] MCP server exited with code ${code}`);
  process.exit(code ?? 1);
});

// HTTP server
const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try {
      const request = JSON.parse(body);
      const id = request.id ?? Math.random().toString(36).slice(2);
      request.id = id;

      const timeout = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: 'Request timeout' } }));
        }
      }, 30000);

      pending.set(id, (response) => {
        clearTimeout(timeout);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      });

      mcp.stdin.write(JSON.stringify(request) + '\n');
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  });
});

server.listen(PORT, () => {
  console.error(`[mcp-http] Bridge listening on http://localhost:${PORT}`);
});
