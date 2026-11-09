export type RiskLevel = "read-only" | "normal" | "high";

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
