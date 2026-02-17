import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import crypto from "node:crypto";

const originalCwd = process.cwd();
let testDir: string;
let db: typeof import("../src/db.js");
let vectorStore: typeof import("../src/vector_store.js");
let embeddings: typeof import("../src/embeddings.js");

describe("VectorStore", () => {
  beforeEach(async () => {
    testDir = join(tmpdir(), `moltmind-vs-${crypto.randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    db = await import("../src/db.js");
    db.closeDb();
    db.initProjectVault();

    embeddings = await import("../src/embeddings.js");
    embeddings._setModelFailed();

    vectorStore = await import("../src/vector_store.js");
    vectorStore._resetVectorStore();
  });

  afterEach(() => {
    db.closeDb();
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("BruteForceStore", () => {
    it("should return empty results when no memories have embeddings", () => {
      const store = new vectorStore.BruteForceStore();
      const query = new Float32Array(384).fill(0.1);
      const results = store.search(query, 5);
      assert.equal(results.length, 0);
    });

    it("should return results ordered by cosine similarity", () => {
      const embedding1 = new Float32Array(384).fill(0);
      embedding1[0] = 1.0;

      const embedding2 = new Float32Array(384).fill(0);
      embedding2[0] = 0.9;
      embedding2[1] = 0.1;

      const embedding3 = new Float32Array(384).fill(0);
      embedding3[1] = 1.0;

      const buf1 = Buffer.from(embedding1.buffer);
      const buf2 = Buffer.from(embedding2.buffer);
      const buf3 = Buffer.from(embedding3.buffer);

      db.insertMemory({
        id: "mem-exact",
        type: "raw",
        title: "Exact match",
        content: "Should be #1",
        tags: [],
        metadata: {},
        embedding: buf1,
        tier: "hot",
      });

      db.insertMemory({
        id: "mem-close",
        type: "raw",
        title: "Close match",
        content: "Should be #2",
        tags: [],
        metadata: {},
        embedding: buf2,
        tier: "hot",
      });

      db.insertMemory({
        id: "mem-far",
        type: "raw",
        title: "Far match",
        content: "Should be #3",
        tags: [],
        metadata: {},
        embedding: buf3,
        tier: "hot",
      });

      const store = new vectorStore.BruteForceStore();
      const query = new Float32Array(384).fill(0);
      query[0] = 1.0;

      const results = store.search(query, 3);
      assert.equal(results.length, 3);
      assert.equal(results[0].id, "mem-exact");
      assert.equal(results[1].id, "mem-close");
      assert.equal(results[2].id, "mem-far");

      assert.ok(results[0].score >= results[1].score);
      assert.ok(results[1].score >= results[2].score);
    });

    it("should respect the k limit", () => {
      for (let i = 0; i < 5; i++) {
        const embedding = new Float32Array(384).fill(0);
        embedding[i] = 1.0;
        db.insertMemory({
          id: `mem-${i}`,
          type: "raw",
          title: `Memory ${i}`,
          content: `Content ${i}`,
          tags: [],
          metadata: {},
          embedding: Buffer.from(embedding.buffer),
          tier: "hot",
        });
      }

      const store = new vectorStore.BruteForceStore();
      const query = new Float32Array(384).fill(0);
      query[0] = 1.0;

      const results = store.search(query, 2);
      assert.equal(results.length, 2);
    });

    it("upsert and delete should be no-ops for BruteForceStore", () => {
      const store = new vectorStore.BruteForceStore();
      store.upsert("test-id", new Float32Array(384));
      store.delete("test-id");
    });
  });

  describe("Singleton management", () => {
    it("getVectorStore() without init should return a new BruteForceStore", () => {
      vectorStore._resetVectorStore();
      const store = vectorStore.getVectorStore();
      assert.ok(store instanceof vectorStore.BruteForceStore);
    });

    it("initVectorStore() should set the active store", () => {
      const customStore: import("../src/vector_store.js").VectorStore = {
        upsert: () => {},
        search: () => [],
        delete: () => {},
      };

      vectorStore.initVectorStore(customStore);
      const retrieved = vectorStore.getVectorStore();
      assert.equal(retrieved, customStore);

      vectorStore._resetVectorStore();
    });

    it("getVectorStore() with tier should create BruteForceStore with that tier", () => {
      vectorStore._resetVectorStore();
      const store = vectorStore.getVectorStore("hot");
      assert.ok(store instanceof vectorStore.BruteForceStore);
    });
  });
});
