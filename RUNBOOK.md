# MoltMind Runbook

A quick hands-on guide to see what MoltMind does. Five scenarios, each takes about a minute.

## Setup

```bash
claude mcp add moltmind -- npx -y moltmind
```

Restart Claude Code, type `/mcp`, confirm "moltmind" shows up.

---

## 1. Memory That Survives Conversations

Start a conversation and type:

> Remember that our API uses port 8080, the database is PostgreSQL on RDS, and deploys go through GitHub Actions. Tag this as "infra".

Close Claude Code completely. Open it again. New conversation. Type:

> What port does our API run on?

**What happens:** Claude finds the answer even though this is a brand new conversation. It searches by meaning — you said "port" and it finds the "API uses port 8080" memory. Try asking "how do we deploy?" and it finds the GitHub Actions detail too.

---

## 2. The Crash Recovery

This is the showoff demo. Give Claude a multi-step task:

> I'm planning a birthday party for my mom. She likes Italian food, jazz music, and the color purple. The party is March 15th. We decided on Olive Garden for the restaurant and the playlist has 30 jazz songs. Create a handoff so we can continue this later.

Now kill Claude Code — Ctrl+C, close the terminal, whatever. Don't save anything.

Open Claude Code again. Type:

> What was I working on?

**What happens:** Claude loads the handoff and tells you exactly where you left off — restaurant booked, playlist done, still need decorations and guest list. Three conversations, two crashes, zero lost context.

---

## 3. Token Savings in Action

After using MoltMind for a few conversations, type:

> Show me MoltMind metrics

**What happens:** You get a dashboard with a `token_savings` section showing:
- How many sessions were tracked
- How many cold starts were avoided (each one saves ~8,000 tokens)
- Your net savings and the mode you're running (default or moltbook)

The savings compound over time. By session 5 the numbers get hard to argue with.

---

## 4. Project-Scoped Memory

Navigate to a project directory and type:

> Set up a MoltMind vault for this project

Then:

> Remember that this project uses React 19, Tailwind, and Zustand for state management

**What happens:** MoltMind creates a `.moltmind/` folder in your project. Memories saved here are scoped to this project — they won't leak into other projects. Switch to a different directory, search for "React 19", and you'll get nothing. Come back to this project and it's all there.

---

## 5. The Full Loop

This ties everything together. In one session:

> Store a learning: Never use `any` in TypeScript generics — always constrain with `extends`. Tag it as "typescript" and "best-practices".

Then:

> Save this session: explored TypeScript patterns, captured one key learning about generics

Close Claude Code. Open it fresh. Type:

> Resume my last session

**What happens:** Claude loads your session summary and latest handoff. It knows you were exploring TypeScript patterns and saved a learning about generics. You can pick up right where you left off, or search for that learning weeks later with:

> What do I know about TypeScript generics?

---

## Troubleshooting

**Claude doesn't know about MoltMind?**
Type `/mcp` — if it's not listed:
```bash
claude mcp remove moltmind
claude mcp add moltmind -- npx -y moltmind
```
Restart Claude Code.

**Search returns nothing?**
The embedding model (~22MB) downloads on first use. Give it a minute and try again.

**"No active session" error?**
MoltMind restarted. Run your command again — it auto-creates a fresh session.
