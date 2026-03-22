/**
 * Unit tests — no LLM or network required.
 * Run with: bun test unit.test.ts
 */

import { describe, test, expect } from "bun:test";
import { tools, openaiTools } from "./tools";
import { text } from "./bot-tool";
import { z } from "zod";

// ── openaiTools schema ─────────────────────────────────────────────────────────

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
    const dice = openaiTools.find(
      (t) => t.type === "function" && t.function.name === "roll_dice"
    );

    expect(dice).toBeDefined();
    if (dice?.type !== "function") throw new Error("not a function tool");
    const props = (dice.function.parameters as any).properties;
    // zod-to-json-schema emits "integer" for z.number().int()
    expect(props.count.type).toBe("integer");
    expect(props.sides.type).toBe("integer");
  });

  test("tools with no parameters have empty properties", () => {
    const noParamTools = openaiTools.filter(
      (t) =>
        t.type === "function" &&
        Object.keys((t.function.parameters as any).properties).length === 0
    );
    // get_score_board, score_board_score_names, get_current_date, get_time_zone, etc.
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

// ── follow_wikipedia_link URL parsing ─────────────────────────────────────────

describe("follow_wikipedia_link URL parsing", () => {
  // Mirrors the regex in tools/wiki.ts
  const regex = /en(?:\.m)?\.wikipedia\.org\/wiki\/([^#?]+)/;

  test("extracts title from standard English Wikipedia URL", () => {
    const url = "https://en.wikipedia.org/wiki/RTX_50_series";
    const match = url.match(regex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("RTX_50_series");
  });

  test("extracts title from mobile English Wikipedia URL", () => {
    const url = "https://en.m.wikipedia.org/wiki/Thomas_Edison";
    const match = url.match(regex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("Thomas_Edison");
  });

  test("rejects non-English Wikipedia URL", () => {
    const url = "https://fr.wikipedia.org/wiki/Thomas_Edison";
    const match = url.match(regex);
    expect(match).toBeNull();
  });

  test("rejects non-Wikipedia URL", () => {
    const url = "https://example.com/wiki/Something";
    const match = url.match(regex);
    expect(match).toBeNull();
  });

  test("stops title at # fragment", () => {
    const url = "https://en.wikipedia.org/wiki/RTX_50_series#Launch";
    const match = url.match(regex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("RTX_50_series");
  });

  test("stops title at ? query string", () => {
    const url = "https://en.wikipedia.org/wiki/RTX_50_series?action=edit";
    const match = url.match(regex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("RTX_50_series");
  });
});

// ── text template helper ──────────────────────────────────────────────────────

describe("text template helper", () => {
  test("returns plain string unchanged", () => {
    expect(text`hello world`).toBe("hello world");
  });

  test("interpolates values", () => {
    const name = "Alice";
    expect(text`hello ${name}`).toBe("hello Alice");
  });

  test("handles multiple interpolations", () => {
    const a = "foo";
    const b = "bar";
    expect(text`${a} and ${b}`).toBe("foo and bar");
  });

  test("replaces undefined values with empty string", () => {
    const val = undefined;
    expect(text`prefix${val}suffix`).toBe("prefixsuffix");
  });
});

// ── scoreboard parameter validation ──────────────────────────────────────────

describe("scoreboard tool parameter validation", () => {
  const usernameSchema = z
    .string()
    .regex(/^<@[0-9]+>$/, "username MUST be in the format <@1234567890>");

  test("accepts valid <@id> mention", () => {
    expect(usernameSchema.safeParse("<@535097720785076245>").success).toBe(true);
  });

  test("rejects plain @user string", () => {
    expect(usernameSchema.safeParse("@user123").success).toBe(false);
  });

  test("rejects non-numeric id", () => {
    expect(usernameSchema.safeParse("<@username>").success).toBe(false);
  });

  test("rejects empty id", () => {
    expect(usernameSchema.safeParse("<@>").success).toBe(false);
  });

  test("rejects bare number", () => {
    expect(usernameSchema.safeParse("535097720785076245").success).toBe(false);
  });
});
