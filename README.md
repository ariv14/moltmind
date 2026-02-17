# MoltMind

Persistent semantic memory and session continuity for AI agents. One install, zero config, runs 100% locally.

MoltMind is an [MCP](https://modelcontextprotocol.io) server that gives your AI agent long-term memory across sessions — storing learnings, decisions, error fixes, and handoff context using local SQLite and embeddings. No API keys, no cloud, no accounts needed.

## Quick Start

### Claude Code

```bash
claude mcp add moltmind -- npx -y moltmind
```

Restart Claude Code, then run `/mcp` to verify.

With moltbook social features:

```bash
claude mcp add moltmind -- npx -y moltmind --moltbook
```

See [moltbook.com](https://moltbook.com) for the agent social network.

### Other Clients

Add to your client's MCP config file:

```json
{
  "mcpServers": {
    "moltmind": {
      "command": "npx",
      "args": ["-y", "moltmind"]
    }
  }
}
```

With moltbook: `"args": ["-y", "moltmind", "--moltbook"]`

| Client | Config file | Key |
|--------|------------|-----|
| Cursor | `~/.cursor/mcp.json` or `.cursor/mcp.json` | `mcpServers` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |
| VS Code (Copilot) | `.vscode/mcp.json` | `servers` |
| Cline | Settings > MCP Servers > Edit Config | `mcpServers` |
| Codex CLI | `~/.codex/config.json` | `mcpServers` |
| Any MCP client | Varies | `mcpServers` |

> **Note:** VS Code uses `"servers"` instead of `"mcpServers"` as the top-level key.

### Upgrading

`npx -y moltmind` always fetches the latest version. If you have a stale global install:

```bash
npm uninstall -g moltmind   # then let npx handle it
```

## Tools

14 core tools by default, 21 with `--moltbook`:

| Tool | Description |
|------|-------------|
| `mm_store` | Store a memory (learning, error fix, decision, plan, or raw note) |
| `mm_recall` | Search memories — hybrid semantic + keyword search |
| `mm_read` | Read a specific memory by ID |
| `mm_update` | Update an existing memory |
| `mm_delete` | Archive a memory (soft delete) |
| `mm_status` | Server health dashboard |
| `mm_init` | Create a project-local memory vault |
| `mm_handoff_create` | Structured handoff for agent-to-agent context transfer |
| `mm_handoff_load` | Load the most recent handoff |
| `mm_session_save` | Save session summary and where you left off |
| `mm_session_resume` | Restore context from recent sessions |
| `mm_session_history` | Browse past sessions with tool call stats |
| `mm_feedback` | Report bugs or request features |
| `mm_metrics` | Adoption and health metrics dashboard |

## How It Works

**Memory & Search** — Memories are stored in local SQLite with FTS5. Each has a type (`learning`, `error`, `decision`, `plan`, `raw`), tags, and a tier (`hot`, `warm`, `cold`, `archived`). `mm_recall` runs hybrid search: semantic similarity (0.7 weight) via a local [MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) embedding model plus FTS5 keyword matching (0.3 weight). If the embedding model isn't available, it falls back to keyword-only.

**Sessions & Handoffs** — Sessions are auto-created on startup and auto-paused on shutdown. `mm_session_save` captures what happened and where you left off; `mm_session_resume` restores full context. `mm_handoff_create` structures goal/state/next-action for agent-to-agent transfers. All tool calls are tagged with session IDs for traceability.

**Diagnostics** — Every tool call is logged locally with latency and success/failure. `mm_status` shows health score, `mm_metrics` shows per-tool usage stats, error rates, and token savings. All data stays on your machine.

## Free vs Pro

| | Free | Pro |
|--|------|-----|
| Stores per day | 20 | Unlimited |
| Total memories | 200 | Unlimited |
| Search | Unlimited | Unlimited |
| Session tools | Unlimited | Unlimited |
| Vector search | Brute-force | Zvec ANN (auto) |

Upgrade: `npx moltmind --upgrade`

## Token Cost

MCP tools add overhead because descriptions are sent with every request. MoltMind pays for itself quickly:

| Mode | Overhead per request |
|------|---------------------|
| Default (14 tools) | ~500 tokens |
| + Moltbook (21 tools) | ~1,000 tokens |
| With prompt caching | ~50 tokens |

### Session resume vs cold start

Without MoltMind, re-exploring a codebase costs ~8,000 tokens per session. `mm_session_resume` restores context in ~325 tokens.

| Scenario | Without | With MoltMind | Savings |
|----------|---------|---------------|---------|
| Single resume | ~8,000 | ~825 | 90% |
| 5-session project | ~40,000 | ~7,500 | 81% |
| 20-session project | ~160,000 | ~40,200 | 75% |

Run `npm run benchmark` for latency measurements and projected savings. See [RUNBOOK.md](RUNBOOK.md) for detailed results.

## Benchmarks (Pro — Zvec ANN)

Pro tier uses [Zvec ANN](https://github.com/ariv14/zvec-native) for approximate nearest neighbor search. Benchmark results on 384-dimension vectors:

### Recall@10 (fraction of true top-10 results found)

| Vectors | Mean | Median | P95 |
|---------|------|--------|-----|
| 100 | 99.7% | 100% | 100% |
| 500 | 98.5% | 100% | 100% |
| 1,000 | 99.1% | 100% | 100% |
| 5,000 | 91.6% | 90% | 100% |
| 10,000 | 80.4% | 80% | 100% |

### Search latency vs brute-force

| Vectors | Brute-force | Zvec ANN | Speedup |
|---------|------------|----------|---------|
| 1,000 | 4.7ms | 0.7ms | 6.7x |
| 5,000 | 22ms | 2.7ms | 8.1x |
| 10,000 | 44ms | 4.3ms | 10.2x |

Run the full benchmark suite from the repo:

```bash
# Install deps
npm install @moltmind/zvec-native
npx tsx scripts/generate-license.ts $(cat ~/.moltmind/instance_id) > ~/.moltmind/license.key

# Run benchmark (8 sections, ~5 min)
npx tsx scripts/ann-benchmark.ts

# Results
cat BENCHMARK_RESULTS.md                          # showcase report
cat /tmp/ann-benchmark-results.json | jq '.verdicts'  # pass/fail summary

# Cleanup
rm ~/.moltmind/license.key
npm uninstall @moltmind/zvec-native
```

See [BENCHMARK_RESULTS.md](BENCHMARK_RESULTS.md) for full results.

## Data Storage

| Path | Purpose |
|------|---------|
| `~/.moltmind/memory.db` | Global memory vault |
| `./.moltmind/memory.db` | Project-local vault (via `mm_init`) |
| `~/.moltmind/models/` | Cached embedding model (~22MB) |
| `~/.moltmind/instance_id` | Anonymous instance identifier |

## Requirements

- Node.js 18+
- No API keys required
- No internet after first embedding model download

## License

MIT
