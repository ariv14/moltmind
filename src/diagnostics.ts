import {
  insertDiagnostic,
  getHealthScoreFromDb,
  getRecentDiagnostics as getRecentDiagnosticsDb,
  insertFeedback as insertFeedbackDb,
  getRecentFeedback as getRecentFeedbackDb,
} from "./db.js";
import { getCurrentSessionId } from "./metrics.js";
import { estimateResponseTokens, upsertTokenEstimate } from "./token_estimator.js";

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
}

const RESUME_TOOLS = ["mm_session_resume", "mm_handoff_load"];

function trackTokens(result: ToolResult, toolName: string, sessionId: string | null): void {
  if (!sessionId) return;
  try {
    const responseLength = result.content.reduce((sum, c) => sum + c.text.length, 0);
    const tokens = estimateResponseTokens(responseLength);
    const coldStartAvoided = RESUME_TOOLS.includes(toolName);
    upsertTokenEstimate(sessionId, tokens, coldStartAvoided);
  } catch {
    // Non-critical — don't let token tracking break tool execution
  }
}

export async function withDiagnostics(
  toolName: string,
  handler: () => Promise<ToolResult>
): Promise<ToolResult> {
  const start = performance.now();
  const sessionId = getCurrentSessionId();
  try {
    const result = await handler();
    insertDiagnostic(toolName, true, performance.now() - start, null, sessionId);
    trackTokens(result, toolName, sessionId);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    insertDiagnostic(toolName, false, performance.now() - start, msg, sessionId);
    const errorResult: ToolResult = {
      content: [{ type: "text" as const, text: JSON.stringify({ success: false, message: msg }) }],
    };
    trackTokens(errorResult, toolName, sessionId);
    return errorResult;
  }
}

export function getHealthScore(): number {
  return getHealthScoreFromDb();
}

export function getRecentDiagnostics(limit: number = 20): Array<{
  id: string;
  tool_name: string;
  success: number;
  latency_ms: number;
  error_message: string | null;
  created_at: string;
}> {
  return getRecentDiagnosticsDb(limit);
}

export function submitFeedback(
  type: "bug" | "feature_request" | "friction",
  message: string,
  toolName: string | null = null
): void {
  insertFeedbackDb(type, message, toolName);
}

export function getRecentFeedback(limit: number = 10): Array<{
  id: string;
  type: string;
  message: string;
  tool_name: string | null;
  created_at: string;
}> {
  return getRecentFeedbackDb(limit);
}
