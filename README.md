# Zapplebot ⚡️🍎🤖

A Discord bot for small community servers (~30 users). Responds to mentions, calls tools autonomously, and maintains persistent per-user memory.

Runs on **Bun + TypeScript** with a local or cloud LLM backend.

---

## Tech Stack

| Layer | What |
|---|---|
| Runtime | Bun |
| Bot | discord.js |
| LLM | llama.cpp (local) · OpenAI · Claude (cloud) |
| Tool Schema | zod + zod-to-json-schema |
| Memory | lowdb (JSON flat file) |
| Logging | Winston (structured JSON → `chat.log`) |
| HTTP | Hono (port 8586 — `/health`, `/webhook`) |

---

## Quick Start

### 1. Install dependencies

```bash
bun install
```

### 2. Set up the LLM backend

**Option A — Local (llama.cpp)**

```bash
# Install llama.cpp
# Linux: build from source (see MAC_MINI_SETUP.md for macOS)
# Then start the server:
llama-server \
  -m /path/to/model.gguf \
  --host 127.0.0.1 \
  --port 8888 \
  --api-key yourkey \
  --parallel 1 \
  -c 4096 \
  -ngl 99   # GPU offload — omit if CPU-only
```

Or use the included systemd service (Linux):

```bash
# edit ~/.config/systemd/user/llama-server.service
systemctl --user enable --now llama-server
```

**Option B — Cloud**

Set `LLM_BACKEND=openai` or `LLM_BACKEND=claude` in `.env` (see Environment Variables below).

### 3. Create `.env`

```env
# Discord
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
BOTLAND_CHANNEL_ID=channel_id_for_unprompted_replies

# LLM backend: llama | openai | claude  (default: llama)
LLM_BACKEND=llama

# llama.cpp (used when LLM_BACKEND=llama)
LLAMA_BASE_URL=http://127.0.0.1:8888
LLAMA_API_KEY=yourkey
LLAMA_MODEL=local-model

# OpenAI (used when LLM_BACKEND=openai)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Claude / Anthropic (used when LLM_BACKEND=claude)
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-haiku-4-5-20251001

# GitHub (for github issues tool)
GH_PAT=github_pat_...

# Webhook secret for POST /webhook (generate with: openssl rand -hex 32)
WEBHOOK_SECRET=your_secret_here
```

### 4. Run the bot

The bot runs as a **systemd user service** — not directly via `bun run`.

```bash
# First-time setup
systemctl --user enable --now zapplebot.service

# After making code changes, restart to pick them up
systemctl --user restart zapplebot.service

# Other controls
systemctl --user stop zapplebot.service
systemctl --user status zapplebot.service
```

Service files live in `~/.config/systemd/user/`.

---

## After Making Changes

**Always restart the service to apply code changes:**

```bash
systemctl --user restart zapplebot.service
```

If you changed the systemd service file itself:

```bash
systemctl --user daemon-reload
systemctl --user restart zapplebot.service
```

---

## Switching LLM Backends

Change `LLM_BACKEND` in `.env` and restart the bot. Claude Code slash commands are available:

```
/use-haiku   # switch to Claude Haiku
/use-llama   # switch back to local llama.cpp
```

---

## Tools

The bot calls these autonomously — no slash commands needed.

| Tool | What it does |
|---|---|
| `roll_dice` | Roll any dice notation (e.g. 4d6) |
| `update_score_board` | Give or take points from a user |
| `get_score_board` | Show all scores |
| `score_board_score_names` | List available score categories |
| `add_persistent_memory` | Save a long-term fact about a user |
| `search_wikipedia` | Look up a topic |
| `run_typescript_javascript` | Execute code in a sandboxed Docker container |
| `get_github_issues` | Fetch open issues from a GitHub repo |
| `get_tech_stack` | Return info about the bot's own stack |
| `get_uptime` | Show how long the bot has been running |
| `get_snow_emergency` | Current Minneapolis snow emergency status |
| `get_current_date` / `get_current_time_for_timezone` | Date/time utilities |

---

## HTTP API

A Hono server runs on port 8586 alongside the bot.

### `GET /health`

Returns current uptime — no auth required.

```bash
curl http://localhost:8586/health
# {"uptime":"2h 15m 4s","started_at":"2026-03-14T20:28:04.000Z"}
```

### `POST /webhook`

Post a message directly to botland. Requires HMAC-SHA256 signature.

```bash
SECRET=your_webhook_secret
BODY='{"message":"hello from webhook"}'
SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')"
curl -X POST http://localhost:8586/webhook \
  -H "Content-Type: application/json" \
  -H "X-Signature-SHA256: $SIG" \
  -d "$BODY"
```

Or use the bundled script:

```bash
bun run webhook "your message here"
```

---

## Cron Jobs

| Timer | Schedule | Purpose |
|---|---|---|
| `zapplebot-snow-cron.timer` | every 30 min | Check Minneapolis snow emergency, post to botland if status changed |

```bash
systemctl --user status zapplebot-snow-cron.timer
systemctl --user start zapplebot-snow-cron.service   # run immediately
```

---

## How It Works

```
Discord message
  → isMention? → yes → handle immediately
  → in botland? → judge LLM decides if bot should reply
      → handleMessage()
          → fetch relevant memories (cosine similarity or recency fallback)
          → agentic tool loop (calls tools until finish_reason=stop)
          → send reply + optional tool trace block
```

**Agentic loop**: the bot can call multiple tools in sequence before replying. Each turn is logged with timing, token usage, and tool results.

**Judge**: a fast single-call to the LLM (max 20 tokens) to gate unprompted replies in botland. Returns `{"should_reply": true/false}`.

---

## Memory

- Stored in `memory.json` via lowdb.
- Retrieval uses cosine similarity on embeddings when available, falls back to most-recent-5.
- The bot only stores stable, long-lived facts (preferences, identity, ongoing projects).
- Not stored: one-off statements, emotional state, session-only context.

---

## Logging

All interactions log to **`chat.log`** as structured JSON (Winston). Both the bot process and cron jobs write to the same file. Each bot request gets a unique `chatId`; cron entries are tagged with `process: "snow-emergency-cron"`.

**View live logs:**

```bash
tail -f chat.log | python3 -c "
import sys, json
for line in sys.stdin:
    e = json.loads(line.strip())
    print(e['timestamp'][:19], e['level'].upper(), e['message'])
"
```

**View systemd journal** (stdout/stderr, startup errors):

```bash
journalctl --user -u zapplebot.service -f
journalctl --user -u zapplebot-snow-cron.service -n 50
```

Key log fields:

```json
{ "chatId": "...", "message": "handle complete", "turns": 2, "toolCallCount": 1, "total_ms": 4200 }
{ "chatId": "...", "message": "tool call", "tool": "roll_dice", "success": true, "duration_ms": 0 }
{ "chatId": "...", "message": "llm response", "turn": 1, "finish_reason": "tool_calls", "usage": {...} }
{ "process": "snow-emergency-cron", "message": "decision: already posted, skipping", "version": "..." }
```

---

## Testing

```bash
bun test integration.test.ts
```

Tests cover: tool schema validation, individual tool implementations, full `handleMessage` tool loop, and judge decisions. Timeouts are long (300s) to accommodate CPU inference.

---

## Mac Mini Setup

For running llama.cpp as a persistent system service on a shared Mac (survives user switching), see **[MAC_MINI_SETUP.md](./MAC_MINI_SETUP.md)**.

---

## Persistence Files

| File | Contents |
|---|---|
| `memory.json` | Long-term user memories with embeddings |
| `db.json` | Scoreboard data |
| `cron.json` | Cron job state (last posted snow emergency version) |
| `chat.log` | Structured interaction logs |

These are gitignored. Back them up if they matter.
