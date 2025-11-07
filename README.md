# Zapplebot

Zapplebot is a **Discord bot** powered by **Qwen3** running locally through **LM Studio**, implemented in **Bun + TypeScript**.  
It responds to mentions in Discord, can call tools to take real actions, and maintains a small persistent memory to stay consistent between conversations.

This bot is built for small community servers (like ours with ~30 people).  
It is **cute, concise, and friendly.**

## ✨ Features

| Feature                 | Description                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| **LLM Responses**       | Uses Qwen3 (via LM Studio) to reply in natural language.                                      |
| **Tool Calling**        | The model can call functions to update a scoreboard, store memory, run logic, etc.            |
| **Persistent Memory**   | The bot remembers _long-term_ user preferences (stored in `memory.json`).                     |
| **Scoreboard System**   | Users can gain/lose points; the scoreboard is stored in `db.json`.                            |
| **Context Awareness**   | The bot can pull _recent message history_ in the channel for better conversational grounding. |
| **Logging & Debugging** | Each interaction gets a unique `chatId` and structured logs (Winston).                        |
| **Safe Mentions**       | Backtick-stripped mentions + controlled `allowedMentions` to prevent accidental pings.        |

## 🧩 Tech Stack

- Runtime: **Bun**
- Bot: **discord.js**
- LLM: **Qwen3 via LM Studio SDK**
- Tool System: **@lmstudio/sdk** tool calling
- Data: **lowdb** JSON file persistence
- Validation: **zod**
- Logging: **winston**

---

## 🚀 Running the Bot

### 1. Install Dependencies

```bash
bun install
```

### 2. Start LM Studio & load the model

Open LM Studio → Load & Run:

```
qwen/qwen3-4b-2507
```

Make sure **Developer Tools → Server** is enabled (default `localhost:1234`).

### 3. Create `.env` file

```
DISCORD_TOKEN=your_bot_token_here
```

### 4. Run the bot

```bash
bun index.ts
```

---

## 💬 Using the Bot

Mention it in Discord:

```
@Zapplebot what's the score look like today?
```

```
@Zapplebot give @username +2 party points
```

```
@Zapplebot remember that I like pineapple pizza
```

It will:

- Read recent chat,
- Decide whether to call a tool,
- Reply concisely,
- And tell you if it used a tool.

---

## 🛠 Tools

| Name                    | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `roll_dice`             | Roll dice                                      |
| `update_score_board`    | Give/take points from users.                   |
| `get_score_board`       | Print the full scoreboard.                     |
| `add_persistent_memory` | Save long-term personality or preference info. |
| `get_persistent_memory` | Recall all memories.                           |
| _(more coming)_         | CLI shell actions, embed renderers, etc.       |

Zapplebot calls these tools **automatically** — you don’t need commands.

---

## 🧠 Persistent Memory Rules

Memory is only written when information is:

- Stable
- Long-lived
- Relevant in future conversations

It **does not** store:

- Things said once
- Emotional state

This prevents "memory spam" and keeps the bot from drifting.

---

## 🧪 Debugging

Each message interaction logs to `chat.log` with a unique `chatId`:

```json
{
  "chatId": "9f3a1b27d44e8c50",
  "role": "assistant",
  "content": "Sure thing!",
  "toolCallRequests": [],
  "toolCallResults": []
}
```

Use this to:

- Reconstruct chat
- See which tools were called
- Diagnose unexpected model behavior

---

## 📦 License

MIT — do whatever, just don’t be evil.
