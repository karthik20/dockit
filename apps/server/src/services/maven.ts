import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import unzipper from 'unzipper';
import type { MavenSourceConfig } from '../types.js';

function buildMavenUrl(config: MavenSourceConfig): string {
  const groupPath = config.groupId.replace(/\./g, '/');
  const classifier = config.classifier || 'javadoc';
  return `https://repo1.maven.org/maven2/${groupPath}/${config.artifactId}/${config.version}/${config.artifactId}-${config.version}-${classifier}.jar`;
}

export async function downloadWithMavenCommand(
  config: MavenSourceConfig,
  targetDir: string,
  log: (msg: string) => void
): Promise<void> {
  const classifier = config.classifier || 'javadoc';
  const artifact = `${config.groupId}:${config.artifactId}:${config.version}:jar:${classifier}`;
  log(`Resolved Maven artifact: ${config.groupId}:${config.artifactId}:${config.version}`);
  log(`Downloading via mvn dependency:copy (using ~/.m2/settings.xml)`);

  fs.mkdirSync(targetDir, { recursive: true });

  const escapedArtifact = artifact.replace(/"/g, '\\"');
  return new Promise((resolve, reject) => {
    const proc = spawn('mvn', [
      'org.apache.maven.plugins:maven-dependency-plugin:3.10.0:copy',
      `-Dartifact=${escapedArtifact}`,
      `-DoutputDirectory=${targetDir}`,
      '-Dtransitive=false',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line) log(`  mvn: ${line}`);
      }
    });
    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line) log(`  mvn: ${line}`);
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        log(`Maven download complete`);
        const downloaded = findJarFiles(targetDir);
        if (downloaded.length > 0) {
          log(`Downloaded: ${downloaded.map((p) => path.basename(p)).join(', ')}`);
          resolve();
          return;
        }
        reject(new Error('Maven download succeeded but no JAR files found in target directory'));
      } else {
        const tail = stderr.slice(-500);
        if (stderr.includes('BUILD FAILURE') || tail.includes('Could not resolve dependencies')) {
          reject(new Error(
            `Maven download failed — artifact may not exist or your settings.xml proxy is misconfigured.\n` +
            `Artifact: ${artifact}\n` +
            `Last output: ${tail}`
          ));
        } else {
          reject(new Error(`Maven download failed with code ${code}. Install Maven or use direct download/locallJar mode. Last output: ${tail}`));
        }
      }
    });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new Error('mvn command not found. Install Maven (apt install maven) or use direct download/locallJar mode.'));
      } else {
        reject(err);
      }
    });
  });
}

export async function extractLocalJar(
  localJarPath: string,
  targetDir: string,
  log: (msg: string) => void
): Promise<void> {
  if (!fs.existsSync(localJarPath)) {
    throw new Error(`Local JAR not found: ${localJarPath}`);
  }
  const stat = fs.statSync(localJarPath);
  if (!stat.isFile()) {
    throw new Error(`localJar must be a .jar file, got directory: ${localJarPath}`);
  }
  if (!localJarPath.endsWith('.jar')) {
    throw new Error(`localJar must be a .jar file: ${localJarPath}`);
  }

  log(`Extracting local JAR from ${localJarPath}`);
  fs.mkdirSync(targetDir, { recursive: true });
  const data = fs.readFileSync(localJarPath);
  const stream = Readable.from(data);
  await pipeline(stream, unzipper.Extract({ path: targetDir }));
  log(`Extracted JAR to ${targetDir}`);
  const files = countFilesRecursive(targetDir);
  log(`Found ${files} files in extracted artifact`);
}

export async function downloadAndExtractMavenJar(
  config: MavenSourceConfig,
  targetDir: string,
  log: (msg: string) => void
): Promise<void> {
  if (config.localJar) {
    await extractLocalJar(config.localJar, targetDir, log);
    return;
  }

  if (config.useMavenCommand) {
    await downloadWithMavenCommand(config, targetDir, log);
    return;
  }

  const url = buildMavenUrl(config);
  log(`Resolved Maven artifact: ${config.groupId}:${config.artifactId}:${config.version}`);
  log(`Downloading JAR from ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download Maven JAR: ${response.status} ${response.statusText} — ${url}`);
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

  log(`Extracted Maven JAR to ${targetDir}`);
  const files = countFilesRecursive(targetDir);
  log(`Found ${files} files in extracted artifact`);
}

function findJarFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jar')) {
      results.push(fullPath);
    }
  }
  return results;
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
