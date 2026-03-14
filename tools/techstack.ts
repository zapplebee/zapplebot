// src/tools/getTechStack.ts
import { text, tool } from "../bot-tool";
// Bun/TS can import JSON with an assertion:
import pkg from "../package.json" assert { type: "json" };

export const getTechStackTool = tool({
  name: "get_tech_stack",
  description: text`Return Zapplebot's runtime, model, and dependency info. Use when asked what the bot is built with, what model it uses, or what version it's on.`,
  parameters: {}, // no inputs
  implementation: async () => {
    const stack = {
      app: {
        name: (pkg as any).name ?? "zapplebot",
        version: (pkg as any).version ?? "0.0.0",
        description: (pkg as any).description ?? null,
      },
      runtime: {
        bun: (globalThis as any).Bun?.version ?? null,
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
      },
      model: process.env.LLAMA_MODEL ?? "local-model",
      dependencies: (pkg as any).dependencies ?? {},
      devDependencies: (pkg as any).devDependencies ?? {},
      tools: [
        "getCurrentDate",
        "update_score_board",
        "get_score_board",
        "get_tech_stack",
      ],
    };

    const summary =
      `Zapplebot runs on Bun ${stack.runtime.bun ?? "unknown"} (Node ${
        stack.runtime.node
      }), ` +
      `uses the llama.cpp OpenAI-compatible API and discord.js, and is configured with model ${stack.model}. ` +
      `Available tools: ${stack.tools.join(", ")}.`;

    return { stack, summary };
  },
});
