import path from 'node:path';
import fs from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzipper';
import type { AntoraSourceConfig } from '../core/domain/types.js';

async function cloneRepo(repoUrl: string, targetDir: string, log: (msg: string) => void): Promise<void> {
  log(`Cloning repository ${repoUrl}`);
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['clone', '--depth', '1', repoUrl, targetDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line) log(`  git: ${line}`);
      }
    });
    proc.on('close', (code) => {
      if (code === 0) {
        log('Repository cloned successfully');
        resolve();
      } else {
        reject(new Error(`git clone failed with code ${code}: ${stderr}`));
      }
    });
    proc.on('error', reject);
  });
}

async function extractZip(zipPath: string, targetDir: string, log: (msg: string) => void): Promise<void> {
  log(`Extracting local ZIP from ${zipPath}`);
  fs.mkdirSync(targetDir, { recursive: true });
  const data = fs.readFileSync(zipPath);
  const stream = Readable.from(data);
  await pipeline(stream, unzipper.Extract({ path: targetDir }));

  const entries = fs.readdirSync(targetDir);
  if (entries.length === 1 && fs.statSync(path.join(targetDir, entries[0])).isDirectory()) {
    log('Detected single root directory in ZIP, flattening...');
    const innerDir = path.join(targetDir, entries[0]);
    const innerEntries = fs.readdirSync(innerDir);
    for (const entry of innerEntries) {
      const src = path.join(innerDir, entry);
      const dest = path.join(targetDir, entry);
      fs.renameSync(src, dest);
    }
    fs.rmdirSync(innerDir);
  }

  log(`Extracted ZIP to ${targetDir}`);
}

function findAntoraYmlFiles(dir: string): string[] {
  const results: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.name === 'antora.yml') {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function findExistingPlaybook(contentDir: string): string | null {
  const candidates = ['antora-playbook.yml', 'site.yml', 'antora-playbook.yaml', 'site.yaml'];
  for (const name of candidates) {
    const p = path.join(contentDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function generatePlaybook(
  entryId: string,
  contentDir: string,
  outputDir: string,
  startPaths: string[],
  log: (msg: string) => void
): string {
  let sourcesYaml: string;
  if (startPaths.length === 0) {
    log('  No antora.yml files found — Antora will scan entire repository');
    sourcesYaml = `    - url: ${contentDir}\n      branches: HEAD`;
  } else {
    log(`  Found ${startPaths.length} antora.yml file(s)`);
    if (startPaths.length === 1) {
      const rel = path.relative(contentDir, path.dirname(startPaths[0]));
      log(`  Using start_path: ${rel || '.'}`);
      sourcesYaml = `    - url: ${contentDir}\n      branches: HEAD\n      start_path: ${rel || '.'}`;
    } else {
      const paths = startPaths
        .map((f) => path.relative(contentDir, path.dirname(f)))
        .filter((p) => p.length > 0);
      const pathsStr = paths.length > 0
        ? `\n${paths.map((p) => `        - ${p}`).join('\n')}`
        : '';
      sourcesYaml = `    - url: ${contentDir}\n      branches: HEAD\n      start_paths:${pathsStr}`;
    }
  }

  return `
site:
  title: Dockit — ${entryId}
  url: /api/bundle/${entryId}
content:
  sources:
${sourcesYaml}
ui:
  bundle:
    url: https://gitlab.com/antora/antora-ui-default/-/jobs/artifacts/HEAD/raw/build/ui-bundle.zip?job=bundle-stable
    snapshot: true
output:
  dir: ${outputDir}
`.trim();
}

function generatePlaybookFromExisting(playbookPath: string, outputDir: string): string {
  const raw = fs.readFileSync(playbookPath, 'utf-8');
  if (raw.includes('output:') && raw.includes('dir:')) {
    return raw;
  }
  return raw + `\noutput:\n  dir: ${outputDir}\n`;
}

async function runAntora(playbookPath: string, log: (msg: string) => void): Promise<void> {
  log(`Running Antora with playbook ${playbookPath}`);
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['antora', playbookPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.dirname(playbookPath),
      env: { ...process.env, CI: 'true' },
    });

    let stderr = '';
    proc.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line) log(`  antora: ${line}`);
      }
    });
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        log('Antora build completed successfully');
        resolve();
      } else {
        const tail = stderr.slice(-800);
        log(`Antora build failed (stderr: ${tail})`);
        reject(new Error(`Antora build failed with code ${code}`));
      }
    });
    proc.on('error', reject);
  });
}

export async function buildAntoraSource(
  config: AntoraSourceConfig,
  entryId: string,
  workDir: string,
  log: (msg: string) => void
): Promise<string> {
  let contentDir: string;
  let cleanupDir: string | undefined;

  if (config.localPath) {
    if (!fs.existsSync(config.localPath)) {
      throw new Error(`Local path not found: ${config.localPath}`);
    }
    if (!fs.statSync(config.localPath).isDirectory()) {
      throw new Error(`localPath must be a directory: ${config.localPath}`);
    }
    log(`Using local directory: ${config.localPath}`);
    contentDir = config.localPath;
  } else if (config.repoUrl) {
    contentDir = path.join(workDir, 'content');
    await cloneRepo(config.repoUrl, contentDir, log);
    cleanupDir = contentDir;
  } else if (config.zipPath) {
    contentDir = path.join(workDir, 'content');
    await extractZip(config.zipPath, contentDir, log);
    cleanupDir = contentDir;
  } else {
    throw new Error('Antora source requires repoUrl, localPath, or zipPath');
  }

  const playbookPath = path.join(workDir, 'antora-playbook.yml');
  const outputDir = path.join(workDir, 'output');
  const existingPlaybook = findExistingPlaybook(contentDir);

  if (existingPlaybook) {
    log(`Found existing playbook at ${path.relative(contentDir, existingPlaybook)}`);
    const playbookContent = generatePlaybookFromExisting(existingPlaybook, outputDir);
    fs.writeFileSync(playbookPath, playbookContent, 'utf-8');
  } else {
    const antoraFiles = findAntoraYmlFiles(contentDir);
    if (antoraFiles.length === 0) {
      throw new Error(
        `No antora.yml files found in repository. ` +
        `This repo does not appear to be an Antora-based documentation source. ` +
        `Use a ZIP or Maven source type instead, or provide the URL to the specific ` +
        `Antora documentation repository (e.g. a repo containing antora.yml files).`
      );
    }
    const playbookContent = generatePlaybook(entryId, contentDir, outputDir, antoraFiles, log);
    fs.writeFileSync(playbookPath, playbookContent, 'utf-8');
  }

  await runAntora(playbookPath, log);

  return outputDir;
}

export function ensureAntoraInstalled(): boolean {
  try {
    execSync('npx antora --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
