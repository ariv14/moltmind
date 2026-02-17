# MoltMind Testing Runbook

A step-by-step guide to test all 14 MoltMind MCP tools using Claude Code. No coding required — just copy-paste each prompt into Claude Code and check the expected result.

## Prerequisites

1. Install Claude Code if you haven't already
2. Add MoltMind as an MCP server:
   ```
   claude mcp add moltmind -- npx -y moltmind
   ```
3. Restart Claude Code
4. Verify MoltMind is running — type `/mcp` and confirm you see moltmind listed with 14 tools

---

## Test 1: Store a Memory (`mm_store`)

**What it does:** Saves a piece of knowledge that persists across sessions.

**Prompt:**
> Remember that our API uses port 8080 in development and port 443 in production.

**What to expect:** MoltMind stores this as a memory and returns a success message with an memory ID. Copy this ID — you'll need it for the next tests.

---

## Test 2: Search Your Memory (`mm_recall`)

**What it does:** Finds memories by meaning, not just exact words.

**Prompt:**
> What port does our API run on?

**What to expect:** MoltMind should find the memory from Test 1, even though you used different words. It searches by meaning (semantic search) and keywords combined.

---

## Test 3: Read a Specific Memory (`mm_read`)

**What it does:** Retrieves a single memory by its ID.

**Prompt:**
> Read the memory with ID [paste the ID from Test 1]

**What to expect:** Returns the full memory including title, content, tags, type, and timestamps.

---

## Test 4: Update a Memory (`mm_update`)

**What it does:** Changes specific fields of an existing memory.

**Prompt:**
> Update memory [paste ID] to add the tags "api" and "config"

**What to expect:** Returns the updated memory with the new tags added. Other fields stay the same.

---

## Test 5: Archive a Memory (`mm_delete`)

**What it does:** Soft-deletes a memory. It won't show up in searches but isn't permanently gone.

**Prompt:**
> Archive the memory with ID [paste ID]

**What to expect:** Returns a success message saying the memory was archived. If you search for it again, it won't appear.

---

## Test 6: Check Server Status (`mm_status`)

**What it does:** Shows MoltMind's health — database stats, uptime, and whether the AI search model is loaded.

**Prompt:**
> What's the MoltMind server status?

**What to expect:** A dashboard showing:
- Version number (should be 0.3.2 or later)
- Number of memories stored
- Health score (0.0 to 1.0)
- Whether the embedding model is ready
- Uptime in seconds

---

## Test 7: Create a Project Vault (`mm_init`)

**What it does:** Creates a separate memory database just for the current project folder.

**Prompt:**
> Initialize a MoltMind project vault in this directory

**What to expect:** Creates a `.moltmind/` folder in your project with its own `memory.db`. After this, all memories are stored locally to this project instead of the global vault.

**Cleanup tip:** Add `.moltmind/` to your `.gitignore` so the database doesn't get committed.

---

## Test 8: Create a Handoff (`mm_handoff_create`)

**What it does:** Saves a structured snapshot of where you are in a task, so a future session can pick up right where you left off.

**Prompt:**
> Create a handoff: The goal is to finish the login page redesign. Current state is that the HTML is done but CSS needs work. Next action is to style the form inputs. The unknown is whether we should use the new design system colors.

**What to expect:** Returns a structured handoff document with goal, current_state, next_action, and known_unknowns filled in.

---

## Test 9: Load a Handoff (`mm_handoff_load`)

**What it does:** Retrieves the most recent handoff so you can resume context.

**Prompt:**
> Load the latest handoff

**What to expect:** Returns the handoff you created in Test 8 with all the fields intact.

---

## Test 10: Save a Session (`mm_session_save`)

**What it does:** Records what happened during this session — what you did, what worked, and where you left off.

**Prompt:**
> Save this session: we tested MoltMind tools, everything worked so far, and we still need to test the remaining tools

**What to expect:** Returns a session record with your summary. If you didn't list specific actions, MoltMind auto-fills them from its own logs of what tools were called during this session.

---

## Test 11: Resume a Session (`mm_session_resume`)

**What it does:** Loads recent sessions and the latest handoff so you can catch up on what happened before.

**Prompt:**
> Resume my previous session context

**What to expect:** A formatted summary showing your recent sessions (including the one from Test 10) and the latest handoff (from Test 8).

---

## Test 12: View Session History (`mm_session_history`)

**What it does:** Lists past sessions with stats on how many tool calls happened in each.

**Prompt:**
> Show my session history

**What to expect:** A list of sessions with:
- Session ID and status (active, paused, or completed)
- When it started and ended
- Number of tool calls made during each session

---

## Test 13: Submit Feedback (`mm_feedback`)

**What it does:** Lets you report bugs, request features, or flag friction. Stored locally for the developer to review.

**Prompt:**
> Submit feedback: feature request — it would be nice to have memory expiration dates

**What to expect:** Returns a success message confirming your feedback was recorded.

---

## Test 14: View Metrics (`mm_metrics`)

**What it does:** Shows a full dashboard of how MoltMind has been used — sessions, tool usage, error rates.

**Prompt:**
> Show MoltMind metrics

**What to expect:** A dashboard showing:
- Total sessions and tool calls
- Per-tool usage breakdown (you should see counts for all the tools you just tested)
- Error rates
- How long MoltMind has been installed

---

## Quick Checklist

| # | Tool | Tested? |
|---|------|---------|
| 1 | mm_store | [ ] |
| 2 | mm_recall | [ ] |
| 3 | mm_read | [ ] |
| 4 | mm_update | [ ] |
| 5 | mm_delete | [ ] |
| 6 | mm_status | [ ] |
| 7 | mm_init | [ ] |
| 8 | mm_handoff_create | [ ] |
| 9 | mm_handoff_load | [ ] |
| 10 | mm_session_save | [ ] |
| 11 | mm_session_resume | [ ] |
| 12 | mm_session_history | [ ] |
| 13 | mm_feedback | [ ] |
| 14 | mm_metrics | [ ] |

## Troubleshooting

**MoltMind tools not showing up?**
- Run `/mcp` in Claude Code to check if moltmind is listed
- Try removing and re-adding: `claude mcp remove moltmind` then `claude mcp add moltmind -- npx -y moltmind`
- Restart Claude Code after making changes

**Search not finding memories?**
- The AI search model downloads on first use (~22MB). If it hasn't finished, MoltMind falls back to keyword-only search.
- Try using more specific keywords in your query.

**"No active session" error?**
- This can happen if the MCP server restarted mid-conversation. Just try again — a new session is created on each startup.
