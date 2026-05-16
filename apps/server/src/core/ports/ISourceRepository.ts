import type { Source, CreateSourceInput, UpdateSourceInput } from '../domain/types.js';

export interface ISourceRepository {
  findByEntryId(entryId: string): Promise<Source[]>;
  findById(id: string): Promise<Source | undefined>;
  save(source: Source): Promise<void>;
  create(entryId: string, input: CreateSourceInput): Promise<Source>;
  update(id: string, input: UpdateSourceInput): Promise<void>;
  delete(id: string): Promise<void>;
  updateStatus(id: string, status: Source['status']): Promise<void>;
}
