import { RISK_LEVELS, type Manifest } from "./types";

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
    if (typeof category !== "object" || category === null) {
      throw new Error("Manifest has a category that is not an object");
    }
    if (!Array.isArray(category.tools)) {
      throw new Error(`Category "${category.id}" must have a tools list`);
    }
    for (const tool of category.tools) {
      if (typeof tool !== "object" || tool === null) {
        throw new Error(`Category "${category.id}" has a tool that is not an object`);
      }
      if (seenIds.has(tool.id)) {
        throw new Error(`Tool id "${tool.id}" is used more than once`);
      }
      seenIds.add(tool.id);
      if (!RISK_LEVELS.includes(tool.risk)) {
        throw new Error(
          `Tool "${tool.id}" has an invalid risk level "${tool.risk}"`,
        );
      }
      if (!Array.isArray(tool.steps)) {
        throw new Error(`Tool "${tool.id}" must have a steps list`);
      }
      if (tool.steps.length === 0) {
        throw new Error(`Tool "${tool.id}" has no steps`);
      }
      for (const step of tool.steps) {
        if (typeof step !== "object" || step === null) {
          throw new Error(`Tool "${tool.id}" has a step that is not an object`);
        }
        if (step.kind !== "command" && step.kind !== "pause") {
          throw new Error(
            `Tool "${tool.id}" has an unknown step kind "${(step as { kind: string }).kind}"`,
          );
        }
        if (
          step.kind === "command" &&
          (typeof step.command !== "string" || step.command.trim() === "")
        ) {
          throw new Error(`Tool "${tool.id}" has a blank command step`);
        }
      }
    }
  }
  return manifest;
}
