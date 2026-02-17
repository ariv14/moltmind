import { getAllMemories } from "./db.js";
import { cosineSimilarity, bufferToEmbedding } from "./embeddings.js";
import type { MemoryTier } from "./types.js";

export interface VectorSearchResult {
  id: string;
  score: number;
}

export interface VectorStore {
  upsert(id: string, vector: Float32Array): void;
  search(query: Float32Array, k: number): VectorSearchResult[];
  delete(id: string): void;
}

export class BruteForceStore implements VectorStore {
  private tier?: MemoryTier;

  constructor(tier?: MemoryTier) {
    this.tier = tier;
  }

  upsert(_id: string, _vector: Float32Array): void {
    // No-op — SQLite BLOB is the store for brute-force
  }

  search(query: Float32Array, k: number): VectorSearchResult[] {
    const memories = getAllMemories(this.tier, 1000);
    const results: VectorSearchResult[] = [];

    for (const mem of memories) {
      if (mem.embedding) {
        const memEmbedding = bufferToEmbedding(mem.embedding);
        const score = cosineSimilarity(query, memEmbedding);
        results.push({ id: mem.id, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  delete(_id: string): void {
    // No-op — SQLite handles deletion for brute-force
  }
}

let activeStore: VectorStore | null = null;

export function initVectorStore(store: VectorStore): void {
  activeStore = store;
}

export function getVectorStore(tier?: MemoryTier): VectorStore {
  if (activeStore) return activeStore;
  return new BruteForceStore(tier);
}

// Reset for testing
export function _resetVectorStore(): void {
  activeStore = null;
}
