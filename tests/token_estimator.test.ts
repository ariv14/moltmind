import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import crypto from "node:crypto";

const originalCwd = process.cwd();
let testDir: string;
let db: typeof import("../src/db.js");
let tokenEstimator: typeof import("../src/token_estimator.js");

describe("Token Estimator", () => {
  beforeEach(async () => {
    testDir = join(tmpdir(), `moltmind-token-${crypto.randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    db = await import("../src/db.js");
    db.closeDb();
    db.initProjectVault();

    tokenEstimator = await import("../src/token_estimator.js");
  });

  afterEach(() => {
    db.closeDb();
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("estimateResponseTokens", () => {
    it("should estimate tokens from response length", () => {
      // ~4 chars per token
      assert.equal(tokenEstimator.estimateResponseTokens(100), 25);
      assert.equal(tokenEstimator.estimateResponseTokens(4), 1);
      assert.equal(tokenEstimator.estimateResponseTokens(0), 0);
    });

    it("should round up partial tokens", () => {
      assert.equal(tokenEstimator.estimateResponseTokens(5), 2);
      assert.equal(tokenEstimator.estimateResponseTokens(1), 1);
    });
  });

  describe("upsertTokenEstimate", () => {
    it("should insert a new token estimate", () => {
      const sessionId = crypto.randomUUID();
      // Create session first
      db.insertSession(sessionId);

      tokenEstimator.upsertTokenEstimate(sessionId, 50, false);

      const row = db.getDb().prepare(
        "SELECT * FROM token_estimates WHERE session_id = ?"
      ).get(sessionId) as Record<string, unknown>;

      assert.ok(row);
      assert.equal(row.tool_response_tokens, 50);
      assert.equal(row.cold_start_avoided, 0);
    });

    it("should update existing token estimate", () => {
      const sessionId = crypto.randomUUID();
      db.insertSession(sessionId);

      tokenEstimator.upsertTokenEstimate(sessionId, 50, false);
      tokenEstimator.upsertTokenEstimate(sessionId, 30, false);

      const row = db.getDb().prepare(
        "SELECT * FROM token_estimates WHERE session_id = ?"
      ).get(sessionId) as Record<string, unknown>;

      assert.equal(row.tool_response_tokens, 80); // 50 + 30
    });

    it("should track cold start avoidance", () => {
      const sessionId = crypto.randomUUID();
      db.insertSession(sessionId);

      tokenEstimator.upsertTokenEstimate(sessionId, 50, true);

      const row = db.getDb().prepare(
        "SELECT * FROM token_estimates WHERE session_id = ?"
      ).get(sessionId) as Record<string, unknown>;

      assert.equal(row.cold_start_avoided, 1);
    });
  });

  describe("getAggregateTokenSavings", () => {
    it("should return zeros with no data", () => {
      const report = tokenEstimator.getAggregateTokenSavings();
      assert.equal(report.sessions_tracked, 0);
      assert.equal(report.overhead_tokens, 0);
      assert.equal(report.tool_response_tokens, 0);
      assert.equal(report.cold_starts_avoided, 0);
    });

    it("should aggregate across sessions", () => {
      const s1 = crypto.randomUUID();
      const s2 = crypto.randomUUID();
      db.insertSession(s1);
      db.insertSession(s2);

      tokenEstimator.upsertTokenEstimate(s1, 100, true);
      tokenEstimator.upsertTokenEstimate(s2, 200, true);

      const report = tokenEstimator.getAggregateTokenSavings();
      assert.equal(report.sessions_tracked, 2);
      assert.equal(report.tool_response_tokens, 300);
      assert.equal(report.cold_starts_avoided, 2);
      assert.ok(report.cold_start_savings > 0);
      assert.equal(typeof report.mode, "string");
    });

    it("should handle sessions with no cold start", () => {
      const sessionId = crypto.randomUUID();
      db.insertSession(sessionId);

      tokenEstimator.upsertTokenEstimate(sessionId, 50, false);

      const report = tokenEstimator.getAggregateTokenSavings();
      assert.equal(report.cold_starts_avoided, 0);
      assert.equal(report.cold_start_savings, 0);
    });
  });
});
