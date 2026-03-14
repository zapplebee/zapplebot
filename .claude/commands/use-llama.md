Switch zapplebot back to the local llama.cpp backend.

Steps:
1. Read the `.env` file
2. Set or update `LLM_BACKEND=llama` in `.env` (or remove the line — llama is the default)
3. Confirm the llama-server systemd service is running: `systemctl --user status llama-server --no-pager`
   - If not running, start it: `systemctl --user start llama-server`
4. Restart the bot in the `zapplebot` tmux session with a startup message indicating the backend has switched:
   `bun run bot -- --startupmessage "⚡️🍎🤖 Switched back to local Qwen2.5-3B on llama.cpp."`
5. Tail the last 3 lines of `chat.log` to confirm the bot comes online
