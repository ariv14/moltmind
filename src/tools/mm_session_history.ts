import { listSessions, getSessionDiagnostics } from "../db.js";
import type { SessionStatus } from "../types.js";

export async function handleMmSessionHistory(args: {
  status?: SessionStatus;
  since?: string;
  limit?: number;
}): Promise<Record<string, unknown>> {
  const sessions = listSessions({
    status: args.status,
    since: args.since,
    limit: args.limit ?? 10,
  });

  const results = sessions.map((s) => {
    const diag = getSessionDiagnostics(s.id);
    return {
      id: s.id,
      status: s.status,
      summary: s.summary,
      goal: s.goal,
      where_left_off: s.where_left_off,
      started_at: s.started_at,
      ended_at: s.ended_at,
      tool_calls: diag.total_calls,
      errors: diag.errors,
      tools_used: diag.by_tool,
    };
  });

  return {
    success: true,
    sessions: results,
    count: results.length,
  };
}
