// src/tools/memoryTools.ts
import { text, tool, LMStudioClient } from "@lmstudio/sdk";
import { z } from "zod";
import { JSONFilePreset } from "lowdb/node";
import cosine from "compute-cosine-similarity";

type Memory = {
  date: string;
  summary: string;
  embedding: number[];
};

type MemoryExternal = {
  date: string;
  summary: string;
};

// A simple append-only memory log
const db = await JSONFilePreset<Array<Memory>>("memory.json", []);
const client = new LMStudioClient();
const model = await client.embedding.model("nomic-embed-text-v1.5");

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
    const { embedding } = await model.embed(summary);
    db.data.push({ date, summary, embedding });
    await db.write();
    return { stored: true, date, summary };
  },
});

export const getMemoryRaw = () => db.data;

function meanPool(vecs: number[][]) {
  //@ts-ignore
  return vecs[0].map(
    (_, i) =>
      //@ts-ignore
      vecs.reduce((sum, v) => sum + v[i], 0) / vecs.length
  );
}

export async function getRelevantMemories(
  ...chatMessages: Array<string>
): Promise<Array<MemoryExternal>> {
  const MIN_SIM = 0.7; // raise to be stricter, lower to recall more
  const TOP_K = 5;

  const chatEmbeddings = (
    await Promise.all(chatMessages.map((e) => model.embed(e)))
  ).map((e) => e.embedding);

  const queryVec = meanPool(chatEmbeddings);
  if (!queryVec.length) return [];

  return db.data
    .map((m) => ({ m, score: cosine(queryVec, m.embedding) || 0 }))
    .filter(({ score }) => score >= MIN_SIM)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)
    .map(({ m }) => ({ date: m.date, summary: m.summary }));
}
