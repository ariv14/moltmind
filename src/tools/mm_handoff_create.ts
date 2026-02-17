import crypto from "node:crypto";
import { insertHandoff } from "../db.js";
import { getCurrentSessionId } from "../metrics.js";

export async function handleMmHandoffCreate(args: {
  goal: string;
  current_state: string;
  next_action: string;
  constraints?: string[];
  known_unknowns?: string[];
  artifacts?: string[];
  stop_conditions?: string[];
}): Promise<Record<string, unknown>> {
  const handoff = insertHandoff({
    goal: args.goal,
    current_state: args.current_state,
    next_action: args.next_action,
    constraints: args.constraints ?? [],
    known_unknowns: args.known_unknowns ?? [],
    artifacts: args.artifacts ?? [],
    stop_conditions: args.stop_conditions ?? [],
    session_id: getCurrentSessionId() ?? crypto.randomUUID(),
  });

  return { success: true, handoff };
}
