import { text, tool } from "@lmstudio/sdk";
import { z } from "zod";
import { runTsInSandbox } from "./sandbox";

export const typescriptSandboxTool = tool({
  name: "run_typescript_javascript",
  description: text`
Execute arbitrary TypeScript or JavaScript code inside a secure, isolated sandbox.

The code is executed in:
- a Docker container (oven/bun:latest)
- with NO network access
- running as a non-root user
- with a read-only filesystem
- with all Linux capabilities dropped
- and a small writable tmpfs for temporary files

This is useful for evaluating or testing code safely without granting host access.

Add comments that would be useful for the user to understand the code.

You always need to log the result so that you can read the stdout to get the result of your code.

If you use this tool, you **MUST** include the code you ran in the message you return to the user. Put it in a codefence like this:

\`\`\`typescript
// your code
\`\`\`
  `,
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
