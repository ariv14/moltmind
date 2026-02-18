# MoltMind — Agent Memory MCP Server

## Project Overview

MoltMind is a TypeScript MCP (Model Context Protocol) server that provides persistent semantic memory and session continuity for AI agents. Agents install it via `npx -y moltmind` and get 14 core tools (21 with `--moltbook`) for storing, recalling, diagnosing, session tracking, and handing off context across sessions. It runs 100% locally — no API keys, no cloud, no accounts needed for the free tier.

See @README.md for user-facing documentation and @package.json for available scripts.

## Tech Stack

- **Language:** TypeScript (strict mode, ES2022 target, NodeNext module resolution)
- **Module system:** ES Modules only — use `import/export`, never `require()`
- **MCP SDK:** `@modelcontextprotocol/sdk` (v1.26+) — STDIO transport for local, Streamable HTTP for remote
- **Database:** `better-sqlite3` — synchronous, zero-config, embedded
- **Embeddings:** `@xenova/transformers` with `Xenova/all-MiniLM-L6-v2` model (384 dimensions, ~22MB, runs locally)
- **Runtime:** Node.js 18+
- **Package manager:** npm
- **Testing:** Node.js built-in `node:test` and `node:assert` — no external test frameworks
- **CI:** GitHub Actions (lint + test on every push/PR)

## Critical Rules

### STDIO Safety

- **NEVER use `console.log()` anywhere in the codebase.** STDIO MCP servers communicate over stdout. Any `console.log` corrupts the JSON-RPC protocol and breaks the server. Use `console.error()` for all debug output.
- Always test after changes by running: `echo '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"},"protocolVersion":"2025-03-26"}}' | node dist/index.js` — if it hangs or prints garbage, something is writing to stdout.

### Error Handling

- **Every MCP tool handler MUST be wrapped in try/catch.** Never let an unhandled exception crash the server process.
- On error, return `{ success: false, message: "<human-readable error>" }` — never expose raw stack traces to agents.
- Use the `withDiagnostics(toolName, handlerFn)` wrapper from `src/diagnostics.ts` on every tool. It handles try/catch, latency measurement, and error logging automatically.
- Top-level `main()` has `.catch()` for startup errors with `process.exit(1)`.
- Register `process.on('SIGINT')` and `process.on('SIGTERM')` handlers in `main()` that call `closeDb()` and `process.exit(0)` to flush SQLite WAL cleanly on shutdown.

### Input Validation

- **All tool inputs MUST be validated with zod schemas** via the MCP SDK's built-in validation before reaching any database function.
- Enforce limits: `content` max 50KB (51200 chars), `title` max 500 chars, `tags` max 20 items each max 100 chars, `metadata` max 10KB when serialized.
- Validate `type` is one of the 5 allowed MemoryType values — never trust raw input.
- Validate `tier` is one of the 4 allowed MemoryTier values.
- `limit` parameters: minimum 1, maximum 500, default 10.
- If validation fails, return `{ success: false, message: "Validation error: <specific field and reason>" }`.

### Code Style

- Use 2-space indentation
- Destructure imports: `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"`
- Use `crypto.randomUUID()` for generating IDs
- All dates stored as ISO 8601 strings: `new Date().toISOString()`
- Prefer `const` over `let`, never use `var`
- All functions that interact with the database should be synchronous (better-sqlite3 is sync)
- All functions that generate embeddings must be `async` (transformers.js is async)
- Type all function parameters and return types explicitly — no implicit `any`

## File Organization
```
src/
├── index.ts          # MCP server setup, tool registration, shutdown handlers. Entry point with shebang.
├── config.ts         # --moltbook flag parsing, isToolEnabled(), getToolMode().
├── db.ts             # SQLite schema, migrations, all database CRUD functions. Singleton pattern.
├── embeddings.ts     # Model loading, embedding generation, cosine similarity, semantic search.
├── license.ts        # RSA license validation, admin keys, heartbeat, free tier limits (20/day, 200 total).
├── vector_store.ts   # VectorStore interface, BruteForceStore, cached singleton (initVectorStore/getVectorStore).
├── vector_store_zvec.ts # ZvecStore wrapping @moltmind/zvec-native, migration helper.
├── diagnostics.ts    # withDiagnostics() wrapper, health score, diagnostics table, feedback table, token tracking.
├── metrics.ts        # Adoption metrics: instance_id, session lifecycle, tool usage counters, getFullMetrics().
├── token_estimator.ts # Token cost estimation heuristics and savings tracking.
├── types.ts          # Shared TypeScript interfaces and types.
└── tools/            # One file per MCP tool. Each exports a handler function.
    ├── mm_store.ts
    ├── mm_recall.ts
    ├── mm_read.ts
    ├── mm_update.ts
    ├── mm_delete.ts
    ├── mm_status.ts
    ├── mm_init.ts
    ├── mm_handoff_create.ts
    ├── mm_handoff_load.ts
    ├── mm_session_save.ts
    ├── mm_session_resume.ts
    ├── mm_session_history.ts
    ├── mm_feedback.ts
    └── mm_metrics.ts
scripts/
└── generate-license.ts  # RSA key generator (NOT published to npm). Signs instance_id with --admin flag support.
worker/                   # Cloudflare Worker for license checkout, webhook, heartbeat (NOT published to npm).
├── src/index.ts         # All routes: /checkout, /api/webhook/polar, /api/license/:token, /api/heartbeat
├── wrangler.toml        # Config + KV bindings + route patterns
├── tsconfig.json
└── package.json
release_instructions.md   # Full release checklist — when to publish, version bumping, post-release verification.
tests/
├── db.test.ts
├── embeddings.test.ts
├── diagnostics.test.ts
├── metrics.test.ts
├── token_estimator.test.ts
├── license.test.ts
├── vector_store.test.ts
├── tools.test.ts
└── moltbook.test.ts
.github/
└── workflows/
    └── ci.yml        # Lint + test on push/PR to main
```

## MCP Tools (14 core + 7 moltbook opt-in)

| Tool | Purpose |
|------|---------|
| `mm_store` | Store a new memory with auto-embedding and type classification. Enforces free tier limits (20/day, 200 total). |
| `mm_recall` | Hybrid search: semantic (0.7 weight) + FTS5 keyword (0.3 weight) |
| `mm_read` | Read a single memory by ID (updates accessed_at and access_count) |
| `mm_update` | Update specific fields of an existing memory |
| `mm_delete` | Soft-delete a memory (sets tier to 'archived') |
| `mm_status` | Server health: DB stats, embedding model status, health score, uptime, tier (free/pro), usage, active sessions, claims, recent events |
| `mm_init` | Create a project-local vault in `.moltmind/` of current directory |
| `mm_handoff_create` | Create a structured handoff document for agent-to-agent transitions. Optional `claims` param for advisory resource locks |
| `mm_handoff_load` | Load the most recent handoff to resume context |
| `mm_session_save` | Save session summary, actions, outcomes, and where we left off. Marks session paused or completed. Auto-releases claims |
| `mm_session_resume` | Load recent sessions + latest handoff + concurrent session count + recent cross-session activity |
| `mm_session_history` | List past sessions with filtering (status, date range, limit) and per-session tool call stats |
| `mm_feedback` | Submit feedback (bug, feature_request, friction) about a specific tool |
| `mm_metrics` | View real-time adoption metrics: sessions, tool usage, error rates, token savings |

## Database Conventions

### Schema & Paths

- Global vault location: `~/.moltmind/memory.db`
- Project vault location: `./.moltmind/memory.db` (created by `mm_init`)
- Always create parent directories with `mkdirSync(path, { recursive: true })` before opening DB
- Use `WAL` journal mode for better concurrent read performance
- Set `busy_timeout = 3000` (3s) on every DB connection — required for multi-session coordination where multiple MCP server processes share the same SQLite file
- Use parameterized queries — never interpolate values into SQL strings

### Migrations

- `src/db.ts` must track a `schema_version` in a `meta` table: `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`
- On database open, read current `schema_version` (default '0' if table doesn't exist)
- Run migrations sequentially: `migrate_v1()`, `migrate_v2()`, etc. — each wrapped in a transaction
- Every migration bumps `schema_version` after success
- v1 = memories, handoffs, memories_fts with triggers
- v2 = diagnostics + feedback + metrics tables
- v3 = moltbook_auth table
- v4 = sessions table + session_id column on diagnostics
- v5 = token_estimates table
- v6 = moltbook_posts table (duplicate post tracking for moltbook)
- v7 = pid + last_heartbeat columns on sessions, session_events table, session_claims table (multi-session coordination)
- This ensures existing users on older versions don't break when upgrading

### Tables (v7 schema)

**memories** — core memory storage (v1)
**handoffs** — agent-to-agent context transfer (v1)
**memories_fts** — FTS5 virtual table on title+content (v1)
**diagnostics** — tool execution logs with session tracking (v2, updated v4)
```sql
CREATE TABLE IF NOT EXISTS diagnostics (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  success INTEGER NOT NULL,
  latency_ms REAL NOT NULL,
  error_message TEXT,
  session_id TEXT,
  created_at TEXT NOT NULL
);
```
**feedback** — agent-submitted feedback (v2)
```sql
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('bug','feature_request','friction')),
  message TEXT NOT NULL,
  tool_name TEXT,
  created_at TEXT NOT NULL
);
```
**metrics** — adoption counters (v2)
```sql
CREATE TABLE IF NOT EXISTS metrics (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```
**sessions** — session lifecycle tracking (v4, updated v7 with pid/heartbeat)
```sql
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
  metadata TEXT NOT NULL DEFAULT '{}',
  pid INTEGER,           -- process ID for stale detection (v7)
  last_heartbeat TEXT     -- ISO timestamp, updated every 30s (v7)
);
```

**token_estimates** — per-session token cost tracking (v5)
```sql
CREATE TABLE IF NOT EXISTS token_estimates (
  session_id TEXT PRIMARY KEY,
  overhead_tokens INTEGER NOT NULL DEFAULT 0,
  tool_response_tokens INTEGER NOT NULL DEFAULT 0,
  cold_start_avoided INTEGER NOT NULL DEFAULT 0,
  net_savings INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
```

**moltbook_posts** — duplicate post tracking for moltbook (v6)
```sql
CREATE TABLE IF NOT EXISTS moltbook_posts (
  id TEXT PRIMARY KEY,
  title_hash TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  submolt TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moltbook_posts_content ON moltbook_posts(content_hash);
CREATE INDEX IF NOT EXISTS idx_moltbook_posts_title ON moltbook_posts(title_hash);
```

**session_events** — cross-session awareness event log (v7)
```sql
CREATE TABLE IF NOT EXISTS session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- 'memory_stored', 'memory_updated', 'memory_archived', 'handoff_created', 'claim', 'release'
  resource_id TEXT,          -- memory ID, handoff ID, or file path
  summary TEXT,              -- human-readable description
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_events_created ON session_events(created_at);
CREATE INDEX IF NOT EXISTS idx_session_events_type ON session_events(event_type);
```

**session_claims** — advisory locks for conflict avoidance (v7)
```sql
CREATE TABLE IF NOT EXISTS session_claims (
  resource TEXT PRIMARY KEY,   -- what's being claimed (file path, "task:xyz", etc.)
  session_id TEXT NOT NULL,    -- who holds the claim
  pid INTEGER,                 -- for stale claim detection
  claimed_at TEXT NOT NULL,
  description TEXT             -- what the session is doing with it
);
```

### Query Behavior

- `getAllMemories()` MUST exclude `tier = 'archived'` by default. Add an `includeArchived` boolean parameter to override.
- `getMemory()` updates `accessed_at` and increments `access_count` — be aware this is a side-effect read. `insertMemory()` should NOT call `getMemory()` to retrieve the row; use a direct SELECT without the side-effect increment instead.
- `deleteMemory()` is soft-delete only (sets tier to 'archived'). No hard-delete exposed to tools.

## Embedding Engine Conventions

- Model is downloaded on first use to `~/.moltmind/models/`
- Show download progress via `console.error` (never stdout)
- Embeddings are stored as `Buffer` from `Float32Array` in SQLite BLOB columns
- Always normalize embeddings before cosine similarity (the model already does this, but verify)
- Hybrid search: weight semantic results at 0.7 and FTS5 keyword results at 0.3
- **Fallback behavior:** If embedding model fails to load or download times out (30s), degrade gracefully to FTS5-only search. Log warning via `console.error`. Never crash.
- **Model loading is lazy:** Don't import/load model at startup. Load on first `embed()` call. Cache the pipeline instance for subsequent calls.

## Diagnostics & Metrics Conventions

### withDiagnostics wrapper (src/diagnostics.ts)

- Every tool handler in `src/index.ts` MUST use this wrapper. No exceptions.
- After each tool call, `withDiagnostics` logs diagnostics AND calls `trackTokens()` to estimate response tokens and update the `token_estimates` table for the current session.
- `trackTokens()` marks `mm_session_resume` and `mm_handoff_load` calls as cold-start avoidances.
- `logDiagnostic()` inserts into the `diagnostics` table — never log memory content, only tool name, success/fail, latency, and error message.
- `getHealthScore()` returns 0.0-1.0 based on success rate in the last 100 operations.

### Adoption Metrics (src/metrics.ts)

- Generate a persistent `instance_id` (UUID) stored in `~/.moltmind/instance_id`. Created once, never changes.
- Track in the `metrics` table: `total_sessions`, `total_tool_calls`, `tool_calls_by_name` (JSON), `first_seen`, `last_seen`, `errors_by_tool` (JSON).
- Increment `total_sessions` on server startup (in `main()`).
- Increment `total_tool_calls` and `tool_calls_by_name[toolName]` inside `withDiagnostics`.
- All metrics are LOCAL ONLY in free tier — nothing leaves the machine.
- `mm_metrics` tool returns a formatted dashboard of all adoption data.

### Tool Mode & CLI Flags (src/config.ts)

- By default, only 14 core `mm_*` tools are registered (~500 tokens overhead).
- With `--moltbook` flag, 7 additional `mb_*` social tools are registered (~1,000 tokens total overhead).
- With `--upgrade` flag, opens Polar checkout in browser, polls for license key, writes `~/.moltmind/license.key` on success, then exits (does not start MCP server).
- `isMoltbookEnabled()` reads `process.argv` once and caches the result.
- `isToolEnabled(toolName)` returns `false` for `mb_*` tools unless `--moltbook` is set.
- In `src/index.ts`, moltbook tool imports are dynamic (`await import(...)`) inside `registerMoltbookTools()` — only loaded when `--moltbook` is passed.

### Token Cost Estimation (src/token_estimator.ts)

- Heuristic: ~4 characters per token for JSON responses.
- Tool overhead: ~500 tokens (default) or ~1,000 tokens (with `--moltbook`).
- Cold-start avoidance: each `mm_session_resume`/`mm_handoff_load` saves ~7,675 tokens vs re-exploring from scratch (~8,000 token cold start vs ~325 token resume).
- `upsertTokenEstimate()` accumulates response tokens and cold-start avoidances per session in the `token_estimates` table.
- `getAggregateTokenSavings()` returns a `TokenSavingsReport` with sessions tracked, overhead, response tokens, cold starts avoided, net savings, and savings percent.
- `mm_metrics` includes a `token_savings` section in its dashboard output.

### Session Lifecycle (src/metrics.ts)

- **Startup:** `initMetrics()` auto-creates an "active" session in the `sessions` table, stores the session ID in `currentSessionId`, registers the PID and initial heartbeat via `updateSessionHeartbeat()`, and runs `markStaleSessions()` to clean up crashed processes.
- **Heartbeat:** A 30s `setInterval` in `main()` calls `heartbeat()` which updates `last_heartbeat` on the current session and marks stale sessions (heartbeat >60s old) as paused. Cleared in `shutdown()`.
- **During session:** `withDiagnostics()` reads `getCurrentSessionId()` and passes it to `insertDiagnostic()` so all tool calls are tagged with the session.
- **Shutdown:** `shutdown()` clears the heartbeat interval, releases all claims via `releaseAllClaims()`, calls `pauseCurrentSession()` which marks the active session as "paused" with an `ended_at` timestamp before closing the DB.
- **Handoff linking:** `mm_handoff_create` uses `getCurrentSessionId()` instead of a random UUID, linking handoffs to the session that created them.
- **Session save:** Agents can call `mm_session_save` to attach summary, actions_taken, outcomes, and where_left_off to the current session. Auto-releases claims on pause/completed.
- **Session resume:** `mm_session_resume` loads recent sessions + latest handoff + concurrent session count + recent cross-session activity so agents can restore context after a restart.
- **Session history:** `mm_session_history` lists past sessions with per-session tool call stats from the diagnostics table.

### Multi-Session Coordination

Multiple MCP server processes can run concurrently on the same machine (e.g., multiple Claude Code windows on the same project). Coordination is handled via shared SQLite tables with zero background overhead beyond the 30s heartbeat.

#### Instance ID (Atomic Write)

- `getOrCreateInstanceId()` in `src/metrics.ts` writes to a temp file then uses `renameSync()` for atomic creation — prevents TOCTOU race when multiple processes start simultaneously.

#### Session Heartbeat & Stale Detection

- `updateSessionHeartbeat(id, pid)` — sets `last_heartbeat` + `pid` on the sessions row.
- `markStaleSessions(staleCutoffMs=60000)` — pauses active sessions with heartbeat >60s old and releases their claims.
- `getActiveSessions()` — returns all sessions with status='active'.
- `heartbeat()` — convenience function called every 30s, updates heartbeat and runs stale cleanup.

#### Session Events (Cross-Session Awareness)

- `logSessionEvent(sessionId, eventType, resourceId?, summary?)` — inserts into `session_events`.
- `getRecentEvents(sinceIso, limit?)` — returns events after a timestamp.
- `getSessionEvents(sessionId, limit?)` — returns events for a specific session in chronological order (ASC).
- **Auto-logging:** Every tool call is automatically logged as a session event by `wrapTool()` in `src/index.ts`. The `TOOL_SUMMARIZERS` map generates human-readable summaries for each tool. Failed calls get `[FAILED]` appended to the summary.
- Tool handlers do NOT manually call `logSessionEvent()` — `wrapTool()` handles it centrally. The only exception is claim-specific events in `mm_handoff_create` (one handoff can claim multiple resources).
- Event types by tool:
  - `mm_store` → `memory_stored` (with memory title)
  - `mm_update` → `memory_updated`
  - `mm_delete` → `memory_archived`
  - `mm_handoff_create` → `handoff_created` (auto-logged) + `claim`/`release` (manual, per resource)
  - All other tools → `tool_call`
- Surfaced in `mm_status` (last 5 min) and `mm_session_resume` (last 10 min + per-session `activity_log`).

#### Session Resume Activity Log

- `mm_session_resume` includes an `activity_log` field on each session summary.
- `activity_log` is an array of `{ event_type, summary, created_at }` from `getSessionEvents()`.
- Provides a complete chronological record of what happened in each session — enables automatic session restore with zero agent action.

#### Advisory Claims (Conflict Avoidance)

- `claimResource(sessionId, resource, pid, description?)` — INSERT OR REPLACE into `session_claims`. If resource is already claimed by a different active session, returns `{ success: false, held_by: sessionId }`.
- `releaseResource(sessionId, resource)` — removes a specific claim.
- `releaseAllClaims(sessionId)` — removes all claims for a session. Called on shutdown, session pause/complete, and stale cleanup.
- `getActiveClaims()` — returns claims held by active sessions. Surfaced in `mm_status`.
- **Semantics:** Advisory only — doesn't block writes. Agents check claims before acting and respect them voluntarily. Stale claims from crashed sessions are auto-released by `markStaleSessions()`.
- **Usage:** Pass `claims: ["src/db.ts", "task:refactor"]` to `mm_handoff_create` to claim resources this session is working on.

### License System (src/license.ts)

- **RSA-signed, machine-locked licenses.** The public key is embedded in `src/license.ts`; the private key stays at `~/.moltmind/license-private.pem` (never published).
- License key format: `MMPRO-{instance_id_prefix_8chars}-{base64url-RSA-signature}`
- Admin key format: `MMADMIN-{instance_id_prefix_8chars}-{base64url-RSA-signature}` (same RSA signing, different prefix)
- `validateLicense()` checks `~/.moltmind/admin.key` FIRST, then `~/.moltmind/license.key`. Returns `{ valid, admin, message }`.
- `_resetLicenseCache()` exported for testing — resets the cached validation result.
- `isProTier()` returns `true` if any license (admin or pro) is valid.
- `isAdminTier()` returns `true` only for admin licenses — used to bypass heartbeat.
- `checkStoreLimits()` returns `{ allowed, message }` — checks Pro tier first, then total memories (200 cap), then daily stores (20 cap).

### Admin License

- File: `~/.moltmind/admin.key` (separate from `license.key`)
- Generated via `scripts/generate-license.ts --admin <instance_id>`
- Admin licenses **skip heartbeat entirely** — no network check, never expires
- NOT published, NOT documented publicly — developer only
- `admin.key` is excluded from npm tarball by `"files"` in package.json

### Heartbeat (One-Machine Enforcement)

- `checkHeartbeat()` in `src/license.ts` — called on every startup, non-blocking
- Admin tier → skip entirely (return immediately)
- Not Pro → skip
- Throttled to once per 24 hours (reads `~/.moltmind/last_heartbeat` timestamp)
- POST to `https://aidigitalcrew.com/api/heartbeat` with `{ instance_id, license_prefix }` (5s timeout)
- `{ valid: true }` → write current timestamp to `~/.moltmind/last_heartbeat`
- `{ valid: false }` → delete `~/.moltmind/license.key`, reset license cache, revert to free tier
- Network error + last heartbeat < 7 days → grace period, stay Pro
- Network error + last heartbeat ≥ 7 days → revert to free tier

### Free Tier Limits

| | Free Tier | Pro Tier |
|--|-----------|----------|
| Memory stores per day | 20 | Unlimited |
| Total memories | 200 | Unlimited |
| Search (`mm_recall`) | Unlimited | Unlimited |
| Session tools | Unlimited | Unlimited |
| Vector search | Brute-force | Zvec ANN (auto) |

- Only `mm_store` is gated. All other tools remain unlimited on free tier.
- `getDailyStoreCount()` in `src/db.ts` counts today's non-archived memories (efficient — free tier maxes at 200).
- Limits are checked at the top of `handleMmStore()` before embedding or inserting.

### VectorStore Abstraction (src/vector_store.ts)

- **`VectorStore` interface:** `upsert(id, vector)`, `search(query, k)`, `delete(id)`.
- **`BruteForceStore`:** Wraps existing `getAllMemories()` + `cosineSimilarity()` loop. `upsert()`/`delete()` are no-ops (SQLite BLOB is the store).
- **Cached singleton:** `initVectorStore(store)` sets the active store at startup. `getVectorStore(tier?)` returns the active store or creates a new `BruteForceStore` per-call.
- **`_resetVectorStore()`** exported for testing.
- **Dual-write strategy:** SQLite BLOB remains source of truth. Zvec is the fast search index. If Zvec is unavailable, search falls back to brute-force using SQLite BLOBs — zero data loss.

### ZvecStore (src/vector_store_zvec.ts)

- Wraps `@moltmind/zvec-native` (optional dependency, not yet published).
- Uses `createRequire(import.meta.url)` for ESM/CJS interop with the napi module.
- Tracks dirty state internally, auto-rebuilds index before search.
- `migrateExistingEmbeddings(store)` — reads all SQLite BLOBs, bulk-inserts into Zvec index. Runs once when `zvec.idx` doesn't exist yet.

### Zvec Auto-Enable

- Zvec ANN is automatically enabled for Pro users at startup — no CLI flag required.
- In `src/index.ts` `main()`, after `initMetrics()`:
  1. If `isProTier()` returns true, dynamically import `ZvecStore`, create/migrate the index, call `initVectorStore()`.
  2. If the native module is unavailable, log fallback and continue with brute-force.

### Moltbook Auto-Login

- When `--moltbook` is enabled, after `registerMoltbookTools()` in `main()`, the server validates any stored API token with `GET /agents/me` (5s timeout).
- On success: logs `Moltbook: authenticated as <name>` to stderr.
- On failure: logs `Moltbook: stored token not currently valid (status <N>), keeping for retry` — does **not** clear the token (it may be temporarily unusable, e.g. post-suspension cooldown).
- Non-blocking: wrapped in try/catch, failure never prevents server startup.
- Token storage uses `getStoredToken()` / `storeToken()` in `src/moltbook_client.ts`, backed by the `moltbook_auth` table in the global DB.

### Moltbook Duplicate Post Guardrails

- `mb_post create` checks for duplicate posts before calling the API, preventing accidental suspension from repeated content.
- **How it works:** SHA-256 hashes of `title.trim().toLowerCase()` and `content.trim().toLowerCase()` are compared against the `moltbook_posts` table. A post is blocked if either its title hash OR content hash matches an existing record in the same submolt.
- **After successful create:** `recordPost()` stores the post ID, title hash, content hash, and submolt in `moltbook_posts` (global DB).
- **Helper functions in `src/db.ts`:** `isDuplicatePost()`, `recordPost()`, `hashPostTitle()`, `hashPostContent()`, `clearMoltbookPosts()` (for tests).
- **On duplicate:** returns `{ success: false, message: "Duplicate post blocked. Similar content was already posted to this submolt." }` — never hits the API.

### --upgrade Flag (Interactive Checkout with Polling)

- When `npx moltmind --upgrade` is run:
  1. Checks if already Pro → exits early if yes
  2. Reads `~/.moltmind/instance_id`, generates a random `activationToken` (UUID)
  3. Opens browser to `https://aidigitalcrew.com/checkout?id={instanceId}&token={activationToken}`
  4. Polls `GET https://aidigitalcrew.com/api/license/{activationToken}` every 3s (5 min timeout)
  5. On success: writes `~/.moltmind/license.key`, prints "Pro activated!", exits
  6. On timeout: prints retry message, exits with code 1
- Cross-platform browser open: `open` (macOS), `start` (Windows), `xdg-open` (Linux)
- Does not start the MCP server

### License Key Generation (scripts/generate-license.ts)

- NOT published to npm (excluded by `"files"` in package.json).
- Reads `~/.moltmind/license-private.pem`, signs the provided `instance_id`.
- Usage: `tsx scripts/generate-license.ts <instance_id>` → outputs `MMPRO-{prefix}-{sig}`
- Usage: `tsx scripts/generate-license.ts --admin <instance_id>` → outputs `MMADMIN-{prefix}-{sig}`
- Admin keys should be saved to `~/.moltmind/admin.key`

### License Server (worker/)

- Cloudflare Worker deployed to `aidigitalcrew.com`
- **NOT published to npm** — separate deployment via `wrangler deploy`
- Routes:
  - `GET /checkout` — redirects to Polar hosted checkout with metadata
  - `POST /api/webhook/polar` — handles payment, signs license, stores in KV
  - `GET /api/license/:activationToken` — CLI polls for license key (24h TTL)
  - `POST /api/heartbeat` — one-machine enforcement check
- KV namespaces: `LICENSES` (24h TTL, checkout flow), `ACTIVE_LICENSES` (permanent, heartbeat)
- Secrets: `RSA_PRIVATE_KEY`, `POLAR_WEBHOOK_SECRET`, `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_ID`
- Checkout creates a Polar session via API (`POST /v1/checkouts/`) with metadata `{ instance_id, activation_token }`
- Webhook uses Standard Webhooks signature verification (HMAC-SHA256, `v1,` prefix, base64)
- Uses Web Crypto API (`crypto.subtle.sign` with RSASSA-PKCS1-v1_5) — must produce signatures compatible with Node.js `crypto.verify` in `src/license.ts`

### Version Strings

- Version is hardcoded in **4 places** — update ALL when bumping:
  1. `package.json` → `"version"`
  2. `src/index.ts` → McpServer constructor `version`
  3. `src/tools/mm_status.ts` → response `version` field
  4. `tests/tools.test.ts` → version assertion
- See @release_instructions.md for the full release checklist and when to publish vs not.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Watch mode with `tsx watch src/index.ts` |
| `npm test` | Run tests with Node's built-in test runner |
| `npm run benchmark` | Run token cost benchmark (no LLM calls) |
| `npm run lint` | Run TypeScript type checking (`tsc --noEmit`) |
| `npm run clean` | Remove `dist/` directory |

## Testing

- Use Node.js built-in `node:test` and `node:assert` — no external test frameworks
- Test files go in `tests/` directory, named `*.test.ts`
- Run a single test: `npx tsx --test tests/db.test.ts`
- Every tool should have at least one happy-path and one error-path test
- For embedding tests, mock the transformer model to avoid downloading 22MB during CI
- Test the `withDiagnostics` wrapper: verify it catches errors and returns `{ success: false }` instead of throwing
- Test input validation: verify that oversized content, invalid types, and missing fields return proper error messages

## CI/CD

- GitHub Actions workflow at `.github/workflows/ci.yml`
- Triggers: push to `main`, pull requests to `main`
- Steps: checkout → setup Node 18 → npm ci → npm run lint → npm test
- Must pass before merging any PR
- For npm releases, follow @release_instructions.md — it covers pre-publish checks, version bumping, and post-release verification

## Git Workflow

- Branch from `main` for features: `feat/tool-name` or `fix/description`
- Commit messages: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:` prefixes
- Run `npm run lint` and `npm test` before committing
- PR descriptions should reference the relevant plan.md phase
- **Before any npm publish**, follow @release_instructions.md — verify the release is necessary, only publish when published files (`dist/`, `README.md`, `LICENSE`) have changed

## Security Considerations

- Database files contain agent memory content which may include sensitive data
- Free tier: all data stays local, no network calls, no telemetry
- Pro/Team tier (future): encrypted at rest with user-provided key before cloud sync
- Never log memory content (titles or bodies) to diagnostics — only metadata
- `.moltmind/` directories should be added to `.gitignore` to prevent accidental commits of memory databases
- **RSA private key** (`~/.moltmind/license-private.pem`) must NEVER be committed, published, or shared. Only the public key is embedded in source.
- **License keys** are machine-locked — a key signed for one `instance_id` won't verify against another machine's `instance_id`

## What NOT to Do

- Do not add express, fastify, or any HTTP framework for the MVP — the MCP SDK handles transport
- Do not use any external API for embeddings — everything runs locally
- Do not store raw embedding model files in the git repo
- Do not add a `.env` file for the core product — it has zero config
- Do not import from `dist/` — always import from `src/` during development
- Do not use `console.log()` — it breaks STDIO MCP transport
- Do not let `insertMemory()` call `getMemory()` (which has side-effect access_count increment) — use a raw SELECT instead
- Do not return archived memories from `getAllMemories()` by default
- Do not expose raw stack traces to agents — always return `{ success: false, message }` format
- Do not hard-delete any data — soft-delete only
- Do not commit or publish `~/.moltmind/license-private.pem` — it is the signing key for Pro licenses
- Do not commit or publish `~/.moltmind/admin.key` — admin licenses bypass heartbeat enforcement
- Do not clear stored moltbook tokens or heartbeat timestamps without explicit reason — they may be in grace period
- Do not add `@moltmind/zvec-native` as a hard dependency — it is an optional dynamic import that auto-enables for Pro users
- Do not bypass free tier limits in `mm_store` — always call `checkStoreLimits()` before insert
- Do not publish to npm when only non-published files changed (CLAUDE.md, tests, scripts, CI) — see @release_instructions.md
- Do not clear stored moltbook tokens on auto-login validation failure — the token may be temporarily unusable (cooldown period). Log and keep for retry.
- Do not remove `busy_timeout` pragma from any DB connection — it is required for multi-session coordination where multiple processes share the same SQLite file
- Do not treat session claims as hard locks — they are advisory only. Never block writes based on claims alone.
- Do not skip `markStaleSessions()` on startup — it cleans up crashed processes and releases their claims
- Do not forget to release claims on session end — `releaseAllClaims()` must be called in shutdown, `pauseCurrentSession()`, and `mm_session_save` with pause/completed status
