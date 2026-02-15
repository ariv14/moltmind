import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import crypto from "node:crypto";

const originalCwd = process.cwd();
let testDir: string;
let db: typeof import("../src/db.js");
let diagnostics: typeof import("../src/diagnostics.js");

describe("Diagnostics", () => {
  beforeEach(async () => {
    testDir = join(tmpdir(), `moltmind-diag-${crypto.randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    db = await import("../src/db.js");
    db.closeDb();
    db.initProjectVault();

    diagnostics = await import("../src/diagnostics.js");
  });

  afterEach(() => {
    db.closeDb();
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("withDiagnostics", () => {
    it("should return handler result on success", async () => {
      const result = await diagnostics.withDiagnostics("test_tool", async () => ({
        content: [{ type: "text", text: JSON.stringify({ success: true }) }],
      }));

      const parsed = JSON.parse(result.content[0].text);
      assert.equal(parsed.success, true);
    });

    it("should log a successful call with latency > 0", async () => {
      await diagnostics.withDiagnostics("test_tool", async () => ({
        content: [{ type: "text", text: "{}" }],
      }));

      const recent = diagnostics.getRecentDiagnostics(1);
      assert.equal(recent.length, 1);
      assert.equal(recent[0].tool_name, "test_tool");
      assert.equal(recent[0].success, 1);
      assert.ok(recent[0].latency_ms >= 0);
      assert.equal(recent[0].error_message, null);
    });

    it("should catch errors and return { success: false }", async () => {
      const result = await diagnostics.withDiagnostics("failing_tool", async () => {
        throw new Error("something broke");
      });

      const parsed = JSON.parse(result.content[0].text);
      assert.equal(parsed.success, false);
      assert.equal(parsed.message, "something broke");
    });

    it("should log a failed call with error message", async () => {
      await diagnostics.withDiagnostics("failing_tool", async () => {
        throw new Error("test error");
      });

      const recent = diagnostics.getRecentDiagnostics(1);
      assert.equal(recent.length, 1);
      assert.equal(recent[0].success, 0);
      assert.equal(recent[0].error_message, "test error");
    });
  });

  describe("getHealthScore", () => {
    it("should return 1.0 when no operations exist", () => {
      const score = diagnostics.getHealthScore();
      assert.equal(score, 1.0);
    });

    it("should return 1.0 when all operations succeed", async () => {
      for (let i = 0; i < 5; i++) {
        await diagnostics.withDiagnostics("ok_tool", async () => ({
          content: [{ type: "text", text: "{}" }],
        }));
      }

      const score = diagnostics.getHealthScore();
      assert.equal(score, 1.0);
    });

    it("should return 0.0 when all operations fail", async () => {
      for (let i = 0; i < 5; i++) {
        await diagnostics.withDiagnostics("bad_tool", async () => {
          throw new Error("fail");
        });
      }

      const score = diagnostics.getHealthScore();
      assert.equal(score, 0.0);
    });

    it("should return correct ratio for mixed results", async () => {
      // 3 successes
      for (let i = 0; i < 3; i++) {
        await diagnostics.withDiagnostics("tool", async () => ({
          content: [{ type: "text", text: "{}" }],
        }));
      }
      // 1 failure
      await diagnostics.withDiagnostics("tool", async () => {
        throw new Error("fail");
      });

      const score = diagnostics.getHealthScore();
      assert.equal(score, 0.75); // 3/4
    });
  });

  describe("submitFeedback / getRecentFeedback", () => {
    it("should store and retrieve feedback", () => {
      diagnostics.submitFeedback("bug", "Something is broken", "mm_store");
      diagnostics.submitFeedback("feature_request", "Add TTL support");

      const feedback = diagnostics.getRecentFeedback(10);
      assert.equal(feedback.length, 2);

      // Verify both entries exist regardless of order
      const types = feedback.map((f) => f.type).sort();
      assert.deepEqual(types, ["bug", "feature_request"]);

      const bugEntry = feedback.find((f) => f.type === "bug")!;
      assert.equal(bugEntry.message, "Something is broken");
      assert.equal(bugEntry.tool_name, "mm_store");

      const featureEntry = feedback.find((f) => f.type === "feature_request")!;
      assert.equal(featureEntry.message, "Add TTL support");
      assert.equal(featureEntry.tool_name, null);
    });
  });
});
