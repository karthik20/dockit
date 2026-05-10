import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_ROOT = path.resolve(__dirname, '..', '..', '..', '..', 'data');
