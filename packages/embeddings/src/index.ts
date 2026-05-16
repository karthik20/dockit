import { pipeline, env } from '@huggingface/transformers';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

let extractor: any = null;
let configured = false;

/**
 * Configure the embedding model loading behavior.
 * Call once before the first embed() call.
 *
 * @param options.cacheDir  Directory to store/load the model (HuggingFace Hub cache format).
 *                          Defaults to `<package>/model/` for bundled mode.
 * @param options.offline   If true, prevents all remote fetches (set env.allowRemoteModels = false).
 *                          Defaults to false (allows download if model not cached).
 */
export function configure(options?: { cacheDir?: string; offline?: boolean }): void {
  if (configured) return;
  configured = true;

  if (options?.cacheDir) {
    env.cacheDir = options.cacheDir;
  }

  if (options?.offline) {
    env.allowRemoteModels = false;
  }

  // In bundled mode, use the package-local model/ directory
  if (!options?.cacheDir) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    // __dirname is <package>/dist/ when built, or <package>/src/ during dev
    // The model/ directory is sibling to dist/ and src/
    const pkgRoot = path.resolve(__dirname, '..');
    env.cacheDir = path.join(pkgRoot, 'model');
  }

  // Use filesystem cache even in browser-like envs
  env.useFSCache = true;
}

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
