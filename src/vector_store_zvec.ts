import { createRequire } from "node:module";
import { getAllMemories } from "./db.js";
import { bufferToEmbedding } from "./embeddings.js";
import type { VectorStore, VectorSearchResult } from "./vector_store.js";

interface ZvecNative {
  createCollection(config: { path: string; dimensions: number; indexType: "hnsw"; metric: "cosine" }): void;
  insertVector(path: string, id: string, vector: Float32Array): void;
  buildIndex(path: string): void;
  search(path: string, query: Float32Array, k: number): { id: string; score: number }[];
  deleteVector(path: string, id: string): boolean;
  stats(path: string): { count: number; dimensions: number; fileSizeBytes: number };
}

export class ZvecStore implements VectorStore {
  private path: string;
  private native: ZvecNative;
  private dirty = false;

  constructor(path: string) {
    this.path = path;

    // Load native module via createRequire for ESM/CJS interop
    const require = createRequire(import.meta.url);
    this.native = require("@moltmind/zvec-native") as ZvecNative;

    // Create collection if it doesn't exist
    this.native.createCollection({
      path: this.path,
      dimensions: 384,
      indexType: "hnsw",
      metric: "cosine",
    });
  }

  upsert(id: string, vector: Float32Array): void {
    this.native.insertVector(this.path, id, vector);
    this.dirty = true;
  }

  search(query: Float32Array, k: number): VectorSearchResult[] {
    if (this.dirty) {
      this.native.buildIndex(this.path);
      this.dirty = false;
    }
    return this.native.search(this.path, query, k);
  }

  delete(id: string): void {
    this.native.deleteVector(this.path, id);
    this.dirty = true;
  }

  stats(): { count: number; dimensions: number; fileSizeBytes: number } {
    return this.native.stats(this.path);
  }
}

export function migrateExistingEmbeddings(store: ZvecStore): void {
  console.error("MoltMind: migrating existing embeddings to Zvec index...");
  const memories = getAllMemories(undefined, 10000);
  let count = 0;

  for (const mem of memories) {
    if (mem.embedding) {
      const embedding = bufferToEmbedding(mem.embedding);
      store.upsert(mem.id, embedding);
      count++;
    }
  }

  console.error(`MoltMind: migrated ${count} embeddings to Zvec index`);
}
