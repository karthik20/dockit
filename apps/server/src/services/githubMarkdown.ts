import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { marked } from 'marked';
import type { GithubMarkdownSourceConfig } from '../core/domain/types.js';

const SKIP_DIRS = new Set([
  'node_modules', 'target', 'build', 'dist', '.git',
  'test', 'tests', 'tcks', '__tests__', 'fixtures',
]);

async function cloneRepo(repoUrl: string, targetDir: string, branch: string | undefined, log: (msg: string) => void): Promise<void> {
  const branchArg = branch ? ['--branch', branch] : [];
  log(`Cloning repository ${repoUrl}${branch ? ` (branch: ${branch})` : ''}`);
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['clone', '--depth', '1', ...branchArg, repoUrl, targetDir], {
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

function findMarkdownFiles(dir: string, sourcePath: string): string[] {
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
      } else if (entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function stripFrontmatter(content: string): string {
  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3);
    if (end !== -1) {
      return content.slice(end + 3).trimStart();
    }
  }
  return content;
}

function buildHtmlTemplate(title: string, bodyHtml: string, relPath: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;line-height:1.6;max-width:900px;margin:40px auto;padding:0 20px;color:#333}
pre{background:#f5f5f5;padding:12px;border-radius:6px;overflow-x:auto}
code{font-family:monospace;background:#f5f5f5;padding:2px 6px;border-radius:3px;font-size:.9em}
pre code{padding:0;background:none}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ddd;padding:8px;text-align:left}
th{background:#f5f5f5}
img{max-width:100%}
blockquote{border-left:4px solid #ddd;margin:0;padding-left:16px;color:#666}
h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.5em}
a{color:#0366d6}
</style>
</head>
<body>
<main>
${bodyHtml}
</main>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function convertMarkdownFiles(
  mdFiles: string[],
  sourceRoot: string,
  targetDir: string,
  log: (msg: string) => void
): Promise<void> {
  log(`Converting ${mdFiles.length} .md files to HTML`);

  let filesProcessed = 0;
  let filesSkipped = 0;

  for (const mdFile of mdFiles) {
    try {
      const relPath = path.relative(sourceRoot, mdFile);
      const outPath = path.join(targetDir, relPath.replace(/\.md$/i, '.html'));
      fs.mkdirSync(path.dirname(outPath), { recursive: true });

      const raw = fs.readFileSync(mdFile, 'utf-8');
      const withoutFrontmatter = stripFrontmatter(raw);
      const bodyHtml = await marked(withoutFrontmatter);

      const title = path.basename(mdFile, '.md');
      const fullHtml = buildHtmlTemplate(title, bodyHtml, relPath);
      fs.writeFileSync(outPath, fullHtml, 'utf-8');

      filesProcessed++;
    } catch (err: any) {
      const rel = path.relative(sourceRoot, mdFile);
      log(`  WARNING: Failed to convert ${rel}: ${err.message || err}`);
      filesSkipped++;
    }
  }

  const htmlCount = countHtmlFiles(targetDir);
  log(`Markdown conversion complete: ${filesProcessed} converted, ${filesSkipped} skipped, ${htmlCount} HTML files generated`);

  if (htmlCount === 0 && filesProcessed === 0) {
    throw new Error('Markdown conversion failed to produce any HTML. Check that the source files are valid.');
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

export async function buildGithubMarkdownSource(
  config: GithubMarkdownSourceConfig,
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
    repoDir = path.join(os.tmpdir(), `dockit-github-md-${Date.now()}`);
    await cloneRepo(config.repoUrl, repoDir, config.branch, log);
    shouldCleanup = true;
  } else {
    throw new Error('GitHub Markdown source requires repoUrl or localPath');
  }

  try {
    const sourcePath = config.sourcePath || '';
    const sourceRoot = sourcePath ? path.join(repoDir, sourcePath) : repoDir;

    log(`Scanning for .md files in ${sourcePath || 'repository root'}`);
    const mdFiles = findMarkdownFiles(repoDir, sourcePath);

    if (mdFiles.length === 0) {
      if (sourcePath) {
        throw new Error(`No .md files found at path "${sourcePath}" in the repository`);
      }
      throw new Error(
        `No .md files found in the repository. ` +
        `If the docs live in a subdirectory, set the "sourcePath" field ` +
        `(e.g. "src/content" for React docs).`
      );
    }

    log(`Found ${mdFiles.length} .md file(s)`);

    fs.mkdirSync(targetDir, { recursive: true });
    await convertMarkdownFiles(mdFiles, sourceRoot, targetDir, log);
  } finally {
    if (shouldCleanup && fs.existsSync(repoDir)) {
      log('Cleaning up cloned repository...');
      rmDir(repoDir);
    }
  }
}
