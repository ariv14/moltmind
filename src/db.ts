import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import crypto from "node:crypto";
import type { Memory, MemoryType, MemoryTier, Handoff, Session, SessionStatus, SessionEvent, SessionClaim } from "./types.js";

const GLOBAL_DIR = join(homedir(), ".moltmind");
const GLOBAL_DB_PATH = join(GLOBAL_DIR, "memory.db");
const PROJECT_DIR = ".moltmind";
const PROJECT_DB_PATH = join(PROJECT_DIR, "memory.db");

let db: Database.Database | null = null;

function resolveDbPath(): string {
  if (existsSync(PROJECT_DB_PATH)) {
    return PROJECT_DB_PATH;
  }
  return GLOBAL_DB_PATH;
}

function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}

function getSchemaVersion(database: Database.Database): number {
  // Create meta table if it doesn't exist
  database.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)");

  const row = database.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

function setSchemaVersion(database: Database.Database, version: number): void {
  database.prepare(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)"
  ).run(String(version));
}

function migrateV1(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      embedding BLOB,
      tier TEXT NOT NULL DEFAULT 'hot',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      accessed_at TEXT NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0,
      decay_score REAL NOT NULL DEFAULT 1.0
    );

    CREATE TABLE IF NOT EXISTS handoffs (
      id TEXT PRIMARY KEY,
      goal TEXT NOT NULL,
      current_state TEXT NOT NULL,
      next_action TEXT NOT NULL,
      constraints TEXT NOT NULL DEFAULT '[]',
      known_unknowns TEXT NOT NULL DEFAULT '[]',
      artifacts TEXT NOT NULL DEFAULT '[]',
      stop_conditions TEXT NOT NULL DEFAULT '[]',
      session_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      title,
      content,
      content=memories,
      content_rowid=rowid
    );

    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, title, content)
      VALUES (new.rowid, new.title, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, title, content)
      VALUES ('delete', old.rowid, old.title, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, title, content)
      VALUES ('delete', old.rowid, old.title, old.content);
      INSERT INTO memories_fts(rowid, title, content)
      VALUES (new.rowid, new.title, new.content);
    END;
  `);
}

function migrateV2(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS diagnostics (
      id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      success INTEGER NOT NULL,
      latency_ms REAL NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('bug','feature_request','friction')),
      message TEXT NOT NULL,
      tool_name TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS metrics (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function migrateV3(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS moltbook_auth (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function migrateV5(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS token_estimates (
      session_id TEXT PRIMARY KEY,
      overhead_tokens INTEGER NOT NULL DEFAULT 0,
      tool_response_tokens INTEGER NOT NULL DEFAULT 0,
      cold_start_avoided INTEGER NOT NULL DEFAULT 0,
      net_savings INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
}

function migrateV6(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS moltbook_posts (
      id TEXT PRIMARY KEY,
      title_hash TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      submolt TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_moltbook_posts_content ON moltbook_posts(content_hash);
    CREATE INDEX IF NOT EXISTS idx_moltbook_posts_title ON moltbook_posts(title_hash);
  `);
}

function migrateV4(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed')),
      summary TEXT,
      goal TEXT,
      actions_taken TEXT NOT NULL DEFAULT '[]',
      outcomes TEXT NOT NULL DEFAULT '[]',
      where_left_off TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      metadata TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
  `);

  // Add session_id column to diagnostics table
  const columns = database.prepare("PRAGMA table_info(diagnostics)").all() as Array<{ name: string }>;
  const hasSessionId = columns.some((c) => c.name === "session_id");
  if (!hasSessionId) {
    database.exec("ALTER TABLE diagnostics ADD COLUMN session_id TEXT");
    database.exec("CREATE INDEX IF NOT EXISTS idx_diagnostics_session_id ON diagnostics(session_id)");
  }
}

function migrateV7(database: Database.Database): void {
  // Add pid and last_heartbeat columns to sessions table
  const columns = database.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  const hasPid = columns.some((c) => c.name === "pid");
  if (!hasPid) {
    database.exec("ALTER TABLE sessions ADD COLUMN pid INTEGER");
    database.exec("ALTER TABLE sessions ADD COLUMN last_heartbeat TEXT");
  }

  // Session events — lightweight cross-session awareness
  database.exec(`
    CREATE TABLE IF NOT EXISTS session_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      resource_id TEXT,
      summary TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_events_created ON session_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_session_events_type ON session_events(event_type);
  `);

  // Session claims — advisory locks for conflict avoidance
  database.exec(`
    CREATE TABLE IF NOT EXISTS session_claims (
      resource TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      pid INTEGER,
      claimed_at TEXT NOT NULL,
      description TEXT
    );
  `);
}

const migrations: Array<(database: Database.Database) => void> = [
  migrateV1,
  migrateV2,
  migrateV3,
  migrateV4,
  migrateV5,
  migrateV6,
  migrateV7,
];

function migrate(database: Database.Database): void {
  const currentVersion = getSchemaVersion(database);

  for (let i = currentVersion; i < migrations.length; i++) {
    const txn = database.transaction(() => {
      migrations[i](database);
      setSchemaVersion(database, i + 1);
    });
    txn();
    console.error(`MoltMind: migrated database to schema v${i + 1}`);
  }
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = resolveDbPath();
  const dir = dbPath === PROJECT_DB_PATH ? PROJECT_DIR : GLOBAL_DIR;
  ensureDir(dir);

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 3000");
  migrate(db);

  return db;
}

export function getDbSchemaVersion(): number {
  const database = getDb();
  return getSchemaVersion(database);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
  closeGlobalDb();
}

function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    id: row.id as string,
    type: row.type as MemoryType,
    title: row.title as string,
    content: row.content as string,
    tags: JSON.parse(row.tags as string) as string[],
    metadata: JSON.parse(row.metadata as string) as Record<string, unknown>,
    embedding: (row.embedding as Buffer) ?? null,
    tier: row.tier as MemoryTier,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    accessed_at: row.accessed_at as string,
    access_count: row.access_count as number,
    decay_score: row.decay_score as number,
  };
}

function rowToHandoff(row: Record<string, unknown>): Handoff {
  return {
    id: row.id as string,
    goal: row.goal as string,
    current_state: row.current_state as string,
    next_action: row.next_action as string,
    constraints: JSON.parse(row.constraints as string) as string[],
    known_unknowns: JSON.parse(row.known_unknowns as string) as string[],
    artifacts: JSON.parse(row.artifacts as string) as string[],
    stop_conditions: JSON.parse(row.stop_conditions as string) as string[],
    session_id: row.session_id as string,
    created_at: row.created_at as string,
  };
}

function getMemoryRaw(id: string): Memory | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM memories WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToMemory(row);
}

export function insertMemory(memory: Omit<Memory, "id" | "created_at" | "updated_at" | "accessed_at" | "access_count" | "decay_score"> & Partial<Pick<Memory, "id" | "created_at" | "updated_at" | "accessed_at" | "access_count" | "decay_score">>): Memory {
  const database = getDb();
  const now = new Date().toISOString();
  const id = memory.id ?? crypto.randomUUID();

  const stmt = database.prepare(`
    INSERT INTO memories (id, type, title, content, tags, metadata, embedding, tier, created_at, updated_at, accessed_at, access_count, decay_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    memory.type,
    memory.title,
    memory.content,
    JSON.stringify(memory.tags),
    JSON.stringify(memory.metadata),
    memory.embedding ?? null,
    memory.tier ?? "hot",
    memory.created_at ?? now,
    memory.updated_at ?? now,
    memory.accessed_at ?? now,
    memory.access_count ?? 0,
    memory.decay_score ?? 1.0,
  );

  return getMemoryRaw(id)!;
}

export function getMemory(id: string): Memory | null {
  const database = getDb();
  const exists = database.prepare("SELECT id FROM memories WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!exists) return null;

  // Update accessed_at and access_count, then read the updated row
  database.prepare("UPDATE memories SET accessed_at = ?, access_count = access_count + 1 WHERE id = ?").run(new Date().toISOString(), id);
  const row = database.prepare("SELECT * FROM memories WHERE id = ?").get(id) as Record<string, unknown>;

  return rowToMemory(row);
}

export function updateMemory(id: string, updates: Partial<Pick<Memory, "type" | "title" | "content" | "tags" | "metadata" | "embedding" | "tier" | "decay_score">>): Memory | null {
  const database = getDb();
  const existing = database.prepare("SELECT * FROM memories WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.type !== undefined) { fields.push("type = ?"); values.push(updates.type); }
  if (updates.title !== undefined) { fields.push("title = ?"); values.push(updates.title); }
  if (updates.content !== undefined) { fields.push("content = ?"); values.push(updates.content); }
  if (updates.tags !== undefined) { fields.push("tags = ?"); values.push(JSON.stringify(updates.tags)); }
  if (updates.metadata !== undefined) { fields.push("metadata = ?"); values.push(JSON.stringify(updates.metadata)); }
  if (updates.embedding !== undefined) { fields.push("embedding = ?"); values.push(updates.embedding); }
  if (updates.tier !== undefined) { fields.push("tier = ?"); values.push(updates.tier); }
  if (updates.decay_score !== undefined) { fields.push("decay_score = ?"); values.push(updates.decay_score); }

  if (fields.length === 0) return rowToMemory(existing);

  fields.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);

  database.prepare(`UPDATE memories SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  return getMemory(id);
}

export function deleteMemory(id: string): boolean {
  const database = getDb();
  const existing = database.prepare("SELECT id FROM memories WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return false;

  database.prepare("UPDATE memories SET tier = 'archived', updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  return true;
}

export function searchMemoriesFTS(query: string, limit: number = 10): Memory[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT m.* FROM memories m
    JOIN memories_fts fts ON m.rowid = fts.rowid
    WHERE memories_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as Record<string, unknown>[];

  return rows.map(rowToMemory);
}

export function getAllMemories(tier?: MemoryTier, limit: number = 100, includeArchived: boolean = false): Memory[] {
  const database = getDb();

  if (tier) {
    const rows = database.prepare("SELECT * FROM memories WHERE tier = ? ORDER BY updated_at DESC LIMIT ?").all(tier, limit) as Record<string, unknown>[];
    return rows.map(rowToMemory);
  }

  if (includeArchived) {
    const rows = database.prepare("SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?").all(limit) as Record<string, unknown>[];
    return rows.map(rowToMemory);
  }

  const rows = database.prepare("SELECT * FROM memories WHERE tier != 'archived' ORDER BY updated_at DESC LIMIT ?").all(limit) as Record<string, unknown>[];
  return rows.map(rowToMemory);
}

export function getMemoryStats(): { total: number; by_type: Record<string, number>; by_tier: Record<string, number> } {
  const database = getDb();

  const total = (database.prepare("SELECT COUNT(*) as count FROM memories").get() as { count: number }).count;

  const typeRows = database.prepare("SELECT type, COUNT(*) as count FROM memories GROUP BY type").all() as { type: string; count: number }[];
  const by_type: Record<string, number> = {};
  for (const row of typeRows) {
    by_type[row.type] = row.count;
  }

  const tierRows = database.prepare("SELECT tier, COUNT(*) as count FROM memories GROUP BY tier").all() as { tier: string; count: number }[];
  const by_tier: Record<string, number> = {};
  for (const row of tierRows) {
    by_tier[row.tier] = row.count;
  }

  return { total, by_type, by_tier };
}

export function insertHandoff(handoff: Omit<Handoff, "id" | "created_at"> & Partial<Pick<Handoff, "id" | "created_at">>): Handoff {
  const database = getDb();
  const now = new Date().toISOString();
  const id = handoff.id ?? crypto.randomUUID();

  database.prepare(`
    INSERT INTO handoffs (id, goal, current_state, next_action, constraints, known_unknowns, artifacts, stop_conditions, session_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    handoff.goal,
    handoff.current_state,
    handoff.next_action,
    JSON.stringify(handoff.constraints),
    JSON.stringify(handoff.known_unknowns),
    JSON.stringify(handoff.artifacts),
    JSON.stringify(handoff.stop_conditions),
    handoff.session_id,
    handoff.created_at ?? now,
  );

  return getLatestHandoff()!;
}

export function getLatestHandoff(): Handoff | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM handoffs ORDER BY created_at DESC LIMIT 1").get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToHandoff(row);
}

// --- Diagnostics ---

export function insertDiagnostic(
  toolName: string,
  success: boolean,
  latencyMs: number,
  errorMessage: string | null,
  sessionId: string | null = null
): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO diagnostics (id, tool_name, success, latency_ms, error_message, session_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    toolName,
    success ? 1 : 0,
    latencyMs,
    errorMessage,
    sessionId,
    new Date().toISOString(),
  );
}

export function getDiagnosticsSummary(): Array<{
  tool_name: string;
  calls: number;
  errors: number;
  avg_latency_ms: number;
}> {
  const database = getDb();
  return database.prepare(`
    SELECT
      tool_name,
      COUNT(*) as calls,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as errors,
      AVG(latency_ms) as avg_latency_ms
    FROM diagnostics
    GROUP BY tool_name
    ORDER BY calls DESC
  `).all() as Array<{ tool_name: string; calls: number; errors: number; avg_latency_ms: number }>;
}

export function getRecentDiagnostics(limit: number = 20): Array<{
  id: string;
  tool_name: string;
  success: number;
  latency_ms: number;
  error_message: string | null;
  created_at: string;
}> {
  const database = getDb();
  return database.prepare(
    "SELECT * FROM diagnostics ORDER BY created_at DESC LIMIT ?"
  ).all(limit) as Array<{
    id: string;
    tool_name: string;
    success: number;
    latency_ms: number;
    error_message: string | null;
    created_at: string;
  }>;
}

export function getHealthScoreFromDb(): number {
  const database = getDb();
  const rows = database.prepare(
    "SELECT success FROM diagnostics ORDER BY created_at DESC LIMIT 100"
  ).all() as Array<{ success: number }>;

  if (rows.length === 0) return 1.0;

  const successes = rows.filter((r) => r.success === 1).length;
  return successes / rows.length;
}

// --- Feedback ---

export function insertFeedback(
  type: "bug" | "feature_request" | "friction",
  message: string,
  toolName: string | null = null
): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO feedback (id, type, message, tool_name, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    type,
    message,
    toolName,
    new Date().toISOString(),
  );
}

export function getRecentFeedback(limit: number = 10): Array<{
  id: string;
  type: string;
  message: string;
  tool_name: string | null;
  created_at: string;
}> {
  const database = getDb();
  return database.prepare(
    "SELECT * FROM feedback ORDER BY created_at DESC LIMIT ?"
  ).all(limit) as Array<{
    id: string;
    type: string;
    message: string;
    tool_name: string | null;
    created_at: string;
  }>;
}

// --- Metrics key/value ---

export function getMetric(key: string): string | null {
  const database = getDb();
  const row = database.prepare("SELECT value FROM metrics WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setMetric(key: string, value: string): void {
  const database = getDb();
  database.prepare(
    "INSERT OR REPLACE INTO metrics (key, value, updated_at) VALUES (?, ?, ?)"
  ).run(key, value, new Date().toISOString());
}

// --- Global DB for moltbook auth (always uses ~/.moltmind/memory.db) ---

let globalDb: Database.Database | null = null;

export function getGlobalDb(): Database.Database {
  if (globalDb) return globalDb;

  ensureDir(GLOBAL_DIR);
  globalDb = new Database(GLOBAL_DB_PATH);
  globalDb.pragma("journal_mode = WAL");
  globalDb.pragma("busy_timeout = 3000");
  migrate(globalDb);

  return globalDb;
}

export function closeGlobalDb(): void {
  if (globalDb) {
    globalDb.close();
    globalDb = null;
  }
}

export function getMoltbookAuth(key: string): string | null {
  const database = getGlobalDb();
  const row = database.prepare("SELECT value FROM moltbook_auth WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setMoltbookAuth(key: string, value: string): void {
  const database = getGlobalDb();
  database.prepare(
    "INSERT OR REPLACE INTO moltbook_auth (key, value, updated_at) VALUES (?, ?, ?)"
  ).run(key, value, new Date().toISOString());
}

export function deleteMoltbookAuth(key: string): void {
  const database = getGlobalDb();
  database.prepare("DELETE FROM moltbook_auth WHERE key = ?").run(key);
}

// --- Sessions ---

function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    status: row.status as SessionStatus,
    summary: (row.summary as string) ?? null,
    goal: (row.goal as string) ?? null,
    actions_taken: JSON.parse(row.actions_taken as string) as string[],
    outcomes: JSON.parse(row.outcomes as string) as string[],
    where_left_off: (row.where_left_off as string) ?? null,
    started_at: row.started_at as string,
    ended_at: (row.ended_at as string) ?? null,
    metadata: JSON.parse(row.metadata as string) as Record<string, unknown>,
    pid: (row.pid as number) ?? null,
    last_heartbeat: (row.last_heartbeat as string) ?? null,
  };
}

export function insertSession(id: string): Session {
  const database = getDb();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO sessions (id, status, started_at)
    VALUES (?, 'active', ?)
  `).run(id, now);

  const row = database.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Record<string, unknown>;
  return rowToSession(row);
}

export function getSession(id: string): Session | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToSession(row);
}

export function getActiveSession(): Session | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1").get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToSession(row);
}

export function updateSession(id: string, updates: {
  status?: SessionStatus;
  summary?: string;
  goal?: string;
  actions_taken?: string[];
  outcomes?: string[];
  where_left_off?: string;
  metadata?: Record<string, unknown>;
}): Session | null {
  const database = getDb();
  const existing = database.prepare("SELECT id FROM sessions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!existing) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
  if (updates.summary !== undefined) { fields.push("summary = ?"); values.push(updates.summary); }
  if (updates.goal !== undefined) { fields.push("goal = ?"); values.push(updates.goal); }
  if (updates.actions_taken !== undefined) { fields.push("actions_taken = ?"); values.push(JSON.stringify(updates.actions_taken)); }
  if (updates.outcomes !== undefined) { fields.push("outcomes = ?"); values.push(JSON.stringify(updates.outcomes)); }
  if (updates.where_left_off !== undefined) { fields.push("where_left_off = ?"); values.push(updates.where_left_off); }
  if (updates.metadata !== undefined) { fields.push("metadata = ?"); values.push(JSON.stringify(updates.metadata)); }

  if (updates.status === "paused" || updates.status === "completed") {
    fields.push("ended_at = ?");
    values.push(new Date().toISOString());
  }

  if (fields.length === 0) return getSession(id);

  values.push(id);
  database.prepare(`UPDATE sessions SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  return getSession(id);
}

export function listSessions(options: {
  status?: SessionStatus;
  limit?: number;
  since?: string;
}): Session[] {
  const database = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (options.status) {
    conditions.push("status = ?");
    values.push(options.status);
  }
  if (options.since) {
    conditions.push("started_at >= ?");
    values.push(options.since);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options.limit ?? 10;
  values.push(limit);

  const rows = database.prepare(
    `SELECT * FROM sessions ${where} ORDER BY started_at DESC LIMIT ?`
  ).all(...values) as Record<string, unknown>[];

  return rows.map(rowToSession);
}

export function getSessionDiagnostics(sessionId: string): {
  total_calls: number;
  errors: number;
  by_tool: Record<string, { calls: number; errors: number }>;
} {
  const database = getDb();
  const rows = database.prepare(
    "SELECT tool_name, success FROM diagnostics WHERE session_id = ?"
  ).all(sessionId) as Array<{ tool_name: string; success: number }>;

  const byTool: Record<string, { calls: number; errors: number }> = {};
  let totalCalls = 0;
  let errors = 0;

  for (const row of rows) {
    totalCalls++;
    if (!row.success) errors++;
    if (!byTool[row.tool_name]) byTool[row.tool_name] = { calls: 0, errors: 0 };
    byTool[row.tool_name].calls++;
    if (!row.success) byTool[row.tool_name].errors++;
  }

  return { total_calls: totalCalls, errors, by_tool: byTool };
}

export function getDailyStoreCount(): number {
  const database = getDb();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const row = database.prepare(
    "SELECT COUNT(*) as count FROM memories WHERE created_at >= ? AND tier != 'archived'"
  ).get(today + "T00:00:00.000Z") as { count: number };
  return row.count;
}

export function initProjectVault(activeSessionId?: string | null): string {
  ensureDir(PROJECT_DIR);

  // Close existing connection and reopen with project DB
  closeDb();
  db = new Database(PROJECT_DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 3000");
  migrate(db);

  // Carry over the active session so mm_session_save still works
  if (activeSessionId) {
    const existing = db.prepare("SELECT id FROM sessions WHERE id = ?").get(activeSessionId) as Record<string, unknown> | undefined;
    if (!existing) {
      db.prepare("INSERT INTO sessions (id, status, started_at) VALUES (?, 'active', ?)").run(activeSessionId, new Date().toISOString());
    }
  }

  return PROJECT_DB_PATH;
}

// --- Session Heartbeat & Coordination ---

export function updateSessionHeartbeat(id: string, pid: number): void {
  const database = getDb();
  database.prepare(
    "UPDATE sessions SET pid = ?, last_heartbeat = ? WHERE id = ?"
  ).run(pid, new Date().toISOString(), id);
}

export function markStaleSessions(staleCutoffMs: number = 60000): number {
  const database = getDb();
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - staleCutoffMs).toISOString();

  // Mark sessions with stale heartbeats
  const staleHeartbeat = database.prepare(
    "UPDATE sessions SET status = 'paused', ended_at = ? WHERE status = 'active' AND last_heartbeat IS NOT NULL AND last_heartbeat < ?"
  ).run(now, cutoff);

  // Mark sessions with no heartbeat and no PID (pre-v7 leftovers or orphaned sessions)
  const nullHeartbeat = database.prepare(
    "UPDATE sessions SET status = 'paused', ended_at = ? WHERE status = 'active' AND last_heartbeat IS NULL AND pid IS NULL"
  ).run(now);

  const totalChanges = staleHeartbeat.changes + nullHeartbeat.changes;

  // Release claims held by newly paused stale sessions
  if (totalChanges > 0) {
    database.prepare(
      "DELETE FROM session_claims WHERE session_id IN (SELECT id FROM sessions WHERE status = 'paused' AND ((last_heartbeat IS NOT NULL AND last_heartbeat < ?) OR (last_heartbeat IS NULL AND pid IS NULL)))"
    ).run(cutoff);
  }

  return totalChanges;
}

export function getActiveSessions(): Session[] {
  const database = getDb();
  const rows = database.prepare(
    "SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC"
  ).all() as Record<string, unknown>[];
  return rows.map(rowToSession);
}

// --- Session Events ---

export function logSessionEvent(
  sessionId: string,
  eventType: string,
  resourceId: string | null = null,
  summary: string | null = null
): void {
  const database = getDb();
  database.prepare(
    "INSERT INTO session_events (id, session_id, event_type, resource_id, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), sessionId, eventType, resourceId, summary, new Date().toISOString());
}

export function getSessionEvents(sessionId: string, limit: number = 50): SessionEvent[] {
  const database = getDb();
  const rows = database.prepare(
    "SELECT * FROM session_events WHERE session_id = ? ORDER BY created_at ASC LIMIT ?"
  ).all(sessionId, limit) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: row.id as string,
    session_id: row.session_id as string,
    event_type: row.event_type as string,
    resource_id: (row.resource_id as string) ?? null,
    summary: (row.summary as string) ?? null,
    created_at: row.created_at as string,
  }));
}

export function getRecentEvents(sinceIso: string, limit: number = 50): SessionEvent[] {
  const database = getDb();
  const rows = database.prepare(
    "SELECT * FROM session_events WHERE created_at > ? ORDER BY created_at DESC LIMIT ?"
  ).all(sinceIso, limit) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: row.id as string,
    session_id: row.session_id as string,
    event_type: row.event_type as string,
    resource_id: (row.resource_id as string) ?? null,
    summary: (row.summary as string) ?? null,
    created_at: row.created_at as string,
  }));
}

// --- Session Claims (Advisory Locks) ---

export function claimResource(
  sessionId: string,
  resource: string,
  pid: number,
  description: string | null = null
): { success: boolean; held_by?: string } {
  const database = getDb();

  // Check if already claimed by a different active session with fresh heartbeat
  const existing = database.prepare(
    "SELECT sc.session_id, sc.pid FROM session_claims sc JOIN sessions s ON sc.session_id = s.id WHERE sc.resource = ? AND s.status = 'active'"
  ).get(resource) as { session_id: string; pid: number } | undefined;

  if (existing && existing.session_id !== sessionId) {
    return { success: false, held_by: existing.session_id };
  }

  database.prepare(
    "INSERT OR REPLACE INTO session_claims (resource, session_id, pid, claimed_at, description) VALUES (?, ?, ?, ?, ?)"
  ).run(resource, sessionId, pid, new Date().toISOString(), description);

  return { success: true };
}

export function releaseResource(sessionId: string, resource: string): boolean {
  const database = getDb();
  const result = database.prepare(
    "DELETE FROM session_claims WHERE session_id = ? AND resource = ?"
  ).run(sessionId, resource);
  return result.changes > 0;
}

export function releaseAllClaims(sessionId: string): number {
  const database = getDb();
  const result = database.prepare(
    "DELETE FROM session_claims WHERE session_id = ?"
  ).run(sessionId);
  return result.changes;
}

export function getActiveClaims(): SessionClaim[] {
  const database = getDb();
  const rows = database.prepare(
    "SELECT sc.* FROM session_claims sc JOIN sessions s ON sc.session_id = s.id WHERE s.status = 'active'"
  ).all() as Record<string, unknown>[];
  return rows.map((row) => ({
    resource: row.resource as string,
    session_id: row.session_id as string,
    pid: row.pid as number,
    claimed_at: row.claimed_at as string,
    description: (row.description as string) ?? null,
  }));
}

// --- Moltbook post dedup ---

function hashString(input: string): string {
  return crypto.createHash("sha256").update(input.trim().toLowerCase()).digest("hex");
}

export function isDuplicatePost(titleHash: string, contentHash: string, submolt: string | null): boolean {
  const database = getGlobalDb();
  const row = database.prepare(
    "SELECT id FROM moltbook_posts WHERE (title_hash = ? OR content_hash = ?) AND (submolt IS ? OR submolt = ?)"
  ).get(titleHash, contentHash, submolt, submolt) as Record<string, unknown> | undefined;
  return !!row;
}

export function recordPost(id: string, title: string, content: string, submolt: string | null): void {
  const database = getGlobalDb();
  database.prepare(
    "INSERT OR IGNORE INTO moltbook_posts (id, title_hash, content_hash, submolt, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, hashString(title), hashString(content), submolt, new Date().toISOString());
}

export function hashPostTitle(title: string): string {
  return hashString(title);
}

export function hashPostContent(content: string): string {
  return hashString(content);
}

export function clearMoltbookPosts(): void {
  const database = getGlobalDb();
  database.prepare("DELETE FROM moltbook_posts").run();
}
