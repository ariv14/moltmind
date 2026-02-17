import { getDb } from "./db.js";
import { getToolMode } from "./config.js";

// Heuristic: ~4 characters per token for JSON responses
const CHARS_PER_TOKEN = 4;

// Estimated tokens for tool descriptions sent to LLM per request
const TOOL_OVERHEAD_DEFAULT = 500;
const TOOL_OVERHEAD_MOLTBOOK = 1000;

// Estimated tokens an agent spends re-exploring without session resume
const COLD_START_COST = 8000;

// Estimated tokens for a session_resume/handoff_load response
const RESUME_COST = 325;

export function estimateResponseTokens(responseLength: number): number {
  return Math.ceil(responseLength / CHARS_PER_TOKEN);
}

export function getToolOverheadTokens(): number {
  return getToolMode() === "moltbook" ? TOOL_OVERHEAD_MOLTBOOK : TOOL_OVERHEAD_DEFAULT;
}

export function estimateColdStartSavings(): number {
  return COLD_START_COST - RESUME_COST;
}

export interface TokenSavingsReport {
  sessions_tracked: number;
  overhead_tokens: number;
  tool_response_tokens: number;
  cold_starts_avoided: number;
  cold_start_savings: number;
  net_savings: number;
  savings_percent: number;
  mode: string;
}

export function upsertTokenEstimate(
  sessionId: string,
  responseTokensDelta: number,
  coldStartAvoided: boolean
): void {
  const database = getDb();
  const now = new Date().toISOString();
  const overhead = getToolOverheadTokens();

  const existing = database.prepare(
    "SELECT * FROM token_estimates WHERE session_id = ?"
  ).get(sessionId) as Record<string, unknown> | undefined;

  if (existing) {
    const newResponseTokens = (existing.tool_response_tokens as number) + responseTokensDelta;
    const newColdStart = coldStartAvoided ? 1 : (existing.cold_start_avoided as number);
    const savings = newColdStart * estimateColdStartSavings();
    const net = savings - overhead - newResponseTokens;

    database.prepare(`
      UPDATE token_estimates
      SET tool_response_tokens = ?, cold_start_avoided = ?, net_savings = ?, overhead_tokens = ?, updated_at = ?
      WHERE session_id = ?
    `).run(newResponseTokens, newColdStart, net, overhead, now, sessionId);
  } else {
    const coldStart = coldStartAvoided ? 1 : 0;
    const savings = coldStart * estimateColdStartSavings();
    const net = savings - overhead - responseTokensDelta;

    database.prepare(`
      INSERT INTO token_estimates (session_id, overhead_tokens, tool_response_tokens, cold_start_avoided, net_savings, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, overhead, responseTokensDelta, coldStart, net, now);
  }
}

export function getAggregateTokenSavings(): TokenSavingsReport {
  const database = getDb();

  const row = database.prepare(`
    SELECT
      COUNT(*) as sessions_tracked,
      COALESCE(SUM(overhead_tokens), 0) as overhead_tokens,
      COALESCE(SUM(tool_response_tokens), 0) as tool_response_tokens,
      COALESCE(SUM(cold_start_avoided), 0) as cold_starts_avoided,
      COALESCE(SUM(net_savings), 0) as net_savings
    FROM token_estimates
  `).get() as Record<string, number>;

  const coldStartSavings = row.cold_starts_avoided * estimateColdStartSavings();
  const totalCost = row.overhead_tokens + row.tool_response_tokens;
  const grossSavings = coldStartSavings;
  const savingsPercent = grossSavings > 0
    ? Math.round(((grossSavings - totalCost) / grossSavings) * 100)
    : 0;

  return {
    sessions_tracked: row.sessions_tracked,
    overhead_tokens: row.overhead_tokens,
    tool_response_tokens: row.tool_response_tokens,
    cold_starts_avoided: row.cold_starts_avoided,
    cold_start_savings: coldStartSavings,
    net_savings: row.net_savings,
    savings_percent: Math.max(0, savingsPercent),
    mode: getToolMode(),
  };
}
