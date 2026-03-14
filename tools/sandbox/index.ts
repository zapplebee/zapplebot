import { text, tool } from "../../bot-tool";
import { z } from "zod";
import { runTsInSandbox } from "./sandbox";

export const typescriptSandboxTool = tool({
  name: "run_typescript_javascript",
  description: text`Execute TypeScript/JavaScript in a sandboxed Docker container (no network, read-only fs). Always log results to stdout. When you use this tool, include the code in your reply in a typescript codefence.`,
  parameters: {
    code: z.string().describe("The TypeScript/JavaScript code to execute."),
  },
  async implementation({ code }) {
    const result = await runTsInSandbox(code, { timeoutMs: 5000 });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
    };
  },
});
