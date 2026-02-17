#!/usr/bin/env npx tsx

/**
 * Token Cost Benchmark for MoltMind
 *
 * Simulates 3 scenarios with pre-calculated estimates (no actual LLM calls):
 * 1. Single cold start: with vs without MoltMind
 * 2. 5-session project: cumulative savings
 * 3. With prompt caching: real-world cost reduction
 *
 * Run: npm run benchmark
 */

// Constants (matching token_estimator.ts)
const TOOL_OVERHEAD_DEFAULT = 500;
const TOOL_OVERHEAD_MOLTBOOK = 1000;
const COLD_START_COST = 8000;
const RESUME_COST = 325;
const PROMPT_CACHE_DISCOUNT = 0.9; // 90% cheaper with caching

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

function printResults(scenarios: Scenario[]): void {
  console.error("# MoltMind Token Cost Benchmark\n");

  console.error("## Tool Description Overhead\n");
  console.error(`| Mode | Tools | Overhead per request |`);
  console.error(`|------|-------|---------------------|`);
  console.error(`| Default (memory only) | 14 | ${formatTokens(TOOL_OVERHEAD_DEFAULT)} tokens |`);
  console.error(`| + Moltbook social | 21 | ${formatTokens(TOOL_OVERHEAD_MOLTBOOK)} tokens |`);
  console.error(`| Default + prompt caching | 14 | ${formatTokens(Math.round(TOOL_OVERHEAD_DEFAULT * (1 - PROMPT_CACHE_DISCOUNT)))} tokens |`);
  console.error("");

  console.error("## Scenario Comparison\n");
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
  console.error(`- Use \`--moltbook\` flag only when you need social features`);
}

const scenarios = runScenarios();
printResults(scenarios);
