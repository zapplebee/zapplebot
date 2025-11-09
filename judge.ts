// judge.ts
/**
 * NOTE FOR FUTURE LLM EDITS:
 *
 * This file exports:
 *   async function shouldReply(messages: Collection<string, Message<true>>): Promise<boolean>
 *
 * Behavior:
 *   - Extracts the last 3 user messages (no system/assistant formatting here).
 *   - Sends a short prompt to a small model asking:
 *         "Should the bot add something useful?"
 *   - The model must return ONLY: {"should_reply": true or false}
 *
 * Requirements:
 *   - Do NOT return explanations or text, only parse JSON strictly.
 *   - Do NOT change returned type (boolean).
 *   - If JSON parse fails, return false.
 *
 * Safe to modify:
 *   - The prompt's wording (but keep format: "Return ONLY JSON").
 *   - The number of messages included.
 *
 * Not allowed to modify:
 *   - The return type (must stay boolean).
 */

import type { Message, Collection } from "discord.js";
import { LMStudioClient, Chat } from "@lmstudio/sdk";
import { z } from "zod";
import { toolsProvider } from "./tools";

const lm = new LMStudioClient();
// You may choose a specific small/fast model here:
const judgeModel = await lm.llm.model("qwen/qwen3-4b-2507");

export async function shouldReply(
  messages: Collection<string, Message<true>>
): Promise<boolean> {
  const tools = await toolsProvider();

  const toolNames = tools.map((e) => `- ${e.name}`);

  const SYSTEM_PROMPT = `
You are a relevance judge for a Discord bot called Zapplebot.
Zapplebot is a playful bot that should notice when it is being talked about.
Decide if the bot should reply to the conversation.
Return ONLY JSON: {"should_reply": true} or {"should_reply": false}

Guidelines:
- Be discerning, useful bot is well liked.
- Reply if the bot can add new, helpful, context-aware information.
- Do NOT reply to inside jokes or personal side conversations.
- Prefer silence if usefulness is unclear.

You will have access to these tools:
${toolNames.join("\n")}
`;

  // Extract last few messages
  const recent = [...messages.values()].map(
    (m) => `${m.author.username}: ${m.content}`
  );

  const chat = Chat.from([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: recent.join("\n") + `\nReturn ONLY JSON.` },
  ]);

  const responseSchema = z.object({ should_reply: z.boolean() });

  const out = await judgeModel.respond(chat, { structured: responseSchema });

  try {
    const doRespond = out.parsed.should_reply;
    return doRespond;
  } catch {
    // fall through
  }
  return false;
}
