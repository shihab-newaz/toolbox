import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Manifest, RunLogEntry } from "../shared/types";
import { RUN_LOG_FILE } from "./runLog";
import type { Shell } from "./runner";
import { createRunService } from "./runService";

// Node stands in for the shell, so each "command" below is a line of JavaScript.
const nodeShell: Shell = { file: process.execPath, args: ["-e"] };

const tool = (id: string, command: string, risk: "read-only" | "normal" = "read-only") => ({
  id,
  name: `Tool ${id}`,
  description: "",
  risk,
  steps: [{ kind: "command" as const, command }],
});

const manifestOf = (...tools: ReturnType<typeof tool>[]): Manifest => ({
  categories: [{ id: "c", name: "C", tools }],
});

const manifest = manifestOf(
  tool("hello", 'console.log("hello out")'),
  tool("other", 'console.log("other out")'),
  tool("broken", 'console.error("it broke"); process.exit(3)'),
  tool("risky", 'console.log("ran anyway")', "normal"),
);

// Every test saves its Run log in its own temporary folder, never the real per-user data folder.
const folders: string[] = [];
function tempFolder(): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "toolbox-run-log-"));
  folders.push(folder);
  return folder;
}
afterEach(() => {
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

const serviceIn = (logFolder: string) =>
  createRunService({ getManifest: () => manifest, shell: nodeShell, logFolder });

const ignoreOutput = () => {};

describe("Run log", () => {
  it("starts empty", () => {
    expect(serviceIn(tempFolder()).getRunLog()).toEqual([]);
  });

  it("records a Run with its Tool, start and end time, commands, output and result", async () => {
    const service = serviceIn(tempFolder());
    const before = Date.now();

    const result = await service.run("hello", ignoreOutput);

    const log = service.getRunLog();
    expect(log).toHaveLength(1);
    const entry = log[0]!;
    expect(entry.toolId).toBe("hello");
    expect(entry.toolName).toBe("Tool hello");
    expect(entry.commands).toEqual(['console.log("hello out")']);
    expect(entry.output).toContain("hello out");
    expect(entry.result).toEqual(result);
    expect(entry.result.ok).toBe(true);
    const started = Date.parse(entry.startedAt);
    const ended = Date.parse(entry.endedAt);
    expect(started).toBeGreaterThanOrEqual(before);
    expect(ended).toBeGreaterThanOrEqual(started);
    expect(ended).toBeLessThanOrEqual(Date.now());
  });

  it("records a failed Run as failed, with its error output", async () => {
    const service = serviceIn(tempFolder());

    await service.run("broken", ignoreOutput);

    const entry = service.getRunLog()[0]!;
    expect(entry.result).toMatchObject({ ok: false, failedStep: 0, exitCode: 3 });
    expect(entry.output).toContain("it broke");
  });

  it("still forwards live output to the caller while recording it", async () => {
    const service = serviceIn(tempFolder());
    let seen = "";

    await service.run("hello", (event) => (seen += event.text));

    expect(seen).toContain("hello out");
  });

  it("lists Runs newest first", async () => {
    const service = serviceIn(tempFolder());

    await service.run("hello", ignoreOutput);
    await service.run("other", ignoreOutput);

    expect(service.getRunLog().map((entry) => entry.toolId)).toEqual(["other", "hello"]);
  });

  it("does not record a request that was refused, because no Run started", async () => {
    const service = serviceIn(tempFolder());

    await service.run("nope", ignoreOutput);
    await service.run("risky", ignoreOutput);

    expect(service.getRunLog()).toEqual([]);
  });

  it("is still there after a restart", async () => {
    const folder = tempFolder();
    const first = serviceIn(folder);
    await first.run("hello", ignoreOutput);
    await first.run("broken", ignoreOutput);

    const afterRestart = serviceIn(folder);

    expect(afterRestart.getRunLog()).toEqual(first.getRunLog());
    expect(afterRestart.getRunLog().map((entry) => entry.toolId)).toEqual(["broken", "hello"]);
  });

  it("keeps the most recent 200 Runs and drops older ones", async () => {
    const folder = tempFolder();
    const seeder = serviceIn(folder);
    await seeder.run("hello", ignoreOutput);
    const sample = seeder.getRunLog()[0]!;
    // 200 saved Runs, oldest first, each told apart by its output.
    const saved: RunLogEntry[] = Array.from({ length: 200 }, (_, i) => ({
      ...sample,
      output: `saved run ${i + 1}`,
    }));
    fs.writeFileSync(path.join(folder, RUN_LOG_FILE), JSON.stringify(saved));

    const service = serviceIn(folder);
    expect(service.getRunLog()).toHaveLength(200);
    await service.run("other", ignoreOutput);

    for (const log of [service.getRunLog(), serviceIn(folder).getRunLog()]) {
      expect(log).toHaveLength(200);
      expect(log[0]!.toolId).toBe("other");
      expect(log[1]!.output).toBe("saved run 200");
      expect(log[199]!.output).toBe("saved run 2");
    }
  });

  it("starts an empty log, and saves it, when the folder does not exist yet", async () => {
    const folder = path.join(tempFolder(), "not", "created", "yet");

    const service = serviceIn(folder);
    expect(service.getRunLog()).toEqual([]);
    await service.run("hello", ignoreOutput);

    expect(serviceIn(folder).getRunLog()).toHaveLength(1);
  });

  it.each([
    ["is not JSON", "{{ this is not json"],
    ["is cut off half way", '[{"toolId":"hello","toolName":"Tool hello"'],
    ["holds something other than a list of Runs", '{"hello":"world"}'],
    ["is empty", ""],
  ])("starts an empty log when the saved file %s, and saves over it", async (_, content) => {
    const folder = tempFolder();
    fs.writeFileSync(path.join(folder, RUN_LOG_FILE), content);

    const service = serviceIn(folder);
    expect(service.getRunLog()).toEqual([]);
    const result = await service.run("hello", ignoreOutput);

    expect(result.ok).toBe(true);
    expect(serviceIn(folder).getRunLog().map((entry) => entry.toolId)).toEqual(["hello"]);
  });

  it("skips saved entries that are not Runs and keeps the rest", async () => {
    const folder = tempFolder();
    const seeder = serviceIn(folder);
    await seeder.run("hello", ignoreOutput);
    const good = seeder.getRunLog()[0]!;
    fs.writeFileSync(
      path.join(folder, RUN_LOG_FILE),
      JSON.stringify([null, 7, { toolId: "half an entry" }, good, { ...good, result: "fine" }]),
    );

    expect(serviceIn(folder).getRunLog()).toEqual([good]);
  });

  it("starts an empty log and still runs Tools when the saved file cannot be read or written", async () => {
    const folder = tempFolder();
    // A folder where the file should be: reading and writing both fail.
    fs.mkdirSync(path.join(folder, RUN_LOG_FILE));

    const service = serviceIn(folder);
    expect(service.getRunLog()).toEqual([]);
    const result = await service.run("hello", ignoreOutput);

    expect(result.ok).toBe(true);
    // The Run is still listed until the app closes, even though it could not be saved.
    expect(service.getRunLog().map((entry) => entry.toolId)).toEqual(["hello"]);
  });
});
