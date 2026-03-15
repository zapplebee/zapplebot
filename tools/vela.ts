import { $ } from "bun";
import { tool, text } from "../bot-tool";
import { z } from "zod";

const ALLOWED_TOP_LEVEL_COMMANDS = new Set([
  "help",
  "version",
  "get",
  "view",
  "validate",
  "compile",
  "expand",
]);

const MAX_OUTPUT_CHARS = 12000;

function truncateOutput(value: string): string {
  if (value.length <= MAX_OUTPUT_CHARS) return value;
  return `${value.slice(0, MAX_OUTPUT_CHARS)}\n...[truncated ${value.length - MAX_OUTPUT_CHARS} chars]`;
}

export const velaTool = tool({
  name: "run_vela_cli",
  description: text`
    Get live Vela CI/CD information from the local Vela CLI.
    Use this whenever the user asks about Vela state, especially current or recent information like:
    what is building in Vela, what builds are running, what failed, list builds, inspect a build,
    list repos, list pipelines, inspect deployments, inspect services, inspect logs, validate a pipeline,
    compile a pipeline, or expand a resource.
    Prefer this tool over answering from general knowledge for any Vela-specific question.
    Allowed top-level commands: help, version, get, view, validate, compile, expand.
    Do not use this tool for mutating Vela state like add, update, remove, approve, cancel, restart, sync, repair, or login.
  `,
  parameters: {
    args: z
      .array(z.string().min(1))
      .min(1)
      .describe("Vela CLI arguments after `vela`, for example `[\"get\", \"builds\"]`, `[\"view\", \"build\", \"123\"]`, `[\"get\", \"deployments\"]`, `[\"validate\", \"pipeline\", \".vela.yml\"]`, or `[\"compile\", \"pipeline\", \".vela.yml\"]`."),
  },
  implementation: async ({ args }: { args: string[] }) => {
    const [topLevel] = args;
    if (!topLevel || !ALLOWED_TOP_LEVEL_COMMANDS.has(topLevel)) {
      return {
        error: `Top-level Vela command '${topLevel ?? ""}' is not allowed.`,
        allowed_commands: [...ALLOWED_TOP_LEVEL_COMMANDS],
      };
    }

    try {
      const output = await $`vela ${args}`.cwd(process.cwd()).quiet().nothrow();

      return {
        command: ["vela", ...args].join(" "),
        exitCode: output.exitCode,
        stdout: truncateOutput(output.stdout.toString("utf8")),
        stderr: truncateOutput(output.stderr.toString("utf8")),
        success: output.exitCode === 0,
      };
    } catch (err) {
      return {
        command: ["vela", ...args].join(" "),
        error: err instanceof Error ? err.message : String(err),
        success: false,
      };
    }
  },
});
