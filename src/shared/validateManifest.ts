import type { Manifest } from "./types";

const RISK_LEVELS = ["read-only", "normal", "high"];

export function validateManifest(input: unknown): Manifest {
  if (
    typeof input !== "object" ||
    input === null ||
    !Array.isArray((input as { categories?: unknown }).categories)
  ) {
    throw new Error("Manifest must contain a categories list");
  }
  const manifest = input as Manifest;
  const seenIds = new Set<string>();
  for (const category of manifest.categories) {
    for (const tool of category.tools) {
      if (seenIds.has(tool.id)) {
        throw new Error(`Tool id "${tool.id}" is used more than once`);
      }
      seenIds.add(tool.id);
      if (!RISK_LEVELS.includes(tool.risk)) {
        throw new Error(
          `Tool "${tool.id}" has an invalid risk level "${tool.risk}"`,
        );
      }
      if (tool.steps.length === 0) {
        throw new Error(`Tool "${tool.id}" has no steps`);
      }
      for (const step of tool.steps) {
        if (step.kind === "command" && step.command.trim() === "") {
          throw new Error(`Tool "${tool.id}" has a blank command step`);
        }
      }
    }
  }
  return manifest;
}
