import { spawn } from "node:child_process";
import type { OutputEvent, RunResult, Tool } from "../shared/types";

export interface Shell {
  file: string;
  args: string[];
}

export type RunEvent = OutputEvent;

export const POWERSHELL: Shell = {
  file: "powershell.exe",
  args: ["-NoProfile", "-NonInteractive", "-Command"],
};

function runCommand(
  command: string,
  shell: Shell,
  onEvent: (event: RunEvent) => void,
): Promise<{ exitCode: number | null; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(shell.file, [...shell.args, command], {
      windowsHide: true,
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (text: string) =>
      onEvent({ type: "output", stream: "stdout", text }),
    );
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text: string) =>
      onEvent({ type: "output", stream: "stderr", text }),
    );
    child.on("error", (err) =>
      resolve({ exitCode: null, error: `Could not start ${shell.file}: ${err.message}` }),
    );
    child.on("close", (code) => resolve({ exitCode: code }));
  });
}

export async function runTool(
  tool: Tool,
  shell: Shell,
  onEvent: (event: RunEvent) => void,
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
    if (step.kind === "command") {
      const { exitCode, error } = await runCommand(step.command, shell, onEvent);
      if (exitCode !== 0) {
        return { ok: false, failedStep: index, exitCode, ...(error && { error }) };
      }
    }
  }
  return { ok: true, failedStep: null, exitCode: 0 };
}
