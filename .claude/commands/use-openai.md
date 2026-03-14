Switch zapplebot to use OpenAI as its LLM backend.

Steps:
1. Read the `.env` file
2. Set or update `LLM_BACKEND=openai` in `.env`
3. Ensure `OPENAI_API_KEY` is present in `.env` — if missing, ask the user to provide it
4. Ensure `OPENAI_MODEL=gpt-4o-mini` is set in `.env` (or confirm with user if they want a different model)
5. Restart the bot in the `zapplebot` tmux session with a startup message indicating the backend has switched:
   `bun run bot -- --startupmessage "⚡️🍎🤖 Now running on OpenAI gpt-4o-mini."`
6. Tail the last 3 lines of `chat.log` to confirm the bot comes online
