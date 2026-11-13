import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { manifest as shippedManifest } from "../shared/manifest";
import type { Manifest, OutputEvent, RiskLevel } from "../shared/types";
import { POWERSHELL, type Shell } from "./runner";
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
    "refuses a %s Tool whose Run was not confirmed, without running it",
    async (risk) => {
      const service = createRunService({
        getManifest: () => manifestOf(tool("risky", 'console.log("ran anyway")', risk)),
        shell: nodeShell,
      });
      const events: OutputEvent[] = [];

      const result = await service.run("risky", (e) => events.push(e));

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not confirmed/i);
      expect(events).toEqual([]);
    },
  );

  it.each(["normal", "high"] as const)("runs a %s Tool whose Run was confirmed", async (risk) => {
    const service = createRunService({
      getManifest: () => manifestOf(tool("risky", 'console.log("ran")', risk)),
      shell: nodeShell,
    });
    const events: OutputEvent[] = [];

    const result = await service.run("risky", (e) => events.push(e), { confirmed: true });

    expect(result).toEqual({ ok: true, failedStep: null, exitCode: 0 });
    expect(textOf(events)).toContain("ran");
  });

  it("refuses a normal Tool when the confirmation is anything but an explicit yes", async () => {
    const service = createRunService({
      getManifest: () => manifestOf(tool("risky", 'console.log("ran anyway")', "normal")),
      shell: nodeShell,
    });
    const events: OutputEvent[] = [];

    // What a stray call from the window could send instead of `true`.
    const result = await service.run("risky", (e) => events.push(e), {
      confirmed: "yes" as unknown as boolean,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not confirmed/i);
    expect(events).toEqual([]);
  });

  it("empties the temp folder with the shipped Temp files cleanup, but only once its Run is confirmed", async () => {
    // A stand-in temp folder: the real one must not be touched by a test.
    const fakeTemp = mkdtempSync(path.join(tmpdir(), "toolbox-fake-temp-"));
    const realTemp = process.env.TEMP;
    process.env.TEMP = fakeTemp;
    try {
      writeFileSync(path.join(fakeTemp, "old.tmp"), "x");
      mkdirSync(path.join(fakeTemp, "old-folder"));
      writeFileSync(path.join(fakeTemp, "old-folder", "nested.tmp"), "x");
      const probe = tool("probe", "Write-Output $env:TEMP");
      const service = createRunService({
        getManifest: () => ({
          categories: [...shippedManifest.categories, { id: "test", name: "Test", tools: [probe] }],
        }),
        shell: POWERSHELL,
      });
      const cleanupId = shippedManifest.categories
        .flatMap((c) => c.tools)
        .find((t) => t.name === "Temp files cleanup")?.id;
      // Guard: the shell really does see the stand-in folder before anything is deleted.
      const seen: OutputEvent[] = [];
      await service.run("probe", (e) => seen.push(e));
      expect(textOf(seen).trim()).toBe(fakeTemp);

      const unconfirmed = await service.run(cleanupId!, () => {});
      expect(unconfirmed.ok).toBe(false);
      expect(readdirSync(fakeTemp).sort()).toEqual(["old-folder", "old.tmp"]);

      const events: OutputEvent[] = [];
      const confirmed = await service.run(cleanupId!, (e) => events.push(e), { confirmed: true });
      expect(confirmed).toEqual({ ok: true, failedStep: null, exitCode: 0 });
      expect(readdirSync(fakeTemp)).toEqual([]);
      expect(textOf(events)).toMatch(/removed 2 of 2/i);
    } finally {
      process.env.TEMP = realTemp;
      if (existsSync(fakeTemp)) rmSync(fakeTemp, { recursive: true, force: true });
    }
  }, 30000);

  it("leaves files outside the temp folder alone when the temp folder holds a link to them", async () => {
    const fakeTemp = mkdtempSync(path.join(tmpdir(), "toolbox-fake-temp-"));
    const outside = mkdtempSync(path.join(tmpdir(), "toolbox-outside-"));
    const realTemp = process.env.TEMP;
    process.env.TEMP = fakeTemp;
    try {
      writeFileSync(path.join(outside, "keep.txt"), "keep me");
      symlinkSync(outside, path.join(fakeTemp, "link-to-outside"), "junction");
      const probe = tool("probe", "Write-Output $env:TEMP");
      const service = createRunService({
        getManifest: () => ({
          categories: [...shippedManifest.categories, { id: "test", name: "Test", tools: [probe] }],
        }),
        shell: POWERSHELL,
      });
      const seen: OutputEvent[] = [];
      await service.run("probe", (e) => seen.push(e));
      expect(textOf(seen).trim()).toBe(fakeTemp);

      const result = await service.run("temp-files-cleanup", () => {}, { confirmed: true });

      expect(result.ok).toBe(true);
      expect(readdirSync(fakeTemp)).toEqual([]);
      expect(readdirSync(outside)).toEqual(["keep.txt"]);
    } finally {
      process.env.TEMP = realTemp;
      rmSync(fakeTemp, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  }, 30000);

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
          tool("one", 'console.log("one"); setTimeout(() => {}, 1500)'),
          tool("two", 'console.log("two")'),
        ),
      shell: nodeShell,
    });
    const stamped: Array<{ text: string; at: number }> = [];
    const onOutput = (e: OutputEvent) => stamped.push({ text: e.text, at: Date.now() });

    const startedAt = Date.now();
    const one = service.run("one", onOutput).then((result) => ({ result, doneAt: Date.now() }));
    const two = await service.run("two", onOutput);
    const { result, doneAt } = await one;

    expect(result.ok).toBe(true);
    expect(two.ok).toBe(true);
    // "two" printed long before the 1.5 s "one" finished, so it did not wait its turn.
    const twoPrintedAt = stamped.find((e) => e.text.includes("two"))!.at;
    expect(twoPrintedAt - startedAt).toBeLessThan(doneAt - startedAt - 500);
  }, 10000);
});
