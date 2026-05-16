import type { Build } from '../domain/types.js';

export interface IBuildRepository {
  create(entryId: string): Promise<Build>;
  update(buildId: string, status: Build['status'], log: string): Promise<void>;
  findLatest(entryId: string): Promise<Build | undefined>;
}
