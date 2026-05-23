export class EmbeddingService {
  private initialized = false;
  private embedFn: ((texts: string[]) => Promise<number[][]>) | null = null;

  private async init() {
    if (this.initialized) return;

    const mod = await import('@lon-ask/dockit-embeddings');
    // Configure for bundled offline mode by default.
    // env.cacheDir defaults to <package>/model/; allowRemoteModels defaults to true
    // (permits download if model not yet cached). For air-gapped environments,
    // call mod.configure({ offline: true }) before first embed().
    mod.configure();
    this.embedFn = mod.embed;
    this.initialized = true;
  }

  async embed(texts: string[]): Promise<number[][]> {
    await this.init();
    if (!this.embedFn) throw new Error('Embedding service not initialized');
    return this.embedFn(texts);
  }
}
