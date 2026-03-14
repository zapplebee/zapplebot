// src/tools/memoryTools.ts
import { text, tool } from "../bot-tool";
import { z } from "zod";
import { JSONFilePreset } from "lowdb/node";
import cosine from "compute-cosine-similarity";
import { openai } from "../llm-client";
import { logger } from "../global";

type Memory = {
  date: string;
  summary: string;
  embedding: number[];
};

type MemoryExternal = {
  date: string;
  summary: string;
};

const TOP_K = 5;

// A simple append-only memory log
const db = await JSONFilePreset<Array<Memory>>("memory.json", []);

async function embed(input: string): Promise<number[] | null> {
  try {
    const res = await openai.embeddings.create({
      model: process.env.LLAMA_EMBED_MODEL ?? "local-model",
      input,
    });
    return res.data[0]?.embedding ?? null;
  } catch (err) {
    logger.warn("embed failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * add_persistent_memory
 * LLM should call this ONLY when the user shares stable, lasting info.
 */
export const addPersistentMemoryTool = tool({
  name: "add_persistent_memory",
  description: text`Store a stable fact about the user: preferences, identity, goals, or ongoing projects. Do NOT store temporary or session-only info. Keep summaries short and factual.`,
  parameters: {
    summary: z.string().min(1),
  },
  implementation: async ({ summary }) => {
    const date = new Date().toISOString();
    const embedding = (await embed(summary)) ?? [];
    db.data.push({ date, summary, embedding });
    await db.write();
    logger.debug("memory stored", {
      summary,
      date,
      hasEmbedding: embedding.length > 0,
      totalMemories: db.data.length,
    });
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
  if (db.data.length === 0) return [];

  // Try similarity search if memories have embeddings
  const embeddedMemories = db.data.filter((m) => m.embedding.length > 0);
  if (embeddedMemories.length > 0) {
    try {
      const chatEmbeddings = (
        await Promise.all(chatMessages.map(embed))
      ).filter((e): e is number[] => e !== null);

      if (chatEmbeddings.length > 0) {
        const queryVec = meanPool(chatEmbeddings);
        const results = embeddedMemories
          .map((m) => ({ m, score: cosine(queryVec, m.embedding) || 0 }))
          .filter(({ score }) => score >= 0.7)
          .sort((a, b) => b.score - a.score)
          .slice(0, TOP_K)
          .map(({ m }) => ({ date: m.date, summary: m.summary }));
        logger.debug("memory retrieval", { method: "similarity", count: results.length });
        return results;
      }
    } catch (err) {
      logger.warn("similarity retrieval failed, falling back to recency", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Fallback: return the most recent memories
  const results = db.data
    .slice(-TOP_K)
    .map((m) => ({ date: m.date, summary: m.summary }));
  logger.debug("memory retrieval", { method: "recency", count: results.length });
  return results;
}
