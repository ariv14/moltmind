import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import crypto from "node:crypto";

const originalCwd = process.cwd();
let testDir: string;
let db: typeof import("../src/db.js");

describe("Database Layer", () => {
  beforeEach(async () => {
    testDir = join(tmpdir(), `moltmind-test-${crypto.randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    db = await import("../src/db.js");
    db.closeDb();
    // initProjectVault creates .moltmind/memory.db in cwd and switches to it
    db.initProjectVault();
  });

  afterEach(() => {
    db.closeDb();
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("insertMemory", () => {
    it("should insert and return a memory", () => {
      const memory = db.insertMemory({
        type: "learning",
        title: "Test Memory",
        content: "This is a test memory for unit testing.",
        tags: ["test", "unit"],
        metadata: { source: "test" },
        embedding: null,
        tier: "hot",
      });

      assert.ok(memory.id);
      assert.equal(memory.type, "learning");
      assert.equal(memory.title, "Test Memory");
      assert.equal(memory.content, "This is a test memory for unit testing.");
      assert.deepEqual(memory.tags, ["test", "unit"]);
      assert.deepEqual(memory.metadata, { source: "test" });
      assert.equal(memory.tier, "hot");
      assert.equal(memory.access_count, 0); // insertMemory uses raw SELECT, no side-effect
      assert.ok(memory.created_at);
    });
  });

  describe("getMemory", () => {
    it("should return a memory by id", () => {
      const inserted = db.insertMemory({
        type: "error",
        title: "Error Memory",
        content: "An error occurred.",
        tags: ["error"],
        metadata: {},
        embedding: null,
        tier: "hot",
      });

      const fetched = db.getMemory(inserted.id);
      assert.ok(fetched);
      assert.equal(fetched.id, inserted.id);
      assert.equal(fetched.title, "Error Memory");
    });

    it("should return null for non-existent id", () => {
      const result = db.getMemory("non-existent-id");
      assert.equal(result, null);
    });

    it("should increment access_count on each read", () => {
      const inserted = db.insertMemory({
        type: "raw",
        title: "Counter Test",
        content: "Testing access count.",
        tags: [],
        metadata: {},
        embedding: null,
        tier: "hot",
      });

      // insertMemory does NOT increment (access_count = 0)
      db.getMemory(inserted.id); // access_count = 1
      const second = db.getMemory(inserted.id); // access_count = 2
      assert.equal(second!.access_count, 2);
    });
  });

  describe("updateMemory", () => {
    it("should update specified fields", () => {
      const inserted = db.insertMemory({
        type: "decision",
        title: "Original Title",
        content: "Original content.",
        tags: ["v1"],
        metadata: {},
        embedding: null,
        tier: "hot",
      });

      const updated = db.updateMemory(inserted.id, {
        title: "Updated Title",
        tags: ["v2", "updated"],
        tier: "warm",
      });

      assert.ok(updated);
      assert.equal(updated.title, "Updated Title");
      assert.deepEqual(updated.tags, ["v2", "updated"]);
      assert.equal(updated.tier, "warm");
      assert.equal(updated.content, "Original content.");
    });

    it("should return null for non-existent id", () => {
      const result = db.updateMemory("non-existent", { title: "Nope" });
      assert.equal(result, null);
    });
  });

  describe("deleteMemory", () => {
    it("should soft-delete by setting tier to archived", () => {
      const inserted = db.insertMemory({
        type: "plan",
        title: "To Delete",
        content: "This will be archived.",
        tags: [],
        metadata: {},
        embedding: null,
        tier: "hot",
      });

      const result = db.deleteMemory(inserted.id);
      assert.equal(result, true);

      const archived = db.getMemory(inserted.id);
      assert.ok(archived);
      assert.equal(archived.tier, "archived");
    });

    it("should return false for non-existent id", () => {
      const result = db.deleteMemory("non-existent");
      assert.equal(result, false);
    });
  });

  describe("searchMemoriesFTS", () => {
    it("should find memories by keyword", () => {
      db.insertMemory({
        type: "learning",
        title: "JavaScript Closures",
        content: "A closure is a function that captures variables from its lexical scope.",
        tags: ["javascript"],
        metadata: {},
        embedding: null,
        tier: "hot",
      });

      db.insertMemory({
        type: "learning",
        title: "Python Decorators",
        content: "Decorators wrap functions to extend behavior.",
        tags: ["python"],
        metadata: {},
        embedding: null,
        tier: "hot",
      });

      const results = db.searchMemoriesFTS("closure");
      assert.equal(results.length, 1);
      assert.equal(results[0].title, "JavaScript Closures");
    });

    it("should return empty array for no matches", () => {
      const results = db.searchMemoriesFTS("nonexistentterm");
      assert.equal(results.length, 0);
    });
  });

  describe("getAllMemories", () => {
    it("should return all memories", () => {
      db.insertMemory({ type: "raw", title: "A", content: "a", tags: [], metadata: {}, embedding: null, tier: "hot" });
      db.insertMemory({ type: "raw", title: "B", content: "b", tags: [], metadata: {}, embedding: null, tier: "warm" });

      const all = db.getAllMemories();
      assert.equal(all.length, 2);
    });

    it("should filter by tier", () => {
      db.insertMemory({ type: "raw", title: "Hot", content: "h", tags: [], metadata: {}, embedding: null, tier: "hot" });
      db.insertMemory({ type: "raw", title: "Warm", content: "w", tags: [], metadata: {}, embedding: null, tier: "warm" });

      const hot = db.getAllMemories("hot");
      assert.equal(hot.length, 1);
      assert.equal(hot[0].title, "Hot");
    });

    it("should exclude archived memories by default", () => {
      db.insertMemory({ type: "raw", title: "Active", content: "a", tags: [], metadata: {}, embedding: null, tier: "hot" });
      const toArchive = db.insertMemory({ type: "raw", title: "Archived", content: "b", tags: [], metadata: {}, embedding: null, tier: "hot" });
      db.deleteMemory(toArchive.id); // soft-delete sets tier to 'archived'

      const defaultResult = db.getAllMemories();
      assert.equal(defaultResult.length, 1);
      assert.equal(defaultResult[0].title, "Active");

      const withArchived = db.getAllMemories(undefined, 100, true);
      assert.equal(withArchived.length, 2);
    });
  });

  describe("getMemoryStats", () => {
    it("should return counts by type and tier", () => {
      db.insertMemory({ type: "learning", title: "L1", content: "l", tags: [], metadata: {}, embedding: null, tier: "hot" });
      db.insertMemory({ type: "error", title: "E1", content: "e", tags: [], metadata: {}, embedding: null, tier: "hot" });
      db.insertMemory({ type: "learning", title: "L2", content: "l", tags: [], metadata: {}, embedding: null, tier: "warm" });

      const stats = db.getMemoryStats();
      assert.equal(stats.total, 3);
      assert.equal(stats.by_type["learning"], 2);
      assert.equal(stats.by_type["error"], 1);
      assert.equal(stats.by_tier["hot"], 2);
      assert.equal(stats.by_tier["warm"], 1);
    });
  });

  describe("Handoffs", () => {
    it("should insert and retrieve a handoff", () => {
      const handoff = db.insertHandoff({
        goal: "Complete feature X",
        current_state: "Started implementation",
        next_action: "Write tests",
        constraints: ["Must be backward compatible"],
        known_unknowns: ["Performance impact"],
        artifacts: ["src/feature.ts"],
        stop_conditions: ["All tests pass"],
        session_id: "session-123",
      });

      assert.ok(handoff.id);
      assert.equal(handoff.goal, "Complete feature X");
      assert.equal(handoff.session_id, "session-123");
      assert.deepEqual(handoff.constraints, ["Must be backward compatible"]);
    });

    it("should return the latest handoff", () => {
      db.insertHandoff({
        goal: "First",
        current_state: "s1",
        next_action: "a1",
        constraints: [],
        known_unknowns: [],
        artifacts: [],
        stop_conditions: [],
        session_id: "s1",
        created_at: "2024-01-01T00:00:00.000Z",
      });

      db.insertHandoff({
        goal: "Second",
        current_state: "s2",
        next_action: "a2",
        constraints: [],
        known_unknowns: [],
        artifacts: [],
        stop_conditions: [],
        session_id: "s2",
        created_at: "2024-01-02T00:00:00.000Z",
      });

      const latest = db.getLatestHandoff();
      assert.ok(latest);
      assert.equal(latest.goal, "Second");
    });

    it("should return null when no handoffs exist", () => {
      const result = db.getLatestHandoff();
      assert.equal(result, null);
    });
  });

  describe("migrations", () => {
    it("should set schema version to 7 after all migrations", () => {
      const version = db.getDbSchemaVersion();
      assert.equal(version, 7);
    });

    it("should be idempotent — reopening DB does not re-run migrations", () => {
      db.insertMemory({ type: "raw", title: "Before reopen", content: "test", tags: [], metadata: {}, embedding: null, tier: "hot" });

      db.closeDb();
      db.getDb(); // reopen triggers migrate() which should be a no-op

      const version = db.getDbSchemaVersion();
      assert.equal(version, 7);

      const all = db.getAllMemories();
      assert.equal(all.length, 1);
      assert.equal(all[0].title, "Before reopen");
    });
  });

  describe("Session Heartbeat", () => {
    it("should update session heartbeat and pid", () => {
      const session = db.insertSession(crypto.randomUUID());
      db.updateSessionHeartbeat(session.id, 12345);

      const updated = db.getSession(session.id);
      assert.ok(updated);
      assert.equal(updated.pid, 12345);
      assert.ok(updated.last_heartbeat);
    });

    it("should mark stale sessions as paused", () => {
      const session = db.insertSession(crypto.randomUUID());
      // Set heartbeat to 2 minutes ago (stale)
      const twoMinAgo = new Date(Date.now() - 120000).toISOString();
      db.getDb().prepare("UPDATE sessions SET last_heartbeat = ?, pid = ? WHERE id = ?").run(twoMinAgo, 99999, session.id);

      const staleCount = db.markStaleSessions();
      assert.equal(staleCount, 1);

      const updated = db.getSession(session.id);
      assert.ok(updated);
      assert.equal(updated.status, "paused");
    });

    it("should not mark fresh sessions as stale", () => {
      const session = db.insertSession(crypto.randomUUID());
      db.updateSessionHeartbeat(session.id, process.pid);

      const staleCount = db.markStaleSessions();
      assert.equal(staleCount, 0);

      const updated = db.getSession(session.id);
      assert.ok(updated);
      assert.equal(updated.status, "active");
    });

    it("should return active sessions", () => {
      db.insertSession(crypto.randomUUID());
      db.insertSession(crypto.randomUUID());

      const active = db.getActiveSessions();
      assert.ok(active.length >= 2);
    });
  });

  describe("Session Events", () => {
    it("should log and retrieve events", () => {
      const sessionId = crypto.randomUUID();
      db.insertSession(sessionId);

      const beforeInsert = new Date(Date.now() - 1000).toISOString();
      db.logSessionEvent(sessionId, "memory_stored", "mem-123", "Test memory");
      db.logSessionEvent(sessionId, "handoff_created", "hoff-456", "Test handoff");

      const events = db.getRecentEvents(beforeInsert);
      assert.equal(events.length, 2);
      assert.equal(events[0].event_type, "handoff_created");
      assert.equal(events[1].event_type, "memory_stored");
    });

    it("should respect time filter", () => {
      const sessionId = crypto.randomUUID();
      db.insertSession(sessionId);

      // Insert old event with explicit past timestamp
      const database = db.getDb();
      const oldTime = new Date(Date.now() - 5000).toISOString();
      database.prepare(
        "INSERT INTO session_events (id, session_id, event_type, resource_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(crypto.randomUUID(), sessionId, "memory_stored", "mem-1", "Old event", oldTime);

      const cutoff = new Date(Date.now() - 2000).toISOString();
      db.logSessionEvent(sessionId, "memory_stored", "mem-2", "New event");

      const events = db.getRecentEvents(cutoff);
      assert.equal(events.length, 1);
      assert.equal(events[0].summary, "New event");
    });
  });

  describe("Session Claims", () => {
    it("should claim and release a resource", () => {
      const sessionId = crypto.randomUUID();
      db.insertSession(sessionId);
      db.updateSessionHeartbeat(sessionId, process.pid);

      const result = db.claimResource(sessionId, "src/db.ts", process.pid, "refactoring");
      assert.equal(result.success, true);

      const claims = db.getActiveClaims();
      assert.equal(claims.length, 1);
      assert.equal(claims[0].resource, "src/db.ts");
      assert.equal(claims[0].description, "refactoring");

      const released = db.releaseResource(sessionId, "src/db.ts");
      assert.equal(released, true);

      const afterRelease = db.getActiveClaims();
      assert.equal(afterRelease.length, 0);
    });

    it("should block claim when held by another active session", () => {
      const session1 = crypto.randomUUID();
      const session2 = crypto.randomUUID();
      db.insertSession(session1);
      db.insertSession(session2);
      db.updateSessionHeartbeat(session1, 11111);
      db.updateSessionHeartbeat(session2, 22222);

      db.claimResource(session1, "src/db.ts", 11111, "editing");
      const result = db.claimResource(session2, "src/db.ts", 22222, "also editing");
      assert.equal(result.success, false);
      assert.equal(result.held_by, session1);
    });

    it("should allow re-claim by same session", () => {
      const sessionId = crypto.randomUUID();
      db.insertSession(sessionId);
      db.updateSessionHeartbeat(sessionId, process.pid);

      db.claimResource(sessionId, "src/db.ts", process.pid, "first");
      const result = db.claimResource(sessionId, "src/db.ts", process.pid, "updated");
      assert.equal(result.success, true);

      const claims = db.getActiveClaims();
      assert.equal(claims.length, 1);
      assert.equal(claims[0].description, "updated");
    });

    it("should release all claims for a session", () => {
      const sessionId = crypto.randomUUID();
      db.insertSession(sessionId);
      db.updateSessionHeartbeat(sessionId, process.pid);

      db.claimResource(sessionId, "file1.ts", process.pid);
      db.claimResource(sessionId, "file2.ts", process.pid);

      const count = db.releaseAllClaims(sessionId);
      assert.equal(count, 2);
      assert.equal(db.getActiveClaims().length, 0);
    });

    it("should release stale claims when marking stale sessions", () => {
      const sessionId = crypto.randomUUID();
      db.insertSession(sessionId);
      const twoMinAgo = new Date(Date.now() - 120000).toISOString();
      db.getDb().prepare("UPDATE sessions SET last_heartbeat = ?, pid = ? WHERE id = ?").run(twoMinAgo, 99999, sessionId);
      db.claimResource(sessionId, "stale-file.ts", 99999);

      db.markStaleSessions();

      const claims = db.getActiveClaims();
      assert.equal(claims.length, 0);
    });
  });

  describe("initProjectVault", () => {
    it("should create project vault and switch db", () => {
      const newDir = join(tmpdir(), `moltmind-vault-${crypto.randomUUID()}`);
      mkdirSync(newDir, { recursive: true });
      process.chdir(newDir);

      db.closeDb();
      const path = db.initProjectVault();
      assert.equal(path, ".moltmind/memory.db");
      assert.ok(existsSync(join(newDir, ".moltmind", "memory.db")));

      // Should be able to use the new vault
      const memory = db.insertMemory({
        type: "raw",
        title: "Vault Test",
        content: "Testing project vault.",
        tags: [],
        metadata: {},
        embedding: null,
        tier: "hot",
      });
      assert.ok(memory.id);

      db.closeDb();
      rmSync(newDir, { recursive: true, force: true });
    });
  });
});
