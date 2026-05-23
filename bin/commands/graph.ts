import path from 'node:path';
import fs from 'node:fs';
import { formatTable } from '../utils.js';

const SUBCOMMANDS = ['query', 'path', 'gods', 'explain'];

export default async function graph(root, positional, flags) {
  const sub = positional[0];
  if (!sub || !SUBCOMMANDS.includes(sub)) {
    console.error('Usage: dockit graph <query|path|gods|explain> <entry> [args...]');
    console.error('');
    console.error('Commands:');
    console.error('  dockit graph query <entry> <query>     Search graph nodes by name, file, or type');
    console.error('  dockit graph path <entry> <from> <to>  Find shortest dependency path between two nodes');
    console.error('  dockit graph gods <entry>               List most connected nodes');
    console.error('  dockit graph explain <entry> <node>     Get node details with edges and connections');
    process.exit(1);
  }

  const entry = positional[1];
  if (!entry) {
    console.error('Error: entry ID is required');
    console.error(`Usage: dockit graph ${sub} <entry> ...`);
    process.exit(1);
  }

  const { GraphifyKnowledgeGraph } = await import(path.join(root, 'apps/server/src/infrastructure/graph/GraphifyKnowledgeGraph.js'));
  const { DATA_ROOT } = await import(path.join(root, 'apps/server/src/services/paths.js'));

  const kg = new GraphifyKnowledgeGraph(path.join(DATA_ROOT, entry));

  if (!kg.exists()) {
    console.error(`No knowledge graph found for entry "${entry}". Build the entry first.`);
    process.exit(1);
  }

  const asJson = !!flags.json;

  switch (sub) {
    case 'query': {
      const query = positional.slice(2).join(' ');
      if (!query) {
        console.error('Error: query string is required');
        console.error(`Usage: dockit graph query ${entry} \"<query>\"`);
        process.exit(1);
      }
      const limit = parseInt(flags.limit || '20', 10);
      const result = kg.query(query, limit);
      if (asJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Query: "${query}" — ${result.totalNodes} node(s), ${result.totalEdges} edge(s) found\n`);
        if (result.nodes.length === 0) {
          console.log('No matching nodes.');
        } else {
          const rows = result.nodes.map((n) => [
            n.name.slice(0, 40),
            n.type.slice(0, 12),
            n.file.slice(0, 50),
          ]);
          console.log(formatTable(['Name', 'Type', 'File'], rows));
        }
      }
      break;
    }

    case 'path': {
      const from = positional[2];
      const to = positional[3];
      if (!from || !to) {
        console.error('Error: from and to node names are required');
        console.error(`Usage: dockit graph path ${entry} <from> <to>`);
        process.exit(1);
      }
      const result = kg.findPath(from, to);
      if (asJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.found) {
          console.log(`Path found (length: ${result.length}):`);
          result.nodes.forEach((n, i) => {
            const prefix = i === 0 ? '  Start' : i === result.nodes.length - 1 ? '  End  ' : '  ->   ';
            console.log(`${prefix} ${n.name}  (${n.file})`);
          });
        } else {
          console.log(`No path found between "${from}" and "${to}".`);
        }
      }
      break;
    }

    case 'gods': {
      const limit = parseInt(flags.limit || '10', 10);
      const nodes = kg.findGodNodes(limit);
      const meta = kg.getMetadata();
      if (asJson) {
        console.log(JSON.stringify({ nodes, metadata: meta }, null, 2));
      } else {
        console.log(`Top ${nodes.length} most connected nodes (${meta.nodeCount} total nodes):\n`);
        const rows = nodes.map((n) => [
          n.name.slice(0, 40),
          String(n.degree ?? 0),
          n.file.slice(0, 50),
        ]);
        console.log(formatTable(['Name', 'Degree', 'File'], rows));
      }
      break;
    }

    case 'explain': {
      const nodeName = positional.slice(2).join(' ');
      if (!nodeName) {
        console.error('Error: node name is required');
        console.error(`Usage: dockit graph explain ${entry} <node>`);
        process.exit(1);
      }
      const queryResult = kg.query(nodeName);
      const node = queryResult.nodes[0] || null;
      if (asJson) {
        const result = {
          node,
          connectedNodes: queryResult.nodes.slice(1, 11),
          edges: queryResult.edges.filter((e) => e.source === node?.id || e.target === node?.id).slice(0, 20),
          totalConnections: queryResult.totalEdges,
        };
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (!node) {
          console.log(`Node "${nodeName}" not found.`);
        } else {
          console.log(`Node: ${node.name}`);
          console.log(`  Type: ${node.type}`);
          console.log(`  File: ${node.file}`);
          if (node.community !== undefined) console.log(`  Community: ${node.community}`);
          console.log('');
          const nodeEdges = queryResult.edges.filter((e) => e.source === node.id || e.target === node.id);
          if (nodeEdges.length > 0) {
            console.log(`Connections (${nodeEdges.length}):`);
            nodeEdges.slice(0, 20).forEach((e) => {
              const direction = e.source === node.id ? '->' : '<-';
              const other = e.source === node.id ? e.target : e.source;
              console.log(`  ${node.name} ${direction} ${other}  [${e.type}]`);
            });
            if (nodeEdges.length > 20) console.log(`  ... and ${nodeEdges.length - 20} more`);
          } else {
            console.log('No connections.');
          }
        }
      }
      break;
    }
  }
}
