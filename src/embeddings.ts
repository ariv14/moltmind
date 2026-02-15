import { env, pipeline } from "@xenova/transformers";
import type { FeatureExtractionPipeline } from "@xenova/transformers";
import { join } from "node:path";
import { homedir } from "node:os";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const MODEL_DIR = join(homedir(), ".moltmind", "models");
const LOAD_TIMEOUT_MS = 30_000;

let extractor: FeatureExtractionPipeline | null = null;
let modelFailed = false;

async function loadModel(): Promise<FeatureExtractionPipeline | null> {
  if (extractor) return extractor;
  if (modelFailed) return null;

  // Configure cache directory before loading
  env.cacheDir = MODEL_DIR;
  // Disable browser-specific features
  env.allowLocalModels = true;
  env.allowRemoteModels = true;

  try {
    const loadPromise = pipeline("feature-extraction", MODEL_NAME, {
      progress_callback: (progress: { status: string; file?: string; progress?: number }) => {
        if (progress.status === "download" && progress.file && progress.progress !== undefined) {
          console.error(`MoltMind: downloading ${progress.file} ${Math.round(progress.progress)}%`);
        }
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Model loading timed out")), LOAD_TIMEOUT_MS);
    });

    extractor = await Promise.race([loadPromise, timeoutPromise]) as FeatureExtractionPipeline;
    return extractor;
  } catch (err) {
    modelFailed = true;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`MoltMind: embedding model failed to load — falling back to FTS5-only search. Error: ${msg}`);
    return null;
  }
}

export async function embed(text: string): Promise<Float32Array | null> {
  const model = await loadModel();
  if (!model) return null;

  const output = await model(text, { pooling: "mean", normalize: true });
  return output.data as Float32Array;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export async function semanticSearch(
  query: string,
  memories: Array<{ id: string; embedding: Buffer }>
): Promise<Array<{ id: string; score: number }>> {
  const queryEmbedding = await embed(query);
  if (!queryEmbedding) return [];

  const results = memories.map((memory) => {
    const memoryEmbedding = bufferToEmbedding(memory.embedding);
    const score = cosineSimilarity(queryEmbedding, memoryEmbedding);
    return { id: memory.id, score };
  });

  results.sort((a, b) => b.score - a.score);
  return results;
}

export function embeddingToBuffer(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

export function bufferToEmbedding(buffer: Buffer): Float32Array {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Float32Array(arrayBuffer);
}

export function isModelReady(): boolean {
  return extractor !== null;
}

// Exported for testing — allows resetting internal state
export function _resetForTesting(): void {
  extractor = null;
  modelFailed = false;
}

export function _setModelFailed(): void {
  modelFailed = true;
}
