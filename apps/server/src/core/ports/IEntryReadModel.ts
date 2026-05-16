export interface EntryReadModelItem {
  id: string;
  name: string;
  version: string;
}

export interface IEntryReadModel {
  listReadyEntries(): Promise<EntryReadModelItem[]>;
}
