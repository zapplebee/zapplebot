# Zapplebot — Claude Code Context

## What this is

A Discord bot running on Bun + TypeScript. It uses an OpenAI-compatible API for LLM inference, supports multiple backends (local llama.cpp, OpenAI, Claude), and has an agentic tool loop.

## Running the bot

The bot runs as a systemd user service. Standard controls:

```bash
systemctl --user status zapplebot.service
systemctl --user restart zapplebot.service
systemctl --user stop zapplebot.service
journalctl --user -u zapplebot.service -f
```

Service file: `~/.config/systemd/user/zapplebot.service`

**After making code changes, always restart:**

```bash
systemctl --user restart zapplebot.service
```

If the service file itself changed, reload first:

```bash
systemctl --user daemon-reload && systemctl --user restart zapplebot.service
```

To restart with a custom Discord announcement, set `STARTUP_MESSAGE` transiently:

```bash
systemctl --user set-environment STARTUP_MESSAGE="..." && \
  systemctl --user restart zapplebot.service && \
  systemctl --user unset-environment STARTUP_MESSAGE
```

Or pass it directly via the webhook script:

```bash
bun run webhook "..."
```

## LLM backend

Controlled by `LLM_BACKEND` in `.env`: `llama` (default) | `openai` | `claude`.

The local llama.cpp server runs as a systemd user service:

```bash
systemctl --user status llama-server
systemctl --user restart llama-server
journalctl --user -u llama-server -n 50
```

Service file: `~/.config/systemd/user/llama-server.service`
Currently running: Qwen2.5-3B-Instruct-Q4_K_M at `127.0.0.1:8888`

## Cron jobs

| Service | Schedule | Purpose |
|---|---|---|
| `zapplebot-snow-cron.timer` | every 30 min | Fetch Minneapolis snow emergency status, post to botland if changed |

```bash
systemctl --user status zapplebot-snow-cron.timer
systemctl --user start zapplebot-snow-cron.service   # run immediately
journalctl --user -u zapplebot-snow-cron.service -n 50
```

Cron logs are written to the same `chat.log` as the bot, tagged with `process: "snow-emergency-cron"`.

## Key files

| File | Purpose |
|---|---|
| `index.ts` | Discord client, message routing, emoji reactions |
| `handle-message.ts` | Agentic tool loop, memory injection, LLM calls |
| `judge.ts` | Gate for unprompted botland replies |
| `llm-client.ts` | Backend switcher — exports `openai` client and `MODEL` |
| `bot-tool.ts` | `tool()` and `text()` helpers (framework-agnostic) |
| `global.ts` | Winston logger, AsyncLocalStorage context (withCtx, getCtxId) |
| `tools/index.ts` | Exports `tools[]` and `openaiTools[]` singletons |
| `sendMessage.ts` | Discord message sender (handles 2000-char splits) |
| `server.ts` | Hono HTTP server (port 8586) — `/health` and `/webhook` endpoints |
| `webhook.ts` | CLI + importable module to post to the webhook endpoint |
| `snow.ts` | Shared snow emergency data fetching + lowdb store (`cron.json`) |
| `cron.ts` | Minneapolis snow emergency checker — run by systemd timer |

## Adding a new tool

1. Create `tools/yourtool.ts` — export a `BotTool` using `tool()` from `../bot-tool`
2. Add it to `tools/index.ts` in the `tools` array
3. The `openaiTools` array is derived automatically via `zod-to-json-schema`

**Important**: avoid `\d` in zod `.regex()` patterns — llama.cpp's GBNF grammar compiler doesn't support it. Use `[0-9]` instead.

## Logs

Structured JSON logs → `chat.log`. Each request has a `chatId`.

```bash
tail -f chat.log | python3 -c "
import sys, json
for line in sys.stdin:
    e = json.loads(line.strip())
    print(e['timestamp'][:19], e['level'].upper(), e['message'])
"
```

## Slash commands (Claude Code)

| Command | Action |
|---|---|
| `/use-haiku` | Switch to Claude Haiku backend |
| `/use-llama` | Switch to local llama.cpp backend |

## Data files (gitignored)

- `memory.json` — persistent user memories (lowdb)
- `db.json` — scoreboard (lowdb)
- `cron.json` — cron job state (e.g. last posted snow emergency version)
- `chat.log` — interaction logs (both bot and cron processes)

## Known issues / gotchas

- `\d` in zod regex → llama.cpp grammar parse failure → all tool calls break (use `[0-9]`)
- `--parallel 1` on llama server improves single-request throughput on this CPU (i5-7500T, 4 cores, no GPU)
- The judge and handle-message both hit the same llama server; concurrent requests will queue
- Embedding via llama.cpp is unsupported (Qwen is not an embedding model); memory falls back to recency-based retrieval
- Mac Mini M1 setup documented in `MAC_MINI_SETUP.md` — will be ~6-10x faster with `-ngl 99`
