/**
 * Integration tests for tool calls against the live llama.cpp server.
 * Run with: bun test integration.test.ts
 *
 * Requires LLAMA_BASE_URL (default: http://127.0.0.1:8888) to be reachable.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { tools, openaiTools } from "./tools";
import { handleMessage } from "./handle-message";
import { shouldReply } from "./judge";
import { withCtx } from "./global";

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

// ── tool schema conversion (no model needed) ──────────────────────────────────

describe("openaiTools schema", () => {
  test("produces valid OpenAI tool schema for each tool", () => {
    expect(openaiTools.length).toBe(tools.length);

    for (const t of openaiTools) {
      expect(t.type).toBe("function");
      if (t.type !== "function") continue;
      expect(typeof t.function.name).toBe("string");
      expect(t.function.name.length).toBeGreaterThan(0);
      expect(typeof t.function.description).toBe("string");
      expect(t.function.parameters).toHaveProperty("type", "object");
      expect(t.function.parameters).toHaveProperty("properties");
    }
  });

  test("dice tool schema has correct parameter types", () => {
    const dice = openaiTools.find((t) => t.type === "function" && t.function.name === "roll_dice");

    expect(dice).toBeDefined();
    if (dice?.type !== "function") throw new Error("not a function tool");
    const props = (dice.function.parameters as any).properties;
    // zod-to-json-schema emits "integer" for z.number().int()
    expect(props.count.type).toBe("integer");
    expect(props.sides.type).toBe("integer");
  });

  test("tools with no parameters have empty properties", () => {
    const noParamTools = openaiTools.filter(
      (t) => t.type === "function" && Object.keys((t.function.parameters as any).properties).length === 0
    );
    // get_score_board, score_board_score_names, get_current_date, get_time_zone, get_location, get_tech_stack
    expect(noParamTools.length).toBeGreaterThan(0);
  });
});

// ── direct tool execution (no model) ─────────────────────────────────────────

describe("tool implementations", () => {
  test("roll_dice returns sum and rolls array", async () => {
    const dice = tools.find((t) => t.name === "roll_dice")!;
    const result = (await dice.implementation({ count: 2, sides: 6 })) as any;

    expect(result.rolls).toHaveLength(2);
    expect(result.sum).toBe(result.rolls[0] + result.rolls[1]);
    for (const r of result.rolls) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(6);
    }
  });

  test("get_current_date returns ISO date string", async () => {
    const dateTool = tools.find((t) => t.name === "get_current_date")!;
    const result = (await dateTool.implementation({})) as any;

    expect(typeof result.date).toBe("string");
    expect(() => new Date(result.date)).not.toThrow();
  });

  test("get_time_zone returns timezone string", async () => {
    const tzTool = tools.find((t) => t.name === "get_time_zone")!;
    const result = (await tzTool.implementation({})) as any;

    expect(typeof result.tz).toBe("string");
  });
});

// ── model + tool loop integration ─────────────────────────────────────────────

describe("handleMessage tool loop", () => {
  test(
    "model calls roll_dice when asked to roll dice",
    async () => {
      let response!: { content: string; toolBlock?: string };

      await withCtx(async () => {
        response = await handleMessage("roll 2d6 for me", "@testuser", []);
      });

      expect(typeof response.content).toBe("string");
      expect(response.content.length).toBeGreaterThan(0);
      // The model should have used the tool
      expect(response.toolBlock).toBeDefined();
      expect(response.toolBlock).toContain("roll_dice");
    },
    300_000
  );

  test(
    "model returns a reply without tools for a simple greeting",
    async () => {
      let response!: { content: string; toolBlock?: string };

      await withCtx(async () => {
        response = await handleMessage("hello!", "@testuser", []);
      });

      expect(typeof response.content).toBe("string");
      expect(response.content.length).toBeGreaterThan(0);
    },
    300_000
  );

  test(
    "model calls get_score_board when asked for scores",
    async () => {
      let response!: { content: string; toolBlock?: string };

      await withCtx(async () => {
        response = await handleMessage(
          "show me the scoreboard",
          "@testuser",
          []
        );
      });

      expect(typeof response.content).toBe("string");
      expect(response.toolBlock).toBeDefined();
      expect(response.toolBlock).toContain("score_board");
    },
    300_000
  );

  test(
    "model respects chat history",
    async () => {
      let response!: { content: string; toolBlock?: string };

      await withCtx(async () => {
        response = await handleMessage("what did I just say?", "@testuser", [
          { role: "user", content: "my favorite color is vermillion" },
          {
            role: "assistant",
            content: "That's a great color!",
          },
        ]);
      });

      expect(response.content.toLowerCase()).toContain("vermillion");
    },
    300_000
  );
});

// ── judge ─────────────────────────────────────────────────────────────────────

describe("shouldReply", () => {
  function makeMessages(entries: Array<{ username: string; content: string }>) {
    // Collection-like object — shouldReply only calls .values()
    const map = new Map(
      entries.map((e, i) => [
        String(i),
        {
          author: { username: e.username },
          content: e.content,
        },
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
    },
    90_000
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
    },
    90_000
  );

  test(
    "always returns a boolean even on unexpected input",
    async () => {
      const result = await shouldReply(makeMessages([]));
      expect(typeof result).toBe("boolean");
    },
    90_000
  );
});
