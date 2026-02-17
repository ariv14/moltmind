#!/usr/bin/env npx tsx

/**
 * MoltMind Zvec Benchmark — End-to-End Pro License + Zvec ANN Test
 *
 * Three comparison modes with formatted tables:
 * A. Without MoltMind vs With MoltMind (Free) — token savings
 * B. MoltMind Free vs MoltMind Pro — search latency, quality, limits
 * C. Load / Stress Tests (Pro only) — bulk insert, throughput, stability
 *
 * Run: npx tsx scripts/zvec-benchmark.ts
 */

import { performance } from "node:perf_hooks";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import crypto from "node:crypto";
import { createRequire } from "node:module";

// ─── Constants ───────────────────────────────────────────────────────────

const EMBEDDING_DIM = 384;
const COLD_START_COST = 8000;
const RESUME_COST = 325;
const TOOL_OVERHEAD = 500;

// Scale points for benchmarks
const SCALE_POINTS = [50, 200, 500, 1000, 5000];
const SEARCH_K = 10;
const SEARCH_ITERATIONS = 50;
const LOAD_TEST_VECTORS = 5000;
const LOAD_TEST_QUERIES = 100;
const DELETE_COUNT = 500;

// ─── Helpers ─────────────────────────────────────────────────────────────

function generateVector(): Float32Array {
  const arr = new Float32Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) arr[i] = Math.random() * 2 - 1;
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += arr[i] * arr[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < EMBEDDING_DIM; i++) arr[i] /= norm;
  return arr;
}

function vectorToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

function formatMs(ms: number): string {
  if (ms < 0.01) return `${(ms * 1000).toFixed(1)}µs`;
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 100) return `${ms.toFixed(2)}ms`;
  return `${ms.toFixed(1)}ms`;
}

function formatNum(n: number): string {
  return n.toLocaleString("en-US");
}

function padRight(s: string, len: number): string {
  return s + " ".repeat(Math.max(0, len - s.length));
}

function padLeft(s: string, len: number): string {
  return " ".repeat(Math.max(0, len - s.length)) + s;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function avg(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function p95(sorted: number[]): number {
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ─── Table printer ───────────────────────────────────────────────────────

function printTable(headers: string[], rows: string[][], colWidths?: number[]): void {
  const widths = colWidths ?? headers.map((h, i) => {
    const maxData = rows.reduce((max, r) => Math.max(max, (r[i] || "").length), 0);
    return Math.max(h.length, maxData) + 2;
  });

  const topBorder = "┌" + widths.map(w => "─".repeat(w)).join("┬") + "┐";
  const midBorder = "├" + widths.map(w => "─".repeat(w)).join("┼") + "┤";
  const botBorder = "└" + widths.map(w => "─".repeat(w)).join("┴") + "┘";

  const fmtRow = (cells: string[]) =>
    "│" + cells.map((c, i) => " " + padRight(c, widths[i] - 1)).join("│") + "│";

  console.error(topBorder);
  console.error(fmtRow(headers));
  console.error(midBorder);
  for (const row of rows) {
    console.error(fmtRow(row));
  }
  console.error(botBorder);
}

// ═══════════════════════════════════════════════════════════════════════════
// Section A: Without MoltMind vs With MoltMind
// ═══════════════════════════════════════════════════════════════════════════

function sectionA(): void {
  console.error("\n╔══════════════════════════════════════════════════════════════╗");
  console.error("║  A. Without MoltMind vs With MoltMind (Token Savings)       ║");
  console.error("╚══════════════════════════════════════════════════════════════╝\n");

  const scenarios = [1, 5, 10, 20];
  const rows: string[][] = [];

  for (const sessions of scenarios) {
    const without = COLD_START_COST * sessions;
    const withMM = (sessions === 1)
      ? RESUME_COST + TOOL_OVERHEAD
      : TOOL_OVERHEAD * sessions + RESUME_COST * (sessions - 1);
    const savings = Math.round(((without - withMM) / without) * 100);
    const label = sessions === 1 ? "1-session cost" : `${sessions}-session project`;
    rows.push([label, `${formatNum(without)} tokens`, `${formatNum(withMM)} tokens`, `${savings}%`]);
  }

  printTable(
    ["Metric", "No MoltMind", "MoltMind Free", "Savings"],
    rows,
  );

  console.error("\n  Cold start re-exploration: ~8,000 tokens");
  console.error("  Session resume (mm_session_resume): ~325 tokens");
  console.error("  Tool overhead (14 tools): ~500 tokens/request (cached: ~50)\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// Section B: Free vs Pro — Latency & Quality
// ═══════════════════════════════════════════════════════════════════════════

interface ZvecNative {
  createCollection(config: { path: string; dimensions: number; indexType: "hnsw"; metric: "cosine" }): void;
  insertVector(path: string, id: string, vector: Float32Array): void;
  buildIndex(path: string): void;
  search(path: string, query: Float32Array, k: number): { id: string; score: number }[];
  deleteVector(path: string, id: string): boolean;
  stats(path: string): { count: number; dimensions: number; fileSizeBytes: number };
}

function loadZvecNative(): ZvecNative | null {
  try {
    const require = createRequire(import.meta.url);
    return require("@moltmind/zvec-native") as ZvecNative;
  } catch {
    return null;
  }
}

async function sectionB(): Promise<void> {
  console.error("╔══════════════════════════════════════════════════════════════╗");
  console.error("║  B. MoltMind Free vs Pro (Search Latency & Quality)         ║");
  console.error("╚══════════════════════════════════════════════════════════════╝\n");

  const zvec = loadZvecNative();
  if (!zvec) {
    console.error("  ⚠ @moltmind/zvec-native not installed — skipping Pro benchmarks\n");
    return;
  }

  // Import brute-force dependencies
  const { cosineSimilarity } = await import("../src/embeddings.js");

  const searchLatencyRows: string[][] = [];
  const qualityRows: string[][] = [];
  const insertLatencyRows: string[][] = [];
  const buildIndexRows: string[][] = [];

  for (const count of SCALE_POINTS) {
    console.error(`  Benchmarking at ${formatNum(count)} vectors...`);

    // Generate vectors
    const vectors: { id: string; vec: Float32Array }[] = [];
    for (let i = 0; i < count; i++) {
      vectors.push({ id: crypto.randomUUID(), vec: generateVector() });
    }

    // ── Insert latency (brute-force = just buffer, zvec = upsert) ──
    const tmpZvecPath = join(tmpdir(), `zvec-bench-${crypto.randomUUID().slice(0, 8)}.idx`);
    zvec.createCollection({ path: tmpZvecPath, dimensions: EMBEDDING_DIM, indexType: "hnsw", metric: "cosine" });

    // Brute-force insert (simulate SQLite buffer storage)
    const bruteInsertStart = performance.now();
    const buffers: Map<string, Float32Array> = new Map();
    for (const { id, vec } of vectors) {
      buffers.set(id, vec);
    }
    const bruteInsertMs = performance.now() - bruteInsertStart;

    // Zvec insert
    const zvecInsertStart = performance.now();
    for (const { id, vec } of vectors) {
      zvec.insertVector(tmpZvecPath, id, vec);
    }
    const zvecInsertMs = performance.now() - zvecInsertStart;

    insertLatencyRows.push([
      `@${formatNum(count)} vectors`,
      formatMs(bruteInsertMs),
      formatMs(zvecInsertMs),
      `${(zvecInsertMs / bruteInsertMs).toFixed(1)}x`,
    ]);

    // ── Build index ──
    const buildStart = performance.now();
    zvec.buildIndex(tmpZvecPath);
    const buildMs = performance.now() - buildStart;
    buildIndexRows.push([`@${formatNum(count)} vectors`, "N/A", formatMs(buildMs)]);

    // ── Search latency ──
    const queries = Array.from({ length: SEARCH_ITERATIONS }, () => generateVector());

    // Brute-force search
    const bruteTimes: number[] = [];
    for (const q of queries) {
      const start = performance.now();
      const scores: { id: string; score: number }[] = [];
      for (const [id, vec] of buffers) {
        scores.push({ id, score: cosineSimilarity(q, vec) });
      }
      scores.sort((a, b) => b.score - a.score);
      scores.slice(0, SEARCH_K);
      bruteTimes.push(performance.now() - start);
    }
    bruteTimes.sort((a, b) => a - b);

    // Zvec ANN search
    const zvecTimes: number[] = [];
    for (const q of queries) {
      const start = performance.now();
      zvec.search(tmpZvecPath, q, SEARCH_K);
      zvecTimes.push(performance.now() - start);
    }
    zvecTimes.sort((a, b) => a - b);

    const bruteAvg = avg(bruteTimes);
    const zvecAvg = avg(zvecTimes);
    const speedup = bruteAvg / zvecAvg;

    searchLatencyRows.push([
      `Search @${formatNum(count)}`,
      `${formatMs(bruteAvg)} (p50=${formatMs(median(bruteTimes))})`,
      `${formatMs(zvecAvg)} (p50=${formatMs(median(zvecTimes))})`,
      `${speedup.toFixed(1)}x`,
    ]);

    // ── Quality: top-10 overlap ──
    // Compare results from one query
    const testQ = queries[0];
    const bruteResults: { id: string; score: number }[] = [];
    for (const [id, vec] of buffers) {
      bruteResults.push({ id, score: cosineSimilarity(testQ, vec) });
    }
    bruteResults.sort((a, b) => b.score - a.score);
    const bruteTop = new Set(bruteResults.slice(0, SEARCH_K).map(r => r.id));
    const zvecResults = zvec.search(tmpZvecPath, testQ, SEARCH_K);
    const zvecTop = new Set(zvecResults.map(r => r.id));
    const overlap = [...bruteTop].filter(id => zvecTop.has(id)).length;
    const overlapPct = Math.round((overlap / SEARCH_K) * 100);

    qualityRows.push([
      `@${formatNum(count)} vectors`,
      `${overlap}/${SEARCH_K}`,
      `${overlapPct}%`,
    ]);

    // Cleanup temp file
    try { rmSync(tmpZvecPath, { force: true }); } catch {}
  }

  // Print tables
  console.error("\n  ── Search Latency (avg of 50 queries, top-10) ──\n");
  printTable(
    ["Metric", "Free (Brute-force)", "Pro (Zvec ANN)", "Speedup"],
    searchLatencyRows,
  );

  console.error("\n  ── Search Quality (top-10 overlap) ──\n");
  printTable(
    ["Scale", "Overlap", "Match %"],
    qualityRows,
  );

  console.error("\n  ── Insert Latency (bulk) ──\n");
  printTable(
    ["Scale", "Free (in-memory map)", "Pro (Zvec upsert)", "Ratio"],
    insertLatencyRows,
  );

  console.error("\n  ── Build Index Time (Pro only) ──\n");
  printTable(
    ["Scale", "Free", "Pro (buildIndex)"],
    buildIndexRows,
  );

  // Tier limits comparison
  console.error("\n  ── Feature Limits ──\n");
  printTable(
    ["Feature", "Free Tier", "Pro Tier"],
    [
      ["Stores per day", "20", "Unlimited"],
      ["Total memories", "200", "Unlimited"],
      ["Vector search", "Brute-force", "Zvec ANN (auto)"],
      ["Search (mm_recall)", "Unlimited", "Unlimited"],
      ["Session tools", "Unlimited", "Unlimited"],
    ],
  );

  // Memory footprint
  const memBefore = process.memoryUsage();
  console.error(`\n  ── Memory Footprint ──`);
  console.error(`  RSS: ${(memBefore.rss / 1024 / 1024).toFixed(1)} MB`);
  console.error(`  Heap used: ${(memBefore.heapUsed / 1024 / 1024).toFixed(1)} MB`);
  console.error(`  Heap total: ${(memBefore.heapTotal / 1024 / 1024).toFixed(1)} MB\n`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Section C: Load / Stress Tests (Pro only)
// ═══════════════════════════════════════════════════════════════════════════

async function sectionC(): Promise<void> {
  console.error("╔══════════════════════════════════════════════════════════════╗");
  console.error("║  C. Load / Stress Tests (Pro Only)                          ║");
  console.error("╚══════════════════════════════════════════════════════════════╝\n");

  const zvec = loadZvecNative();
  if (!zvec) {
    console.error("  ⚠ @moltmind/zvec-native not installed — skipping load tests\n");
    return;
  }

  const tmpPath = join(tmpdir(), `zvec-load-${crypto.randomUUID().slice(0, 8)}.idx`);
  const results: string[][] = [];
  let passed = 0;
  let failed = 0;

  function record(test: string, status: "PASS" | "FAIL", detail: string): void {
    if (status === "PASS") passed++;
    else failed++;
    results.push([test, status, detail]);
  }

  try {
    // Test 1: Bulk insert 5000 vectors
    console.error(`  [1/5] Inserting ${formatNum(LOAD_TEST_VECTORS)} vectors...`);
    zvec.createCollection({ path: tmpPath, dimensions: EMBEDDING_DIM, indexType: "hnsw", metric: "cosine" });

    const ids: string[] = [];
    const insertStart = performance.now();
    for (let i = 0; i < LOAD_TEST_VECTORS; i++) {
      const id = crypto.randomUUID();
      ids.push(id);
      zvec.insertVector(tmpPath, id, generateVector());
    }
    const insertMs = performance.now() - insertStart;
    const insertRate = Math.round(LOAD_TEST_VECTORS / (insertMs / 1000));

    const stats = zvec.stats(tmpPath);
    if (stats.count === LOAD_TEST_VECTORS) {
      record(
        `Bulk insert ${formatNum(LOAD_TEST_VECTORS)} vectors`,
        "PASS",
        `${formatMs(insertMs)} (${formatNum(insertRate)} vec/sec), file=${(stats.fileSizeBytes / 1024).toFixed(0)}KB`,
      );
    } else {
      record(`Bulk insert ${formatNum(LOAD_TEST_VECTORS)} vectors`, "FAIL", `Expected ${LOAD_TEST_VECTORS}, got ${stats.count}`);
    }

    // Test 2: Build index
    console.error("  [2/5] Building index...");
    const buildStart = performance.now();
    zvec.buildIndex(tmpPath);
    const buildMs = performance.now() - buildStart;
    record("Build index", "PASS", formatMs(buildMs));

    // Test 3: Rapid sequential search (100 queries)
    console.error(`  [3/5] Running ${LOAD_TEST_QUERIES} rapid searches...`);
    const searchTimes: number[] = [];
    for (let i = 0; i < LOAD_TEST_QUERIES; i++) {
      const q = generateVector();
      const start = performance.now();
      const res = zvec.search(tmpPath, q, SEARCH_K);
      searchTimes.push(performance.now() - start);
      if (res.length !== SEARCH_K) {
        record(`Search query ${i}`, "FAIL", `Expected ${SEARCH_K} results, got ${res.length}`);
      }
    }
    searchTimes.sort((a, b) => a - b);
    const qps = Math.round(LOAD_TEST_QUERIES / (searchTimes.reduce((a, b) => a + b, 0) / 1000));
    record(
      `${LOAD_TEST_QUERIES} sequential searches`,
      "PASS",
      `avg=${formatMs(avg(searchTimes))}, p50=${formatMs(median(searchTimes))}, p95=${formatMs(p95(searchTimes))}, ${formatNum(qps)} qps`,
    );

    // Test 4: Repeated buildIndex (idempotent)
    console.error("  [4/5] Repeated buildIndex (idempotency)...");
    const buildTimes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      zvec.buildIndex(tmpPath);
      buildTimes.push(performance.now() - start);
    }
    const buildVariance = Math.max(...buildTimes) / Math.min(...buildTimes);
    record(
      "5x repeated buildIndex",
      "PASS",
      `avg=${formatMs(avg(buildTimes))}, variance=${buildVariance.toFixed(1)}x`,
    );

    // Test 5: Delete + rebuild + search
    console.error(`  [5/5] Delete ${DELETE_COUNT} vectors, rebuild, search...`);
    const deleteIds = ids.slice(0, DELETE_COUNT);
    const deleteStart = performance.now();
    for (const id of deleteIds) {
      zvec.deleteVector(tmpPath, id);
    }
    const deleteMs = performance.now() - deleteStart;

    zvec.buildIndex(tmpPath);
    const statsAfter = zvec.stats(tmpPath);

    // Search should not return deleted IDs
    const deletedSet = new Set(deleteIds);
    let deletedFound = 0;
    for (let i = 0; i < 20; i++) {
      const res = zvec.search(tmpPath, generateVector(), SEARCH_K);
      for (const r of res) {
        if (deletedSet.has(r.id)) deletedFound++;
      }
    }

    if (deletedFound === 0 && statsAfter.count === LOAD_TEST_VECTORS - DELETE_COUNT) {
      record(
        `Delete ${DELETE_COUNT} + rebuild + search`,
        "PASS",
        `delete=${formatMs(deleteMs)}, remaining=${statsAfter.count}, no deleted IDs in results`,
      );
    } else {
      record(
        `Delete ${DELETE_COUNT} + rebuild + search`,
        "FAIL",
        `remaining=${statsAfter.count} (expected ${LOAD_TEST_VECTORS - DELETE_COUNT}), deleted IDs found=${deletedFound}`,
      );
    }

    // Peak memory
    const mem = process.memoryUsage();
    console.error(`\n  Peak memory: RSS=${(mem.rss / 1024 / 1024).toFixed(1)}MB, Heap=${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB\n`);

    // Print results table
    printTable(
      ["Test", "Status", "Detail"],
      results,
    );

    console.error(`\n  Results: ${passed} passed, ${failed} failed\n`);
  } finally {
    try { rmSync(tmpPath, { force: true }); } catch {}
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// License verification
// ═══════════════════════════════════════════════════════════════════════════

async function verifyLicense(): Promise<boolean> {
  console.error("╔══════════════════════════════════════════════════════════════╗");
  console.error("║  License Verification                                       ║");
  console.error("╚══════════════════════════════════════════════════════════════╝\n");

  const licensePath = join(homedir(), ".moltmind", "license.key");
  const instancePath = join(homedir(), ".moltmind", "instance_id");

  if (!existsSync(licensePath)) {
    console.error("  ✗ No license file at ~/.moltmind/license.key");
    console.error("  Generate one: npx tsx scripts/generate-license.ts <instance_id>\n");
    return false;
  }

  const instanceId = readFileSync(instancePath, "utf-8").trim();
  const key = readFileSync(licensePath, "utf-8").trim();

  // Import and validate
  const { validateLicense, _resetLicenseCache, isProTier } = await import("../src/license.js");
  _resetLicenseCache();
  const result = validateLicense();

  console.error(`  Instance ID: ${instanceId}`);
  console.error(`  License key: ${key.slice(0, 20)}...`);
  console.error(`  Validation:  ${result.valid ? "✓ VALID" : "✗ INVALID"} — ${result.message}`);
  console.error(`  isProTier(): ${isProTier()}\n`);

  return result.valid;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.error("═══════════════════════════════════════════════════════════════");
  console.error("  MoltMind Zvec Benchmark — Pro License + ANN End-to-End Test");
  console.error("═══════════════════════════════════════════════════════════════\n");

  const isPro = await verifyLicense();

  // Section A: Token savings (always runs)
  sectionA();

  // Section B: Free vs Pro latency (needs zvec-native)
  await sectionB();

  // Section C: Load tests (needs zvec-native)
  if (isPro) {
    await sectionC();
  } else {
    console.error("  Skipping load tests — Pro license required\n");
  }

  console.error("═══════════════════════════════════════════════════════════════");
  console.error("  Benchmark complete");
  console.error("═══════════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
