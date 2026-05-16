import type { Entry, CreateEntryInput, UpdateEntryInput } from '../domain/types.js';

export interface IEntryRepository {
  findAll(): Promise<(Entry & { source_count: number })[]>;
  findById(id: string): Promise<Entry | undefined>;
  save(entry: Entry): Promise<void>;
  update(id: string, input: UpdateEntryInput): Promise<void>;
  delete(id: string): Promise<void>;
  updateStatus(id: string, status: Entry['status']): Promise<void>;
  create(input: CreateEntryInput): Promise<Entry>;
}
