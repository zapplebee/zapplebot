// src/tools/getTechStack.ts
import { text, tool } from "@lmstudio/sdk";
// Bun/TS can import JSON with an assertion:
import pkg from "../package.json" assert { type: "json" };

export const getTechStackTool = tool({
  name: "get_tech_stack",
  description: text`
    Return Zapplebot's local tech stack details for grounding answers about capabilities, versions, and dependencies.

    Call this when the user asks about: "what are you built with", "versions", "dependencies", "runtime", "models", or "tools".

    The tool returns:
    {
      "stack": {
        "app": { "name": string, "version": string, "description": string|null },
        "runtime": { "bun": string|null, "node": string, "platform": string, "arch": string },
        "model": string,
        "dependencies": Record<string,string>,
        "devDependencies": Record<string,string>,
        "tools": string[]
      },
      "summary": string // a concise English summary you can quote directly
    }

    Example user requests that should trigger this tool:
    - "What is zapplebot built with?"
    - "Which model and SDK are you using?"
    - "What versions are you on?"
  `,
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
      model: "qwen/qwen3-4b-2507",
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
      `uses the LM Studio SDK and discord.js, and is configured with model ${stack.model}. ` +
      `Available tools: ${stack.tools.join(", ")}.`;

    return { stack, summary };
  },
});
