import type { IEntryRepository } from '../ports/IEntryRepository.js';
import type { ISourceRepository } from '../ports/ISourceRepository.js';
import type { Entry, Source, CreateEntryInput, UpdateEntryInput, CreateSourceInput, UpdateSourceInput } from '../domain/types.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import { generateEntryId } from '../domain/entry.js';

export class ConfigUseCase {
  constructor(
    private readonly entryRepo: IEntryRepository,
    private readonly sourceRepo: ISourceRepository,
  ) {}

  async listEntries(): Promise<(Entry & { source_count: number })[]> {
    return this.entryRepo.findAll();
  }

  async getEntry(id: string): Promise<Entry | undefined> {
    return this.entryRepo.findById(id);
  }

  async getEntryWithSources(id: string): Promise<(Entry & { sources: Source[] }) | undefined> {
    const entry = await this.entryRepo.findById(id);
    if (!entry) return undefined;
    const sources = await this.sourceRepo.findByEntryId(id);
    return { ...entry, sources };
  }

  async createEntry(input: CreateEntryInput): Promise<Entry> {
    if (!input.name?.trim()) throw new ValidationError('Entry name is required', 'name', input.name);
    if (!input.version?.trim()) throw new ValidationError('Entry version is required', 'version', input.version);
    const id = input.id ?? generateEntryId(input.name, input.version);
    return this.entryRepo.create({ ...input, id });
  }

  async updateEntry(id: string, input: UpdateEntryInput): Promise<void> {
    const existing = await this.entryRepo.findById(id);
    if (!existing) throw new NotFoundError('Entry', id);
    await this.entryRepo.update(id, input);
  }

  async deleteEntry(id: string): Promise<void> {
    const existing = await this.entryRepo.findById(id);
    if (!existing) throw new NotFoundError('Entry', id);
    await this.entryRepo.delete(id);
  }

  async createSource(entryId: string, input: CreateSourceInput): Promise<Source> {
    const entry = await this.entryRepo.findById(entryId);
    if (!entry) throw new NotFoundError('Entry', entryId);
    return this.sourceRepo.create(entryId, input);
  }

  async updateSource(id: string, input: UpdateSourceInput): Promise<void> {
    const existing = await this.sourceRepo.findById(id);
    if (!existing) throw new NotFoundError('Source', id);
    await this.sourceRepo.update(id, input);
  }

  async deleteSource(id: string): Promise<void> {
    const existing = await this.sourceRepo.findById(id);
    if (!existing) throw new NotFoundError('Source', id);
    await this.sourceRepo.delete(id);
  }
}
