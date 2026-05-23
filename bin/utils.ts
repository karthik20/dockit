import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function resolveProjectRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error('Could not find dockit project root');
}

export function resolveDockitHome(): string {
  return process.env.DOCKIT_DATA_DIR || path.join(os.homedir(), '.dockit');
}

export function resolveConfigPath(root: string): string {
  const homeConfig = path.join(resolveDockitHome(), 'dockit.yaml');
  if (fs.existsSync(homeConfig)) return homeConfig;
  const projectConfig = path.join(root, 'dockit.yaml');
  if (fs.existsSync(projectConfig)) return projectConfig;
  return homeConfig;
}

export function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      flags[key] = true;
    } else {
      positional.push(arg);
    }
  }

  return { command: positional[0] || null, positional: positional.slice(1), flags };
}

export function formatTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] || '').length))
  );

  const pad = (str, width) => String(str).padEnd(width);

  const headerLine = headers.map((h, i) => pad(h, widths[i])).join('  ');
  const separator = widths.map((w) => '─'.repeat(w)).join('  ');
  const dataLines = rows.map((row) =>
    row.map((cell, i) => pad(cell || '', widths[i])).join('  ')
  );

  return [headerLine, separator, ...dataLines].join('\n');
}

export function spawnProcess(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: 'inherit', shell: true });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Process exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}
