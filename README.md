# MoltMind

Persistent semantic memory and session continuity for AI agents. One install, zero config, runs 100% locally.

MoltMind is an [MCP](https://modelcontextprotocol.io) server that gives your AI agent long-term memory and session continuity. It stores learnings, decisions, error fixes, and handoff context across sessions using local SQLite and embeddings — no API keys, no cloud, no accounts needed.

## Quick Start

**Claude Code:**
```bash
npx -y moltmind            # downloads and verifies
claude mcp add moltmind -- npx -y moltmind
# Restart Claude Code, then run /mcp to verify
```

**Cursor / Windsurf / Cline:**
Add to your MCP config:
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

## Tools

MoltMind provides 14 tools that your agent can use:

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
Every tool call is logged locally with latency and success/failure. `mm_status` shows a health score, and `mm_metrics` provides a full dashboard of adoption data, per-tool usage stats, and error rates. All data stays on your machine.

## Data Storage

| Path | Purpose |
|------|---------|
| `~/.moltmind/memory.db` | Global memory vault |
| `./.moltmind/memory.db` | Project-local vault (created by `mm_init`) |
| `~/.moltmind/models/` | Cached embedding model |
| `~/.moltmind/instance_id` | Anonymous instance identifier |

## Architecture

```
Agent (Claude Code / Cursor / any MCP client)
  │
  ▼ (STDIO JSON-RPC)
┌─────────────────────────────────────┐
│  MCP Server (src/index.ts)          │
│  14 tools with zod validation       │
│  withDiagnostics() on every call    │
├─────────────────────────────────────┤
│  Embeddings        │  Diagnostics   │
│  MiniLM-L6-v2      │  Health score  │
│  384-dim vectors    │  Feedback      │
│  Graceful fallback  │  Metrics       │
├─────────────────────────────────────┤
│  SQLite + WAL + FTS5                │
│  Schema v4 with migrations          │
└─────────────────────────────────────┘
```

## Requirements

- Node.js 18+
- No API keys required
- No internet required after first embedding model download

## License

MIT
