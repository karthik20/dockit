import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzipper';
import asciidoctorModule from '@asciidoctor/core';
import type { AsciidocSourceConfig } from '../core/domain/types.js';

type Processor = {
  convertFile(file: string, options?: Record<string, unknown>): unknown;
};
const asciidoctor = asciidoctorModule as unknown as () => Processor;

const SKIP_DIRS = new Set([
  'node_modules', 'target', 'build', 'dist', '.git',
  'integrations', 'extensions', 'independent-projects',
  'test', 'tests', 'tcks',
]);

async function cloneRepo(repoUrl: string, targetDir: string, log: (msg: string) => void): Promise<void> {
  log(`Cloning repository ${repoUrl}`);
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
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
    log('Detected single root directory, flattening...');
    const innerDir = path.join(targetDir, entries[0]);
    const innerEntries = fs.readdirSync(innerDir);
    for (const entry of innerEntries) {
      fs.renameSync(path.join(innerDir, entry), path.join(targetDir, entry));
    }
    fs.rmdirSync(innerDir);
  }
  log(`Extracted ZIP to ${targetDir}`);
}

function findAdocFiles(dir: string, sourcePath: string): string[] {
  const root = sourcePath ? path.join(dir, sourcePath) : dir;
  if (!fs.existsSync(root)) {
    return [];
  }
  const results: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.name.endsWith('.adoc')) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

async function runAsciidoctor(
  adocFiles: string[],
  sourceRoot: string,
  targetDir: string,
  log: (msg: string) => void
): Promise<void> {
  log(`Converting ${adocFiles.length} .adoc files to HTML`);

  const adoc = asciidoctor();
  let filesProcessed = 0;
  let filesSkipped = 0;

  for (const adocFile of adocFiles) {
    try {
      const relPath = path.relative(sourceRoot, adocFile);
      const outDir = path.join(targetDir, path.dirname(relPath));
      fs.mkdirSync(outDir, { recursive: true });

      adoc.convertFile(adocFile, {
        to_dir: outDir,
        base_dir: path.dirname(adocFile),
        mkdirs: true,
        safe: 'unsafe',
      });
      filesProcessed++;
    } catch (err: any) {
      const rel = path.relative(sourceRoot, adocFile);
      log(`  WARNING: Failed to convert ${rel}: ${err.message || err}`);
      filesSkipped++;
    }
  }

  const htmlCount = countHtmlFiles(targetDir);
  log(`AsciiDoc conversion complete: ${filesProcessed} converted, ${filesSkipped} skipped, ${htmlCount} HTML files generated`);

  if (htmlCount === 0 && filesProcessed === 0) {
    throw new Error('Asciidoctor failed to produce any HTML. Check that the source files are valid.');
  }
}

function countHtmlFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(current, e.name);
      if (e.isDirectory() && !e.name.startsWith('.')) stack.push(p);
      else if (e.name.endsWith('.html')) count++;
    }
  }
  return count;
}

function rmDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

export async function buildAsciidocSource(
  config: AsciidocSourceConfig,
  targetDir: string,
  log: (msg: string) => void
): Promise<void> {
  let repoDir: string;
  let shouldCleanup: boolean;

  if (config.localPath) {
    if (!fs.existsSync(config.localPath)) {
      throw new Error(`Local path not found: ${config.localPath}`);
    }
    if (!fs.statSync(config.localPath).isDirectory()) {
      throw new Error(`localPath must be a directory: ${config.localPath}`);
    }
    log(`Using local directory: ${config.localPath}`);
    repoDir = config.localPath;
    shouldCleanup = false;
  } else if (config.repoUrl) {
    repoDir = path.join(os.tmpdir(), `dockit-asciidoc-${Date.now()}`);
    await cloneRepo(config.repoUrl, repoDir, log);
    shouldCleanup = true;
  } else if (config.zipPath) {
    repoDir = path.join(os.tmpdir(), `dockit-asciidoc-${Date.now()}`);
    fs.mkdirSync(repoDir, { recursive: true });
    await extractZip(config.zipPath, repoDir, log);
    shouldCleanup = true;
  } else {
    throw new Error('AsciiDoc source requires repoUrl, localPath, or zipPath');
  }

  try {
    const sourcePath = config.sourcePath || '';
    const sourceRoot = sourcePath ? path.join(repoDir, sourcePath) : repoDir;

    log(`Scanning for .adoc files in ${sourcePath || 'repository root'}`);
    const adocFiles = findAdocFiles(repoDir, sourcePath);

    if (adocFiles.length === 0) {
      if (sourcePath) {
        throw new Error(`No .adoc files found at path "${sourcePath}" in the repository`);
      }
      throw new Error(
        `No .adoc files found in the repository. ` +
        `If the docs live in a subdirectory, set the "sourcePath" field ` +
        `(e.g. "docs/src/main/asciidoc" for Quarkus).`
      );
    }

    log(`Found ${adocFiles.length} .adoc file(s)`);

    fs.mkdirSync(targetDir, { recursive: true });
    await runAsciidoctor(adocFiles, sourceRoot, targetDir, log);
  } finally {
    if (shouldCleanup && fs.existsSync(repoDir)) {
      log('Cleaning up cloned repository...');
      rmDir(repoDir);
    }
  }
}
