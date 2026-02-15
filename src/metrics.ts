import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import crypto from "node:crypto";
import { getMetric, setMetric, getDiagnosticsSummary } from "./db.js";
import { getHealthScore, getRecentFeedback } from "./diagnostics.js";

const MOLTMIND_DIR = join(homedir(), ".moltmind");
const INSTANCE_ID_PATH = join(MOLTMIND_DIR, "instance_id");

let instanceId: string | null = null;
const startTime = Date.now();

function getOrCreateInstanceId(): string {
  if (instanceId) return instanceId;

  mkdirSync(MOLTMIND_DIR, { recursive: true });

  if (existsSync(INSTANCE_ID_PATH)) {
    instanceId = readFileSync(INSTANCE_ID_PATH, "utf-8").trim();
  } else {
    instanceId = crypto.randomUUID();
    writeFileSync(INSTANCE_ID_PATH, instanceId, "utf-8");
  }

  return instanceId;
}

export function initMetrics(): void {
  const id = getOrCreateInstanceId();

  // Set first_seen if not already set
  if (!getMetric("first_seen")) {
    setMetric("first_seen", new Date().toISOString());
  }

  // Increment total_sessions
  const sessions = parseInt(getMetric("total_sessions") ?? "0", 10);
  setMetric("total_sessions", String(sessions + 1));

  // Update last_seen
  setMetric("last_seen", new Date().toISOString());

  console.error(`MoltMind: instance ${id.slice(0, 8)}... session #${sessions + 1}`);
}

export function recordToolCall(toolName: string, success: boolean): void {
  // Increment total_tool_calls
  const totalCalls = parseInt(getMetric("total_tool_calls") ?? "0", 10);
  setMetric("total_tool_calls", String(totalCalls + 1));

  // Update tool_calls_by_name
  const byName: Record<string, number> = JSON.parse(getMetric("tool_calls_by_name") ?? "{}");
  byName[toolName] = (byName[toolName] ?? 0) + 1;
  setMetric("tool_calls_by_name", JSON.stringify(byName));

  // Update errors_by_tool if failed
  if (!success) {
    const errorsByTool: Record<string, number> = JSON.parse(getMetric("errors_by_tool") ?? "{}");
    errorsByTool[toolName] = (errorsByTool[toolName] ?? 0) + 1;
    setMetric("errors_by_tool", JSON.stringify(errorsByTool));
  }
}

export interface FullMetrics {
  adoption: {
    instance_id: string;
    install_age_days: number;
    total_sessions: number;
    first_seen: string;
    last_seen: string;
  };
  health: {
    score: number;
    total_tool_calls: number;
    total_errors: number;
    error_rate_percent: number;
  };
  tool_usage: Record<string, {
    calls: number;
    errors: number;
    error_rate: number;
    avg_latency_ms: number;
  }>;
  top_errors: Array<{ tool_name: string; error_count: number }>;
  feedback_summary: {
    total: number;
    recent: Array<{ type: string; message: string; tool_name: string | null; created_at: string }>;
  };
  uptime_seconds: number;
}

export function getFullMetrics(): FullMetrics {
  const id = getOrCreateInstanceId();
  const firstSeen = getMetric("first_seen") ?? new Date().toISOString();
  const lastSeen = getMetric("last_seen") ?? new Date().toISOString();
  const totalSessions = parseInt(getMetric("total_sessions") ?? "0", 10);
  const totalToolCalls = parseInt(getMetric("total_tool_calls") ?? "0", 10);
  const errorsByTool: Record<string, number> = JSON.parse(getMetric("errors_by_tool") ?? "{}");

  const totalErrors = Object.values(errorsByTool).reduce((sum, n) => sum + n, 0);
  const healthScore = getHealthScore();

  // Build tool_usage from diagnostics summary
  const diagSummary = getDiagnosticsSummary();
  const toolUsage: FullMetrics["tool_usage"] = {};
  for (const row of diagSummary) {
    toolUsage[row.tool_name] = {
      calls: row.calls,
      errors: row.errors,
      error_rate: row.calls > 0 ? row.errors / row.calls : 0,
      avg_latency_ms: Math.round(row.avg_latency_ms * 100) / 100,
    };
  }

  // Top errors: tools sorted by error count descending
  const topErrors = Object.entries(errorsByTool)
    .map(([tool_name, error_count]) => ({ tool_name, error_count }))
    .sort((a, b) => b.error_count - a.error_count)
    .slice(0, 5);

  // Feedback
  const recentFeedback = getRecentFeedback(5);

  const installAgeDays = Math.floor(
    (Date.now() - new Date(firstSeen).getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    adoption: {
      instance_id: id.slice(0, 8),
      install_age_days: installAgeDays,
      total_sessions: totalSessions,
      first_seen: firstSeen,
      last_seen: lastSeen,
    },
    health: {
      score: healthScore,
      total_tool_calls: totalToolCalls,
      total_errors: totalErrors,
      error_rate_percent: totalToolCalls > 0
        ? Math.round((totalErrors / totalToolCalls) * 10000) / 100
        : 0,
    },
    tool_usage: toolUsage,
    top_errors: topErrors,
    feedback_summary: {
      total: recentFeedback.length,
      recent: recentFeedback,
    },
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
  };
}
