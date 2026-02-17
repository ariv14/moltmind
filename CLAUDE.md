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
tests/
├── db.test.ts
├── embeddings.test.ts
├── diagnostics.test.ts
├── metrics.test.ts
├── token_estimator.test.ts
└── tools.test.ts
.github/
└── workflows/
    └── ci.yml        # Lint + test on push/PR to main
```

## MCP Tools (14 core + 7 moltbook opt-in)

| Tool | Purpose |
|------|---------|
| `mm_store` | Store a new memory with auto-embedding and type classification |
| `mm_recall` | Hybrid search: semantic (0.7 weight) + FTS5 keyword (0.3 weight) |
| `mm_read` | Read a single memory by ID (updates accessed_at and access_count) |
| `mm_update` | Update specific fields of an existing memory |
| `mm_delete` | Soft-delete a memory (sets tier to 'archived') |
| `mm_status` | Server health: DB stats, embedding model status, health score, uptime |
| `mm_init` | Create a project-local vault in `.moltmind/` of current directory |
| `mm_handoff_create` | Create a structured handoff document for agent-to-agent transitions |
| `mm_handoff_load` | Load the most recent handoff to resume context |
| `mm_session_save` | Save session summary, actions, outcomes, and where we left off. Marks session paused or completed |
| `mm_session_resume` | Load recent sessions + latest handoff, return formatted summary for context recovery |
| `mm_session_history` | List past sessions with filtering (status, date range, limit) and per-session tool call stats |
| `mm_feedback` | Submit feedback (bug, feature_request, friction) about a specific tool |
| `mm_metrics` | View real-time adoption metrics: sessions, tool usage, error rates, token savings |

## Database Conventions

### Schema & Paths

- Global vault location: `~/.moltmind/memory.db`
- Project vault location: `./.moltmind/memory.db` (created by `mm_init`)
- Always create parent directories with `mkdirSync(path, { recursive: true })` before opening DB
- Use `WAL` journal mode for better concurrent read performance
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
- This ensures existing users on older versions don't break when upgrading

### Tables (v5 schema)

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
**sessions** — session lifecycle tracking (v4)
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
  metadata TEXT NOT NULL DEFAULT '{}'
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

### Tool Mode & --moltbook Flag (src/config.ts)

- By default, only 14 core `mm_*` tools are registered (~500 tokens overhead).
- With `--moltbook` flag, 7 additional `mb_*` social tools are registered (~1,000 tokens total overhead).
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

- **Startup:** `initMetrics()` auto-creates an "active" session in the `sessions` table and stores the session ID in `currentSessionId`.
- **During session:** `withDiagnostics()` reads `getCurrentSessionId()` and passes it to `insertDiagnostic()` so all tool calls are tagged with the session.
- **Shutdown:** `shutdown()` calls `pauseCurrentSession()` which marks the active session as "paused" with an `ended_at` timestamp before closing the DB.
- **Handoff linking:** `mm_handoff_create` uses `getCurrentSessionId()` instead of a random UUID, linking handoffs to the session that created them.
- **Session save:** Agents can call `mm_session_save` to attach summary, actions_taken, outcomes, and where_left_off to the current session.
- **Session resume:** `mm_session_resume` loads recent sessions + latest handoff so agents can restore context after a restart.
- **Session history:** `mm_session_history` lists past sessions with per-session tool call stats from the diagnostics table.

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

## Git Workflow

- Branch from `main` for features: `feat/tool-name` or `fix/description`
- Commit messages: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:` prefixes
- Run `npm run lint` and `npm test` before committing
- PR descriptions should reference the relevant plan.md phase

## Security Considerations

- Database files contain agent memory content which may include sensitive data
- Free tier: all data stays local, no network calls, no telemetry
- Pro/Team tier (future): encrypted at rest with user-provided key before cloud sync
- Never log memory content (titles or bodies) to diagnostics — only metadata
- `.moltmind/` directories should be added to `.gitignore` to prevent accidental commits of memory databases

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
