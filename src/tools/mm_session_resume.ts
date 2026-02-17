import { listSessions, getLatestHandoff, getSessionDiagnostics, getActiveSessions, getRecentEvents } from "../db.js";

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

  // Concurrent session awareness
  const activeSessions = getActiveSessions();
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recentActivity = getRecentEvents(tenMinAgo, 20).map((e) => ({
    session_id: e.session_id.slice(0, 8),
    event_type: e.event_type,
    summary: e.summary,
    created_at: e.created_at,
  }));

  return {
    success: true,
    sessions: sessionSummaries,
    latest_handoff: handoff ?? null,
    concurrent_sessions: activeSessions.length,
    recent_activity: recentActivity,
    message: sessions.length > 0
      ? `Found ${sessions.length} recent session(s)${activeSessions.length > 1 ? ` (${activeSessions.length} currently active)` : ""}`
      : "No previous sessions found",
  };
}
