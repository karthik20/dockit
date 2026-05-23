import { McpServer, StdioServerTransport, fromJsonSchema } from '@modelcontextprotocol/server';
import path from 'node:path';
import fs from 'node:fs';
import { loadConfig, syncConfigToDb } from './services/configLoader.js';
import { getDb } from './infrastructure/persistence/sqlite/connection.js';
import { SqliteEntryRepository } from './infrastructure/persistence/sqlite/SqliteEntryRepository.js';
import { SqliteSourceRepository } from './infrastructure/persistence/sqlite/SqliteSourceRepository.js';
import { SqliteBuildRepository } from './infrastructure/persistence/sqlite/SqliteBuildRepository.js';
import { SqliteEntryReadModel } from './infrastructure/persistence/sqlite/SqliteEntryReadModel.js';
import { createSearchEngine } from './infrastructure/search/SearchEngineFactory.js';
import { SearchUseCase } from './core/usecases/SearchUseCase.js';
import { BuildUseCase } from './core/usecases/BuildUseCase.js';
import { ConfigUseCase } from './core/usecases/ConfigUseCase.js';
import { FileSystemDocumentStore } from './infrastructure/filesystem/FileSystemDocumentStore.js';
import { extractTextFromHtml } from './services/textExtractor.js';
import { ZipSourceProcessor } from './infrastructure/source-processors/ZipSourceProcessor.js';
import { AntoraSourceProcessor } from './infrastructure/source-processors/AntoraSourceProcessor.js';
import { AsciidocSourceProcessor } from './infrastructure/source-processors/AsciidocSourceProcessor.js';
import { MavenSourceProcessor } from './infrastructure/source-processors/MavenSourceProcessor.js';
import { GithubMarkdownSourceProcessor } from './infrastructure/source-processors/GithubMarkdownSourceProcessor.js';
import { SourceCodeSourceProcessor } from './infrastructure/source-processors/SourceCodeSourceProcessor.js';
import { DocumentNormalizer } from './infrastructure/source-processors/DocumentNormalizer.js';
import { PathResolver } from './infrastructure/source-processors/PathResolver.js';
import { GraphifyKnowledgeGraph } from './infrastructure/graph/GraphifyKnowledgeGraph.js';
import { DATA_ROOT } from './services/paths.js';

let configPath = path.join(DATA_ROOT, 'dockit.yaml');
if (!fs.existsSync(configPath)) {
  configPath = path.join(process.cwd(), 'dockit.yaml');
}

const config = loadConfig(configPath);
const toolPrefix = config.mcp?.toolPrefix || 'dockit_';
const maxResults = config.mcp?.maxSearchResults || 10;

async function main() {
  const db = getDb();
  const entryRepo = new SqliteEntryRepository(db);
  const sourceRepo = new SqliteSourceRepository(db);
  const buildRepo = new SqliteBuildRepository(db);

  await syncConfigToDb(config, entryRepo, sourceRepo);
  const entryReadModel = new SqliteEntryReadModel(db);
  const searchEngine = await createSearchEngine(entryReadModel, config.search?.engine);

  const configUseCase = new ConfigUseCase(entryRepo, sourceRepo);
  const searchUseCase = new SearchUseCase(searchEngine);

  const processors = [
    new ZipSourceProcessor(),
    new AntoraSourceProcessor(),
    new AsciidocSourceProcessor(),
    new MavenSourceProcessor(),
    new GithubMarkdownSourceProcessor(),
    new SourceCodeSourceProcessor(),
  ];
  const documentNormalizer = new DocumentNormalizer();
  const pathResolver = new PathResolver();

  const buildUseCase = new BuildUseCase(
    buildRepo, sourceRepo, entryRepo, searchEngine,
    processors, documentNormalizer, pathResolver,
  );
  const docStore = new FileSystemDocumentStore();

  if (config.mcp?.autoBuild) {
    console.error('[dockit] Auto-building all entries...');
    for (const entryConfig of config.entries) {
      try {
        const result = await buildUseCase.build(entryConfig.id);
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
      const entries = await configUseCase.listEntries();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(entries, null, 2) }],
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
    async ({ entry, query, maxResults: limit }: any) => {
      const entryStr = entry as string;
      const queryStr = query as string;
      const resultLimit = Math.min(Math.max(1, (limit as number) || maxResults), 20);

      if (!entryStr || !queryStr) {
        return {
          content: [{ type: 'text' as const, text: 'Error: entry and query are required' }],
          isError: true,
        };
      }

      const results = await searchUseCase.searchEntry(entryStr, queryStr, resultLimit);

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
    async ({ entry, path: docPath }: any) => {
      const entryStr = entry as string;
      const docPathStr = docPath as string;

      if (!entryStr || !docPathStr) {
        return {
          content: [{ type: 'text' as const, text: 'Error: entry and path are required' }],
          isError: true,
        };
      }

      const exists = await docStore.documentExists(entryStr, docPathStr);
      if (!exists) {
        return {
          content: [{ type: 'text' as const, text: `Document not found: ${docPathStr}. Has the entry been built?` }],
          isError: true,
        };
      }

      const html = await docStore.getDocument(entryStr, docPathStr);
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
    async ({ entry }: any) => {
      const entryStr = entry as string;

      if (!entryStr) {
        return {
          content: [{ type: 'text' as const, text: 'Error: entry is required' }],
          isError: true,
        };
      }

      const entryRecord = await configUseCase.getEntry(entryStr);
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

      buildUseCase.build(entryStr).then((result) => {
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
    async ({ entry }: any) => {
      const entryStr = entry as string;

      if (!entryStr) {
        return {
          content: [{ type: 'text' as const, text: 'Error: entry is required' }],
          isError: true,
        };
      }

      const build = await buildRepo.findLatest(entryStr);

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
    async ({ query }: any) => {
      const queryStr = (query as string).toLowerCase();
      const entries = await entryRepo.findAll();
      const filtered = entries.filter((e) =>
        e.name.toLowerCase().includes(queryStr) ||
        (e.description || '').toLowerCase().includes(queryStr)
      );

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(filtered, null, 2) }],
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
    async ({ query, maxResults: limit }: any) => {
      const queryStr = query as string;
      const resultLimit = Math.min(Math.max(1, (limit as number) || maxResults * 2), 50);

      if (!queryStr) {
        return {
          content: [{ type: 'text' as const, text: 'Error: query is required' }],
          isError: true,
        };
      }

      const results = await searchUseCase.globalSearch(queryStr, resultLimit);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  function getKnowledgeGraph(entryId: string): GraphifyKnowledgeGraph {
    return new GraphifyKnowledgeGraph(path.join(DATA_ROOT, entryId));
  }

  server.registerTool(
    `${toolPrefix}graph_query`,
    {
      description: 'Search the knowledge graph for an entry. Returns nodes and edges matching the query. Use this instead of dockit_search for source-code-only entries.',
      inputSchema: fromJsonSchema({
        type: 'object',
        properties: {
          entry: { type: 'string', description: 'Entry ID with a built knowledge graph' },
          query: { type: 'string', description: 'Text to match against node names, file paths, or types' },
          limit: { type: 'number', description: 'Maximum nodes to return (default 20)' },
        },
        required: ['entry', 'query'],
      }),
    },
    async ({ entry, query, limit: max }: any) => {
      const kg = getKnowledgeGraph(entry as string);
      if (!kg.exists()) {
        return { content: [{ type: 'text' as const, text: 'No knowledge graph found. Build the entry first.' }], isError: true };
      }
      const result = kg.query(query as string, (max as number) || 20);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    `${toolPrefix}graph_path`,
    {
      description: 'Find the shortest dependency path between two nodes in the knowledge graph.',
      inputSchema: fromJsonSchema({
        type: 'object',
        properties: {
          entry: { type: 'string', description: 'Entry ID with a built knowledge graph' },
          from: { type: 'string', description: 'Starting node name or ID' },
          to: { type: 'string', description: 'Target node name or ID' },
        },
        required: ['entry', 'from', 'to'],
      }),
    },
    async ({ entry, from, to }: any) => {
      const kg = getKnowledgeGraph(entry as string);
      if (!kg.exists()) {
        return { content: [{ type: 'text' as const, text: 'No knowledge graph found. Build the entry first.' }], isError: true };
      }
      const result = kg.findPath(from as string, to as string);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    `${toolPrefix}graph_explain`,
    {
      description: 'Get details about a specific node in the knowledge graph, including its edges and connections.',
      inputSchema: fromJsonSchema({
        type: 'object',
        properties: {
          entry: { type: 'string', description: 'Entry ID with a built knowledge graph' },
          node: { type: 'string', description: 'Node name or ID' },
        },
        required: ['entry', 'node'],
      }),
    },
    async ({ entry, node }: any) => {
      const kg = getKnowledgeGraph(entry as string);
      if (!kg.exists()) {
        return { content: [{ type: 'text' as const, text: 'No knowledge graph found. Build the entry first.' }], isError: true };
      }
      const queryResult = kg.query(node as string);
      const result = {
        node: queryResult.nodes[0] || null,
        connectedNodes: queryResult.nodes.slice(1),
        edges: queryResult.edges,
        totalConnections: queryResult.totalEdges,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    `${toolPrefix}graph_gods`,
    {
      description: 'List the most connected nodes (God Nodes) in the knowledge graph. These are the most important classes or modules.',
      inputSchema: fromJsonSchema({
        type: 'object',
        properties: {
          entry: { type: 'string', description: 'Entry ID with a built knowledge graph' },
          limit: { type: 'number', description: 'Number of god nodes to return (default 10)' },
        },
        required: ['entry'],
      }),
    },
    async ({ entry, limit: max }: any) => {
      const kg = getKnowledgeGraph(entry as string);
      if (!kg.exists()) {
        return { content: [{ type: 'text' as const, text: 'No knowledge graph found. Build the entry first.' }], isError: true };
      }
      const nodes = kg.findGodNodes((max as number) || 10);
      const meta = kg.getMetadata();
      return { content: [{ type: 'text' as const, text: JSON.stringify({ nodes, metadata: meta }, null, 2) }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[dockit] MCP server ready');
}

main().catch((err) => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});
