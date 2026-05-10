import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzipper';
import type { ZipSourceConfig } from '../types.js';

export async function extractLocalZip(
  localPath: string,
  targetDir: string,
  log: (msg: string) => void
): Promise<void> {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local file not found: ${localPath}`);
  }
  const stat = fs.statSync(localPath);
  if (!stat.isFile()) {
    throw new Error(`localPath must be a ZIP file, got directory: ${localPath}`);
  }

  log(`Extracting local ZIP from ${localPath}`);
  fs.mkdirSync(targetDir, { recursive: true });
  const data = fs.readFileSync(localPath);
  const stream = Readable.from(data);
  await pipeline(stream, unzipper.Extract({ path: targetDir }));
  log(`Extracted ZIP to ${targetDir}`);
  const files = countFilesRecursive(targetDir);
  log(`Found ${files} files in extracted archive`);
}

export async function downloadAndExtractZip(
  configOrUrl: ZipSourceConfig | string,
  targetDir: string,
  log: (msg: string) => void
): Promise<void> {
  const config = typeof configOrUrl === 'string'
    ? { url: configOrUrl }
    : configOrUrl;

  if (config.localPath) {
    await extractLocalZip(config.localPath, targetDir, log);
    return;
  }

  if (!config.url) {
    throw new Error('ZIP source requires url or localPath');
  }

  log(`Downloading ZIP from ${config.url}`);
  const response = await fetch(config.url);
  if (!response.ok) {
    throw new Error(`Failed to download ZIP: ${response.status} ${response.statusText}`);
  }

  fs.mkdirSync(targetDir, { recursive: true });

  if (!response.body) {
    throw new Error('No response body');
  }

  const nodeStream = Readable.fromWeb(response.body as never);
  await pipeline(
    nodeStream,
    unzipper.Extract({ path: targetDir })
  );

  log(`Extracted ZIP to ${targetDir}`);
  const files = countFilesRecursive(targetDir);
  log(`Found ${files} files in extracted archive`);
}

function countFilesRecursive(dir: string): number {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFilesRecursive(fullPath);
    } else {
      count++;
    }
  }
  return count;
}
