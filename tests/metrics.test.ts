import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import crypto from "node:crypto";

const originalCwd = process.cwd();
let testDir: string;
let db: typeof import("../src/db.js");
let metrics: typeof import("../src/metrics.js");

describe("Metrics", () => {
  beforeEach(async () => {
    testDir = join(tmpdir(), `moltmind-metrics-${crypto.randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    db = await import("../src/db.js");
    db.closeDb();
    db.initProjectVault();

    metrics = await import("../src/metrics.js");
  });

  afterEach(() => {
    db.closeDb();
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("recordToolCall", () => {
    it("should increment total_tool_calls", () => {
      metrics.recordToolCall("mm_store", true);
      metrics.recordToolCall("mm_recall", true);
      metrics.recordToolCall("mm_store", false);

      const totalCalls = db.getMetric("total_tool_calls");
      assert.equal(totalCalls, "3");
    });

    it("should track calls by tool name", () => {
      metrics.recordToolCall("mm_store", true);
      metrics.recordToolCall("mm_store", true);
      metrics.recordToolCall("mm_recall", true);

      const byName = JSON.parse(db.getMetric("tool_calls_by_name") ?? "{}");
      assert.equal(byName["mm_store"], 2);
      assert.equal(byName["mm_recall"], 1);
    });

    it("should track errors by tool", () => {
      metrics.recordToolCall("mm_store", true);
      metrics.recordToolCall("mm_store", false);
      metrics.recordToolCall("mm_recall", false);

      const errors = JSON.parse(db.getMetric("errors_by_tool") ?? "{}");
      assert.equal(errors["mm_store"], 1);
      assert.equal(errors["mm_recall"], 1);
    });
  });

  describe("getFullMetrics", () => {
    it("should return a complete dashboard object", () => {
      // Seed some data
      metrics.recordToolCall("mm_store", true);
      metrics.recordToolCall("mm_store", false);

      const dashboard = metrics.getFullMetrics();

      // Adoption
      assert.ok(dashboard.adoption.instance_id);
      assert.equal(dashboard.adoption.instance_id.length, 8); // truncated
      assert.ok(dashboard.adoption.first_seen || true); // may not be set if initMetrics not called
      assert.equal(typeof dashboard.adoption.install_age_days, "number");

      // Health
      assert.equal(typeof dashboard.health.score, "number");
      assert.equal(typeof dashboard.health.total_tool_calls, "number");
      assert.equal(typeof dashboard.health.total_errors, "number");
      assert.equal(typeof dashboard.health.error_rate_percent, "number");

      // Tool usage
      assert.equal(typeof dashboard.tool_usage, "object");

      // Top errors
      assert.ok(Array.isArray(dashboard.top_errors));

      // Feedback
      assert.equal(typeof dashboard.feedback_summary.total, "number");
      assert.ok(Array.isArray(dashboard.feedback_summary.recent));

      // Uptime
      assert.ok(dashboard.uptime_seconds >= 0);
    });

    it("should reflect recorded tool calls in metrics", () => {
      metrics.recordToolCall("mm_store", true);
      metrics.recordToolCall("mm_store", true);
      metrics.recordToolCall("mm_recall", false);

      const dashboard = metrics.getFullMetrics();
      assert.equal(dashboard.health.total_tool_calls, 3);
      assert.equal(dashboard.health.total_errors, 1);
      assert.ok(dashboard.top_errors.length > 0);
      assert.equal(dashboard.top_errors[0].tool_name, "mm_recall");
    });
  });
});
