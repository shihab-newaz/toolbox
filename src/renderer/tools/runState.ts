import type { OutputEvent, RunResult } from "@shared/types";

/** What the window knows about one Tool's latest Run. */
export interface RunState {
  output: OutputEvent[];
  /** Null while the Run is in progress. */
  result: RunResult | null;
  startedAt: number;
  endedAt: number | null;
  /** Whether the user has looked at the finished Run; the row keeps its mark until they do. */
  viewed: boolean;
}

export const isRunning = (state: RunState | undefined): boolean =>
  state !== undefined && state.result === null;
