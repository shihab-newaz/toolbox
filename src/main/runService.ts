import type { Manifest, OutputEvent, RunResult } from "../shared/types";
import { runTool, type Shell } from "./runner";

export interface RunService {
  run(
    toolId: string,
    onOutput: (event: OutputEvent) => void,
    options?: { confirmed?: boolean },
  ): Promise<RunResult>;
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
}): RunService {
  const running = new Set<string>();

  return {
    async run(toolId, onOutput, runOptions = {}) {
      const tool = options
        .getManifest()
        .categories.flatMap((category) => category.tools)
        .find((t) => t.id === toolId);
      if (!tool) return refused(`Unknown tool "${toolId}"`);
      // Only an explicit `true` counts: the value crosses from the window, which is not trusted.
      if (tool.risk !== "read-only" && runOptions.confirmed !== true) {
        return refused(`"${tool.name}" is ${tool.risk} and its Run was not confirmed`);
      }
      if (running.has(toolId)) return refused(`"${tool.name}" is already running`);

      running.add(toolId);
      try {
        return await runTool(tool, options.shell, onOutput);
      } finally {
        running.delete(toolId);
      }
    },
  };
}
