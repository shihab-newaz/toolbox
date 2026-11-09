import { describe, expect, it } from "vitest";
import { manifest as shippedManifest } from "./manifest";
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
      tool({ id: "hibernation", risk: "high" }),
    );
    expect(validateManifest(manifest)).toEqual(manifest);
  });

  it("accepts the Manifest the app ships with, which includes a read-only Free-space check", () => {
    const valid = validateManifest(shippedManifest);
    const tools = valid.categories.flatMap((c) => c.tools);

    expect(tools.find((t) => t.id === "free-space-check")?.risk).toBe("read-only");
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
