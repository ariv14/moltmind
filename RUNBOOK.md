# MoltMind Runbook

Operational guide — setup, benchmarks, workflows, and troubleshooting.

## Getting Started

### Install

```bash
# Claude Code (primary)
claude mcp add moltmind -- npx -y moltmind

# With moltbook social features
claude mcp add moltmind -- npx -y moltmind --moltbook

# Any other MCP client — add to config:
# { "mcpServers": { "moltmind": { "command": "npx", "args": ["-y", "moltmind"] } } }
# With moltbook: "args": ["-y", "moltmind", "--moltbook"]
```

See [README.md](README.md) for per-client config paths.

### Verify

In Claude Code, run `/mcp` — you should see `moltmind` listed with 14 tools. Then test:

> "Store a test memory about setting up MoltMind"
> "Recall memories about MoltMind"

If both work, you're set. The embedding model (~22MB) downloads automatically on first `mm_recall`.

### First session tips

- Your agent should call `mm_session_resume` at the start of every conversation to pick up where it left off.
- Use `mm_store` to save learnings, decisions, and error fixes as you work.
- Before ending a session, the agent should call `mm_session_save` and `mm_handoff_create` to checkpoint progress.
- Use `mm_init` in a project directory to create a project-local vault.

---

## Try It (5 Scenarios)

### 1. Memory that survives conversations

Start a conversation:

> Remember that our API uses port 8080, the database is PostgreSQL on RDS, and deploys go through GitHub Actions. Tag this as "infra".

Close Claude Code. Open it again. New conversation:

> What port does our API run on?

Claude finds the answer in the new conversation. It searches by meaning — "port" matches "API uses port 8080".

### 2. Crash recovery

Give Claude a multi-step task:

> I'm planning a birthday party. She likes Italian food, jazz music, and purple. The party is March 15th. We decided on Olive Garden and the playlist has 30 jazz songs. Create a handoff so we can continue later.

Kill Claude Code (Ctrl+C, close terminal). Open it again:

> What was I working on?

Claude loads the handoff and tells you exactly where you left off.

### 3. Token savings

After a few conversations:

> Show me MoltMind metrics

You get a dashboard showing sessions tracked, cold starts avoided (~8,000 tokens each), and net savings.

### 4. Project-scoped memory

In a project directory:

> Set up a MoltMind vault for this project

> Remember that this project uses React 19, Tailwind, and Zustand

Memories stay scoped to this project. Switch directories and they're invisible.

### 5. The full loop

> Store a learning: Never use `any` in TypeScript generics — always constrain with `extends`. Tag it as "typescript".

> Save this session: explored TypeScript patterns, captured one key learning about generics

Close and reopen:

> Resume my last session

Claude restores full context. Weeks later, search still works:

> What do I know about TypeScript generics?

---

## Benchmark Results

Run `npm run benchmark` from the MoltMind repo for your machine's numbers. Typical results:

### Latency (50 memories, SQLite + FTS5)

| Operation | Avg | p50 | p95 | Max |
|-----------|-----|-----|-----|-----|
| Store memory | ~300µs | ~300µs | ~500µs | ~1.5ms |
| Keyword search (FTS5) | ~270µs | ~250µs | ~370µs | ~460µs |
| Vector search (brute-force) | ~1ms | ~750µs | ~1.3ms | ~4ms |

**What this means:**
- Store is under 1ms — invisible to the agent.
- FTS5 keyword search is the fastest retrieval path (~250µs).
- Brute-force vector search is ~1ms at 50 memories, scaling linearly. At 200 memories (free tier max), expect ~4ms. Pro tier uses Zvec ANN which stays sub-millisecond at any scale.

### Token cost

| Scenario | Without MoltMind | With MoltMind | Savings |
|----------|-----------------|---------------|---------|
| Single session resume | ~8,000 tokens | ~825 tokens | 90% |
| 5-session project | ~40,000 tokens | ~7,500 tokens | 81% |
| 20-session project | ~160,000 tokens | ~40,200 tokens | 75% |

Tool description overhead (~500 tokens/request) pays for itself after one session resume. With prompt caching, overhead drops to ~50 tokens.

### ANN benchmark (Pro tier — Zvec)

Pro tier uses Zvec ANN for approximate nearest neighbor search instead of brute-force. The benchmark suite tests recall, latency, scalability, correctness, and throughput.

#### Quick run

```bash
# Install zvec-native and generate a Pro license
npm install @moltmind/zvec-native
npx tsx scripts/generate-license.ts $(cat ~/.moltmind/instance_id) > ~/.moltmind/license.key

# Run the full benchmark (~5 min)
npx tsx scripts/ann-benchmark.ts

# Cleanup
rm ~/.moltmind/license.key
npm uninstall @moltmind/zvec-native
```

#### What it tests (8 sections)

| Section | What it measures |
|---------|-----------------|
| Recall@K | Fraction of true top-K results the ANN finds (K=1,5,10,25,50 at 100–10K vectors) |
| Distribution sensitivity | Recall on uniform, clustered (20 centers), and adversarial (near-identical) vectors |
| Warm vs cold latency | First search after buildIndex vs subsequent searches (p50/p95/p99) |
| Scalability curves | Insert throughput, build time, search latency, recall, RSS at 8 scale points |
| Sustained throughput | 1,000 queries back-to-back + mixed workload with interleaved inserts |
| Memory efficiency | Bytes per vector vs theoretical minimum (1,536 bytes for 384 dims) |
| Correctness under mutation | Delete 1,000 vectors, verify none leak into results, reinsert 500, check recall |
| Rebuild stability | 10 consecutive buildIndex calls — determinism and build time variance |

#### Typical results (384-dim, Intel i9)

**Recall@10:**

| Vectors | Mean | Median |
|---------|------|--------|
| 100 | 99.7% | 100% |
| 1,000 | 99.1% | 100% |
| 5,000 | 91.6% | 90% |
| 10,000 | 80.4% | 80% |

**Search latency (warm):**

| Vectors | p50 | p95 |
|---------|-----|-----|
| 500 | 0.4ms | 0.6ms |
| 1,000 | 0.7ms | 1.0ms |
| 5,000 | 2.7ms | 3.2ms |
| 10,000 | 4.3ms | 4.8ms |

**Throughput:** 330+ queries/sec sustained at 5,000 vectors, zero latency spikes.

**Correctness:** Zero deleted IDs in results. Deterministic results across rebuilds (CV < 0.1).

#### Output files

| File | Purpose |
|------|---------|
| Terminal (stderr) | Formatted ASCII tables as benchmark runs |
| `BENCHMARK_RESULTS.md` | Polished showcase report (auto-generated in project root) |
| `/tmp/ann-benchmark-results.json` | Machine-readable results for programmatic analysis |

#### Pass/fail verdicts

The benchmark exits with code 1 if any verdict fails:

| Criterion | Threshold |
|-----------|-----------|
| Recall@10 at ≤1,000 vectors | ≥ 90% |
| Recall@10 at 10,000 vectors | ≥ 70% |
| Throughput at 5,000 vectors | ≥ 200 qps |
| No deleted IDs in results | 0 leaked |
| Build determinism | CV < 0.3 |
| Clustered recall vs uniform | Within 10pp |

---

## Free vs Pro

| | Free | Pro |
|--|------|-----|
| Stores per day | 20 | Unlimited |
| Total memories | 200 | Unlimited |
| Search (recall) | Unlimited | Unlimited |
| Session tools | Unlimited | Unlimited |
| Vector search | Brute-force | Zvec ANN (auto) |
| Data location | 100% local | 100% local |

**Stay on Free** if you work on 1-2 projects and store fewer than ~20 memories/day. The 200 total cap covers most individual workflows.

**Upgrade to Pro** if you work across many projects, need more than 200 memories, or want sub-millisecond search at scale. Run `npx moltmind --upgrade`.

Pro licenses are RSA-signed and machine-locked to your `instance_id`. Stored at `~/.moltmind/license.key`. Zvec ANN auto-enables — no flags needed. All data stays local.

---

## Common Workflows

### Session resume

1. **Session starts** — MoltMind auto-creates a session with a unique ID.
2. **Agent calls `mm_session_resume`** — loads recent sessions + latest handoff.
3. **During work** — `mm_store` saves discoveries, `mm_handoff_create` checkpoints progress.
4. **Session ends** — `mm_session_save` captures the summary. MoltMind auto-pauses on shutdown.
5. **Next session** — repeat from step 1. Full context restored.

### Agent-to-agent handoff

```
Agent A calls mm_handoff_create:
  goal: "Implement auth middleware"
  current_state: "JWT validation function done, tests pass"
  next_action: "Wire into Express routes in src/server.ts"
  constraints: ["Support cookie and header tokens"]
  known_unknowns: ["Refresh token rotation not decided"]

Agent B calls mm_handoff_load → gets the full handoff
Agent B calls mm_session_resume → gets recent session history
→ Picks up from where Agent A stopped
```

### Project-local vaults

`mm_init` creates a `.moltmind/` vault in the current directory:

```
~/projects/myapp/.moltmind/memory.db   ← project memories
~/.moltmind/memory.db                  ← global memories
```

Useful when you want project-specific context, per-user isolation on shared machines, or `.gitignore`-able local state.

### Memory organization

**Types:**
- `learning` — stable patterns, "how X works"
- `error` — bug fixes, root causes
- `decision` — architectural choices, "we chose X because..."
- `plan` — implementation strategies
- `raw` — session logs, temporary notes

**Tags** — use project names (`myapp`), categories (`api`, `frontend`), and status (`resolved`).

**Tiers** — `hot` (active), `warm` (useful), `cold` (archival), `archived` (soft-deleted). Use `mm_update` to move memories between tiers as relevance changes.

---

## Troubleshooting

### Stale global install

**Symptom:** Old version, missing tools.
**Cause:** `npm install -g moltmind` takes precedence over `npx`.
**Fix:**
```bash
npm uninstall -g moltmind
```

### Embedding model won't download

**Symptom:** `mm_recall` returns keyword-only results.
**Cause:** First-run download of ~22MB model failed.
**Fix:** Ensure internet access and ~50MB free disk space. Check `~/.moltmind/models/`. MoltMind retries on next `mm_recall` — keyword search works in the meantime.

### STDIO corruption

**Symptom:** JSON parse errors, server hangs.
**Debug:**
```bash
echo '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"},"protocolVersion":"2025-03-26"}}' | npx moltmind
```
Should return valid JSON-RPC. If not, something is writing to stdout.

### License activation

**Symptom:** `mm_status` shows "free" after purchasing Pro.
**Check:**
```bash
cat ~/.moltmind/instance_id       # your machine ID
cat ~/.moltmind/license.key       # should start with MMPRO-
```
The 8 chars after `MMPRO-` must match your `instance_id` prefix. Restart your MCP client after placing the license file.

### Database locked

**Symptom:** "database is locked" errors.
**Cause:** Multiple MoltMind instances or unclean shutdown.
**Fix:** Check `ps aux | grep moltmind`, kill stale processes, restart your MCP client.

### Memory limit reached (free tier)

**Check:** `mm_status` shows total count and daily stores.
**Options:**
- Archive old memories with `mm_delete` (soft delete frees up count)
- Clean up duplicates via `mm_recall`
- Upgrade: `npx moltmind --upgrade`

### MoltMind not listed in /mcp

```bash
claude mcp remove moltmind
claude mcp add moltmind -- npx -y moltmind
```
Restart Claude Code.

### Reinstalling with different options

To switch between default and moltbook mode, remove and re-add:

```bash
# Switch to moltbook mode
claude mcp remove moltmind
claude mcp add moltmind -- npx -y moltmind --moltbook

# Switch back to default (14 tools)
claude mcp remove moltmind
claude mcp add moltmind -- npx -y moltmind
```

Restart Claude Code after changing.
