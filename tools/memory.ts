// src/tools/memoryTools.ts
import { text, tool } from "@lmstudio/sdk";
import { z } from "zod";
import { JSONFilePreset } from "lowdb/node";

type Memory = {
  date: string;
  summary: string;
};

// A simple append-only memory log
const db = await JSONFilePreset<Array<Memory>>("memory.json", []);

/**
 * add_persistent_memory
 * LLM should call this ONLY when the user shares stable, lasting info.
 */
export const addPersistentMemoryTool = tool({
  name: "add_persistent_memory",
  description: text`
    Store a short, stable memory about the user or environment that will still matter in the future.

    Use this tool **only when** the user provides information that is:
    - personal preference (e.g., favorite food, preferred way to be addressed)
    - identity details (e.g., "I'm a teacher", "I live in Minneapolis")
    - long-term goals
    - ongoing projects

    **Do NOT** store:
    - temporary details
    - things that only matter in this conversation
    - emotional state that will change moment-to-moment

    Summaries should be very short and factual.
  `,
  parameters: {
    summary: z.string().min(1),
  },
  implementation: async ({ summary }) => {
    const date = new Date().toISOString();
    db.data.push({ date, summary });
    await db.write();
    return { stored: true, date, summary };
  },
});

/**
 * get_persistent_memory
 * Returns the full memory array for summarization/context use.
 */
export const getPersistentMemoryTool = tool({
  name: "get_persistent_memory",
  description: text`
    Retrieve all stored persistent memories.
    Use this when recalling user preferences or long-term context.
  `,
  parameters: {}, // no arguments
  implementation: async () => {
    return db.data;
  },
});

export const getMemoryRaw = () => db.data;
