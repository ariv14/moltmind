import { listSessions, getLatestHandoff, getSessionDiagnostics } from "../db.js";

export async function handleMmSessionResume(args: {
  limit?: number;
}): Promise<Record<string, unknown>> {
  const limit = args.limit ?? 5;

  // Get recent sessions (paused or completed)
  const sessions = listSessions({ limit });

  // Get the latest handoff
  const handoff = getLatestHandoff();

  // Build formatted summary
  const sessionSummaries = sessions.map((s) => {
    const diag = getSessionDiagnostics(s.id);
    return {
      id: s.id,
      status: s.status,
      summary: s.summary,
      goal: s.goal,
      actions_taken: s.actions_taken,
      outcomes: s.outcomes,
      where_left_off: s.where_left_off,
      started_at: s.started_at,
      ended_at: s.ended_at,
      tool_calls: diag.total_calls,
      errors: diag.errors,
    };
  });

  return {
    success: true,
    sessions: sessionSummaries,
    latest_handoff: handoff ?? null,
    message: sessions.length > 0
      ? `Found ${sessions.length} recent session(s)`
      : "No previous sessions found",
  };
}
