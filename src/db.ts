import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import crypto from "node:crypto";
import type { Memory, MemoryType, MemoryTier, Handoff } from "./types.js";

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

const migrations: Array<(database: Database.Database) => void> = [
  migrateV1,
  // migrateV2 will be added in Phase 5
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

export function initProjectVault(): string {
  ensureDir(PROJECT_DIR);

  // Close existing connection and reopen with project DB
  closeDb();
  db = new Database(PROJECT_DB_PATH);
  db.pragma("journal_mode = WAL");
  migrate(db);

  return PROJECT_DB_PATH;
}
