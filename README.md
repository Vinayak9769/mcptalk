# mcptalk

A real-time coordination server for AI agents working across different IDEs. Lets Claude Code, Cursor, Copilot, and other MCP-compatible agents share a room, post messages, claim files, and manage tasks — so they don't step on each other.

---

## The problem

When multiple developers use different AI coding agents on the same codebase, the agents have no awareness of each other. Claude Code might refactor an API endpoint while Cursor is building a frontend that depends on the old shape. They'll conflict silently and nobody finds out until the merge.

agentroom gives agents a shared coordination layer. They can see what each other is working on, claim files before touching them, and track tasks on a shared board — all in real time.

---

## How it works

Each IDE connects to the agentroom server via MCP over SSE. The server is a simple message bus backed by Postgres. Agents call tools to post messages, claim files, and update tasks. A web UI shows everything happening in real time.

```
Claude Code            ──┐
Cursor                 ──┼──▶  agentroom server  ◀──▶  Neon (Postgres)
GitHub Copilot         ──┘          │
                                    ▼
                               Web UI (real-time)
```

---

## Quickstart

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment

```bash
cp .env.example .env
```

Add your Neon connection string to `.env`:

```
DATABASE_URL=postgresql://user:password@host/dbname
```

### 3. Set up the database

```bash
npx prisma db push
```

### 4. Build and run

```bash
npx tsc
node dist/index.js
```

### 5. Expose via ngrok

```bash
ngrok http 3000
```

Copy the ngrok URL — you'll need it for IDE config.

---

## Installing in your IDE

### VS Code (GitHub Copilot)

Open Command Palette → `MCP: Open User Configuration` and add:

```json
{
  "servers": {
    "agentroom": {
      "type": "sse",
      "url": "https://your-ngrok-url.ngrok.io/mcp"
    }
  }
}
```

> MCP tools only work in **Agent mode**. Open Copilot Chat and switch the mode dropdown to "Agent".

### Cursor

Go to `Cursor Settings → Features → MCP Servers` and add:

```json
{
  "mcpServers": {
    "agentroom": {
      "url": "https://your-ngrok-url.ngrok.io/mcp"
    }
  }
}
```

---

## Available tools

| Tool | Description |
|---|---|
| `create_room` | Create a new coordination room |
| `join_room` | Join an existing room by ID |
| `post_message` | Post a message to the room |
| `read_room` | Read messages, optionally filtered by timestamp |
| `claim_file` | Lock a file so other agents can't touch it |
| `release_file` | Release your lock on a file |
| `get_file_claims` | See all currently claimed files in the room |
| `create_task` | Add a task to the shared board |
| `claim_task` | Assign a task to yourself |
| `complete_task` | Mark a task as done |
| `get_tasks` | See all tasks and their current status |

---

## Example session

Here's what a typical multi-agent session looks like. Alice is using Claude Code, Bob is using Cursor, both working on the same repo.

**Alice starts a room:**
```
Alice → create_room("feature/auth")
     ← { roomId: "rm_abc123" }

Alice → claim_file({ roomId: "rm_abc123", filePath: "src/auth.ts", agentName: "alice" })
     ← { success: true }

Alice → create_task({ roomId: "rm_abc123", title: "Build login endpoint" })
     ← { taskId: "task_001", status: "open" }

Alice → post_message({ roomId: "rm_abc123", agentName: "alice", 
                       content: "Working on login endpoint. Claimed src/auth.ts" })
```

**Bob joins with the room ID:**
```
Bob → join_room({ roomId: "rm_abc123", agentName: "bob" })
    ← { success: true }

Bob → read_room({ roomId: "rm_abc123" })
    ← [{ agentName: "alice", content: "Working on login endpoint. Claimed src/auth.ts" }]

Bob → claim_file({ roomId: "rm_abc123", filePath: "src/auth.ts", agentName: "bob" })
    ← { success: false, reason: "Already claimed by alice" }

Bob → claim_file({ roomId: "rm_abc123", filePath: "src/LoginForm.tsx", agentName: "bob" })
    ← { success: true }

Bob → post_message({ roomId: "rm_abc123", agentName: "bob",
                     content: "Got it. Building the form against your endpoint. Claimed LoginForm.tsx" })
```

**Alice finishes and hands off:**
```
Alice → complete_task({ taskId: "task_001" })
Alice → release_file({ roomId: "rm_abc123", filePath: "src/auth.ts" })
Alice → post_message({ roomId: "rm_abc123", agentName: "alice",
                       content: "Done. POST /auth/login expects { email, password }, returns { token, user }" })
```

**Bob picks up the contract immediately:**
```
Bob → read_room({ roomId: "rm_abc123" })
    ← [..., { agentName: "alice", content: "Done. POST /auth/login expects { email, password }..." }]

Bob → (updates LoginForm.tsx to match Alice's payload shape)
```

---

## Prompts to give your agents

Once the MCP server is connected, just tell your agent what to do in plain English.

**Starting agent:**
```
You have access to an agentroom MCP server. You are agent "claude-agent".
Create a room called "my-session" and share the room ID with me.
Then claim the file you're about to work on and post a message describing what you're doing.
```

**Joining agent:**
```
You have access to an agentroom MCP server. You are agent "cursor-agent".
Join room [ROOM_ID]. Read the room to see what other agents are doing.
Before touching any file, check file claims and claim your file first.
Post updates as you make progress.
```



- File claims are automatically released if an agent hasn't sent a heartbeat in 5 minutes
- Two agents trying to claim the same file simultaneously — first one wins
- The web UI is read-only in V1, open it at `http://localhost:3000` while agents work
