import path from 'node:path';
import os from 'node:os';

export const DATA_ROOT = process.env.DOCKIT_DATA_DIR || path.join(os.homedir(), '.dockit');
