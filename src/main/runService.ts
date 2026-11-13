import type { Manifest, OutputEvent, RunLogEntry, RunResult } from "../shared/types";
import { createRunLog } from "./runLog";
import { runTool, type Shell } from "./runner";

export interface RunService {
  run(toolId: string, onOutput: (event: OutputEvent) => void): Promise<RunResult>;
  /** Every Run that started and ended, newest first. */
  getRunLog(): RunLogEntry[];
}

const refused = (error: string): RunResult => ({
  ok: false,
  failedStep: null,
  exitCode: null,
  error,
});

/**
 * Decides whether a requested Run may start, then runs it. This is the elevated
 * process's own check; the UI disabling a button is not enough, because a reload
 * or a stray call can reach it without the button.
 */
export function createRunService(options: {
  getManifest: () => Manifest;
  shell: Shell;
  /** Where the Run log is saved. Without it the log is not kept across restarts. */
  logFolder?: string;
}): RunService {
  const running = new Set<string>();
  const runLog = createRunLog(options.logFolder);

  return {
    async run(toolId, onOutput) {
      const tool = options
        .getManifest()
        .categories.flatMap((category) => category.tools)
        .find((t) => t.id === toolId);
      if (!tool) return refused(`Unknown tool "${toolId}"`);
      // Until confirmation exists (a later ticket), only Tools that change nothing may run.
      if (tool.risk !== "read-only") {
        return refused(
          `"${tool.name}" is ${tool.risk}; only read-only Tools can run until confirmation exists`,
        );
      }
      if (running.has(toolId)) return refused(`"${tool.name}" is already running`);

      running.add(toolId);
      const startedAt = new Date().toISOString();
      let output = "";
      try {
        const result = await runTool(tool, options.shell, (event) => {
          output += event.text;
          onOutput(event);
        });
        runLog.add({
          toolId: tool.id,
          toolName: tool.name,
          startedAt,
          endedAt: new Date().toISOString(),
          commands: tool.steps.flatMap((step) => (step.kind === "command" ? [step.command] : [])),
          output,
          result,
        });
        return result;
      } finally {
        running.delete(toolId);
      }
    },
    getRunLog: () => runLog.entries(),
  };
}
