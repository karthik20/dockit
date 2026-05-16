import type { EntryStatus } from '../domain/types.js';

export function canTransitionTo(current: EntryStatus, next: EntryStatus): boolean {
  const transitions: Record<EntryStatus, EntryStatus[]> = {
    pending: ['building'],
    building: ['ready', 'error'],
    ready: ['building'],
    error: ['building'],
  };
  return transitions[current]?.includes(next) ?? false;
}

export function generateEntryId(name: string, version: string): string {
  const namePart = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const versionPart = version
    .toLowerCase()
    .replace(/[^a-z0-9x]+/g, '');
  return `${namePart}-${versionPart}`;
}
