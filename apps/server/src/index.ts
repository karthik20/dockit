import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import entryRoutes from './routes/entries.js';
import sourceRoutes from './routes/sources.js';
import sourceFlatRoutes from './routes/sources-flat.js';
import buildRoutes from './routes/build.js';
import searchRoutes from './routes/search.js';
import viewerRoutes from './routes/viewer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/entries', entryRoutes);

app.use('/api/entries/:entryId/sources', sourceRoutes);
app.use('/api/sources', sourceFlatRoutes);

app.use('/api', buildRoutes);
app.use('/api', searchRoutes);
app.use('/api', viewerRoutes);

app.listen(PORT, () => {
  console.log(`Dockit server running on http://localhost:${PORT}`);
});
