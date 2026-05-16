import type { IEntryRepository } from '../ports/IEntryRepository.js';
import type { ISourceRepository } from '../ports/ISourceRepository.js';
import type { Entry, Source, CreateEntryInput, UpdateEntryInput, CreateSourceInput, UpdateSourceInput } from '../domain/types.js';

function generateEntryId(name: string, version: string): string {
  const namePart = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const versionPart = version
    .toLowerCase()
    .replace(/[^a-z0-9x]+/g, '');
  return `${namePart}-${versionPart}`;
}

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
    const id = input.id ?? generateEntryId(input.name, input.version);
    return this.entryRepo.create({ ...input, id });
  }

  async updateEntry(id: string, input: UpdateEntryInput): Promise<void> {
    await this.entryRepo.update(id, input);
  }

  async deleteEntry(id: string): Promise<void> {
    await this.entryRepo.delete(id);
  }

  async createSource(entryId: string, input: CreateSourceInput): Promise<Source> {
    return this.sourceRepo.create(entryId, input);
  }

  async updateSource(id: string, input: UpdateSourceInput): Promise<void> {
    await this.sourceRepo.update(id, input);
  }

  async deleteSource(id: string): Promise<void> {
    await this.sourceRepo.delete(id);
  }
}
