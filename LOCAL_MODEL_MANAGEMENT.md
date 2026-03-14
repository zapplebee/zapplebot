# Local Model Management

Reference for tuning, switching, and restarting the llama.cpp inference server that backs zapplebot.

---

## Current Configuration

Service file: `~/.config/systemd/user/llama-server.service`

```
llama-server
  -m /home/zac/models/Qwen3-1.7B-Q4_K_M.gguf   # model file
  -t 4                                            # CPU threads
  -c 4096                                         # context window (tokens)
  --parallel 1                                    # concurrent request slots
  --host 127.0.0.1                               # bind address
  --port 8888                                    # port
  --api-key bigaihatesthisoneweirdtrick          # API key
```

**Hardware**: Intel i5-7500T, 4 cores, no GPU, no hyperthreading.
**Observed performance**: ~20 tok/s generation, ~70 tok/s prompt eval (Qwen3-1.7B).

---

## Available Models

All stored in `~/models/`:

| File | Size | Notes |
|---|---|---|
| `Qwen3-1.7B-Q4_K_M.gguf` | 1.1 GB | **Current.** Fastest. Tool calling reliable. |
| `Qwen3-4B-Q4_K_M.gguf` | 2.4 GB | Better reasoning, ~2x slower. |
| `Qwen2.5-3B-Instruct-Q4_K_M.gguf` | 2.0 GB | Previous model. Fallback. |
| `Qwen2.5-7B-Instruct-Q4_K_M.gguf` | 4.4 GB | Slowest. Original. |

**Qwen3 vs Qwen2.5**: Qwen3 models have native thinking mode (suppressed via `/no_think` in system prompt). Better instruction following at equivalent size.

---

## Parameters Explained

### `-m` — Model file
Path to the `.gguf` model. This is how you switch models. See "Switching Models" below.

### `-t` — CPU threads
How many threads to use for inference. Set to `4` because this machine has 4 physical cores. Setting higher than your core count hurts performance. Setting lower wastes cores.

> **Tune if**: you add more cores or want to leave headroom for other processes (try `-t 3`).

### `-c` — Context window
Maximum tokens in a single conversation (prompt + response combined). Currently `4096`.
Larger values use more RAM and slow prompt eval slightly, but allow longer conversations.

> **Tune if**: the bot starts truncating long conversations (you'll see errors in logs), or you want to reduce RAM usage (try `-c 2048`).

### `--parallel` — Concurrent slots
How many requests can be processed simultaneously. Set to `1` because:
- This is a CPU-only machine with limited memory bandwidth
- The Discord bot mostly handles one request at a time
- Multiple slots divide bandwidth and make *each* response slower

> **Keep at 1** on this hardware. Only increase on multi-GPU or high-memory-bandwidth machines.

### `--host` — Bind address
`127.0.0.1` = localhost only (secure, no LAN access).
`0.0.0.0` = accessible from the local network (needed if pointing zapplebot at a remote machine, e.g. the Mac mini).

> **Change to `0.0.0.0`** if you move inference to the Mac mini and zapplebot needs to reach it over the LAN.

### `--api-key` — API key
Required in all requests as `Authorization: Bearer <key>`. Set in zapplebot's `.env` as `LLAMA_API_KEY`.

---

## Meaningful Things to Tune

### Speed vs quality tradeoff — switch the model

| Goal | Model |
|---|---|
| Maximum speed | `Qwen3-1.7B-Q4_K_M.gguf` |
| Better reasoning, moderate speed | `Qwen3-4B-Q4_K_M.gguf` |

### Quantization level

The `Q4_K_M` suffix means 4-bit quantization with medium quality. Lower = faster/smaller, higher = slower/better:

| Quant | Size vs Q4_K_M | Quality |
|---|---|---|
| Q2_K | ~60% | Noticeably degraded |
| Q3_K_M | ~75% | Acceptable for simple tasks |
| **Q4_K_M** | 100% (baseline) | Good balance |
| Q5_K_M | ~125% | Slightly better |
| Q8_0 | ~200% | Near lossless |

For this CPU, `Q4_K_M` is the right default. Only go lower if RAM is a constraint.

### Context size (`-c`)

| Value | RAM usage (approx) | Good for |
|---|---|---|
| 2048 | minimal | Short Discord conversations |
| **4096** | moderate | **Current — good default** |
| 8192 | significant | Long multi-tool conversations |

### Threads (`-t`)

Leave at `4` on this machine. If you ever run other CPU-heavy processes alongside the bot, drop to `3` to avoid contention.

---

## Switching Models

1. Edit the service file:

```bash
nano ~/.config/systemd/user/llama-server.service
```

Change the `-m` line to point to the new model file.

2. Reload and restart:

```bash
systemctl --user daemon-reload
systemctl --user restart llama-server
```

3. Confirm it loaded:

```bash
journalctl --user -u llama-server -n 10 --no-pager
```

Look for: `main: model loaded` and `server is listening`.

4. Restart the bot with a message:

```bash
# In the zapplebot tmux session:
tmux send-keys -t zapplebot C-c Enter
sleep 1
tmux send-keys -t zapplebot 'bun run bot -- --startupmessage "⚡️🍎🤖 Model changed."' Enter
```

---

## Checking Performance

Token speed from the last few requests:

```bash
journalctl --user -u llama-server --no-pager | grep "eval time" | tail -10
```

Output format:
```
prompt eval time = 1163 ms / 97 tokens  →  83 tok/s   (reading the prompt)
       eval time =  465 ms / 11 tokens  →  23 tok/s   (generating the reply)
```

**Generation rate** (eval time) is what you feel as response latency. **Prompt eval** is fast because llama.cpp caches it across requests with the same system prompt prefix.

---

## Useful Commands

| Task | Command |
|---|---|
| Check service status | `systemctl --user status llama-server` |
| Restart server | `systemctl --user restart llama-server` |
| Stop server | `systemctl --user stop llama-server` |
| Start server | `systemctl --user start llama-server` |
| View logs (live) | `journalctl --user -u llama-server -f` |
| View last 50 log lines | `journalctl --user -u llama-server -n 50 --no-pager` |
| Check token speed | `journalctl --user -u llama-server --no-pager \| grep "eval time" \| tail -10` |
| List models | `ls -lh ~/models/` |
| Edit service file | `nano ~/.config/systemd/user/llama-server.service` |
| Reload after edit | `systemctl --user daemon-reload` |

---

## Switching to Mac Mini (when ready)

When the Mac mini M1 is running the llama-server as a LaunchDaemon (see `MAC_MINI_SETUP.md`):

1. Get the Mac mini's local IP: `ipconfig getifaddr en0` (run on the Mac)
2. Update `.env` on nyx:
   ```
   LLAMA_BASE_URL=http://<mac-mini-ip>:8888
   ```
3. Restart the bot. The llama-server service on nyx can be stopped:
   ```bash
   systemctl --user stop llama-server
   systemctl --user disable llama-server
   ```

Expected performance on M1 with `-ngl 99`: **80–150 tok/s generation** for 1.7B, **40–80 tok/s** for 4B.
