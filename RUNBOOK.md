# MoltMind Testing Guide

Think of MoltMind as a notebook for your AI assistant. It lets Claude remember things between conversations, pick up where it left off, and never lose track of what happened. This guide walks you through testing every feature — just type the prompts into Claude Code and see what happens.

## Before You Start

1. Open your terminal
2. Type this to install MoltMind:
   ```
   claude mcp add moltmind -- npx -y moltmind
   ```
3. Close and reopen Claude Code
4. Type `/mcp` — you should see "moltmind" in the list. If you do, you're good to go!

---

## The Showoff Scenario: Watch Claude Survive a Crash

This is the best way to see what MoltMind actually does. You'll give Claude a task, interrupt it halfway, close everything, come back, and watch it pick up exactly where it left off — like nothing happened.

### Step 1 — Start a task (Conversation 1)

Open Claude Code and type:

> I'm planning a birthday party for my mom. She likes Italian food, jazz music, and the color purple. The party is on March 15th. We need to figure out: the restaurant, the playlist, the decorations, and the guest list.

Claude will save these details. Now give it some progress:

> We decided on Olive Garden for the restaurant. The playlist is done — 30 jazz songs on Spotify. Still need to figure out decorations and the guest list. Remember all of this.

Claude saves everything. Now type one more thing:

> Create a handoff for the party planning so we can pick this up later

**What should happen:** Claude creates a structured bookmark that captures:
- The goal (plan mom's birthday party)
- What's done (restaurant booked, playlist ready)
- What's left (decorations and guest list)
- Key details (March 15th, Italian food, jazz, purple)

### Step 2 — Pull the plug

Now simulate an unexpected interruption. Do one of these:
- Press **Ctrl+C** to kill Claude Code
- Or just close the terminal window entirely

Don't save anything. Don't say goodbye. Just close it — like your laptop died or your WiFi dropped.

**What happens behind the scenes:** Even though you didn't save anything, MoltMind automatically records what tools were used during that session and marks it as interrupted. Nothing is lost.

### Step 3 — Come back later (Conversation 2)

Open Claude Code again. This is a brand new conversation — Claude normally wouldn't remember anything. But with MoltMind, type:

> What was I working on last time?

**What should happen:** Claude checks MoltMind and tells you:
- You were planning your mom's birthday party
- Olive Garden is booked, playlist is done
- You still need decorations and the guest list
- The party is March 15th and she likes purple

It's like Claude has perfect memory of a conversation it was never part of.

### Step 4 — Keep going like nothing happened

> OK let's figure out decorations. Purple tablecloths, purple balloons, and a "Happy Birthday" banner. Save this progress.

**What should happen:** Claude updates the session with the new progress. Now decorations are done too — only the guest list remains.

### Step 5 — Pull the plug again

Close Claude Code again without warning. Just close the window.

### Step 6 — Come back one more time (Conversation 3)

Open Claude Code and type:

> Catch me up on the party planning

**What should happen:** Claude now knows:
- Restaurant: Olive Garden (done)
- Playlist: 30 jazz songs (done)
- Decorations: purple tablecloths, balloons, banner (done)
- Guest list: still needs to be figured out

Three different conversations, two unexpected crashes, and Claude didn't lose a single detail.

**That's MoltMind.** Your AI assistant now has a memory that survives anything.

---

## Part 1: Teaching Claude to Remember Things

### Test 1 — Save a note

Type this into Claude Code:

> Remember that my dog's name is Biscuit and he's a golden retriever.

**What should happen:** Claude saves this as a memory. You'll see a confirmation with an ID (a long string of letters and numbers). Write down or copy that ID — you'll use it in the next few tests.

**Why this matters:** Normally, Claude forgets everything when you start a new conversation. MoltMind makes it stick.

---

### Test 2 — Find it by asking differently

> What's my pet's name?

**What should happen:** Claude finds the Biscuit memory even though you said "pet" instead of "dog." MoltMind understands meaning, not just exact words.

---

### Test 3 — Look up a specific note

> Read the memory with ID [paste your ID from Test 1]

**What should happen:** You get back the full note — the title, content, when it was saved, and how many times it's been looked at.

---

### Test 4 — Edit a note

> Update memory [paste your ID] to add the tags "pets" and "family"

**What should happen:** The note now has those tags attached. Everything else stays the same.

---

### Test 5 — Delete a note

> Archive the memory about Biscuit

**What should happen:** The note is tucked away. If you search for "dog" or "Biscuit" again, it won't show up. But it's not gone forever — it's just archived.

---

## Part 2: Checking on MoltMind Itself

### Test 6 — Health check

> How is MoltMind doing?

**What should happen:** You get a quick dashboard showing:
- How many notes are saved
- A health score (1.0 means everything is working perfectly)
- How long MoltMind has been running

---

### Test 7 — Create a project notebook

> Set up a MoltMind vault for this project

**What should happen:** MoltMind creates a separate notebook just for this project folder. Notes you save here won't mix with notes from other projects.

Think of it like having a separate notebook for work vs. personal stuff.

---

## Part 3: Picking Up Where You Left Off

This is where MoltMind really shines. Imagine you're halfway through a task and you close your laptop. These tools help Claude remember exactly where things stood.

### Test 8 — Leave a bookmark

> Create a handoff: I'm redesigning the homepage. The header is done but the footer still needs work. Next step is to pick colors for the footer. I'm not sure yet whether to use blue or green.

**What should happen:** MoltMind saves a structured bookmark with:
- The goal (redesign the homepage)
- Where things stand (header done, footer needs work)
- What to do next (pick footer colors)
- Open questions (blue or green?)

---

### Test 9 — Pick up the bookmark

> Load my last handoff

**What should happen:** You get back exactly what you saved in Test 8. If you were starting a new conversation tomorrow, this is how Claude would know what you were working on.

---

### Test 10 — Save what happened today

> Save this session: I tested MoltMind's memory and handoff features, everything worked great, still need to test the session history and feedback tools

**What should happen:** MoltMind saves a summary of this session. It also automatically logs which tools were used — you don't have to list them yourself.

---

### Test 11 — Catch up on past work

> What happened in my recent sessions?

**What should happen:** Claude shows you a summary of recent sessions (including the one you just saved) and your latest handoff. This is what Claude would check at the start of a new conversation to get back up to speed.

---

### Test 12 — Browse session history

> Show my full session history

**What should happen:** A list of all your sessions — when they started, when they ended, and how many things Claude did in each one.

---

## Part 4: Feedback and Stats

### Test 13 — Tell MoltMind what you think

> I wish MoltMind could automatically remind me about important memories once a week

**What should happen:** Your feedback is saved. This helps the developer know what features people want.

---

### Test 14 — See the big picture

> Show me MoltMind usage stats

**What should happen:** A dashboard showing:
- How many sessions you've had
- Which tools have been used the most
- Whether anything has been going wrong

---

## Checklist

Check off each test as you go:

| # | What you tested | Done? |
|---|----------------|-------|
| - | **Showoff Scenario** | |
| - | Start a task, crash, come back, continue | [ ] |
| | | |
| 1 | Save a note | [ ] |
| 2 | Find it with different words | [ ] |
| 3 | Look up a specific note | [ ] |
| 4 | Edit a note | [ ] |
| 5 | Delete a note | [ ] |
| 6 | Health check | [ ] |
| 7 | Project notebook | [ ] |
| 8 | Leave a bookmark | [ ] |
| 9 | Pick up a bookmark | [ ] |
| 10 | Save what happened | [ ] |
| 11 | Catch up on past work | [ ] |
| 12 | Browse session history | [ ] |
| 13 | Share feedback | [ ] |
| 14 | View stats | [ ] |

---

## Something Not Working?

**Claude doesn't seem to know about MoltMind?**
- Type `/mcp` to check if it's connected
- If it's not listed, run these in your terminal (not in Claude Code):
  ```
  claude mcp remove moltmind
  claude mcp add moltmind -- npx -y moltmind
  ```
- Restart Claude Code and try again

**Search isn't finding your notes?**
- The first time you use MoltMind, it downloads a small AI model (~22MB). Give it a minute and try again.

**Getting a "no active session" error?**
- This just means MoltMind restarted. Try your command again — it creates a fresh session automatically.
