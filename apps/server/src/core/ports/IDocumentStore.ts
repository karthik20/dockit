export interface IDocumentStore {
  getDocument(entryId: string, path: string): Promise<string>;
  documentExists(entryId: string, path: string): Promise<boolean>;
}
