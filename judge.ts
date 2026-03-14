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
import { tools } from "./tools";
import { openai, MODEL } from "./llm-client";
import { logger } from "./global";

const SYSTEM_PROMPT = `/no_think\nYou are a judge for Zapplebot, a Discord bot with tools: dice, scores, wikipedia, code sandbox, github issues, memory.\nOutput {"should_reply": true} only if the bot can clearly add value. Default to {"should_reply": false} for chatter, jokes, or personal conversation.`;

export async function shouldReply(
  messages: Collection<string, Message<true>>
): Promise<boolean> {
  const recent = [...messages.values()].map(
    (m) => `${m.author.username}: ${m.content}`
  );

  const start = Date.now();

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: recent.join("\n") + `\nReturn ONLY JSON.`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 20,
    });

    const text = response.choices[0]?.message.content ?? "{}";
    const parsed = JSON.parse(text);
    const decision = Boolean(parsed.should_reply);

    logger.debug("judge decision", {
      decision,
      duration_ms: Date.now() - start,
      messages: recent,
      usage: response.usage,
    });

    return decision;
  } catch (err) {
    logger.warn("judge failed", {
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    });
  }
  return false;
}
