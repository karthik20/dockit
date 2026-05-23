import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn, execSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzipper';
import type { ISourceProcessor } from '../../core/ports/ISourceProcessor.js';
import type { Source, SourceCodeSourceConfig } from '../../core/domain/types.js';

const GRAPHIFY_TIMEOUT = 600_000;

function execWithTimeout(cmd: string, args: string[], log: (msg: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: GRAPHIFY_TIMEOUT,
    });
    let stderr = '';
    proc.stdout?.on('data', (data: Buffer) => {
      for (const line of data.toString().trim().split('\n')) {
        if (line) log(`  graphify: ${line}`);
      }
    });
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else if (code === 1) {
        log('  graphify: completed with warnings (partial results)');
        resolve();
      }
      else reject(new Error(`graphify exited with code ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', (err) => reject(new Error(`Failed to run graphify: ${err.message}`)));
  });
}

function ensureGraphify(log: (msg: string) => void): void {
  try {
    execSync('graphify --version', { stdio: 'pipe', timeout: 10_000 });
    log('Graphify is available on PATH');
  } catch {
    log('Graphify not found. Installing via pip...');
    execSync('pip3 install graphify 2>&1', { stdio: 'pipe', timeout: 120_000 });
    log('Graphify installed successfully');
  }
  try {
    execSync('pip3 show openai 2>&1', { stdio: 'pipe', timeout: 10_000 });
    log('OpenAI already installed');
  } catch {
    log('OpenAI not found. Installing for graphify semantic extraction...');
    try {
      execSync('pip3 install openai 2>&1', { stdio: 'pipe', timeout: 120_000 });
      log('OpenAI installed successfully');
    } catch {
      log('Warning: could not install openai (semantic extraction unavailable)');
    }
  }
}

async function cloneRepo(repoUrl: string, targetDir: string, branch: string | undefined, log: (msg: string) => void): Promise<void> {
  log(`Cloning repository ${repoUrl}`);
  const branchArg = branch ? ['--branch', branch] : [];
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['clone', '--depth', '1', ...branchArg, repoUrl, targetDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      for (const line of data.toString().trim().split('\n')) {
        if (line) log(`  git: ${line}`);
      }
    });
    proc.on('close', (code) => {
      if (code === 0) { log('Repository cloned successfully'); resolve(); }
      else reject(new Error(`git clone failed with code ${code}: ${stderr.slice(-300)}`));
    });
    proc.on('error', reject);
  });
}

async function extractZip(zipPath: string, targetDir: string, log: (msg: string) => void): Promise<void> {
  log(`Extracting ZIP from ${zipPath}`);
  fs.mkdirSync(targetDir, { recursive: true });
  const data = fs.readFileSync(zipPath);
  const stream = Readable.from(data);
  await pipeline(stream, unzipper.Extract({ path: targetDir }));
  const entries = fs.readdirSync(targetDir);
  if (entries.length === 1 && fs.statSync(path.join(targetDir, entries[0])).isDirectory()) {
    log('Flattening single root directory...');
    const innerDir = path.join(targetDir, entries[0]);
    for (const entry of fs.readdirSync(innerDir)) {
      fs.renameSync(path.join(innerDir, entry), path.join(targetDir, entry));
    }
    fs.rmdirSync(innerDir);
  }
  log(`Extracted to ${targetDir}`);
}

function readGraphMetadata(graphJsonPath: string): { nodeCount: number; edgeCount: number; communities: number } {
  try {
    const data = JSON.parse(fs.readFileSync(graphJsonPath, 'utf-8'));
    const nodes = (data.nodes || []).length;
    const edges = (data.edges || []).length;
    const communities = new Set((data.nodes || []).map((n: { community?: number }) => n.community).filter(Boolean)).size;
    return { nodeCount: nodes, edgeCount: edges, communities };
  } catch {
    return { nodeCount: 0, edgeCount: 0, communities: 0 };
  }
}

export class SourceCodeSourceProcessor implements ISourceProcessor {
  readonly sourceType = 'source-code' as const;

  async runGraphify(config: Record<string, unknown>, entryDir: string, log: (msg: string) => void): Promise<void> {
    const cfg = config as unknown as SourceCodeSourceConfig;
    let repoDir: string | undefined;
    let shouldCleanupRepo = false;

    try {
      if (cfg.localPath) {
        if (!fs.existsSync(cfg.localPath)) throw new Error(`Local path not found: ${cfg.localPath}`);
        log(`Using local directory: ${cfg.localPath}`);
        repoDir = cfg.localPath;
      } else if (cfg.repoUrl) {
        repoDir = path.join(os.tmpdir(), `dockit-graphify-${Date.now()}`);
        await cloneRepo(cfg.repoUrl, repoDir, cfg.branch, log);
        shouldCleanupRepo = true;
      } else if (cfg.zipPath) {
        repoDir = path.join(os.tmpdir(), `dockit-graphify-${Date.now()}`);
        fs.mkdirSync(repoDir, { recursive: true });
        await extractZip(cfg.zipPath, repoDir, log);
        shouldCleanupRepo = true;
      } else {
        throw new Error('graphifyEnabled requires repoUrl, localPath, or zipPath on the source');
      }

      ensureGraphify(log);
      const graphifyDir = cfg.graphifySourcePath ? path.join(repoDir, cfg.graphifySourcePath) : repoDir;
      if (!fs.existsSync(graphifyDir)) {
        throw new Error(`graphifySourcePath not found: ${cfg.graphifySourcePath}`);
      }
      log(`Running Graphify on ${graphifyDir}...`);
      await execWithTimeout('graphify', ['update', graphifyDir], log);

      const graphOutDir = path.join(graphifyDir, 'graphify-out');
      const graphJsonPath = path.join(graphOutDir, 'graph.json');
      const graphHtmlPath = path.join(graphOutDir, 'graph.html');

      if (fs.existsSync(graphJsonPath)) {
        const destJson = path.join(entryDir, 'graph.json');
        fs.copyFileSync(graphJsonPath, destJson);
        log(`Copied graph.json to ${destJson}`);
        const meta = readGraphMetadata(destJson);
        log(`Graph: ${meta.nodeCount} nodes, ${meta.edgeCount} edges, ${meta.communities} communities`);
      } else {
        log('WARNING: graph.json not produced by Graphify');
      }

      if (fs.existsSync(graphHtmlPath)) {
        const destHtml = path.join(entryDir, 'graph.html');
        fs.copyFileSync(graphHtmlPath, destHtml);
        log(`Copied graph.html to ${destHtml}`);
      }
    } finally {
      if (shouldCleanupRepo && repoDir && fs.existsSync(repoDir)) {
        fs.rmSync(repoDir, { recursive: true, force: true });
      }
    }
  }

  async process(source: Source, sourceDir: string, entryDir: string, _entryId: string, log: (msg: string) => void): Promise<string> {
    const config = source.config as SourceCodeSourceConfig;
    let repoDir: string;
    let shouldCleanup: boolean;

    if (config.localPath) {
      if (!fs.existsSync(config.localPath)) throw new Error(`Local path not found: ${config.localPath}`);
      if (!fs.statSync(config.localPath).isDirectory()) throw new Error(`localPath must be a directory: ${config.localPath}`);
      log(`Using local directory: ${config.localPath}`);
      repoDir = config.localPath;
      shouldCleanup = false;
    } else if (config.repoUrl) {
      repoDir = path.join(os.tmpdir(), `dockit-source-${Date.now()}`);
      await cloneRepo(config.repoUrl, repoDir, config.branch, log);
      shouldCleanup = true;
    } else if (config.zipPath) {
      repoDir = path.join(os.tmpdir(), `dockit-source-${Date.now()}`);
      fs.mkdirSync(repoDir, { recursive: true });
      await extractZip(config.zipPath, repoDir, log);
      shouldCleanup = true;
    } else {
      throw new Error('Source code source requires repoUrl, localPath, or zipPath');
    }

    try {
      const targetDir = config.sourcePath ? path.join(repoDir, config.sourcePath) : repoDir;
      if (!fs.existsSync(targetDir)) {
        throw new Error(`Source path not found: ${config.sourcePath || '(root)'}`);
      }

      fs.mkdirSync(sourceDir, { recursive: true });
      copyDirContents(targetDir, sourceDir, log);

      log('Ensuring Graphify is available...');
      ensureGraphify(log);

      const graphifyDir = config.graphifySourcePath
        ? path.join(repoDir, config.graphifySourcePath)
        : config.sourcePath
          ? targetDir
          : repoDir;
      if (!fs.existsSync(graphifyDir)) {
        throw new Error(`Graphify target not found: ${config.graphifySourcePath || config.sourcePath || '(root)'}`);
      }
      log(`Running Graphify on ${graphifyDir}...`);
      await execWithTimeout('graphify', ['update', graphifyDir], log);

      const graphOutDir = path.join(graphifyDir, 'graphify-out');
      const graphJsonPath = path.join(graphOutDir, 'graph.json');
      const graphHtmlPath = path.join(graphOutDir, 'graph.html');

      if (fs.existsSync(graphJsonPath)) {
        const destJson = path.join(entryDir, 'graph.json');
        fs.copyFileSync(graphJsonPath, destJson);
        log(`Copied graph.json to ${destJson}`);

        const meta = readGraphMetadata(destJson);
        log(`Graph: ${meta.nodeCount} nodes, ${meta.edgeCount} edges, ${meta.communities} communities`);
      } else {
        log('WARNING: graph.json not produced by Graphify');
      }

      if (fs.existsSync(graphHtmlPath)) {
        const destHtml = path.join(entryDir, 'graph.html');
        fs.copyFileSync(graphHtmlPath, destHtml);
        log(`Copied graph.html to ${destHtml}`);
      }

      return sourceDir;
    } finally {
      if (shouldCleanup && fs.existsSync(repoDir)) {
        log('Cleaning up cloned repository...');
        fs.rmSync(repoDir, { recursive: true, force: true });
      }
    }
  }
}

function copyDirContents(srcDir: string, destDir: string, log: (msg: string) => void): void {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'target') continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirContents(srcPath, destPath, log);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
