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

/** What the renderer may ask of the main process. */
export interface ToolboxBridge {
  getManifest(): Promise<Manifest>;
  runTool(toolId: string): Promise<RunResult>;
  /** Subscribe to live output of any running Tool; returns an unsubscribe function. */
  onOutput(listener: (toolId: string, event: OutputEvent) => void): () => void;
}
