/**
 * Integration tests — require live llama.cpp server at 127.0.0.1:8888.
 * Run with: bun test integration.test.ts --timeout 0
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { handleMessage } from "./handle-message";
import { shouldReply } from "./judge";
import { withCtx } from "./global";
import { readFileSync, existsSync } from "node:fs";
import type OpenAI from "openai";

// ── helpers ──────────────────────────────────────────────────────────────────

async function serverIsUp(): Promise<boolean> {
  try {
    const r = await fetch(
      `${process.env.LLAMA_BASE_URL ?? "http://127.0.0.1:8888"}/health`
    );
    const j = (await r.json()) as { status?: string };
    return j.status === "ok";
  } catch {
    return false;
  }
}

// ── setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const up = await serverIsUp();
  if (!up) {
    throw new Error(
      "llama.cpp server is not reachable. Start it before running integration tests."
    );
  }
});

// ── model + tool loop integration ─────────────────────────────────────────────

describe("handleMessage tool loop", () => {
  test(
    "model calls roll_dice when asked to roll dice",
    async () => {
      let response!: { content: string; toolBlock?: string };

      await withCtx(async () => {
        response = await handleMessage(
          "roll 2d6 for me",
          { id: "123", mention: "@testuser", displayName: "testuser" },
          []
        );
      });

      expect(typeof response.content).toBe("string");
      expect(response.content.length).toBeGreaterThan(0);
      expect(response.toolBlock).toBeDefined();
      expect(response.toolBlock).toContain("roll_dice");
    }
  );

  test(
    "model returns a reply without tools for a simple greeting",
    async () => {
      let response!: { content: string; toolBlock?: string };

      await withCtx(async () => {
        response = await handleMessage(
          "hello!",
          { id: "123", mention: "@testuser", displayName: "testuser" },
          []
        );
      });

      expect(typeof response.content).toBe("string");
      expect(response.content.length).toBeGreaterThan(0);
    }
  );

  test(
    "model calls get_score_board when asked for scores",
    async () => {
      let response!: { content: string; toolBlock?: string };

      await withCtx(async () => {
        response = await handleMessage(
          "show me the scoreboard",
          { id: "123", mention: "@testuser", displayName: "testuser" },
          []
        );
      });

      expect(typeof response.content).toBe("string");
      expect(response.toolBlock).toBeDefined();
      expect(response.toolBlock).toContain("score_board");
    }
  );

  test(
    "model respects chat history",
    async () => {
      let response!: { content: string; toolBlock?: string };

      await withCtx(async () => {
        response = await handleMessage(
          "what did I just say?",
          { id: "123", mention: "@testuser", displayName: "testuser" },
          [
            { role: "user", content: "my favorite color is vermillion" },
            { role: "assistant", content: "That's a great color!" },
          ]
        );
      });

      expect(response.content.toLowerCase()).toContain("vermillion");
    }
  );
});

// ── judge ─────────────────────────────────────────────────────────────────────

describe("shouldReply", () => {
  function makeMessages(entries: Array<{ username: string; content: string }>) {
    const map = new Map(
      entries.map((e, i) => [
        String(i),
        { author: { username: e.username }, content: e.content },
      ])
    );
    return { values: () => map.values() } as any;
  }

  test(
    "returns true when bot is mentioned by name",
    async () => {
      const result = await shouldReply(
        makeMessages([
          { username: "alice", content: "hey zapplebot can you roll some dice?" },
        ])
      );
      expect(typeof result).toBe("boolean");
      expect(result).toBe(true);
    }
  );

  test(
    "returns false for unrelated personal conversation",
    async () => {
      const result = await shouldReply(
        makeMessages([
          { username: "alice", content: "lol yeah same" },
          { username: "bob", content: "haha I know right" },
          { username: "alice", content: "anyway see you tonight" },
        ])
      );
      expect(typeof result).toBe("boolean");
      expect(result).toBe(false);
    }
  );

  test(
    "always returns a boolean even on unexpected input",
    async () => {
      const result = await shouldReply(makeMessages([]));
      expect(typeof result).toBe("boolean");
    }
  );
});

// ── chat log replay ───────────────────────────────────────────────────────────

type LogEntry = Record<string, any>;

function loadReplayCases(
  logPath: string,
  limit = 10
): Array<{
  chatId: string;
  prompt: string;
  history: OpenAI.Chat.ChatCompletionMessageParam[];
  userInfo: { id: string; mention: string; displayName: string };
  expectedTools: string[];
}> {
  if (!existsSync(logPath)) return [];

  const lines = readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
  const entries: LogEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }

  // Group by chatId into { request, response } pairs
  const byId = new Map<string, { request?: LogEntry; response?: LogEntry }>();
  for (const e of entries) {
    const id = e.chatId;
    if (!id || (e.message !== "request" && e.message !== "response")) continue;
    if (!byId.has(id)) byId.set(id, {});
    const pair = byId.get(id)!;
    if (e.message === "request") pair.request = e;
    else pair.response = e;
  }

  // Keep only pairs with tool calls, in log order (last N)
  const cases = [];
  for (const [chatId, { request, response }] of byId) {
    if (!request || !response) continue;
    if (!Array.isArray(response.toolCallRequests) || response.toolCallRequests.length === 0)
      continue;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = request.messages ?? [];
    const nonSystem = messages.filter((m) => m.role !== "system");
    const lastUser = nonSystem.at(-1);
    if (!lastUser || lastUser.role !== "user") continue;

    const prompt = typeof lastUser.content === "string" ? lastUser.content : "";
    const history = nonSystem.slice(0, -1);
    const userInfo = {
      id: request.user?.id ?? "unknown",
      mention: request.user?.mention ?? "<@0>",
      displayName: request.user?.displayName ?? "unknown",
    };
    const expectedTools: string[] = response.toolCallRequests
      .filter((tc: any) => tc?.function?.name)
      .map((tc: any) => tc.function.name as string);

    cases.push({ chatId, prompt, history, userInfo, expectedTools });
  }

  // Return the last `limit` cases
  return cases.slice(-limit);
}

const CONVO_LOG = new URL("./convo.log", import.meta.url).pathname;
const replayCases = loadReplayCases(CONVO_LOG, 10);

if (replayCases.length === 0) {
  console.warn(
    "[chat log replay] No entries with tool calls found in convo.log — skipping replay suite."
  );
}

describe("chat log replay", () => {
  for (const { chatId, prompt, history, userInfo, expectedTools } of replayCases) {
    test(
      `chatId ${chatId} calls expected tools`,
      async () => {
        let result!: { content: string; toolBlock?: string };
        await withCtx(async () => {
          result = await handleMessage(prompt, userInfo, history);
        });
        for (const toolName of expectedTools) {
          expect(result.toolBlock).toContain(toolName);
        }
      }
    );
  }
});
