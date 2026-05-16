#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_DIR = path.join(__dirname, '..', 'model');

async function downloadModel() {
  console.log('Downloading all-MiniLM-L6-v2 ONNX model...');
  console.log('This requires internet access. For enterprise environments, download on a connected machine and copy the files.');

  const { pipeline } = await import('@huggingface/transformers');

  fs.mkdirSync(MODEL_DIR, { recursive: true });

  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    dtype: 'q8',
  });

  console.log('Model downloaded and cached successfully.');
  console.log(`Cache location: ${process.env.HUGGINGFACE_CACHE_DIR || '~/.cache/huggingface'}`);
  console.log('You can now use vector search by setting search.engine: "vector" in dockit.yaml');
}

downloadModel().catch((err) => {
  console.error('Failed to download model:', err.message);
  process.exit(1);
});
