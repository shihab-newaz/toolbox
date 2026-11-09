import { describe, expect, it } from "vitest";
import { validateManifest } from "./validateManifest";

const tool = (overrides: Record<string, unknown> = {}) => ({
  id: "free-space",
  name: "Free-space check",
  description: "Shows used and free space on C:",
  risk: "read-only",
  steps: [{ kind: "command", command: "Get-PSDrive C" }],
  ...overrides,
});

const manifestWith = (...tools: unknown[]) => ({
  categories: [{ id: "disk", name: "Disk", tools }],
});

describe("validateManifest", () => {
  it("rejects a Tool whose Risk level is not read-only, normal or high", () => {
    expect(() => validateManifest(manifestWith(tool({ risk: "scary" })))).toThrow(
      /risk/i,
    );
  });

  it("rejects a Tool that has no Steps", () => {
    expect(() => validateManifest(manifestWith(tool({ steps: [] })))).toThrow(
      /step/i,
    );
  });

  it("rejects two Tools that share an id, even across Categories", () => {
    const manifest = {
      categories: [
        { id: "a", name: "A", tools: [tool({ id: "dup" })] },
        { id: "b", name: "B", tools: [tool({ id: "dup" })] },
      ],
    };
    expect(() => validateManifest(manifest)).toThrow(/dup/);
  });

  it("rejects a command Step whose command is blank", () => {
    const blank = tool({ steps: [{ kind: "command", command: "   " }] });
    expect(() => validateManifest(manifestWith(blank))).toThrow(/command/i);
  });

  it("accepts a valid Manifest and returns it unchanged", () => {
    const manifest = manifestWith(
      tool(),
      tool({
        id: "docker-shrink",
        risk: "normal",
        steps: [
          { kind: "command", command: "docker system prune" },
          { kind: "pause", message: "Quit Docker Desktop, then continue" },
        ],
      }),
    );
    expect(validateManifest(manifest)).toEqual(manifest);
  });

  it("rejects input that is not an object with a categories list", () => {
    expect(() => validateManifest({ tools: [] })).toThrow(
      /manifest must contain a categories list/i,
    );
    expect(() => validateManifest(null)).toThrow(
      /manifest must contain a categories list/i,
    );
  });
});
