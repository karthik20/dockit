import { McpServer, StdioServerTransport, fromJsonSchema } from '@modelcontextprotocol/server';
import path from 'node:path';
import fs from 'node:fs';
import { loadConfig, syncConfigToDb } from './services/configLoader.js';
import { buildEntry } from './services/buildPipeline.js';
import { getDb, getSources } from './db/index.js';
import { searchIndex } from './services/indexer.js';
import { extractTextFromHtml } from './services/textExtractor.js';
import { DATA_ROOT } from './services/paths.js';
import type { Entry } from './types.js';

const PROJECT_ROOT = path.resolve(DATA_ROOT, '..', '..');

let configPath = path.join(PROJECT_ROOT, 'dockit.yaml');
if (!fs.existsSync(configPath)) {
  configPath = path.join(process.cwd(), 'dockit.yaml');
}

const config = loadConfig(configPath);
const toolPrefix = config.mcp?.toolPrefix || 'dockit_';
const maxResults = config.mcp?.maxSearchResults || 10;

syncConfigToDb(config);

if (config.mcp?.autoBuild) {
  console.error('[dockit] Auto-building all entries...');
  for (const entryConfig of config.entries) {
    try {
      const result = await buildEntry(entryConfig.id);
      console.error(`[dockit] ${entryConfig.id}: ${result.status}`);
    } catch (err) {
      console.error(`[dockit] ${entryConfig.id}: build error - ${(err as Error).message}`);
    }
  }
}

const server = new McpServer({
  name: 'dockit',
  version: '1.0.0',
});

server.registerTool(
  `${toolPrefix}list_entries`,
  {
    description: 'List all available documentation entries with their status and source count.',
  },
  async () => {
    const db = getDb();
    const entries = db.prepare('SELECT id, name, version, description, status FROM entries ORDER BY name').all() as Entry[];
    const entryList = entries.map((e) => {
      const sources = getSources(e.id);
      return {
        id: e.id,
        name: e.name,
        version: e.version,
        description: e.description,
        status: e.status,
        sourceCount: sources.length,
      };
    });
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(entryList, null, 2) }],
    };
  },
);

  server.registerTool(
  `${toolPrefix}search`,
  {
    description:
      'Search through built documentation for a specific entry. Returns document paths, titles, and text snippets matching the query. Use this to find relevant documents before fetching full content.',
    inputSchema: fromJsonSchema({
      type: 'object',
      properties: {
        entry: { type: 'string', description: 'Entry ID to search (use dockit_list_entries to discover available IDs)' },
        query: { type: 'string', description: 'Search query string. Case-insensitive keyword matching across titles, headings, and body text.' },
        maxResults: { type: 'number', description: `Maximum number of results to return (1-20, default ${maxResults})` },
      },
      required: ['entry', 'query'],
    }),
  },
  async ({ entry, query, maxResults: limit }) => {
    const entryStr = entry as string;
    const queryStr = query as string;
    const resultLimit = Math.min(Math.max(1, (limit as number) || maxResults), 20);

    if (!entryStr || !queryStr) {
      return {
        content: [{ type: 'text' as const, text: 'Error: entry and query are required' }],
        isError: true,
      };
    }

    const indexPath = path.join(DATA_ROOT, entryStr, 'index.json');
    const results = searchIndex(indexPath, queryStr, resultLimit);

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
    };
  },
);

server.registerTool(
  `${toolPrefix}get_doc`,
  {
    description:
      'Retrieve the full text content of a specific documentation file. Returns plain text extracted from the built HTML. Use this after dockit_search to get the complete content of relevant documents.',
    inputSchema: fromJsonSchema({
      type: 'object',
      properties: {
        entry: { type: 'string', description: 'Entry ID that owns the document' },
        path: { type: 'string', description: 'Document path as returned by dockit_search (e.g. "asciidoc/rest-json.html")' },
      },
      required: ['entry', 'path'],
    }),
  },
  async ({ entry, path: docPath }) => {
    const entryStr = entry as string;
    const docPathStr = docPath as string;

    if (!entryStr || !docPathStr) {
      return {
        content: [{ type: 'text' as const, text: 'Error: entry and path are required' }],
        isError: true,
      };
    }

    const filePath = path.join(DATA_ROOT, entryStr, 'bundle', docPathStr);
    if (!fs.existsSync(filePath)) {
      return {
        content: [{ type: 'text' as const, text: `Document not found: ${docPathStr}. Has the entry been built?` }],
        isError: true,
      };
    }

    const html = fs.readFileSync(filePath, 'utf-8');
    const text = extractTextFromHtml(html);

    return {
      content: [{ type: 'text' as const, text }],
    };
  },
);

server.registerTool(
  `${toolPrefix}build`,
  {
    description:
      'Build or rebuild documentation for an entry. This clones repos, downloads artifacts, and converts sources to HTML. Build status can be checked with dockit_build_status.',
    inputSchema: fromJsonSchema({
      type: 'object',
      properties: {
        entry: { type: 'string', description: 'Entry ID to build' },
      },
      required: ['entry'],
    }),
  },
  async ({ entry }) => {
    const entryStr = entry as string;

    if (!entryStr) {
      return {
        content: [{ type: 'text' as const, text: 'Error: entry is required' }],
        isError: true,
      };
    }

    const db = getDb();
    const entryRecord = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryStr) as Entry | undefined;
    if (!entryRecord) {
      return {
        content: [{ type: 'text' as const, text: `Entry not found: ${entryStr}` }],
        isError: true,
      };
    }

    if (entryRecord.status === 'building') {
      return {
        content: [{ type: 'text' as const, text: `Build already in progress for ${entryStr}` }],
      };
    }

    buildEntry(entryStr).then((result) => {
      console.error(`[dockit] Build ${entryStr}: ${result.status}`);
    });

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ entry: entryStr, status: 'building', message: 'Build started. Check status with dockit_build_status.' }) }],
    };
  },
);

server.registerTool(
  `${toolPrefix}build_status`,
  {
    description: 'Check the build status of an entry. Returns status (pending/building/ready/error) and the build log.',
    inputSchema: fromJsonSchema({
      type: 'object',
      properties: {
        entry: { type: 'string', description: 'Entry ID to check' },
      },
      required: ['entry'],
    }),
  },
  async ({ entry }) => {
    const entryStr = entry as string;

    if (!entryStr) {
      return {
        content: [{ type: 'text' as const, text: 'Error: entry is required' }],
        isError: true,
      };
    }

    const db = getDb();
    const build = db.prepare('SELECT * FROM builds WHERE entry_id = ? ORDER BY started_at DESC LIMIT 1').get(entryStr) as { status: string; log: string; started_at: string; finished_at: string } | undefined;

    if (!build) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ status: 'none', message: 'No builds found for this entry' }) }],
      };
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        status: build.status,
        startedAt: build.started_at,
        finishedAt: build.finished_at,
        log: build.log.slice(-2000),
      }, null, 2) }],
    };
  },
);

server.registerTool(
  `${toolPrefix}find_entry`,
  {
    description: 'Find documentation entries by name or description. Returns matching entries with their IDs and status. Use this when you do not know the entry ID.',
    inputSchema: fromJsonSchema({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query to match against entry name or description (case-insensitive substring match)' },
      },
      required: ['query'],
    }),
  },
  async ({ query }) => {
    const queryStr = (query as string).toLowerCase();
    const db = getDb();
    const entries = db.prepare(
      "SELECT id, name, version, description, status FROM entries WHERE LOWER(name) LIKE ? OR LOWER(COALESCE(description,'')) LIKE ? ORDER BY name"
    ).all(`%${queryStr}%`, `%${queryStr}%`) as Entry[];

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(entries, null, 2) }],
    };
  },
);

server.registerTool(
  `${toolPrefix}global_search`,
  {
    description: 'Search across ALL built documentation entries at once. No entry ID required. Returns aggregated results from every ready entry. Use this for broad discovery when you do not know which entry contains the answer.',
    inputSchema: fromJsonSchema({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string. Case-insensitive keyword matching across titles, headings, and body text of ALL entries.' },
        maxResults: { type: 'number', description: `Maximum total results to return across all entries (1-50, default ${maxResults * 2})` },
      },
      required: ['query'],
    }),
  },
  async ({ query, maxResults: limit }) => {
    const queryStr = query as string;
    const resultLimit = Math.min(Math.max(1, (limit as number) || maxResults * 2), 50);

    if (!queryStr) {
      return {
        content: [{ type: 'text' as const, text: 'Error: query is required' }],
        isError: true,
      };
    }

    const db = getDb();
    const readyEntries = db.prepare("SELECT id, name, version FROM entries WHERE status = 'ready' ORDER BY name").all() as Entry[];

    const allResults: Array<Record<string, unknown>> = [];
    for (const entry of readyEntries) {
      const indexPath = path.join(DATA_ROOT, entry.id, 'index.json');
      const results = searchIndex(indexPath, queryStr, 10);
      for (const r of results) {
        allResults.push({
          entryId: entry.id,
          entryName: entry.name,
          entryVersion: entry.version,
          ...r,
        });
      }
    }

    // Sort by relevance (score) and truncate
    allResults.sort((a, b) => ((b as any).score || 0) - ((a as any).score || 0));
    const limited = allResults.slice(0, resultLimit);

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(limited, null, 2) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[dockit] MCP server ready');
