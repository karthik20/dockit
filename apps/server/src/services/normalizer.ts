import path from 'node:path';
import fs from 'node:fs';

export interface NormalizeSource {
  label: string;
  dir: string;
}

export function normalizeDocs(
  sources: NormalizeSource[],
  outputDir: string,
  log: (msg: string) => void
): string[] {
  fs.mkdirSync(outputDir, { recursive: true });

  const htmlFiles: Array<{ relativePath: string; fullPath: string }> = [];

  for (const source of sources) {
    log(`Normalizing source "${source.label}" from ${source.dir}`);
    const sourceDir = path.join(outputDir, sanitizeDirname(source.label));
    copyDirContents(source.dir, sourceDir, outputDir, htmlFiles, log);
  }

  log(`Normalized ${htmlFiles.length} HTML files into ${outputDir}`);
  return htmlFiles.map((f) => f.relativePath);
}

function sanitizeDirname(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function copyDirContents(
  srcDir: string,
  destDir: string,
  bundleRoot: string,
  htmlFiles: Array<{ relativePath: string; fullPath: string }>,
  log: (msg: string) => void
): void {
  if (!fs.existsSync(srcDir)) {
    log(`  Warning: source directory does not exist: ${srcDir}`);
    return;
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirContents(srcPath, destPath, bundleRoot, htmlFiles, log);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      const relativePath = path.relative(bundleRoot, destPath);
      htmlFiles.push({ relativePath, fullPath: destPath });
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
