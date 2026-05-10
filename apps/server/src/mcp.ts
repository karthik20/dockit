import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
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

const server = new Server(
  { name: 'dockit', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: `${toolPrefix}list_entries`,
      description: 'List all available documentation entries with their status and source count.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
    {
      name: `${toolPrefix}search`,
      description:
        'Search through built documentation for a specific entry. Returns document paths, titles, and text snippets matching the query. Use this to find relevant documents before fetching full content.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          entry: {
            type: 'string',
            description: 'Entry ID to search (use dockit_list_entries to discover available IDs)',
          },
          query: {
            type: 'string',
            description: 'Search query string. Case-insensitive keyword matching across titles, headings, and body text.',
          },
          maxResults: {
            type: 'number',
            description: `Maximum number of results to return (1-20, default ${maxResults})`,
          },
        },
        required: ['entry', 'query'],
      },
    },
    {
      name: `${toolPrefix}get_doc`,
      description:
        'Retrieve the full text content of a specific documentation file. Returns plain text extracted from the built HTML. Use this after dockit_search to get the complete content of relevant documents.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          entry: {
            type: 'string',
            description: 'Entry ID that owns the document',
          },
          path: {
            type: 'string',
            description: 'Document path as returned by dockit_search (e.g. "asciidoc/rest-json.html")',
          },
        },
        required: ['entry', 'path'],
      },
    },
    {
      name: `${toolPrefix}build`,
      description:
        'Build or rebuild documentation for an entry. This clones repos, downloads artifacts, and converts sources to HTML. Build status can be checked with dockit_build_status.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          entry: {
            type: 'string',
            description: 'Entry ID to build',
          },
        },
        required: ['entry'],
      },
    },
    {
      name: `${toolPrefix}build_status`,
      description:
        'Check the build status of an entry. Returns status (pending/building/ready/error) and the build log.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          entry: {
            type: 'string',
            description: 'Entry ID to check',
          },
        },
        required: ['entry'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = (request.params.arguments || {}) as Record<string, unknown>;

  try {
    switch (toolName) {
      case `${toolPrefix}list_entries`: {
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
      }

      case `${toolPrefix}search`: {
        const entry = args.entry as string;
        const query = args.query as string;
        const limit = Math.min(Math.max(1, (args.maxResults as number) || maxResults), 20);

        if (!entry || !query) {
          return {
            content: [{ type: 'text' as const, text: 'Error: entry and query are required' }],
            isError: true,
          };
        }

        const indexPath = path.join(DATA_ROOT, entry, 'index.json');
        const results = searchIndex(indexPath, query, limit);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
        };
      }

      case `${toolPrefix}get_doc`: {
        const entry = args.entry as string;
        const docPath = args.path as string;

        if (!entry || !docPath) {
          return {
            content: [{ type: 'text' as const, text: 'Error: entry and path are required' }],
            isError: true,
          };
        }

        const filePath = path.join(DATA_ROOT, entry, 'bundle', docPath);
        if (!fs.existsSync(filePath)) {
          return {
            content: [{ type: 'text' as const, text: `Document not found: ${docPath}. Has the entry been built?` }],
            isError: true,
          };
        }

        const html = fs.readFileSync(filePath, 'utf-8');
        const text = extractTextFromHtml(html);

        return {
          content: [{ type: 'text' as const, text: text }],
        };
      }

      case `${toolPrefix}build`: {
        const entry = args.entry as string;
        if (!entry) {
          return {
            content: [{ type: 'text' as const, text: 'Error: entry is required' }],
            isError: true,
          };
        }

        const db = getDb();
        const entryRecord = db.prepare('SELECT * FROM entries WHERE id = ?').get(entry) as Entry | undefined;
        if (!entryRecord) {
          return {
            content: [{ type: 'text' as const, text: `Entry not found: ${entry}` }],
            isError: true,
          };
        }

        if (entryRecord.status === 'building') {
          return {
            content: [{ type: 'text' as const, text: `Build already in progress for ${entry}` }],
          };
        }

        buildEntry(entry).then((result) => {
          console.error(`[dockit] Build ${entry}: ${result.status}`);
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ entry, status: 'building', message: 'Build started. Check status with dockit_build_status.' }) }],
        };
      }

      case `${toolPrefix}build_status`: {
        const entry = args.entry as string;
        if (!entry) {
          return {
            content: [{ type: 'text' as const, text: 'Error: entry is required' }],
            isError: true,
          };
        }

        const db = getDb();
        const build = db.prepare('SELECT * FROM builds WHERE entry_id = ? ORDER BY started_at DESC LIMIT 1').get(entry) as { status: string; log: string; started_at: string; finished_at: string } | undefined;

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
      }

      default:
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${toolName}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

console.error('[dockit] MCP server ready');
