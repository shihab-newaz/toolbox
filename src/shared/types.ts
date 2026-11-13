export const RISK_LEVELS = ["read-only", "normal", "high"] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

export type Step =
  | { kind: "command"; command: string }
  | { kind: "pause"; message: string };

export interface Tool {
  id: string;
  name: string;
  description: string;
  risk: RiskLevel;
  steps: Step[];
}

export interface Category {
  id: string;
  name: string;
  tools: Tool[];
}

export interface Manifest {
  categories: Category[];
}

export interface OutputEvent {
  type: "output";
  stream: "stdout" | "stderr";
  text: string;
}

export interface RunResult {
  ok: boolean;
  failedStep: number | null;
  exitCode: number | null;
  error?: string;
}

/** One past Run, as kept in the Run log. */
export interface RunLogEntry {
  toolId: string;
  toolName: string;
  /** ISO 8601 date and time. */
  startedAt: string;
  /** ISO 8601 date and time. */
  endedAt: string;
  /** The command of every command Step, in order. */
  commands: string[];
  /** Standard output and error output together, in the order they arrived. */
  output: string;
  result: RunResult;
}

/** What the renderer may ask of the main process. */
export interface ToolboxBridge {
  getManifest(): Promise<Manifest>;
  /**
   * `confirmed` says the user approved this Run after seeing its commands. The main
   * process refuses a normal or high Tool without it.
   */
  runTool(toolId: string, confirmed: boolean): Promise<RunResult>;
  /** The Run log, newest Run first. */
  getRunLog(): Promise<RunLogEntry[]>;
  /** Subscribe to live output of any running Tool; returns an unsubscribe function. */
  onOutput(listener: (toolId: string, event: OutputEvent) => void): () => void;
}
