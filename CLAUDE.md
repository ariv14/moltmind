# MoltMind — Agent Memory MCP Server

## Project Overview
MoltMind is a TypeScript MCP (Model Context Protocol) server that provides persistent semantic memory for AI agents. Agents install it via `npx -y moltmind` and get 8 tools for storing, recalling, and handing off context across sessions. It runs 100% locally — no API keys, no cloud, no accounts needed for the core product.

See @README.md for user-facing documentation and @package.json for available scripts.

## Tech Stack
- **Language:** TypeScript (strict mode, ES2022 target, NodeNext module resolution)
- **Module system:** ES Modules only — use `import/export`, never `require()`
- **MCP SDK:** `@modelcontextprotocol/sdk` (v1.26+) — STDIO transport for local, Streamable HTTP for remote
- **Database:** `better-sqlite3` — synchronous, zero-config, embedded
- **Embeddings:** `@xenova/transformers` with `Xenova/all-MiniLM-L6-v2` model (384 dimensions, ~22MB, runs locally)
- **Runtime:** Node.js 18+
- **Package manager:** npm

## Critical Rules

### STDIO Safety
- **NEVER use `console.log()` anywhere in the codebase.** STDIO MCP servers communicate over stdout. Any `console.log` corrupts the JSON-RPC protocol and breaks the server. Use `console.error()` for all debug output.
- Always test after changes by running: `echo '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"},"protocolVersion":"2025-03-26"}}' | node dist/index.js` — if it hangs or prints garbage, something is writing to stdout.

### Code Style
- Use 2-space indentation
- Destructure imports: `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"`
- Use `crypto.randomUUID()` for generating IDs
- All dates stored as ISO 8601 strings: `new Date().toISOString()`
- Prefer `const` over `let`, never use `var`
- All functions that interact with the database should be synchronous (better-sqlite3 is sync)
- All functions that generate embeddings must be `async` (transformers.js is async)
- Type all function parameters and return types explicitly — no implicit `any`

### File Organization
- `src/index.ts` — MCP server setup, tool registration, transport initialization. Entry point with `#!/usr/bin/env node` shebang.
- `src/db.ts` — SQLite schema, migrations, and all database read/write functions. Export a singleton.
- `src/embeddings.ts` — Model loading, embedding generation, cosine similarity, semantic search. Lazy-load the model on first use.
- `src/tools/` — One file per MCP tool. Each file exports a handler function. Naming convention: `mm_toolname.ts`
- `src/types.ts` — Shared TypeScript interfaces and types

### Database Conventions
- Global vault location: `~/.moltmind/memory.db`
- Project vault location: `./.moltmind/memory.db` (created by `mm_init`)
- Always create parent directories with `mkdirSync(path, { recursive: true })` before opening DB
- Use `WAL` journal mode for better concurrent read performance
- Use parameterized queries — never interpolate values into SQL strings

### Embedding Engine Conventions
- Model is downloaded on first use to `~/.moltmind/models/`
- Show download progress via `console.error` (never stdout)
- Embeddings are stored as `Buffer` from `Float32Array` in SQLite BLOB columns
- Always normalize embeddings before cosine similarity (the model already does this, but verify)
- Hybrid search: weight semantic results at 0.7 and FTS5 keyword results at 0.3

### MCP Tool Conventions
- Every tool must have a clear `description` string that tells the AI when to use it
- Input parameters use `zod` schemas via the SDK's built-in validation
- All tools return JSON objects with a `success: boolean` field
- Error responses include a `message` field explaining what went wrong
- Tools that modify data should also update `updated_at` timestamps
- Tools that read data should update `accessed_at` and increment `access_count`

## Commands
- `npm run build` — Compile TypeScript to `dist/`
- `npm run dev` — Watch mode with `tsx watch src/index.ts`
- `npm test` — Run tests with Node's built-in test runner
- `npm run lint` — Run TypeScript type checking (`tsc --noEmit`)
- `npm run clean` — Remove `dist/` directory

## Testing
- Use Node.js built-in `node:test` and `node:assert` — no external test frameworks
- Test files go in `tests/` directory, named `*.test.ts`
- Run a single test: `npx tsx --test tests/db.test.ts`
- Every tool should have at least one happy-path and one error-path test
- For embedding tests, mock the transformer model to avoid downloading 22MB during CI

## Git Workflow
- Branch from `main` for features: `feat/tool-name` or `fix/description`
- Commit messages: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:` prefixes
- Run `npm run lint` and `npm test` before committing
- PR descriptions should reference the relevant plan.md phase

## What NOT to Do
- Do not add express, fastify, or any HTTP framework for the MVP — the MCP SDK handles transport
- Do not use any external API for embeddings — everything runs locally
- Do not store raw embedding model files in the git repo
- Do not add a `.env` file for the core product — it has zero config
- Do not import from `dist/` — always import from `src/` during development
