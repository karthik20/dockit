import path from 'node:path';
import fs from 'node:fs';
import type { IDocumentStore } from '../../core/ports/IDocumentStore.js';
import { DATA_ROOT } from '../../services/paths.js';

export class FileSystemDocumentStore implements IDocumentStore {
  async getDocument(entryId: string, docPath: string): Promise<string> {
    const filePath = path.join(DATA_ROOT, entryId, 'bundle', docPath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Document not found: ${docPath} for entry ${entryId}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  async documentExists(entryId: string, docPath: string): Promise<boolean> {
    const filePath = path.join(DATA_ROOT, entryId, 'bundle', docPath);
    return fs.existsSync(filePath);
  }
}
