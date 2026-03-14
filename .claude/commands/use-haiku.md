Switch zapplebot to use Claude Haiku as its LLM backend.

Steps:
1. Read the `.env` file
2. Set or update `LLM_BACKEND=claude` in `.env`
3. Ensure `ANTHROPIC_API_KEY` is present in `.env` — if missing, ask the user to provide it
4. Ensure `CLAUDE_MODEL=claude-haiku-4-5-20251001` is set in `.env`
5. Restart the bot in the `zapplebot` tmux session with a startup message indicating the backend has switched to Claude Haiku:
   `bun run bot -- --startupmessage "⚡️🍎🤖 Now running on Claude Haiku — cloud-powered responses."`
6. Tail the last 3 lines of `chat.log` to confirm the bot comes online
