#!/usr/bin/env node

import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const req = createRequire(import.meta.url);

function nativeModuleNeedsRebuild() {
  const bs3Pkg = path.dirname(req.resolve('better-sqlite3/package.json'));
  const binaryPath = path.join(bs3Pkg, 'build/Release/better_sqlite3.node');
  if (!fs.existsSync(binaryPath)) return true;
  try {
    const bs3 = req('better-sqlite3');
    new bs3(':memory:').close();
    return false;
  } catch { return true; }
}

if (nativeModuleNeedsRebuild()) {
  console.log('Compiling SQLite module for Node.js ' + process.version.split('.')[0].slice(1) + '...');
  console.log('(takes ~1-2 min first run, then cached)');
  const bs3Pkg = path.dirname(req.resolve('better-sqlite3/package.json'));
  try { fs.rmSync(path.join(bs3Pkg, 'build'), { recursive: true, force: true }); } catch {}
  try {
    execSync('npm run install', { cwd: bs3Pkg, stdio: 'inherit', timeout: 300000, windowsHide: true });
  } catch (e) {
    console.error('Warning: SQLite compile failed. Server may not start. Try: npm install -g @lon-ask/dockit@latest');
  }
}

const proc = spawn('npx', ['tsx', path.join(projectRoot, 'bin/dockit-cli.ts'), ...process.argv.slice(2)], {
  cwd: projectRoot,
  stdio: 'inherit',
});

proc.on('close', (code) => {
  process.exit(code || 0);
});
