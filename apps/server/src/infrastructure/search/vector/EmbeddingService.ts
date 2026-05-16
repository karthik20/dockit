export class EmbeddingService {
  private initialized = false;
  private embedFn: ((texts: string[]) => Promise<number[][]>) | null = null;

  private async init() {
    if (this.initialized) return;

    const mod = await import('@dockit/embeddings');
    this.embedFn = mod.embed;
    this.initialized = true;
  }

  async embed(texts: string[]): Promise<number[][]> {
    await this.init();
    if (!this.embedFn) throw new Error('Embedding service not initialized');
    return this.embedFn(texts);
  }
}
