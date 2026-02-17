import { getMemoryStats, getActiveSessions, getActiveClaims, getRecentEvents } from "../db.js";
import { getHealthScore } from "../diagnostics.js";
import { isModelReady } from "../embeddings.js";
import { isProTier, checkStoreLimits } from "../license.js";

const startTime = Date.now();

export async function handleMmStatus(): Promise<Record<string, unknown>> {
  const stats = getMemoryStats();
  const healthScore = getHealthScore();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  // Coordination info
  const activeSessions = getActiveSessions().map((s) => ({
    id: s.id.slice(0, 8),
    pid: s.pid,
    started_at: s.started_at,
  }));
  const activeClaims = getActiveClaims().map((c) => ({
    resource: c.resource,
    session_id: c.session_id.slice(0, 8),
    description: c.description,
  }));
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const recentEvents = getRecentEvents(fiveMinAgo, 10).map((e) => ({
    event_type: e.event_type,
    summary: e.summary,
    created_at: e.created_at,
  }));

  return {
    success: true,
    version: "0.8.1",
    tier: isProTier() ? "pro" : "free",
    usage: checkStoreLimits().message,
    db_stats: stats,
    health_score: healthScore,
    embedding_model_ready: isModelReady(),
    uptime_seconds: uptimeSeconds,
    active_sessions: activeSessions,
    active_claims: activeClaims,
    recent_events: recentEvents,
  };
}
