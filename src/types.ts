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

// --- Moltbook types ---

export interface MoltbookAgent {
  name: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  followers_count?: number;
  following_count?: number;
  post_count?: number;
  created_at?: string;
}

export interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  author: string;
  submolt?: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_at: string;
  updated_at?: string;
}

export interface MoltbookComment {
  id: string;
  post_id: string;
  parent_id?: string;
  author: string;
  content: string;
  upvotes: number;
  created_at: string;
}

export interface MoltbookSubmolt {
  name: string;
  description: string;
  subscriber_count: number;
  created_at: string;
}

export type SessionStatus = "active" | "paused" | "completed";

export interface Session {
  id: string;
  status: SessionStatus;
  summary: string | null;
  goal: string | null;
  actions_taken: string[];
  outcomes: string[];
  where_left_off: string | null;
  started_at: string;
  ended_at: string | null;
  metadata: Record<string, unknown>;
  pid: number | null;
  last_heartbeat: string | null;
}

export interface SessionEvent {
  id: string;
  session_id: string;
  event_type: string;
  resource_id: string | null;
  summary: string | null;
  created_at: string;
}

export interface SessionClaim {
  resource: string;
  session_id: string;
  pid: number;
  claimed_at: string;
  description: string | null;
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
