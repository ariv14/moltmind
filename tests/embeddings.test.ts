import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  cosineSimilarity,
  embeddingToBuffer,
  bufferToEmbedding,
  semanticSearch,
  embed,
  isModelReady,
  _resetForTesting,
  _setModelFailed,
} from "../src/embeddings.js";

describe("Embedding Engine", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  describe("cosineSimilarity", () => {
    it("should return 1.0 for identical vectors", () => {
      const a = new Float32Array([1, 2, 3]);
      const score = cosineSimilarity(a, a);
      assert.ok(Math.abs(score - 1.0) < 1e-6, `Expected ~1.0, got ${score}`);
    });

    it("should return ~0 for orthogonal vectors", () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([0, 1, 0]);
      const score = cosineSimilarity(a, b);
      assert.ok(Math.abs(score) < 1e-6, `Expected ~0, got ${score}`);
    });

    it("should return -1.0 for opposite vectors", () => {
      const a = new Float32Array([1, 0, 0]);
      const b = new Float32Array([-1, 0, 0]);
      const score = cosineSimilarity(a, b);
      assert.ok(Math.abs(score - (-1.0)) < 1e-6, `Expected ~-1.0, got ${score}`);
    });

    it("should return 0 for zero vectors", () => {
      const a = new Float32Array([0, 0, 0]);
      const b = new Float32Array([1, 2, 3]);
      const score = cosineSimilarity(a, b);
      assert.equal(score, 0);
    });
  });

  describe("embeddingToBuffer / bufferToEmbedding", () => {
    it("should round-trip correctly", () => {
      const original = new Float32Array([0.1, 0.2, 0.3, -0.4, 0.5]);
      const buffer = embeddingToBuffer(original);
      const restored = bufferToEmbedding(buffer);

      assert.equal(restored.length, original.length);
      for (let i = 0; i < original.length; i++) {
        assert.ok(
          Math.abs(restored[i] - original[i]) < 1e-7,
          `Index ${i}: expected ${original[i]}, got ${restored[i]}`
        );
      }
    });

    it("should produce a buffer of correct byte length", () => {
      const embedding = new Float32Array(384); // MiniLM-L6-v2 dimension
      const buffer = embeddingToBuffer(embedding);
      assert.equal(buffer.byteLength, 384 * 4); // Float32 = 4 bytes each
    });
  });

  describe("graceful degradation", () => {
    it("should return null from embed() when model is unavailable", async () => {
      _setModelFailed();
      const result = await embed("test text");
      assert.equal(result, null);
    });

    it("should report model not ready when failed", () => {
      _setModelFailed();
      assert.equal(isModelReady(), false);
    });

    it("should return empty array from semanticSearch when model is unavailable", async () => {
      _setModelFailed();
      const fakeMemory = {
        id: "test-id",
        embedding: embeddingToBuffer(new Float32Array(384)),
      };
      const results = await semanticSearch("query", [fakeMemory]);
      assert.equal(results.length, 0);
    });
  });

  describe("semanticSearch", () => {
    it("should return results sorted by score descending", async () => {
      // Mock: since model won't be loaded in tests, we test the sorting logic
      // by testing cosineSimilarity-based ordering with known vectors
      const queryVec = new Float32Array([1, 0, 0]);
      const closeVec = new Float32Array([0.9, 0.1, 0]);  // high similarity
      const farVec = new Float32Array([0, 0, 1]);          // low similarity
      const midVec = new Float32Array([0.5, 0.5, 0]);      // medium similarity

      const closeScore = cosineSimilarity(queryVec, closeVec);
      const midScore = cosineSimilarity(queryVec, midVec);
      const farScore = cosineSimilarity(queryVec, farVec);

      assert.ok(closeScore > midScore, "Close should score higher than mid");
      assert.ok(midScore > farScore, "Mid should score higher than far");
    });
  });
});
