import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import type { OutputEvent, RunResult, Tool } from "../shared/types";

export interface Shell {
  file: string;
  args: string[];
  /** Adjusts a command before it is handed to the shell. */
  wrapCommand?: (command: string) => string;
}

export const POWERSHELL: Shell = {
  file: "powershell.exe",
  args: ["-NoProfile", "-NonInteractive", "-Command"],
  // UTF-8 output; any error stops the command with a failing exit code (PowerShell
  // otherwise exits 0 when only an earlier statement failed); a native command's
  // own exit code is passed through.
  wrapCommand: (command) =>
    `[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ErrorActionPreference='Stop'; ${command}; exit $LASTEXITCODE`,
};

const running = new Set<ChildProcess>();

export function runningCommandCount(): number {
  return running.size;
}

/** Stops every running command and the processes it started (used when the app quits). */
export function killAllRunning(): void {
  for (const child of running) {
    if (child.pid === undefined) continue;
    if (process.platform === "win32") {
      // /T takes the whole process tree: PowerShell does not stop what it launched.
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    } else {
      child.kill("SIGKILL");
    }
  }
}

function runCommand(
  command: string,
  shell: Shell,
  onEvent: (event: OutputEvent) => void,
): Promise<{ exitCode: number | null; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(shell.file, [...shell.args, shell.wrapCommand?.(command) ?? command], {
      windowsHide: true,
      // stdin ignored: a command that waits for input gets end-of-input, not a hang.
      stdio: ["ignore", "pipe", "pipe"],
    });
    running.add(child);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (text: string) =>
      onEvent({ type: "output", stream: "stdout", text }),
    );
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text: string) =>
      onEvent({ type: "output", stream: "stderr", text }),
    );
    child.on("error", (err) => {
      running.delete(child);
      resolve({ exitCode: null, error: `Could not start ${shell.file}: ${err.message}` });
    });
    child.on("close", (code) => {
      running.delete(child);
      resolve({ exitCode: code });
    });
  });
}

export async function runTool(
  tool: Tool,
  shell: Shell,
  onEvent: (event: OutputEvent) => void,
): Promise<RunResult> {
  for (const [index, step] of tool.steps.entries()) {
    if (step.kind === "pause") {
      return {
        ok: false,
        failedStep: index,
        exitCode: null,
        error: "Pause steps are not supported yet",
      };
    }
    if (step.kind !== "command") {
      return {
        ok: false,
        failedStep: index,
        exitCode: null,
        error: `Unknown step kind "${(step as { kind: string }).kind}"`,
      };
    }
    const { exitCode, error } = await runCommand(step.command, shell, onEvent);
    if (exitCode !== 0) {
      return { ok: false, failedStep: index, exitCode, ...(error && { error }) };
    }
  }
  return { ok: true, failedStep: null, exitCode: 0 };
}
