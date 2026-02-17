#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { closeDb } from "./db.js";
import { withDiagnostics } from "./diagnostics.js";
import { initMetrics, recordToolCall, pauseCurrentSession } from "./metrics.js";
import { handleMmStore } from "./tools/mm_store.js";
import { handleMmRecall } from "./tools/mm_recall.js";
import { handleMmRead } from "./tools/mm_read.js";
import { handleMmUpdate } from "./tools/mm_update.js";
import { handleMmDelete } from "./tools/mm_delete.js";
import { handleMmStatus } from "./tools/mm_status.js";
import { handleMmInit } from "./tools/mm_init.js";
import { handleMmHandoffCreate } from "./tools/mm_handoff_create.js";
import { handleMmHandoffLoad } from "./tools/mm_handoff_load.js";
import { handleMmFeedback } from "./tools/mm_feedback.js";
import { handleMmMetrics } from "./tools/mm_metrics.js";
import { handleMmSessionSave } from "./tools/mm_session_save.js";
import { handleMmSessionResume } from "./tools/mm_session_resume.js";
import { handleMmSessionHistory } from "./tools/mm_session_history.js";
import { handleMbAuth } from "./tools/mb_auth.js";
import { handleMbPost } from "./tools/mb_post.js";
import { handleMbFeed } from "./tools/mb_feed.js";
import { handleMbComment } from "./tools/mb_comment.js";
import { handleMbVote } from "./tools/mb_vote.js";
import { handleMbSocial } from "./tools/mb_social.js";
import { handleMbSubmolt } from "./tools/mb_submolt.js";

const server = new McpServer({
  name: "moltmind",
  version: "0.3.0",
});

function wrapTool(
  toolName: string,
  handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
): (args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return (args: Record<string, unknown>) =>
    withDiagnostics(toolName, async () => {
      const result = await handler(args);
      recordToolCall(toolName, result.success !== false);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    });
}

// --- Tool Registration ---

server.tool(
  "mm_store",
  "Store a memory (learning, error fix, decision, plan, or raw note). Use this whenever you learn something worth remembering across sessions.",
  {
    title: z.string().max(500).describe("Short title for the memory"),
    content: z.string().max(51200).describe("Full content of the memory"),
    type: z.enum(["learning", "error", "decision", "plan", "raw"]).optional().describe("Memory type classification"),
    tags: z.array(z.string().max(100)).max(20).optional().describe("Tags for categorization"),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Additional metadata"),
  },
  wrapTool("mm_store", (args) => handleMmStore(args as Parameters<typeof handleMmStore>[0]))
);

server.tool(
  "mm_recall",
  "Search your memory using natural language. Finds semantically similar memories even if exact words don't match.",
  {
    query: z.string().max(1000).describe("Natural language search query"),
    limit: z.number().int().min(1).max(500).optional().describe("Max results to return (default 10)"),
    tier: z.enum(["hot", "warm", "cold"]).optional().describe("Filter by memory tier"),
    type: z.enum(["learning", "error", "decision", "plan", "raw"]).optional().describe("Filter by memory type"),
  },
  wrapTool("mm_recall", (args) => handleMmRecall(args as Parameters<typeof handleMmRecall>[0]))
);

server.tool(
  "mm_read",
  "Read a specific memory by its ID. Returns the full memory with all fields.",
  {
    id: z.string().describe("The memory ID to read"),
  },
  wrapTool("mm_read", (args) => handleMmRead(args as Parameters<typeof handleMmRead>[0]))
);

server.tool(
  "mm_update",
  "Update an existing memory. Only the fields you provide will be changed.",
  {
    id: z.string().describe("The memory ID to update"),
    title: z.string().max(500).optional().describe("New title"),
    content: z.string().max(51200).optional().describe("New content"),
    type: z.enum(["learning", "error", "decision", "plan", "raw"]).optional().describe("New type"),
    tags: z.array(z.string().max(100)).max(20).optional().describe("New tags"),
    metadata: z.record(z.string(), z.unknown()).optional().describe("New metadata"),
    tier: z.enum(["hot", "warm", "cold", "archived"]).optional().describe("New tier"),
  },
  wrapTool("mm_update", (args) => handleMmUpdate(args as Parameters<typeof handleMmUpdate>[0]))
);

server.tool(
  "mm_delete",
  "Archive a memory (soft delete). The memory is moved to archived tier and won't appear in recall results, but is not permanently removed.",
  {
    id: z.string().describe("The memory ID to archive"),
  },
  wrapTool("mm_delete", (args) => handleMmDelete(args as Parameters<typeof handleMmDelete>[0]))
);

server.tool(
  "mm_status",
  "Get MoltMind server status: memory stats, health score, embedding model readiness, and uptime.",
  {},
  wrapTool("mm_status", () => handleMmStatus())
);

server.tool(
  "mm_init",
  "Initialize a project-local memory vault in the current directory. Creates .moltmind/memory.db for project-specific memories.",
  {},
  wrapTool("mm_init", () => handleMmInit())
);

server.tool(
  "mm_handoff_create",
  "Create a structured handoff document for agent-to-agent context transfer. Captures goal, state, next steps, and constraints.",
  {
    goal: z.string().describe("What the next agent should accomplish"),
    current_state: z.string().describe("Where things stand right now"),
    next_action: z.string().describe("The immediate next step to take"),
    constraints: z.array(z.string()).optional().describe("Rules or limitations to respect"),
    known_unknowns: z.array(z.string()).optional().describe("Things that still need investigation"),
    artifacts: z.array(z.string()).optional().describe("Files or resources involved"),
    stop_conditions: z.array(z.string()).optional().describe("When to consider the goal complete"),
  },
  wrapTool("mm_handoff_create", (args) => handleMmHandoffCreate(args as Parameters<typeof handleMmHandoffCreate>[0]))
);

server.tool(
  "mm_handoff_load",
  "Load the most recent handoff to resume context from a previous session or agent.",
  {},
  wrapTool("mm_handoff_load", () => handleMmHandoffLoad())
);

server.tool(
  "mm_feedback",
  "Report a bug, request a feature, or flag friction with MoltMind. Your feedback directly shapes what gets built next.",
  {
    type: z.enum(["bug", "feature_request", "friction"]).describe("Feedback type"),
    message: z.string().max(2000).describe("Your feedback message"),
    tool_name: z.string().optional().describe("Which tool the feedback is about"),
  },
  wrapTool("mm_feedback", (args) => handleMmFeedback(args as Parameters<typeof handleMmFeedback>[0]))
);

server.tool(
  "mm_metrics",
  "Get a full adoption and health dashboard: install age, session count, per-tool usage stats, error rates, and feedback summary.",
  {},
  wrapTool("mm_metrics", () => handleMmMetrics())
);

// --- Session Tools ---

server.tool(
  "mm_session_save",
  "Save session summary, actions, outcomes, and where we left off. Marks session paused or completed.",
  {
    summary: z.string().max(2000).optional().describe("Summary of what happened this session"),
    goal: z.string().max(1000).optional().describe("What the session was trying to accomplish"),
    actions_taken: z.array(z.string()).optional().describe("List of actions taken during the session"),
    outcomes: z.array(z.string()).optional().describe("List of outcomes (success/failure)"),
    where_left_off: z.string().max(2000).optional().describe("Where things stand at the end of the session"),
    status: z.enum(["paused", "completed"]).optional().describe("Session end status (default: paused)"),
    metadata: z.record(z.string(), z.unknown()).optional().describe("Additional session metadata"),
  },
  wrapTool("mm_session_save", (args) => handleMmSessionSave(args as Parameters<typeof handleMmSessionSave>[0]))
);

server.tool(
  "mm_session_resume",
  "Load recent sessions + latest handoff, return formatted summary for agent to present.",
  {
    limit: z.number().int().min(1).max(50).optional().describe("Number of recent sessions to load (default 5)"),
  },
  wrapTool("mm_session_resume", (args) => handleMmSessionResume(args as Parameters<typeof handleMmSessionResume>[0]))
);

server.tool(
  "mm_session_history",
  "List past sessions with filtering (status, date range, limit) and per-session tool call stats.",
  {
    status: z.enum(["active", "paused", "completed"]).optional().describe("Filter by session status"),
    since: z.string().optional().describe("Only show sessions started after this ISO date"),
    limit: z.number().int().min(1).max(50).optional().describe("Max sessions to return (default 10)"),
  },
  wrapTool("mm_session_history", (args) => handleMmSessionHistory(args as Parameters<typeof handleMmSessionHistory>[0]))
);

// --- Moltbook Tool Registration ---

server.tool(
  "mb_auth",
  "Authenticate with moltbook.com (social network for AI agents). Actions: register (create account), login (with existing API key), status (check auth), update_profile. Rate limits: 100 req/min.",
  {
    action: z.enum(["register", "login", "status", "update_profile"]).describe("Auth action to perform"),
    username: z.string().max(50).optional().describe("Username for register"),
    api_key: z.string().optional().describe("API key for login"),
    display_name: z.string().max(100).optional().describe("Display name for register/update_profile"),
    bio: z.string().max(500).optional().describe("Bio for register/update_profile"),
  },
  wrapTool("mb_auth", (args) => handleMbAuth(args as Parameters<typeof handleMbAuth>[0]))
);

server.tool(
  "mb_post",
  "Create, view, or delete posts on moltbook.com. Actions: create, get, delete. Rate limit: 1 post per 30 minutes.",
  {
    action: z.enum(["create", "get", "delete"]).describe("Post action to perform"),
    id: z.string().optional().describe("Post ID (for get/delete)"),
    title: z.string().max(300).optional().describe("Post title (for create)"),
    content: z.string().max(10000).optional().describe("Post content (for create)"),
    submolt: z.string().max(50).optional().describe("Submolt to post in (for create)"),
  },
  wrapTool("mb_post", (args) => handleMbPost(args as Parameters<typeof handleMbPost>[0]))
);

server.tool(
  "mb_feed",
  "Browse feeds and search on moltbook.com. Actions: browse (public feed), personal (followed agents), search (query posts). Rate limit: 100 req/min.",
  {
    action: z.enum(["browse", "personal", "search"]).describe("Feed action to perform"),
    sort: z.string().optional().describe("Sort order: hot, new, top (for browse)"),
    limit: z.number().int().min(1).max(50).optional().describe("Number of posts to return"),
    query: z.string().max(200).optional().describe("Search query (for search action)"),
    submolt: z.string().max(50).optional().describe("Filter by submolt (for browse)"),
  },
  wrapTool("mb_feed", (args) => handleMbFeed(args as Parameters<typeof handleMbFeed>[0]))
);

server.tool(
  "mb_comment",
  "Add comments or replies on moltbook.com posts, or list comments. Actions: create, list. Rate limit: 50 comments/day, 1 comment per 20s cooldown.",
  {
    action: z.enum(["create", "list"]).describe("Comment action to perform"),
    post_id: z.string().optional().describe("Post ID to comment on or list comments from"),
    content: z.string().max(5000).optional().describe("Comment content (for create)"),
    parent_id: z.string().optional().describe("Parent comment ID for nested replies (for create)"),
  },
  wrapTool("mb_comment", (args) => handleMbComment(args as Parameters<typeof handleMbComment>[0]))
);

server.tool(
  "mb_vote",
  "Vote on posts and comments on moltbook.com. Actions: upvote_post, downvote_post, upvote_comment.",
  {
    action: z.enum(["upvote_post", "downvote_post", "upvote_comment"]).describe("Vote action to perform"),
    post_id: z.string().optional().describe("Post ID (for upvote_post/downvote_post)"),
    comment_id: z.string().optional().describe("Comment ID (for upvote_comment)"),
  },
  wrapTool("mb_vote", (args) => handleMbVote(args as Parameters<typeof handleMbVote>[0]))
);

server.tool(
  "mb_social",
  "Follow/unfollow agents and view profiles on moltbook.com. Actions: follow, unfollow, profile.",
  {
    action: z.enum(["follow", "unfollow", "profile"]).describe("Social action to perform"),
    name: z.string().max(50).optional().describe("Agent username"),
  },
  wrapTool("mb_social", (args) => handleMbSocial(args as Parameters<typeof handleMbSocial>[0]))
);

server.tool(
  "mb_submolt",
  "Manage communities (submolts) on moltbook.com. Actions: create, list, get, subscribe, unsubscribe.",
  {
    action: z.enum(["create", "list", "get", "subscribe", "unsubscribe"]).describe("Submolt action to perform"),
    name: z.string().max(50).optional().describe("Submolt name"),
    description: z.string().max(500).optional().describe("Submolt description (for create)"),
  },
  wrapTool("mb_submolt", (args) => handleMbSubmolt(args as Parameters<typeof handleMbSubmolt>[0]))
);

// --- Server lifecycle ---

function shutdown(): void {
  console.error("MoltMind shutting down");
  pauseCurrentSession();
  closeDb();
  process.exit(0);
}

async function main(): Promise<void> {
  initMetrics();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.error("MoltMind MCP server started");
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
