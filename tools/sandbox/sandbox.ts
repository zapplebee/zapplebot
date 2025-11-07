// sandbox.ts
type SandboxResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
};

type SandboxOptions = {
  /** Kill the sandbox if it runs longer than this (ms). Default 15_000. */
  timeoutMs?: number;
  /** Docker image to use. Default "oven/bun:latest". */
  dockerImage?: string;
  /** Extra docker args to append (e.g., ["--cpus","1"]). */
  extraDockerArgs?: string[];
};

/**
 * Run TypeScript code in a no-privileges Bun container with zero host writes.
 * The code is sent via STDIN and executed with `bun run -`.
 */
export async function runTsInSandbox(
  script: string,
  opts: SandboxOptions = {}
): Promise<SandboxResult> {
  const {
    timeoutMs = 15_000,
    dockerImage = "oven/bun:latest",
    extraDockerArgs = [],
  } = opts;

  const args = [
    "docker",
    "run",
    "--rm",
    "-i", // read script from stdin
    "--network=none", // no network
    "--read-only", // read-only root FS
    "--cap-drop=ALL", // drop all Linux caps
    "--security-opt",
    "no-new-privileges", // block privilege escalation
    "--pids-limit",
    "128", // simple DoS guard
    "--memory",
    "256m",
    "--memory-swap",
    "256m",
    "--cpus",
    "0.5",
    "--ipc=none",
    // "--uts=private",
    "--user",
    "65532:65532", // nobody:nogroup
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,nodev,size=64m", // small ephemeral /tmp
    ...extraDockerArgs,
    dockerImage,
    "bun",
    "run",
    "-", // run code from stdin
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const proc = Bun.spawn({
    cmd: args,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    signal: controller.signal,
  });

  // Send the script and close stdin
  proc.stdin?.write(script);
  proc.stdin?.end();

  let timedOut = false;

  try {
    const [outText, errText] = await Promise.all([
      proc.stdout ? new Response(proc.stdout).text() : Promise.resolve(""),
      proc.stderr ? new Response(proc.stderr).text() : Promise.resolve(""),
      proc.exited, // waits for process to exit
    ]);
    clearTimeout(timer);
    return {
      stdout: outText,
      stderr: errText,
      exitCode: proc.exitCode ?? -1,
      timedOut,
    };
  } catch (e) {
    clearTimeout(timer);
    // If aborted due to timeout, try to ensure the process is gone
    if (controller.signal.aborted) {
      timedOut = true;
      try {
        proc.kill();
      } catch {}
      return {
        stdout: "",
        stderr:
          "Sandbox timed out and was aborted (consider increasing timeoutMs).",
        exitCode: -1,
        timedOut,
      };
    }
    // Other error (e.g., docker not found)
    return {
      stdout: "",
      stderr: e instanceof Error ? e.message : String(e),
      exitCode: -1,
      timedOut,
    };
  }
}
