#!/usr/bin/env npx tsx

/**
 * MoltMind Benchmark — Latency + Token Cost
 *
 * Measures real DB performance (store, keyword search, vector search)
 * and projects token cost savings across usage scenarios.
 *
 * Run: npm run benchmark
 */

import { performance } from "node:perf_hooks";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import crypto from "node:crypto";

// Token cost constants (matching token_estimator.ts)
const TOOL_OVERHEAD_DEFAULT = 500;
const TOOL_OVERHEAD_MOLTBOOK = 1000;
const COLD_START_COST = 8000;
const RESUME_COST = 325;
const PROMPT_CACHE_DISCOUNT = 0.9;

const MEMORY_COUNT = 50;
const SEARCH_ITERATIONS = 20;
const EMBEDDING_DIM = 384;

// --- Latency Benchmark ---

function generateSyntheticEmbedding(): Buffer {
  const arr = new Float32Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    arr[i] = Math.random() * 2 - 1;
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += arr[i] * arr[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < EMBEDDING_DIM; i++) arr[i] /= norm;
  return Buffer.from(arr.buffer);
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 10) return `${ms.toFixed(2)}ms`;
  return `${ms.toFixed(1)}ms`;
}

async function runLatencyBenchmark(): Promise<void> {
  // Create temp directory for isolated benchmark
  const tmpDir = join(tmpdir(), `moltmind-bench-${crypto.randomUUID().slice(0, 8)}`);
  mkdirSync(join(tmpDir, ".moltmind"), { recursive: true });

  // We need to set env/cwd to use the temp vault
  const originalCwd = process.cwd();
  process.chdir(tmpDir);

  try {
    // Dynamic import after chdir so db.ts picks up the right path
    const { insertMemory, searchMemoriesFTS, getAllMemories, closeDb } = await import("../src/db.js");
    const { BruteForceStore, initVectorStore } = await import("../src/vector_store.js");

    // Initialize project vault by triggering DB creation
    const { initProjectVault } = await import("../src/db.js");
    initProjectVault();

    const storeTimes: number[] = [];
    const memoryIds: string[] = [];
    const embeddings: Map<string, Float32Array> = new Map();

    // --- Store benchmark ---
    for (let i = 0; i < MEMORY_COUNT; i++) {
      const embedding = generateSyntheticEmbedding();
      const start = performance.now();
      const mem = insertMemory({
        type: "learning",
        title: `Benchmark memory ${i}: ${crypto.randomUUID().slice(0, 8)}`,
        content: `This is benchmark content for memory ${i}. It contains enough text to be realistic. Topics include TypeScript patterns, database optimization, and API design. Random seed: ${Math.random()}.`,
        tags: ["benchmark", `group-${i % 5}`],
        metadata: { index: i },
        embedding,
        tier: "hot",
      });
      storeTimes.push(performance.now() - start);
      memoryIds.push(mem.id);
      embeddings.set(mem.id, new Float32Array(embedding.buffer, embedding.byteOffset, EMBEDDING_DIM));
    }

    // --- FTS search benchmark ---
    const ftsQueries = [
      "TypeScript patterns",
      "database optimization",
      "API design",
      "benchmark content",
      "memory",
    ];
    const ftsTimes: number[] = [];
    for (let i = 0; i < SEARCH_ITERATIONS; i++) {
      const query = ftsQueries[i % ftsQueries.length];
      const start = performance.now();
      searchMemoriesFTS(query, 10);
      ftsTimes.push(performance.now() - start);
    }

    // --- Vector search benchmark ---
    const bruteStore = new BruteForceStore();
    initVectorStore(bruteStore);

    const vectorTimes: number[] = [];
    for (let i = 0; i < SEARCH_ITERATIONS; i++) {
      const queryEmbedding = generateSyntheticEmbedding();
      const queryVec = new Float32Array(queryEmbedding.buffer, queryEmbedding.byteOffset, EMBEDDING_DIM);
      const start = performance.now();
      bruteStore.search(queryVec, 10);
      vectorTimes.push(performance.now() - start);
    }

    // --- Print results ---
    storeTimes.sort((a, b) => a - b);
    ftsTimes.sort((a, b) => a - b);
    vectorTimes.sort((a, b) => a - b);

    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

    console.error(`\n## Latency (${MEMORY_COUNT} memories, SQLite + FTS5)\n`);
    console.error(`| Operation | Avg | p50 | p95 | Max |`);
    console.error(`|-----------|-----|-----|-----|-----|`);
    console.error(
      `| Store memory | ${formatMs(avg(storeTimes))} | ${formatMs(percentile(storeTimes, 50))} | ${formatMs(percentile(storeTimes, 95))} | ${formatMs(storeTimes[storeTimes.length - 1])} |`
    );
    console.error(
      `| Keyword search (FTS5) | ${formatMs(avg(ftsTimes))} | ${formatMs(percentile(ftsTimes, 50))} | ${formatMs(percentile(ftsTimes, 95))} | ${formatMs(ftsTimes[ftsTimes.length - 1])} |`
    );
    console.error(
      `| Vector search (brute-force) | ${formatMs(avg(vectorTimes))} | ${formatMs(percentile(vectorTimes, 50))} | ${formatMs(percentile(vectorTimes, 95))} | ${formatMs(vectorTimes[vectorTimes.length - 1])} |`
    );
    console.error("");

    closeDb();
  } finally {
    process.chdir(originalCwd);
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  }
}

// --- Free vs Pro comparison ---

function printFreeVsPro(): void {
  console.error("## Free vs Pro\n");
  console.error("| Feature | Free | Pro |");
  console.error("|---------|------|-----|");
  console.error("| Stores per day | 20 | Unlimited |");
  console.error("| Total memories | 200 | Unlimited |");
  console.error("| Vector search | Brute-force | Zvec ANN (auto) |");
  console.error("| Recall/search | Unlimited | Unlimited |");
  console.error("| Session tools | Unlimited | Unlimited |");
  console.error("");
}

// --- Token cost scenarios ---

interface Scenario {
  name: string;
  sessions: number;
  withoutMoltmind: number;
  withMoltmindDefault: number;
  withMoltmindMoltbook: number;
  withPromptCaching: number;
}

function runScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];

  // Scenario 1: Single cold start
  {
    const without = COLD_START_COST;
    const withDefault = RESUME_COST + TOOL_OVERHEAD_DEFAULT;
    const withMoltbook = RESUME_COST + TOOL_OVERHEAD_MOLTBOOK;
    const withCaching = RESUME_COST + Math.round(TOOL_OVERHEAD_DEFAULT * (1 - PROMPT_CACHE_DISCOUNT));

    scenarios.push({
      name: "Single session resume",
      sessions: 1,
      withoutMoltmind: without,
      withMoltmindDefault: withDefault,
      withMoltmindMoltbook: withMoltbook,
      withPromptCaching: withCaching,
    });
  }

  // Scenario 2: 5-session project
  {
    const sessions = 5;
    const avgToolCalls = 15;
    const avgResponseTokens = 50;

    const without = COLD_START_COST * sessions;
    const toolResponseCost = avgToolCalls * avgResponseTokens * sessions;
    const withDefault = (TOOL_OVERHEAD_DEFAULT * sessions) + (RESUME_COST * (sessions - 1)) + toolResponseCost;
    const withMoltbook = (TOOL_OVERHEAD_MOLTBOOK * sessions) + (RESUME_COST * (sessions - 1)) + toolResponseCost;
    const withCaching = (Math.round(TOOL_OVERHEAD_DEFAULT * (1 - PROMPT_CACHE_DISCOUNT)) * sessions) + (RESUME_COST * (sessions - 1)) + toolResponseCost;

    scenarios.push({
      name: "5-session project",
      sessions,
      withoutMoltmind: without,
      withMoltmindDefault: withDefault,
      withMoltmindMoltbook: withMoltbook,
      withPromptCaching: withCaching,
    });
  }

  // Scenario 3: Heavy usage (20 sessions)
  {
    const sessions = 20;
    const avgToolCalls = 20;
    const avgResponseTokens = 60;

    const without = COLD_START_COST * sessions;
    const toolResponseCost = avgToolCalls * avgResponseTokens * sessions;
    const withDefault = (TOOL_OVERHEAD_DEFAULT * sessions) + (RESUME_COST * (sessions - 1)) + toolResponseCost;
    const withMoltbook = (TOOL_OVERHEAD_MOLTBOOK * sessions) + (RESUME_COST * (sessions - 1)) + toolResponseCost;
    const withCaching = (Math.round(TOOL_OVERHEAD_DEFAULT * (1 - PROMPT_CACHE_DISCOUNT)) * sessions) + (RESUME_COST * (sessions - 1)) + toolResponseCost;

    scenarios.push({
      name: "20-session project",
      sessions,
      withoutMoltmind: without,
      withMoltmindDefault: withDefault,
      withMoltmindMoltbook: withMoltbook,
      withPromptCaching: withCaching,
    });
  }

  return scenarios;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `~${(n / 1000).toFixed(1)}k`;
  return `~${n}`;
}

function printTokenResults(scenarios: Scenario[]): void {
  console.error("## Tool Description Overhead\n");
  console.error(`| Mode | Tools | Overhead per request |`);
  console.error(`|------|-------|---------------------|`);
  console.error(`| Default (memory only) | 14 | ${formatTokens(TOOL_OVERHEAD_DEFAULT)} tokens |`);
  console.error(`| + Moltbook social | 21 | ${formatTokens(TOOL_OVERHEAD_MOLTBOOK)} tokens |`);
  console.error(`| Default + prompt caching | 14 | ${formatTokens(Math.round(TOOL_OVERHEAD_DEFAULT * (1 - PROMPT_CACHE_DISCOUNT)))} tokens |`);
  console.error("");

  console.error("## Token Cost Scenarios\n");
  console.error(`| Scenario | Without MoltMind | Default (14 tools) | + Moltbook (21 tools) | With prompt caching | Savings vs no MoltMind |`);
  console.error(`|----------|-----------------|-------------------|---------------------|--------------------|-----------------------|`);

  for (const s of scenarios) {
    const savings = Math.round(((s.withoutMoltmind - s.withMoltmindDefault) / s.withoutMoltmind) * 100);
    const cacheSavings = Math.round(((s.withoutMoltmind - s.withPromptCaching) / s.withoutMoltmind) * 100);
    console.error(
      `| ${s.name} | ${formatTokens(s.withoutMoltmind)} | ${formatTokens(s.withMoltmindDefault)} | ${formatTokens(s.withMoltmindMoltbook)} | ${formatTokens(s.withPromptCaching)} | ${savings}% (${cacheSavings}% cached) |`
    );
  }

  console.error("");
  console.error("## Key Insights\n");
  console.error(`- A single cold-start re-exploration costs ${formatTokens(COLD_START_COST)} tokens`);
  console.error(`- MoltMind's session resume does it in ${formatTokens(RESUME_COST)} tokens`);
  console.error(`- Tool description overhead is ${formatTokens(TOOL_OVERHEAD_DEFAULT)} tokens (default) — paid once per request`);
  console.error(`- With prompt caching (standard in Claude, GPT-4), real overhead drops to ${formatTokens(Math.round(TOOL_OVERHEAD_DEFAULT * (1 - PROMPT_CACHE_DISCOUNT)))} tokens`);
  console.error(`- The overhead pays for itself after one session resume`);
}

// --- Main ---

async function main(): Promise<void> {
  console.error("# MoltMind Benchmark\n");

  await runLatencyBenchmark();
  printFreeVsPro();

  const scenarios = runScenarios();
  printTokenResults(scenarios);
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
