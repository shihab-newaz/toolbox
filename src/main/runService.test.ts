import { describe, expect, it } from "vitest";
import type { Manifest, OutputEvent, RiskLevel } from "../shared/types";
import type { Shell } from "./runner";
import { createRunService } from "./runService";

// Node stands in for the shell, so each "command" below is a line of JavaScript.
const nodeShell: Shell = { file: process.execPath, args: ["-e"] };

const tool = (id: string, command: string, risk: RiskLevel = "read-only") => ({
  id,
  name: id,
  description: "",
  risk,
  steps: [{ kind: "command" as const, command }],
});

const manifestOf = (...tools: ReturnType<typeof tool>[]): Manifest => ({
  categories: [{ id: "c", name: "C", tools }],
});

const textOf = (events: OutputEvent[]) => events.map((e) => e.text).join("");

describe("run service", () => {
  it("fails, without running anything, for a Tool id the Manifest does not contain", async () => {
    const service = createRunService({ getManifest: () => manifestOf(tool("a", 'console.log("x")')), shell: nodeShell });
    const events: OutputEvent[] = [];

    const result = await service.run("nope", (e) => events.push(e));

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown tool "nope"/i);
    expect(events).toEqual([]);
  });

  it("runs a read-only Tool and forwards its output", async () => {
    const service = createRunService({ getManifest: () => manifestOf(tool("a", 'console.log("hello")')), shell: nodeShell });
    const events: OutputEvent[] = [];

    const result = await service.run("a", (e) => events.push(e));

    expect(result).toEqual({ ok: true, failedStep: null, exitCode: 0 });
    expect(textOf(events)).toContain("hello");
  });

  it.each(["normal", "high"] as const)(
    "refuses a %s-risk Tool without running it, because only read-only Tools may run until confirmation exists",
    async (risk) => {
      const service = createRunService({
        getManifest: () => manifestOf(tool("risky", 'console.log("ran anyway")', risk)),
        shell: nodeShell,
      });
      const events: OutputEvent[] = [];

      const result = await service.run("risky", (e) => events.push(e));

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/read-only/i);
      expect(events).toEqual([]);
    },
  );

  it("refuses a second start of a Tool that is still running, and lets it start again afterwards", async () => {
    const service = createRunService({
      getManifest: () => manifestOf(tool("slow", 'console.log("started"); setTimeout(() => {}, 600)')),
      shell: nodeShell,
    });
    const events: OutputEvent[] = [];
    const onOutput = (e: OutputEvent) => events.push(e);

    const first = service.run("slow", onOutput);
    const second = await service.run("slow", onOutput);
    const firstResult = await first;

    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already running/i);
    expect(firstResult.ok).toBe(true);
    expect(textOf(events).match(/started/g)).toHaveLength(1);

    const again = await service.run("slow", onOutput);
    expect(again.ok).toBe(true);
    expect(textOf(events).match(/started/g)).toHaveLength(2);
  }, 10000);

  it("lets different Tools run at the same time", async () => {
    const service = createRunService({
      getManifest: () =>
        manifestOf(
          tool("one", 'console.log("one"); setTimeout(() => {}, 400)'),
          tool("two", 'console.log("two")'),
        ),
      shell: nodeShell,
    });
    const events: OutputEvent[] = [];

    const [a, b] = await Promise.all([
      service.run("one", (e) => events.push(e)),
      service.run("two", (e) => events.push(e)),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  }, 10000);
});
