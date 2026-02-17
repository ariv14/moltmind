# MoltMind

Persistent semantic memory and session continuity for AI agents. One install, zero config, runs 100% locally.

MoltMind is an [MCP](https://modelcontextprotocol.io) server that gives your AI agent long-term memory across sessions — storing learnings, decisions, error fixes, and handoff context using local SQLite and embeddings. No API keys, no cloud, no accounts needed.

## Why MoltMind?

Every time your AI agent starts a new conversation, it forgets everything. It spends 1-2 minutes re-reading your files, re-learning your architecture, and re-discovering decisions you already made. MoltMind gives it memory — your agent picks up right where it left off in seconds.

| | Without MoltMind | With MoltMind |
|--|-----------------|---------------|
| **Model used** | Claude Opus 4.6 ($5/$25 per 1M tokens) | |
| **Time per session** | 1-2 min re-exploring | Seconds to resume |
| **Cost per session** | ~$0.09 | ~$0.009 |
| **20 sessions** | $1.80 | $0.18 |
| **Daily use (1 year)** | $32.85 | $3.29 |
| **Time saved (1 year)** | — | **~6 hours** |
| **Money saved (1 year)** | — | **~$30** |

> Assumes ~8,000 input + ~2,000 output tokens per cold start, ~825 input + ~200 output per resume. Savings scale with usage — power users save more.

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

**Memory & Search** — Your agent stores memories in a local database. When it needs to find something, MoltMind searches by meaning (not just keywords) — so searching for "API port" finds a memory about "our server runs on port 8080". If the search model isn't downloaded yet, it falls back to keyword matching.

**Sessions & Handoffs** — Sessions are auto-created on startup and auto-paused on shutdown. Your agent saves where it left off and picks up seamlessly next time. Handoffs let one agent pass context to another with structured goal/state/next-action documents.

**Diagnostics** — Every tool call is logged locally with timing and success/failure. `mm_status` shows health, `mm_metrics` shows usage stats and token savings. All data stays on your machine.

## What It Costs (Tokens)

Every MCP tool adds a small overhead to each request because the AI needs to know what tools are available. Here's what MoltMind costs — and what it saves you:

| | Cost per request | In dollars |
|--|-----------------|------------|
| MoltMind overhead (14 tools) | ~500 tokens | ~$0.0015 |
| With prompt caching | ~50 tokens | ~$0.00015 |
| **Session resume (saves you)** | **~7,675 tokens** | **~$0.023** |

**Bottom line:** MoltMind pays for itself after a single session resume. Every conversation after that is pure savings.

## Free vs Pro

| | Free | Pro |
|--|------|-----|
| Stores per day | 20 | Unlimited |
| Total memories | 200 | Unlimited |
| Search | Unlimited | Unlimited |
| Session tools | Unlimited | Unlimited |
| Vector search | Brute-force | Zvec ANN (auto) |

Upgrade: `npx moltmind --upgrade`

## Search Performance (Pro)

Pro tier uses [Zvec ANN](https://github.com/ariv14/zvec-native) for fast memory search. Here's what that means in practice:

**Accuracy** — At 1,000 memories (a typical heavy user), Zvec finds **98% of the exact same results** as an exhaustive search. Your agent gets the right answer almost every time.

**Speed** — Search takes **under 1ms** at 1,000 memories. At 10,000 memories, it's still under 5ms. Your agent won't notice any delay.

**Reliability** — Handles **330+ searches per second** with zero latency spikes. Deleted memories never come back. Results are deterministic.

See [BENCHMARK_RESULTS.md](BENCHMARK_RESULTS.md) for the full report, or [RUNBOOK.md](RUNBOOK.md) for how to run benchmarks yourself.

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
