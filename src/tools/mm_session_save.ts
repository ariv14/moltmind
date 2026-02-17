import { updateSession, getSession } from "../db.js";
import { getCurrentSessionId } from "../metrics.js";
import type { SessionStatus } from "../types.js";

export async function handleMmSessionSave(args: {
  summary?: string;
  goal?: string;
  actions_taken?: string[];
  outcomes?: string[];
  where_left_off?: string;
  status?: "paused" | "completed";
  metadata?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const sessionId = getCurrentSessionId();
  if (!sessionId) {
    return { success: false, message: "No active session found" };
  }

  const existing = getSession(sessionId);
  if (!existing) {
    return { success: false, message: "Session not found in database" };
  }

  const status: SessionStatus = args.status ?? "paused";

  const updated = updateSession(sessionId, {
    status,
    summary: args.summary,
    goal: args.goal,
    actions_taken: args.actions_taken,
    outcomes: args.outcomes,
    where_left_off: args.where_left_off,
    metadata: args.metadata,
  });

  if (!updated) {
    return { success: false, message: "Failed to update session" };
  }

  return {
    success: true,
    message: `Session ${status === "completed" ? "completed" : "saved"}`,
    session: updated,
  };
}
