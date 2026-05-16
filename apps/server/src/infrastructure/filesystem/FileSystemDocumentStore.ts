import path from 'node:path';
import fs from 'node:fs';
import type { IDocumentStore } from '../../core/ports/IDocumentStore.js';
import { DATA_ROOT } from '../../services/paths.js';

export class FileSystemDocumentStore implements IDocumentStore {
  async getDocument(entryId: string, docPath: string): Promise<string> {
    const resolved = path.resolve(DATA_ROOT, entryId, 'bundle', docPath);
    const dataRoot = path.resolve(DATA_ROOT);
    if (!resolved.startsWith(dataRoot)) {
      throw new Error('Invalid document path');
    }
    if (!fs.existsSync(resolved)) {
      throw new Error(`Document not found: ${docPath} for entry ${entryId}`);
    }
    return fs.readFileSync(resolved, 'utf-8');
  }

  async documentExists(entryId: string, docPath: string): Promise<boolean> {
    const resolved = path.resolve(DATA_ROOT, entryId, 'bundle', docPath);
    const dataRoot = path.resolve(DATA_ROOT);
    if (!resolved.startsWith(dataRoot)) {
      return false;
    }
    return fs.existsSync(resolved);
  }
}
