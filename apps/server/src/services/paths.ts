import path from 'node:path';
import os from 'node:os';

const home = os.homedir() || process.cwd();
export const DATA_ROOT = process.env.DOCKIT_DATA_DIR || path.join(home, '.dockit');
