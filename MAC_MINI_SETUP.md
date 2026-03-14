# Mac Mini (M1) llama.cpp Server Setup

Goal: run llama.cpp as a system-level LaunchDaemon so it serves the OpenAI-compatible API on the local network 24/7, regardless of which user is logged in.

---

## 1. Install llama.cpp

```bash
brew install llama.cpp
```

This installs `llama-server` to `/opt/homebrew/bin/llama-server`. Confirm with:

```bash
which llama-server
llama-server --version
```

> If you prefer to build from source for the latest version:
> ```bash
> git clone https://github.com/ggml-org/llama.cpp
> cd llama.cpp
> cmake -B build -DGGML_METAL=ON
> cmake --build build --config Release -j$(sysctl -n hw.logicalcpu)
> ```
> Binary will be at `build/bin/llama-server`.

---

## 2. Download the model

```bash
mkdir -p /opt/llama/models
aria2c -x 8 -d /opt/llama/models \
  https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf
```

Or use a larger model — the M1 has fast unified memory, so Q4_K_M at 7B is very reasonable:

```bash
aria2c -x 8 -d /opt/llama/models \
  https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf
```

---

## 3. Test it manually first

```bash
llama-server \
  -m /opt/llama/models/qwen2.5-3b-instruct-q4_k_m.gguf \
  --host 0.0.0.0 \
  --port 8888 \
  --api-key bigaihatesthisoneweirdtrick \
  -ngl 99 \
  --parallel 1 \
  -c 4096
```

`-ngl 99` offloads all layers to the M1 GPU — this is what makes it fast. You should see ~60–100 tok/s.

Test from the Mac mini:

```bash
curl http://localhost:8888/v1/models \
  -H "Authorization: Bearer bigaihatesthisoneweirdtrick"
```

Test from nyx (replace `<mac-mini-ip>` with the Mac mini's local IP):

```bash
curl http://<mac-mini-ip>:8888/v1/models \
  -H "Authorization: Bearer bigaihatesthisoneweirdtrick"
```

Find the Mac mini's IP with: `ipconfig getifaddr en0`

---

## 4. Create the LaunchDaemon plist

Create `/Library/LaunchDaemons/com.zapplebot.llama-server.plist` (requires sudo):

```bash
sudo nano /Library/LaunchDaemons/com.zapplebot.llama-server.plist
```

Paste this (update the model path and binary path if needed):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.zapplebot.llama-server</string>

  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/llama-server</string>
    <string>-m</string>
    <string>/opt/llama/models/qwen2.5-3b-instruct-q4_k_m.gguf</string>
    <string>--host</string>
    <string>0.0.0.0</string>
    <string>--port</string>
    <string>8888</string>
    <string>--api-key</string>
    <string>bigaihatesthisoneweirdtrick</string>
    <string>-ngl</string>
    <string>99</string>
    <string>--parallel</string>
    <string>1</string>
    <string>-c</string>
    <string>4096</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/var/log/llama-server.log</string>

  <key>StandardErrorPath</key>
  <string>/var/log/llama-server.log</string>
</dict>
</plist>
```

---

## 5. Load and start the daemon

```bash
sudo launchctl load /Library/LaunchDaemons/com.zapplebot.llama-server.plist
sudo launchctl start com.zapplebot.llama-server
```

Check it's running:

```bash
sudo launchctl list | grep zapplebot
tail -f /var/log/llama-server.log
```

It will now start automatically at boot and restart on failure, for all users.

---

## 6. Point zapplebot at the Mac mini

On `nyx`, edit `/home/zac/github.com/zapplebee/zapplebot/.env`:

```
LLAMA_BASE_URL=http://<mac-mini-ip>:8888
```

Then restart the bot:

```bash
# in the zapplebot tmux session on nyx
bun run bot -- --startupmessage "⚡️🍎🤖 Now running inference on the M1 Mac mini."
```

---

## Useful commands

| Action | Command |
|---|---|
| Stop the server | `sudo launchctl stop com.zapplebot.llama-server` |
| Unload permanently | `sudo launchctl unload /Library/LaunchDaemons/com.zapplebot.llama-server.plist` |
| View logs | `tail -f /var/log/llama-server.log` |
| Check status | `sudo launchctl list \| grep zapplebot` |
| Reload after plist edit | `sudo launchctl unload ... && sudo launchctl load ...` |

---

## Notes

- Use `--host 0.0.0.0` (not `127.0.0.1`) so the server is reachable from other machines on the LAN.
- Consider assigning the Mac mini a static IP via your router's DHCP reservation so the IP never changes.
- The M1 with `-ngl 99` should deliver ~60–100 tok/s for 3B Q4_K_M, vs ~10 tok/s on the i5-7500T. The 7B model is also viable at ~40–60 tok/s.
