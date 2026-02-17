# MoltMind

Persistent semantic memory and session continuity for AI agents. One install, zero config, runs 100% locally.

MoltMind is an [MCP](https://modelcontextprotocol.io) server that gives your AI agent long-term memory and session continuity. It stores learnings, decisions, error fixes, and handoff context across sessions using local SQLite and embeddings — no API keys, no cloud, no accounts needed.

## Quick Start

Each setup below shows two options: **default** (14 memory + session tools) and **with moltbook** (adds 7 social tools for [moltbook.com](https://moltbook.com)).

### Claude Code

```bash
# Default (memory + sessions)
claude mcp add moltmind -- npx -y moltmind

# With moltbook social
claude mcp add moltmind -- npx -y moltmind --moltbook
```

Restart Claude Code, then run `/mcp` to verify.

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

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

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

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

### VS Code (GitHub Copilot)

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "moltmind": {
      "command": "npx",
      "args": ["-y", "moltmind"]
    }
  }
}
```

With moltbook: `"args": ["-y", "moltmind", "--moltbook"]`

Or add to VS Code `settings.json` under `"mcp" > "servers"` with the same format.

### Cline

Add to Cline's MCP settings (Settings > MCP Servers > Edit Config):

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

### OpenAI Codex CLI

```bash
# Default
codex --mcp-config '{"mcpServers":{"moltmind":{"command":"npx","args":["-y","moltmind"]}}}'

# With moltbook
codex --mcp-config '{"mcpServers":{"moltmind":{"command":"npx","args":["-y","moltmind","--moltbook"]}}}'
```

Or add to `~/.codex/config.json`:

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

### Any MCP-compatible client

MoltMind works with any client that supports the [Model Context Protocol](https://modelcontextprotocol.io). Point it at `npx -y moltmind` as a STDIO server:

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

## Tools

MoltMind provides 14 core tools by default (21 with `--moltbook`):

| Tool | Description |
|------|-------------|
| `mm_store` | Store a memory (learning, error fix, decision, plan, or raw note) |
| `mm_recall` | Search memories using natural language — hybrid semantic + keyword search |
| `mm_read` | Read a specific memory by ID |
| `mm_update` | Update title, content, tags, or type of an existing memory |
| `mm_delete` | Archive a memory (soft delete) |
| `mm_status` | Server health dashboard: DB stats, health score, uptime |
| `mm_init` | Create a project-local memory vault in the current directory |
| `mm_handoff_create` | Create a structured handoff for agent-to-agent context transfer |
| `mm_handoff_load` | Load the most recent handoff to resume context |
| `mm_session_save` | Save session summary, actions, outcomes, and where you left off |
| `mm_session_resume` | Load recent sessions + latest handoff for context recovery |
| `mm_session_history` | List past sessions with filtering and per-session tool call stats |
| `mm_feedback` | Report bugs, request features, or flag friction |
| `mm_metrics` | Full adoption and health metrics dashboard |

## How It Works

### Memory Storage
Memories are stored in a local SQLite database with full-text search (FTS5). Each memory has a type (`learning`, `error`, `decision`, `plan`, `raw`), tags, metadata, and a tier (`hot`, `warm`, `cold`, `archived`).

### Hybrid Search
When you use `mm_recall`, MoltMind runs two searches in parallel:
- **Semantic search** (weight: 0.7) — embeds your query with a local transformer model and finds similar memories by meaning
- **Keyword search** (weight: 0.3) — uses SQLite FTS5 for exact and partial word matches

Results are merged, deduplicated, and ranked by combined score. If the embedding model isn't available, it falls back to keyword-only search.

### Local Embeddings
MoltMind uses [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) (~22MB) to generate 384-dimensional embeddings. The model downloads automatically on first use and is cached at `~/.moltmind/models/`.

### Memory Tiers
- **hot** — actively used, high relevance
- **warm** — less frequently accessed
- **cold** — rarely accessed but retained
- **archived** — soft-deleted, excluded from search

### Handoffs
`mm_handoff_create` captures structured context (goal, current state, next action, constraints, unknowns, artifacts, stop conditions) so a future session or different agent can pick up exactly where you left off.

### Session Continuity
MoltMind automatically tracks sessions across agent restarts:
- **Auto-created** on server startup — every session gets a unique ID
- **Auto-paused** on shutdown (SIGINT/SIGTERM) — no data lost on disconnect
- **`mm_session_save`** — save what happened, what was accomplished, and where you left off
- **`mm_session_resume`** — load recent sessions and the latest handoff to restore context
- **`mm_session_history`** — browse past sessions with per-session tool call stats

All diagnostics are tagged with the current session ID, so you can see exactly what tools were called in each session.

### Diagnostics & Metrics
Every tool call is logged locally with latency and success/failure. `mm_status` shows a health score, and `mm_metrics` provides a full dashboard of adoption data, per-tool usage stats, error rates, and token savings estimates. All data stays on your machine.

## Data Storage

| Path | Purpose |
|------|---------|
| `~/.moltmind/memory.db` | Global memory vault |
| `./.moltmind/memory.db` | Project-local vault (created by `mm_init`) |
| `~/.moltmind/models/` | Cached embedding model |
| `~/.moltmind/instance_id` | Anonymous instance identifier |

## Token Cost

MCP tools add token overhead because their descriptions are sent with every LLM request. MoltMind is designed to pay for itself quickly:

### Overhead

| Mode | Tools | Overhead per request |
|------|-------|---------------------|
| Default (memory + sessions) | 14 | ~500 tokens |
| + Moltbook social (`--moltbook`) | 21 | ~1,000 tokens |
| Default + prompt caching | 14 | ~50 tokens |

Most LLM providers (Claude, GPT-4) cache tool descriptions after the first request, reducing real overhead by ~90%.

### ROI: session resume vs cold start

Without MoltMind, an agent re-exploring a codebase from scratch costs **~8,000 tokens** per session. MoltMind's `mm_session_resume` restores full context in **~325 tokens** — a 96% reduction.

| Scenario | Without MoltMind | With MoltMind | Savings |
|----------|-----------------|---------------|---------|
| Single session resume | ~8,000 tokens | ~825 tokens | 90% |
| 5-session project | ~40,000 tokens | ~7,500 tokens | 81% |
| 20-session project | ~160,000 tokens | ~40,200 tokens | 75% |

The tool overhead pays for itself after a single session resume.

### Built-in tracking

MoltMind tracks token savings automatically. Run `mm_metrics` to see your cumulative savings:

```
Token Savings (estimated):
  Sessions tracked: 15
  Cold starts avoided: 12 (saved ~92,100 tokens)
  Mode: default (add --moltbook for social tools)
```

### Benchmark

Run the built-in benchmark to see projected savings for your usage pattern:

```bash
npm run benchmark
```

## Architecture

```
Agent (Claude Code / Cursor / any MCP client)
  │
  ▼ (STDIO JSON-RPC)
┌─────────────────────────────────────┐
│  MCP Server (src/index.ts)          │
│  14-21 tools with zod validation    │
│  withDiagnostics() on every call    │
├─────────────────────────────────────┤
│  Embeddings        │  Diagnostics   │
│  MiniLM-L6-v2      │  Health score  │
│  384-dim vectors    │  Feedback      │
│  Graceful fallback  │  Metrics       │
├─────────────────────────────────────┤
│  SQLite + WAL + FTS5                │
│  Schema v5 with migrations          │
└─────────────────────────────────────┘
```

## Requirements

- Node.js 18+
- No API keys required
- No internet required after first embedding model download

## License

MIT
