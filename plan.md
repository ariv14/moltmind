# MoltMind Development Plan

> Persistent semantic memory MCP server for AI agents.
> GitHub: github.com/ariv14/moltmind
> npm: npmjs.com/package/moltmind

---

## Phase 0: Environment Setup ✅

**Goal:** Mac machine ready, GitHub repo connected, Claude Code working.

- [x] **0.1** Install prerequisites (Node.js 18+, npm, Git, Claude Code)
- [x] **0.2** GitHub repo live at github.com/ariv14/moltmind
- [x] **0.3** Initialize Claude Code in the project
- [x] **0.4** npm account ready

**Checkpoint:** ✅ Complete.

---

## Phase 1: Project Scaffold ✅

**Goal:** Empty but runnable MCP server that connects to Claude Code.

- [x] **1.1** package.json with dependencies, bin entry, scripts, engines
- [x] **1.2** tsconfig.json (ES2022, NodeNext, strict)
- [x] **1.3** .gitignore (node_modules, dist, .moltmind, *.db)
- [x] **1.4** src/index.ts — minimal MCP server with mm_status placeholder
- [x] **1.5** Build and STDIO test pass
- [x] **1.6** Connected to Claude Code as local MCP server
- [x] **1.7** Git checkpoint: `feat: minimal MCP server scaffold with mm_status placeholder`

**Checkpoint:** ✅ MCP server builds, connects, responds to mm_status.

---

## Phase 2: Database Layer ✅

**Goal:** SQLite stores and retrieves memories with FTS5 search.

- [x] **2.1** src/types.ts — Memory, MemoryType, MemoryTier, Handoff, SearchResult interfaces
- [x] **2.2** src/db.ts — SQLite with WAL, FTS5, triggers, dual vault resolution (project vs global)
- [x] **2.3** tests/db.test.ts — 19 test scenarios (CRUD, FTS5, handoffs, vault init, edge cases)
- [x] **2.4** Git checkpoint: `feat: SQLite database layer with FTS5 search`

**Checkpoint:** ✅ Database creates, stores, retrieves, searches memories. All tests pass.

---

## Phase 3: Production Hardening

**Goal:** Fix architectural issues from audit before building more features.

- [ ] **3.1** Add database migration system
  - Tell Claude Code:
```
    Refactor src/db.ts to add a migration system. Create a `meta` table with key/value pairs.
    Track schema_version (start at '1' for current schema). Write a migrate() function that
    reads current version and runs sequential migration functions. Wrap each migration in a
    transaction. Current schema = v1 (memories, handoffs, memories_fts + triggers).
    v2 migrations will be added in Phase 5.
```

- [ ] **3.2** Fix insertMemory side-effect
  - Tell Claude Code:
```
    In src/db.ts, insertMemory() currently calls getMemory() to return the inserted row, but
    getMemory() has a side-effect: it increments access_count. Fix this by adding a private
    getMemoryRaw(id) function that does a plain SELECT without updating accessed_at or
    access_count. insertMemory() should call getMemoryRaw(). getMemory() (the public function)
    keeps the side-effect behavior for normal reads. Update tests to expect access_count=0
    on freshly inserted memories.
```

- [ ] **3.3** Fix getAllMemories to exclude archived
  - Tell Claude Code:
```
    In src/db.ts, getAllMemories() should exclude tier='archived' by default. Add an optional
    includeArchived boolean parameter (default false). When false, add WHERE tier != 'archived'.
    Update existing tests and add a new test verifying archived memories are excluded.
```

- [ ] **3.4** Add graceful shutdown
  - Tell Claude Code:
```
    In src/index.ts, inside main(), after server.connect(), add handlers for process.on('SIGINT')
    and process.on('SIGTERM') that call closeDb() from db.ts, log "MoltMind shutting down" to
    console.error, and call process.exit(0). This ensures SQLite WAL flushes cleanly.
```

- [ ] **3.5** Add CI workflow
  - Tell Claude Code:
```
    Create .github/workflows/ci.yml — a GitHub Actions workflow that:
    - Triggers on push to main and pull_request to main
    - Runs on ubuntu-latest
    - Steps: checkout, setup Node 18, npm ci, npm run lint, npm test
    Keep it minimal.
```

- [ ] **3.6** Update tests for all hardening changes
```bash
  npm test
```

- [ ] **3.7** Git checkpoint
```bash
  git add -A
  git commit -m "refactor: production hardening — migrations, side-effect fix, graceful shutdown, CI"
  git push origin main
```

**Checkpoint:** Migration system works, insertMemory returns correct access_count, archived memories hidden by default, CI pipeline green.

---

## Phase 4: Embedding Engine

**Goal:** Local semantic search works without any API keys.

- [ ] **4.1** Create src/embeddings.ts
  - Tell Claude Code:
```
    Create src/embeddings.ts following CLAUDE.md conventions.
    1. Use @xenova/transformers to load Xenova/all-MiniLM-L6-v2
    2. Lazy-load: don't load model on import, load on first embed() call
    3. Cache model directory: ~/.moltmind/models/
    4. Progress callback to console.error during download
    5. If model loading fails or times out (30s), set a flag and degrade gracefully.
       All future embed() calls return null instead of crashing.
       Log warning once via console.error.
    
    Export:
    - async embed(text: string): Promise<Float32Array | null>
    - cosineSimilarity(a: Float32Array, b: Float32Array): number
    - async semanticSearch(query: string, memories: Memory[]): Promise<Array<{id: string, score: number}>>
    - embeddingToBuffer(embedding: Float32Array): Buffer
    - bufferToEmbedding(buffer: Buffer): Float32Array
    - isModelReady(): boolean
```

- [ ] **4.2** Write embedding tests (tests/embeddings.test.ts)
  - Mock the transformer model to avoid 22MB download in CI
  - Test: cosineSimilarity returns 1.0 for identical vectors
  - Test: cosineSimilarity returns ~0 for orthogonal vectors
  - Test: embeddingToBuffer and bufferToEmbedding are reversible
  - Test: embed() returns null when model unavailable (graceful degradation)
  - Test: semanticSearch returns results sorted by score descending

- [ ] **4.3** Git checkpoint
```bash
  git add -A
  git commit -m "feat: local embedding engine with semantic search and graceful degradation"
  git push origin main
```

**Checkpoint:** Embeddings generate locally, similarity works, graceful degradation on model failure.

---

## Phase 5: Diagnostics, Feedback & Adoption Metrics

**Goal:** Every tool call is tracked, agents can submit feedback, adoption is measurable.

- [ ] **5.1** Run v2 database migration
  - Tell Claude Code:
```
    Add a migrate_v2() function to src/db.ts that creates the diagnostics, feedback, and
    metrics tables as specified in CLAUDE.md. Bump schema_version to '2'. Run this migration
    automatically when the database opens and detects version < 2.
```

- [ ] **5.2** Create src/diagnostics.ts
  - Tell Claude Code:
```
    Create src/diagnostics.ts following the CLAUDE.md spec exactly.
    Export:
    - withDiagnostics(toolName, handler): wraps any tool handler with try/catch, timing,
      and diagnostic logging. On error, returns { success: false, message } instead of throwing.
    - logDiagnostic(toolName, success, latencyMs, errorMessage): inserts into diagnostics table.
    - getHealthScore(): returns 0.0-1.0 based on success rate of last 100 operations.
    - getRecentDiagnostics(limit): returns recent diagnostic entries.
    - submitFeedback(type, message, toolName?): inserts into feedback table.
    - getRecentFeedback(limit): returns recent feedback entries.
    
    Never log memory content. Only log tool_name, success, latency, error_message.
```

- [ ] **5.3** Create src/metrics.ts
  - Tell Claude Code:
```
    Create src/metrics.ts following CLAUDE.md spec.
    Export:
    - initMetrics(): generate or read persistent instance_id from ~/.moltmind/instance_id,
      increment total_sessions in metrics table, update last_seen.
    - recordToolCall(toolName, success): increment total_tool_calls, update tool_calls_by_name
      JSON, update errors_by_tool JSON if !success.
    - getFullMetrics(): return a dashboard object with instance_id, total_sessions,
      total_tool_calls, tool_calls_by_name, errors_by_tool, first_seen, last_seen,
      uptime_seconds, health_score (from diagnostics).
    
    Call initMetrics() once in main() on startup.
    Call recordToolCall() inside withDiagnostics() after each tool execution.
    All data is LOCAL ONLY.
```

- [ ] **5.4** Write tests (tests/diagnostics.test.ts, tests/metrics.test.ts)
  - Test: withDiagnostics catches errors and returns { success: false }
  - Test: withDiagnostics records latency > 0
  - Test: getHealthScore returns 1.0 when all operations succeed
  - Test: getHealthScore returns 0.0 when all operations fail
  - Test: submitFeedback stores and retrieves feedback
  - Test: recordToolCall increments counters correctly
  - Test: getFullMetrics returns complete dashboard

- [ ] **5.5** Git checkpoint
```bash
  git add -A
  git commit -m "feat: diagnostics, feedback, and adoption metrics system"
  git push origin main
```

**Checkpoint:** Every tool call logged, feedback submittable, real-time metrics dashboard works.

---

## Phase 6: All 11 MCP Tools

**Goal:** All tools registered, validated, wrapped with diagnostics, and tested.

- [ ] **6.1** Create src/tools/mm_store.ts
  - Zod schema: `{ title: string (max 500), content: string (max 50KB), type?: MemoryType, tags?: string[] (max 20), metadata?: object (max 10KB) }`
  - Auto-embed content, auto-classify type if not provided, insert memory, return stored memory
  - Wrapped with `withDiagnostics("mm_store", ...)`

- [ ] **6.2** Create src/tools/mm_recall.ts
  - Zod schema: `{ query: string (max 1000), limit?: number (1-500, default 10), tier?: MemoryTier, type?: MemoryType }`
  - Hybrid search: semantic (0.7) + FTS5 keyword (0.3). If embeddings unavailable, fall back to FTS5-only.
  - Return array of `{ id, title, content, type, score, tags }`

- [ ] **6.3** Create src/tools/mm_read.ts
  - Zod schema: `{ id: string }`
  - Return full memory object or `{ success: false, message: "Memory not found" }`

- [ ] **6.4** Create src/tools/mm_update.ts
  - Zod schema: `{ id: string, title?: string, content?: string, type?: MemoryType, tags?: string[], metadata?: object, tier?: MemoryTier }`
  - Re-embed if content changed. Return updated memory.

- [ ] **6.5** Create src/tools/mm_delete.ts
  - Zod schema: `{ id: string }`
  - Soft-delete (set tier='archived'). Return `{ success: true, message: "Memory archived" }`

- [ ] **6.6** Upgrade src/tools/mm_status.ts
  - No input params. Return: `{ success, version, db_stats (from getMemoryStats), health_score (from getHealthScore), embedding_model_ready (from isModelReady), uptime_seconds }`

- [ ] **6.7** Create src/tools/mm_init.ts
  - No input params. Call `initProjectVault()`. Return `{ success: true, path: ".moltmind/memory.db" }`

- [ ] **6.8** Create src/tools/mm_handoff_create.ts
  - Zod schema: `{ goal: string, current_state: string, next_action: string, constraints?: string[], known_unknowns?: string[], artifacts?: string[], stop_conditions?: string[] }`
  - Generate session_id, insert handoff, return handoff object

- [ ] **6.9** Create src/tools/mm_handoff_load.ts
  - No input params. Return latest handoff or `{ success: false, message: "No handoff found" }`

- [ ] **6.10** Create src/tools/mm_feedback.ts
  - Zod schema: `{ type: 'bug' | 'feature_request' | 'friction', message: string (max 2000), tool_name?: string }`
  - Call `submitFeedback()`. Return `{ success: true }`

- [ ] **6.11** Create src/tools/mm_metrics.ts
  - No input params. Call `getFullMetrics()`. Return the full dashboard object.

- [ ] **6.12** Register all 11 tools in src/index.ts
  - Import all tool handlers
  - Register each with `server.tool(name, description, zodSchema, withDiagnostics(name, handler))`
  - Call `initMetrics()` in `main()` before `server.connect()`

- [ ] **6.13** Rebuild and test end-to-end in Claude Code
```bash
  npm run build
  claude mcp remove moltmind-dev
  claude mcp add --scope user moltmind-dev -- node $(pwd)/dist/index.js
```
  - Test every tool via Claude Code conversation
  - Verify mm_metrics shows correct call counts after testing

- [ ] **6.14** Write comprehensive tool tests (tests/tools.test.ts)
  - Every tool: 1 happy-path + 1 error-path test minimum
  - Test input validation: oversized content, invalid type, missing required fields
  - Test hybrid search: verify results include both semantic and keyword matches
  - Test graceful degradation: mm_recall works when embeddings unavailable

- [ ] **6.15** Git checkpoint
```bash
  git add -A
  git commit -m "feat: all 11 MCP tools with validation, diagnostics, and full test coverage"
  git push origin main
```

**Checkpoint:** All 11 tools work end-to-end. Every tool validates input, catches errors, logs diagnostics. CI green.

---

## Phase 7: Package & Publish to npm

**Goal:** Anyone can install with `npx -y moltmind`.

- [ ] **7.1** Prepare package.json for publishing
  - Add `"files": ["dist/", "README.md", "LICENSE"]` to limit what ships to npm
  - Verify `bin`, `main`, `keywords`, `repository` fields
  - Bump version if needed

- [ ] **7.2** Write full README.md
  - Quick start (3 lines: npx install, claude mcp add, verify)
  - Tools table (all 11 with descriptions)
  - Architecture overview (local SQLite + embeddings + MCP)
  - How it works section (hybrid search, memory tiers, handoffs)
  - Contributing guide link
  - License

- [ ] **7.3** Create .npmignore
```
  src/
  tests/
  .github/
  .moltmind/
  CLAUDE.md
  plan.md
  tsconfig.json
  *.db
```

- [ ] **7.4** Dry run and publish
```bash
  npm run clean && npm run build
  npm publish --dry-run
  # Review the file list — should only include dist/, README.md, LICENSE, package.json
  npm publish
```

- [ ] **7.5** Verify installation
```bash
  cd /tmp && mkdir moltmind-test && cd moltmind-test
  npx -y moltmind
  # Should start and respond to STDIO
```

- [ ] **7.6** Switch Claude Code to published version
```bash
  claude mcp remove moltmind-dev
  claude mcp add moltmind -- npx -y moltmind
  claude mcp list
```

- [ ] **7.7** Git tag and push
```bash
  git add -A
  git commit -m "chore: publish v0.1.0 to npm"
  git tag v0.1.0
  git push origin main --tags
```

**Checkpoint:** `npx -y moltmind` works globally. Package live on npmjs.com/package/moltmind.

---

## Phase 8: Go Live on Moltbook

**Goal:** MoltMind agent registered, claimed, and posting on moltbook.com.

- [ ] **8.1** Register agent via Moltbook API (POST /api/v1/agents/register) — SAVE the api_key immediately
- [ ] **8.2** Claim agent (open claim URL, verify email, post verification tweet)
- [ ] **8.3** Post launch announcement to m/agents
  - Include: what it does, npx install command, tool list, "built by agent+human" narrative
- [ ] **8.4** Cross-post to m/infrastructure, m/showandtell, m/automation (space 30 min apart)
- [ ] **8.5** Engage: comment helpfully on memory-related posts in m/agents
- [ ] **8.6** Create m/moltmind submolt for community, support, and feature requests

**Checkpoint:** Agent live on Moltbook, launch posts generating engagement.

---

## Phase 9: Iterate & Monetize (Week 2+)

- [ ] **9.1** Monitor npm downloads (`npm info moltmind`) and GitHub issues daily
- [ ] **9.2** Fix bugs from feedback, release patch versions (v0.1.1, v0.1.2, etc.)
- [ ] **9.3** Build cloud sync backend (Supabase) for Pro tier
- [ ] **9.4** Build landing page at moltmind.dev (Vercel)
- [ ] **9.5** Add Stripe billing ($7/mo Pro, $19/mo Team)
- [ ] **9.6** Implement tier enforcement: check license key on startup, gate Pro/Team features
- [ ] **9.7** Add cross-agent memory sharing tools (mm_share, mm_import_shared) for Team tier
- [ ] **9.8** Build web dashboard for memory analytics
- [ ] **9.9** Add encrypted-at-rest option for Pro/Team (user-provided key)

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `claude` | Start Claude Code in project |
| `npm run build` | Compile TypeScript |
| `npm run dev` | Watch mode |
| `npm test` | Run all tests |
| `npm run lint` | Type check |
| `npm publish` | Publish to npm |
| `claude mcp add moltmind -- npx -y moltmind` | Install as user MCP server |
| `/mcp` | Check MCP status inside Claude Code |
| `/clear` | Reset context between tasks |

## Architecture Diagram
```
Agent (Claude Code / any MCP client)
  │
  ▼ (STDIO JSON-RPC)
┌─────────────────────────────────────────────┐
│  src/index.ts — MCP Server                  │
│  ├── 11 tools registered with zod schemas   │
│  ├── withDiagnostics() on every tool        │
│  ├── initMetrics() on startup               │
│  └── SIGINT/SIGTERM → closeDb()             │
├─────────────────────────────────────────────┤
│  src/tools/*.ts — Tool handlers             │
│  └── Input validation → business logic →    │
│      { success: bool, ...data }             │
├─────────────────────────────────────────────┤
│  src/embeddings.ts    │  src/diagnostics.ts │
│  Xenova/MiniLM-L6-v2  │  withDiagnostics()  │
│  384-dim vectors       │  health score       │
│  Graceful degradation  │  feedback system    │
├─────────────────────────────────────────────┤
│  src/db.ts — SQLite + WAL + FTS5            │
│  Schema v1: memories, handoffs, FTS5        │
│  Schema v2: + diagnostics, feedback, metrics│
│  Migration system with versioning           │
├─────────────────────────────────────────────┤
│  ~/.moltmind/memory.db  (global vault)      │
│  ./.moltmind/memory.db  (project vault)     │
│  ~/.moltmind/models/    (embedding model)   │
│  ~/.moltmind/instance_id (adoption tracking)│
└─────────────────────────────────────────────┘
```
