#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const proc = spawn('npx', ['tsx', path.join(projectRoot, 'bin/dockit-cli.ts'), ...process.argv.slice(2)], {
  cwd: projectRoot,
  stdio: 'inherit',
});

proc.on('close', (code) => {
  process.exit(code || 0);
});
