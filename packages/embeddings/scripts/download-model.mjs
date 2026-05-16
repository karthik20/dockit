#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_DIR = path.join(__dirname, '..', 'model');

async function downloadModel() {
  console.log('Downloading all-MiniLM-L6-v2 ONNX model...');
  console.log(`Target cache directory: ${MODEL_DIR}`);
  console.log('');

  // Configure transformers to use the project-local model directory
  env.cacheDir = MODEL_DIR;
  env.useFSCache = true;

  fs.mkdirSync(MODEL_DIR, { recursive: true });

  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    dtype: 'q8',
  });

  console.log('');
  console.log('Model downloaded and cached successfully.');
  console.log(`Location: ${MODEL_DIR}`);
  console.log('');
  console.log('The model is now available for offline use. To enable offline mode:');
  console.log('  import { configure } from "@dockit/embeddings";');
  console.log('  configure({ offline: true });');
}

downloadModel().catch((err) => {
  console.error('Failed to download model:', err.message);
  console.error('');
  console.error('For enterprise proxy environments, set HTTP_PROXY/HTTPS_PROXY before running:');
  console.error('  export HTTPS_PROXY=http://proxy.corp:8080');
  console.error('  npm run download-model -w packages/embeddings');
  process.exit(1);
});
