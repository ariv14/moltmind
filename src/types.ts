export type MemoryType = "learning" | "error" | "decision" | "plan" | "raw";

export type MemoryTier = "hot" | "warm" | "cold" | "archived";

export interface Memory {
  id: string;
  type: MemoryType;
  title: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  embedding: Buffer | null;
  tier: MemoryTier;
  created_at: string;
  updated_at: string;
  accessed_at: string;
  access_count: number;
  decay_score: number;
}

export interface Handoff {
  id: string;
  goal: string;
  current_state: string;
  next_action: string;
  constraints: string[];
  known_unknowns: string[];
  artifacts: string[];
  stop_conditions: string[];
  session_id: string;
  created_at: string;
}

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  type: MemoryType;
  score: number;
  tags: string[];
  created_at: string;
}
