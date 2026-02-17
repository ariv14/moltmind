import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import crypto from "node:crypto";

const originalCwd = process.cwd();
let testDir: string;
let db: typeof import("../src/db.js");

// Import tool handlers
let handleMmStore: typeof import("../src/tools/mm_store.js").handleMmStore;
let handleMmRecall: typeof import("../src/tools/mm_recall.js").handleMmRecall;
let handleMmRead: typeof import("../src/tools/mm_read.js").handleMmRead;
let handleMmUpdate: typeof import("../src/tools/mm_update.js").handleMmUpdate;
let handleMmDelete: typeof import("../src/tools/mm_delete.js").handleMmDelete;
let handleMmStatus: typeof import("../src/tools/mm_status.js").handleMmStatus;
let handleMmInit: typeof import("../src/tools/mm_init.js").handleMmInit;
let handleMmHandoffCreate: typeof import("../src/tools/mm_handoff_create.js").handleMmHandoffCreate;
let handleMmHandoffLoad: typeof import("../src/tools/mm_handoff_load.js").handleMmHandoffLoad;
let handleMmFeedback: typeof import("../src/tools/mm_feedback.js").handleMmFeedback;
let handleMmMetrics: typeof import("../src/tools/mm_metrics.js").handleMmMetrics;
let handleMmSessionSave: typeof import("../src/tools/mm_session_save.js").handleMmSessionSave;
let handleMmSessionResume: typeof import("../src/tools/mm_session_resume.js").handleMmSessionResume;
let handleMmSessionHistory: typeof import("../src/tools/mm_session_history.js").handleMmSessionHistory;
let metricsModule: typeof import("../src/metrics.js");
let configModule: typeof import("../src/config.js");

// Force embedding model to fail so tests don't download 22MB
let embeddings: typeof import("../src/embeddings.js");

describe("MCP Tool Handlers", () => {
  beforeEach(async () => {
    testDir = join(tmpdir(), `moltmind-tools-${crypto.randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    db = await import("../src/db.js");
    db.closeDb();
    db.initProjectVault();

    embeddings = await import("../src/embeddings.js");
    embeddings._setModelFailed(); // No model download in tests

    const store = await import("../src/tools/mm_store.js");
    handleMmStore = store.handleMmStore;
    const recall = await import("../src/tools/mm_recall.js");
    handleMmRecall = recall.handleMmRecall;
    const read = await import("../src/tools/mm_read.js");
    handleMmRead = read.handleMmRead;
    const update = await import("../src/tools/mm_update.js");
    handleMmUpdate = update.handleMmUpdate;
    const del = await import("../src/tools/mm_delete.js");
    handleMmDelete = del.handleMmDelete;
    const status = await import("../src/tools/mm_status.js");
    handleMmStatus = status.handleMmStatus;
    const init = await import("../src/tools/mm_init.js");
    handleMmInit = init.handleMmInit;
    const handoffCreate = await import("../src/tools/mm_handoff_create.js");
    handleMmHandoffCreate = handoffCreate.handleMmHandoffCreate;
    const handoffLoad = await import("../src/tools/mm_handoff_load.js");
    handleMmHandoffLoad = handoffLoad.handleMmHandoffLoad;
    const feedback = await import("../src/tools/mm_feedback.js");
    handleMmFeedback = feedback.handleMmFeedback;
    const metrics = await import("../src/tools/mm_metrics.js");
    handleMmMetrics = metrics.handleMmMetrics;
    const sessionSave = await import("../src/tools/mm_session_save.js");
    handleMmSessionSave = sessionSave.handleMmSessionSave;
    const sessionResume = await import("../src/tools/mm_session_resume.js");
    handleMmSessionResume = sessionResume.handleMmSessionResume;
    const sessionHistory = await import("../src/tools/mm_session_history.js");
    handleMmSessionHistory = sessionHistory.handleMmSessionHistory;
    metricsModule = await import("../src/metrics.js");
    configModule = await import("../src/config.js");
    // Initialize metrics to create an active session
    metricsModule.initMetrics();
  });

  afterEach(() => {
    db.closeDb();
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // --- mm_store ---
  describe("mm_store", () => {
    it("should store a memory and return success", async () => {
      const result = await handleMmStore({
        title: "Test Learning",
        content: "TypeScript generics are powerful.",
        type: "learning",
        tags: ["typescript"],
      });
      assert.equal(result.success, true);
      assert.ok(result.id);
      assert.ok(result.message);
    });

    it("should default type to raw when not provided", async () => {
      const result = await handleMmStore({
        title: "Raw Note",
        content: "Just a note.",
      });
      assert.equal(result.success, true);
      const memory = db.getMemory(result.id!);
      assert.equal(memory!.type, "raw");
    });
  });

  // --- mm_recall ---
  describe("mm_recall", () => {
    it("should find memories by keyword (FTS fallback)", async () => {
      await handleMmStore({ title: "JavaScript closures", content: "Closures capture variables from lexical scope." });
      await handleMmStore({ title: "Python decorators", content: "Decorators wrap functions." });

      const result = await handleMmRecall({ query: "closures" });
      assert.equal(result.success, true);
      assert.ok(result.count >= 1);
      assert.equal(result.results[0].title, "JavaScript closures");
    });

    it("should return empty results for no matches", async () => {
      const result = await handleMmRecall({ query: "nonexistentxyz" });
      assert.equal(result.success, true);
      assert.equal(result.count, 0);
    });
  });

  // --- mm_read ---
  describe("mm_read", () => {
    it("should read a memory by id", async () => {
      const stored = await handleMmStore({ title: "Readable", content: "Read me." });
      const result = await handleMmRead({ id: stored.id! });
      assert.equal(result.success, true);
      assert.equal((result.memory as Record<string, unknown>).title, "Readable");
    });

    it("should return error for non-existent id", async () => {
      const result = await handleMmRead({ id: "non-existent" });
      assert.equal(result.success, false);
      assert.equal(result.message, "Memory not found");
    });
  });

  // --- mm_update ---
  describe("mm_update", () => {
    it("should update memory fields", async () => {
      const stored = await handleMmStore({ title: "Original", content: "Original content." });
      const result = await handleMmUpdate({ id: stored.id!, title: "Updated", tags: ["new"] });
      assert.equal(result.success, true);
      assert.equal((result.memory as Record<string, unknown>).title, "Updated");
    });

    it("should return error for non-existent id", async () => {
      const result = await handleMmUpdate({ id: "non-existent", title: "Nope" });
      assert.equal(result.success, false);
    });
  });

  // --- mm_delete ---
  describe("mm_delete", () => {
    it("should archive a memory", async () => {
      const stored = await handleMmStore({ title: "To Delete", content: "Delete me." });
      const result = await handleMmDelete({ id: stored.id! });
      assert.equal(result.success, true);
      assert.equal(result.message, "Memory archived");

      const memory = db.getMemory(stored.id!);
      assert.equal(memory!.tier, "archived");
    });

    it("should return error for non-existent id", async () => {
      const result = await handleMmDelete({ id: "non-existent" });
      assert.equal(result.success, false);
    });
  });

  // --- mm_status ---
  describe("mm_status", () => {
    it("should return server status", async () => {
      const result = await handleMmStatus();
      assert.equal(result.success, true);
      assert.equal(result.version, "0.4.0");
      assert.ok(result.db_stats);
      assert.equal(typeof result.health_score, "number");
      assert.equal(typeof result.uptime_seconds, "number");
    });
  });

  // --- mm_init ---
  describe("mm_init", () => {
    it("should initialize project vault", async () => {
      const newDir = join(tmpdir(), `moltmind-init-${crypto.randomUUID()}`);
      mkdirSync(newDir, { recursive: true });
      process.chdir(newDir);
      db.closeDb();

      const result = await handleMmInit();
      assert.equal(result.success, true);
      assert.equal(result.path, ".moltmind/memory.db");
      assert.ok(existsSync(join(newDir, ".moltmind", "memory.db")));

      db.closeDb();
      rmSync(newDir, { recursive: true, force: true });
    });
  });

  // --- mm_handoff_create ---
  describe("mm_handoff_create", () => {
    it("should create a handoff", async () => {
      const result = await handleMmHandoffCreate({
        goal: "Finish Phase 6",
        current_state: "Tools built",
        next_action: "Write tests",
      });
      assert.equal(result.success, true);
      assert.ok(result.handoff);
    });
  });

  // --- mm_handoff_load ---
  describe("mm_handoff_load", () => {
    it("should load the latest handoff", async () => {
      await handleMmHandoffCreate({
        goal: "Test handoff",
        current_state: "Created",
        next_action: "Load it",
      });

      const result = await handleMmHandoffLoad();
      assert.equal(result.success, true);
      assert.equal((result.handoff as Record<string, unknown>).goal, "Test handoff");
    });

    it("should return error when no handoffs exist", async () => {
      const result = await handleMmHandoffLoad();
      assert.equal(result.success, false);
      assert.equal(result.message, "No handoff found");
    });
  });

  // --- mm_feedback ---
  describe("mm_feedback", () => {
    it("should record feedback", async () => {
      const result = await handleMmFeedback({
        type: "feature_request",
        message: "Add memory TTL",
        tool_name: "mm_store",
      });
      assert.equal(result.success, true);
    });
  });

  // --- mm_metrics ---
  describe("mm_metrics", () => {
    it("should return metrics dashboard", async () => {
      const result = await handleMmMetrics();
      assert.equal(result.success, true);
      assert.ok(result.adoption);
      assert.ok(result.health);
    });
  });

  // --- mm_session_save ---
  describe("mm_session_save", () => {
    it("should save session state", async () => {
      const result = await handleMmSessionSave({
        summary: "Implemented session tracking",
        goal: "Add session continuity",
        actions_taken: ["Created tables", "Added tools"],
        outcomes: ["All tests pass"],
        where_left_off: "Ready to publish",
        status: "paused",
      });
      assert.equal(result.success, true);
      assert.equal(result.message, "Session saved");
      const session = result.session as Record<string, unknown>;
      assert.equal(session.status, "paused");
      assert.equal(session.summary, "Implemented session tracking");
    });

    it("should mark session completed", async () => {
      const result = await handleMmSessionSave({
        summary: "Done",
        status: "completed",
      });
      assert.equal(result.success, true);
      assert.equal(result.message, "Session completed");
    });

    it("should auto-populate actions_taken from diagnostics when not provided", async () => {
      // Generate some diagnostics by calling tools
      const sessionId = metricsModule.getCurrentSessionId();
      assert.ok(sessionId);
      db.insertDiagnostic("mm_store", true, 10, null, sessionId);
      db.insertDiagnostic("mm_store", true, 12, null, sessionId);
      db.insertDiagnostic("mm_recall", true, 8, null, sessionId);
      db.insertDiagnostic("mm_recall", false, 5, "error", sessionId);

      const result = await handleMmSessionSave({
        summary: "Test auto-populate",
        status: "paused",
      });
      assert.equal(result.success, true);
      const session = result.session as Record<string, unknown>;
      const actions = session.actions_taken as string[];
      assert.ok(Array.isArray(actions));
      assert.ok(actions.length >= 2);
      // Should contain tool names with call counts
      const storeAction = actions.find((a: string) => a.startsWith("mm_store"));
      assert.ok(storeAction);
      assert.ok(storeAction.includes("2 calls"));
      const recallAction = actions.find((a: string) => a.startsWith("mm_recall"));
      assert.ok(recallAction);
      assert.ok(recallAction.includes("1 failed"));
    });

    it("should use provided actions_taken instead of auto-populating", async () => {
      const sessionId = metricsModule.getCurrentSessionId();
      db.insertDiagnostic("mm_store", true, 10, null, sessionId);

      const result = await handleMmSessionSave({
        summary: "Manual actions",
        actions_taken: ["Did thing A", "Did thing B"],
        status: "paused",
      });
      assert.equal(result.success, true);
      const session = result.session as Record<string, unknown>;
      const actions = session.actions_taken as string[];
      assert.deepEqual(actions, ["Did thing A", "Did thing B"]);
    });
  });

  // --- mm_session_resume ---
  describe("mm_session_resume", () => {
    it("should return recent sessions", async () => {
      // Save current session first
      await handleMmSessionSave({
        summary: "Test session",
        status: "paused",
      });

      const result = await handleMmSessionResume({});
      assert.equal(result.success, true);
      assert.ok(Array.isArray(result.sessions));
      assert.ok((result.sessions as unknown[]).length >= 1);
    });

    it("should return empty when no sessions exist (fresh db)", async () => {
      // Pause current, then clear sessions table
      await handleMmSessionSave({ status: "completed" });
      const database = db.getDb();
      database.prepare("DELETE FROM sessions").run();

      const result = await handleMmSessionResume({});
      assert.equal(result.success, true);
      assert.equal((result.sessions as unknown[]).length, 0);
    });
  });

  // --- mm_session_history ---
  describe("mm_session_history", () => {
    it("should list sessions with filtering", async () => {
      const result = await handleMmSessionHistory({ status: "active" });
      assert.equal(result.success, true);
      assert.ok(Array.isArray(result.sessions));
    });

    it("should return per-session tool call stats", async () => {
      // Store a memory to generate diagnostics
      await handleMmStore({ title: "Test", content: "Content" });

      const result = await handleMmSessionHistory({});
      assert.equal(result.success, true);
      const sessions = result.sessions as Array<Record<string, unknown>>;
      assert.ok(sessions.length >= 1);
      // The active session should have tool_calls from mm_store
      const active = sessions.find((s) => s.status === "active");
      if (active) {
        assert.equal(typeof active.tool_calls, "number");
      }
    });
  });

  // --- Tool filtering (--moltbook flag) ---
  describe("config: tool filtering", () => {
    it("should report default mode without --moltbook flag", () => {
      // In test environment, --moltbook is not passed
      assert.equal(configModule.isMoltbookEnabled(), false);
      assert.equal(configModule.getToolMode(), "default");
      assert.equal(configModule.getEnabledToolCount(), 14);
    });

    it("should mark mm_* tools as enabled in default mode", () => {
      assert.equal(configModule.isToolEnabled("mm_store"), true);
      assert.equal(configModule.isToolEnabled("mm_recall"), true);
      assert.equal(configModule.isToolEnabled("mm_metrics"), true);
    });

    it("should mark mb_* tools as disabled in default mode", () => {
      assert.equal(configModule.isToolEnabled("mb_auth"), false);
      assert.equal(configModule.isToolEnabled("mb_post"), false);
      assert.equal(configModule.isToolEnabled("mb_feed"), false);
      assert.equal(configModule.isToolEnabled("mb_comment"), false);
      assert.equal(configModule.isToolEnabled("mb_vote"), false);
      assert.equal(configModule.isToolEnabled("mb_social"), false);
      assert.equal(configModule.isToolEnabled("mb_submolt"), false);
    });
  });

  // --- mm_metrics includes token_savings ---
  describe("mm_metrics: token_savings", () => {
    it("should include token_savings section in metrics", async () => {
      const result = await handleMmMetrics();
      assert.equal(result.success, true);
      assert.ok(result.token_savings);
      const savings = result.token_savings as Record<string, unknown>;
      assert.equal(typeof savings.sessions_tracked, "number");
      assert.equal(typeof savings.overhead_tokens, "number");
      assert.equal(typeof savings.cold_starts_avoided, "number");
      assert.equal(typeof savings.net_savings, "number");
      assert.equal(typeof savings.mode, "string");
    });
  });
});
