import crypto from "node:crypto";
import { insertHandoff, logSessionEvent, claimResource } from "../db.js";
import { getCurrentSessionId } from "../metrics.js";
// NOTE: logSessionEvent is still imported for claim-specific events below.
// The handoff_created event is now auto-logged by wrapTool() in index.ts.

export async function handleMmHandoffCreate(args: {
  goal: string;
  current_state: string;
  next_action: string;
  constraints?: string[];
  known_unknowns?: string[];
  artifacts?: string[];
  stop_conditions?: string[];
  claims?: string[];
}): Promise<Record<string, unknown>> {
  const sessionId = getCurrentSessionId() ?? crypto.randomUUID();

  const handoff = insertHandoff({
    goal: args.goal,
    current_state: args.current_state,
    next_action: args.next_action,
    constraints: args.constraints ?? [],
    known_unknowns: args.known_unknowns ?? [],
    artifacts: args.artifacts ?? [],
    stop_conditions: args.stop_conditions ?? [],
    session_id: sessionId,
  });

  // Process claims if provided
  const claimResults: Array<{ resource: string; success: boolean; held_by?: string }> = [];
  if (args.claims && args.claims.length > 0) {
    for (const resource of args.claims) {
      const result = claimResource(sessionId, resource, process.pid, args.goal.slice(0, 100));
      claimResults.push({ resource, ...result });
      if (result.success) {
        logSessionEvent(sessionId, "claim", resource, `Claimed: ${resource}`);
      }
    }
  }

  return {
    success: true,
    handoff,
    ...(claimResults.length > 0 ? { claims: claimResults } : {}),
  };
}
