import { pipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

let extractor: any = null;

export async function embed(texts: string | string[]): Promise<number[][]> {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
    });
  }

  const inputTexts = Array.isArray(texts) ? texts : [texts];
  const output = await extractor(inputTexts, { pooling: 'mean', normalize: true });
  return output.tolist();
}
