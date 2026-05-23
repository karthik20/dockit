import { Router } from 'express';
import { GraphifyKnowledgeGraph } from '../infrastructure/graph/GraphifyKnowledgeGraph.js';
import { DATA_ROOT } from '../services/paths.js';
import path from 'node:path';

export function createGraphRoutes(
  buildRepo: any,
  configUseCase: any,
): Router {
  const router = Router();

  router.get('/graph/:entry/query', async (req, res) => {
    try {
      const { entry } = req.params;
      const q = req.query.q as string;
      const limit = parseInt(req.query.limit as string, 10) || 20;
      if (!q) return res.status(400).json({ error: 'query parameter "q" is required' });
      const kg = new GraphifyKnowledgeGraph(path.join(DATA_ROOT, entry));
      if (!kg.exists()) return res.status(404).json({ error: 'No knowledge graph found. Build the entry first.' });
      const result = kg.query(q, limit);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/graph/:entry/path', async (req, res) => {
    try {
      const { entry } = req.params;
      const from = req.query.from as string;
      const to = req.query.to as string;
      if (!from || !to) return res.status(400).json({ error: '"from" and "to" query parameters are required' });
      const kg = new GraphifyKnowledgeGraph(path.join(DATA_ROOT, entry));
      if (!kg.exists()) return res.status(404).json({ error: 'No knowledge graph found. Build the entry first.' });
      const result = kg.findPath(from, to);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/graph/:entry/gods', async (req, res) => {
    try {
      const { entry } = req.params;
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const kg = new GraphifyKnowledgeGraph(path.join(DATA_ROOT, entry));
      if (!kg.exists()) return res.status(404).json({ error: 'No knowledge graph found. Build the entry first.' });
      const nodes = kg.findGodNodes(limit);
      const meta = kg.getMetadata();
      res.json({ nodes, metadata: meta });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
