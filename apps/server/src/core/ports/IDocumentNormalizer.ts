export interface IDocumentNormalizer {
  normalize(sources: Array<{ label: string; dir: string }>, outputDir: string, log: (msg: string) => void): string[];
}
