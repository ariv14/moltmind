# MoltMind Development Plan

> Persistent semantic memory MCP server for AI agents.
> GitHub: github.com/ariv14/moltmind
> npm: npmjs.com/package/moltmind

---

## Phase 0: Environment Setup
**Goal:** Mac machine ready, GitHub repo connected, Claude Code working.

- [ ] **0.1** Install prerequisites
  - Node.js 18+ (`brew install node` or use nvm)
  - npm 9+ (comes with Node)
  - Git (`brew install git`)
  - Claude Code (`npm install -g @anthropic-ai/claude-code`)
  - Verify: `node -v && npm -v && git --version && claude --version`

- [ ] **0.2** GitHub repo is live at github.com/ariv14/moltmind ✅

- [ ] **0.3** Initialize Claude Code in the project
  - Run `claude` inside the moltmind directory
  - Verify CLAUDE.md is loaded: ask Claude "what are the critical rules for this project?"

- [ ] **0.4** Create npm account (if you don't have one)
  - Go to npmjs.com → Sign Up
  - Run `npm login` in terminal and authenticate
  - Verify: `npm whoami`

**Checkpoint:** `claude` runs in the project, CLAUDE.md is loaded, git remote is set, npm is authenticated.

---

## Phase 1: Project Scaffold
**Goal:** Empty but runnable MCP server that connects to Claude Code.

- [ ] **1.1** Initialize package.json
  - Tell Claude Code:
```
    Create package.json with:
    name "moltmind", version "0.1.0", type "module",
    bin entry pointing to dist/index.js,
    scripts for build (tsc), dev (tsx watch), test, lint (tsc --noEmit), clean,
    engines node >=18.
    Then install dependencies:
      @modelcontextprotocol/sdk better-sqlite3 @xenova/transformers
    And dev dependencies:
      typescript @types/better-sqlite3 @types/node tsx
```

- [ ] **1.2** Create tsconfig.json
  - Tell Claude Code:
```
    Create tsconfig.json: target ES2022, module NodeNext,
    moduleResolution NodeNext, outDir dist, rootDir src,
    strict true, esModuleInterop true, skipLibCheck true,
    declaration true, sourceMap true.
    Include src/**/*.ts, exclude node_modules and dist.
```

- [ ] **1.3** Create .gitignore
  - Tell Claude Code:
```
    Create .gitignore with: node_modules/, dist/, .moltmind/,
    *.db, *.db-wal, *.db-shm, .DS_Store, .env, CLAUDE.local.md
```

- [ ] **1.4** Create minimal MCP server entry point
  - Tell Claude Code:
```
    Create src/index.ts with a minimal MCP server using
    @modelcontextprotocol/sdk. Use McpServer class and StdioServerTransport.
    Register one placeholder tool called "mm_status" that returns
    { success: true, message: "MoltMind is running", version: "0.1.0" }.
    Add #!/usr/bin/env node shebang at top.
    Remember: NEVER use console.log — only console.error for debug output.
```

- [ ] **1.5** Build and test the skeleton
```bash
  npm run build
  echo '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"},"protocolVersion":"2025-03-26"}}' | node dist/index.js
```

- [ ] **1.6** Connect to Claude Code as a local MCP server
```bash
  claude mcp add --scope user moltmind-dev -- node $(pwd)/dist/index.js
  claude mcp list
```
  - Restart Claude Code, run `/mcp` to verify connection
  - Test: ask Claude to "use mm_status to check MoltMind"

- [ ] **1.7** Git checkpoint
```bash
  git add -A
  git commit -m "feat: minimal MCP server scaffold with mm_status placeholder"
  git push origin main
```

**Checkpoint:** MCP server builds, connects to Claude Code, and responds to mm_status.

---

## Phase 2: Database Layer
**Goal:** SQLite stores and retrieves memories.

- [ ] **2.1** Create src/types.ts
  - Tell Claude Code:
```
    Create src/types.ts with TypeScript interfaces for:
    - Memory { id, type, title, content, tags, metadata, embedding, tier,
      created_at, updated_at, accessed_at, access_count, decay_score }
    - MemoryType = 'learning' | 'error' | 'decision' | 'plan' | 'raw'
    - MemoryTier = 'hot' | 'warm' | 'cold' | 'archived'
    - Handoff { id, goal, current_state, next_action, constraints,
      known_unknowns, artifacts, stop_conditions, session_id, created_at }
    - SearchResult { id, title, content, type, score, tags, created_at }
```

- [ ] **2.2** Create src/db.ts
  - Tell Claude Code:
```
    Create src/db.ts following the conventions in CLAUDE.md.

    It should:
    1. Determine DB path: use .moltmind/memory.db if it exists in cwd,
       otherwise use ~/.moltmind/memory.db
    2. Create directories with mkdirSync recursive
    3. Open with better-sqlite3 in WAL mode
    4. Run CREATE TABLE IF NOT EXISTS for memories and handoffs tables
    5. Create FTS5 virtual table: memories_fts on title + content
    6. Keep FTS5 in sync using triggers (INSERT, UPDATE, DELETE)

    Export functions:
    - getDb(): returns the singleton database instance
    - insertMemory(memory): inserts and returns the memory
    - getMemory(id): returns one memory or null
    - updateMemory(id, updates): updates fields, returns updated memory
    - deleteMemory(id): soft-delete by setting tier to 'archived'
    - searchMemoriesFTS(query, limit): full-text search
    - getAllMemories(tier?, limit?): list with optional filters
    - getMemoryStats(): return counts by type and tier
    - insertHandoff(handoff): inserts and returns
    - getLatestHandoff(): returns most recent handoff
    - initProjectVault(): creates .moltmind/ in cwd and switches DB
```

- [ ] **2.3** Write database tests
```bash
  npx tsx --test tests/db.test.ts
```

- [ ] **2.4** Git checkpoint
```bash
  git add -A
  git commit -m "feat: SQLite database layer with FTS5 search"
  git push origin main
```

**Checkpoint:** Database creates, stores, retrieves, searches, and deletes memories. Tests pass.

---

## Phase 3: Embedding Engine
**Goal:** Local semantic search works without any API keys.

- [ ] **3.1** Create src/embeddings.ts
  - Tell Claude Code:
```
    Create src/embeddings.ts following CLAUDE.md conventions.

    1. Use @xenova/transformers to load Xenova/all-MiniLM-L6-v2
    2. Lazy-load: don't load model on import, load on first embed() call
    3. Cache model directory: ~/.moltmind/models/
    4. Progress callback to console.error during download

    Export:
    - async embed(text: string): Promise<Float32Array>
    - cosineSimilarity(a: Float32Array, b: Float32Array): number
    - async semanticSearch(query, memories): Promise<Array<{id, score}>>
    - embeddingToBuffer(embedding: Float32Array): Buffer
    - bufferToEmbedding(buffer: Buffer): Float32Array
```

- [ ] **3.2** Write embedding tests
```bash
  npx tsx --test tests/embeddings.test.ts
```

- [ ] **3.3** Git checkpoint
```bash
  git add -A
  git commit -m "feat: local embedding engine with semantic search"
  git push origin main
```

**Checkpoint:** Embeddings generate locally, semantic similarity works.

---

## Phase 4: Core MCP Tools
**Goal:** All 8 tools registered, functional, and tested through Claude Code.

- [ ] **4.1** Build src/tools/mm_store.ts
- [ ] **4.2** Build src/tools/mm_recall.ts (hybrid semantic + keyword search)
- [ ] **4.3** Build src/tools/mm_read.ts
- [ ] **4.4** Build src/tools/mm_update.ts
- [ ] **4.5** Upgrade src/tools/mm_status.ts (real stats from DB)
- [ ] **4.6** Build src/tools/mm_init.ts
- [ ] **4.7** Build src/tools/mm_handoff_create.ts
- [ ] **4.8** Build src/tools/mm_handoff_load.ts
- [ ] **4.9** Register all 8 tools in src/index.ts
- [ ] **4.10** Rebuild, reconnect MCP, and test every tool in Claude Code
```bash
  npm run build
  claude mcp remove moltmind-dev
  claude mcp add --scope user moltmind-dev -- node $(pwd)/dist/index.js
```
- [ ] **4.11** Write tool tests in tests/tools.test.ts
- [ ] **4.12** Git checkpoint
```bash
  git add -A
  git commit -m "feat: all 8 MCP tools implemented and tested"
  git push origin main
```

**Checkpoint:** All 8 tools work end-to-end in Claude Code.

---

## Phase 5: Package & Publish to npm
**Goal:** Anyone can install with `npx -y moltmind`.

- [ ] **5.1** Prepare package.json for publishing (files, bin, keywords, repository)
- [ ] **5.2** Write full README.md (quick start, tools table, architecture)
- [ ] **5.3** Create .npmignore
- [ ] **5.4** Publish
```bash
  npm run clean && npm run build
  npm publish --dry-run
  npm publish
```
- [ ] **5.5** Verify: `npx -y moltmind` works from a temp directory
- [ ] **5.6** Switch Claude Code to the published version
```bash
  claude mcp remove moltmind-dev
  claude mcp add moltmind -- npx -y moltmind
```
- [ ] **5.7** Git tag and push
```bash
  git add -A
  git commit -m "chore: publish v0.1.0 to npm"
  git tag v0.1.0
  git push origin main --tags
```

**Checkpoint:** `npx -y moltmind` works globally. Package live on npmjs.com.

---

## Phase 6: Go Live on Moltbook
**Goal:** MoltMind agent registered, claimed, and posting on moltbook.com.

- [ ] **6.1** Register agent via Moltbook API — SAVE the api_key immediately
- [ ] **6.2** Claim agent (open claim URL, verify email, post verification tweet)
- [ ] **6.3** Post launch announcement to m/agents
- [ ] **6.4** Cross-post to m/infrastructure, m/showandtell, m/automation (30 min apart)
- [ ] **6.5** Engage: comment helpfully on memory-related posts
- [ ] **6.6** Create m/moltmind submolt for community support

**Checkpoint:** Agent live on Moltbook, launch posts up, community engaging.

---

## Phase 7: Iterate & Monetize (Week 2+)

- [ ] **7.1** Monitor npm downloads and GitHub issues
- [ ] **7.2** Fix bugs, release patch versions
- [ ] **7.3** Build cloud sync backend (Supabase) for Pro tier
- [ ] **7.4** Build landing page at moltmind.dev (Vercel)
- [ ] **7.5** Add Stripe billing ($7/mo Pro, $19/mo Team)
- [ ] **7.6** Add cross-agent memory sharing tools (mm_share, mm_import_shared)
- [ ] **7.7** Build web dashboard for memory analytics

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
| `claude mcp add moltmind -- npx -y moltmind` | Install as user |
| `/mcp` | Check MCP status inside Claude Code |
| `/clear` | Reset context between tasks |
