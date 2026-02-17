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

### Reading the results

If you're not familiar with benchmark terminology, here's a quick guide:

- **Recall** = accuracy. "98% recall" means the search found 98 out of 100 correct results. Higher is better.
- **Latency** = speed. "0.7ms" means the search took less than a thousandth of a second. Lower is better.
- **p50/p95/p99** = percentiles. p50 is the typical case, p95 is the slow case, p99 is the worst case you'd normally see.
- **Throughput** = capacity. "330 queries/sec" means MoltMind can handle 330 searches every second — far more than any agent needs.

### How fast is it? (Free tier)

Run `npm run benchmark` from the MoltMind repo for your machine's numbers. Typical results with 50 memories:

| Operation | Typical speed | What this means |
|-----------|--------------|-----------------|
| Store a memory | ~300µs | Instant — your agent won't notice |
| Keyword search | ~250µs | Fastest way to find memories by exact words |
| Meaning-based search | ~1ms | Finds related memories even with different wording |

At 200 memories (free tier max), meaning-based search takes ~4ms — still imperceptible. Pro tier stays sub-millisecond at any scale.

### How much does it save? (Dollars)

Every session resume saves your agent from re-exploring your codebase. Using Claude Sonnet 4.5 pricing ($3/1M input tokens) as reference:

| Scenario | Without MoltMind | With MoltMind | You save |
|----------|-----------------|---------------|----------|
| Single session | $0.024 (8,000 tokens) | $0.001 (325 tokens) | **$0.023** |
| 5-session project | $0.12 | $0.02 | **$0.10** |
| 20-session project | $0.48 | $0.05 | **$0.43** |

Tool description overhead (~500 tokens/request, ~$0.0015) pays for itself after one session resume. With prompt caching, overhead drops to ~50 tokens (~$0.00015).

### ANN benchmark (Pro tier — Zvec)

Pro tier uses Zvec ANN for fast approximate search instead of brute-force. The benchmark suite tests 8 aspects of search quality. Here's what each one means and why it matters.

#### Running the benchmark

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

**1. Accuracy (Recall@K)** — Does your agent find the right memories?

When your agent searches for something, does it get the same results as an exhaustive search through every memory? At 1,000 memories, the answer is yes 98% of the time.

| Vectors | Mean accuracy | Typical case |
|---------|------|--------|
| 100 | 99.7% | Perfect |
| 1,000 | 99.1% | Near-perfect |
| 5,000 | 91.6% | Excellent |
| 10,000 | 80.4% | Good |

**2. Distribution sensitivity** — Does it work with all kinds of data?

Real memories aren't uniformly distributed. Some cluster around topics, others are near-duplicates. The benchmark tests all three patterns — accuracy stays above 97% regardless.

**3. Search speed (latency)** — Is search instant?

Your agent shouldn't wait for results. Even at 10,000 memories, search takes under 5ms.

| Memories | Typical speed | Slowest case |
|---------|-----|-----|
| 500 | 0.4ms | 0.6ms |
| 1,000 | 0.7ms | 1.0ms |
| 5,000 | 2.7ms | 3.2ms |
| 10,000 | 4.3ms | 4.8ms |

**4. Scalability** — Does it stay fast as memories grow?

Insert speed, index build time, and search latency at every scale from 100 to 10,000 vectors. Search stays under 4ms even at 10K.

**5. Throughput** — Can it handle heavy use?

330+ searches per second sustained, with zero latency spikes. Far more than any agent needs.

**6. Memory efficiency** — Does it waste RAM?

Each memory costs ~2,112 bytes of storage — only 1.4x the theoretical minimum. Efficient enough for any workload.

**7. Correctness under mutation** — Are deleted memories really gone?

After deleting memories, zero deleted results ever appear in searches. Your agent never sees stale data.

**8. Rebuild stability** — Are results consistent?

Rebuilding the search index produces identical results every time, with stable build times (variance under 10%).

#### Output files

| File | Purpose |
|------|---------|
| Terminal (stderr) | Live progress as benchmark runs |
| `BENCHMARK_RESULTS.md` | Full report with interpretation (auto-generated) |
| `/tmp/ann-benchmark-results.json` | Raw data for programmatic analysis |

#### Pass/fail thresholds

The benchmark exits with code 1 if any of these minimums aren't met:

| What it checks | Must be at least |
|-----------|-----------|
| Accuracy at 1,000 memories | 90% |
| Accuracy at 10,000 memories | 70% |
| Search throughput | 200 queries/sec |
| Deleted memories in results | 0 |
| Build consistency | Variance under 30% |
| Clustered data accuracy | Within 10% of uniform |

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
