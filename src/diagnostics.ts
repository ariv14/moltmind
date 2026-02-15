import {
  insertDiagnostic,
  getHealthScoreFromDb,
  getRecentDiagnostics as getRecentDiagnosticsDb,
  insertFeedback as insertFeedbackDb,
  getRecentFeedback as getRecentFeedbackDb,
} from "./db.js";

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
}

export async function withDiagnostics(
  toolName: string,
  handler: () => Promise<ToolResult>
): Promise<ToolResult> {
  const start = performance.now();
  try {
    const result = await handler();
    insertDiagnostic(toolName, true, performance.now() - start, null);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    insertDiagnostic(toolName, false, performance.now() - start, msg);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ success: false, message: msg }) }],
    };
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
