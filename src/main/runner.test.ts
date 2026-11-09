import { describe, expect, it } from "vitest";
import type { Tool } from "../shared/types";
import { POWERSHELL, runTool, type RunEvent, type Shell } from "./runner";

// Node stands in for the shell, so each "command" below is a line of JavaScript.
const nodeShell: Shell = { file: process.execPath, args: ["-e"] };

const toolOf = (...commands: string[]): Tool => ({
  id: "t",
  name: "T",
  description: "",
  risk: "read-only",
  steps: commands.map((command) => ({ kind: "command" as const, command })),
});

async function run(tool: Tool) {
  const events: Array<RunEvent & { at: number }> = [];
  const result = await runTool(tool, nodeShell, (e) =>
    events.push({ ...e, at: Date.now() }),
  );
  return { result, events };
}

const outputText = (events: RunEvent[], stream: "stdout" | "stderr") =>
  events
    .filter((e) => e.type === "output" && e.stream === stream)
    .map((e) => (e.type === "output" ? e.text : ""))
    .join("");

describe("runTool", () => {
  it("streams a command's stdout and finishes ok when it exits 0", async () => {
    const { result, events } = await run(toolOf('console.log("hello")'));

    expect(outputText(events, "stdout")).toContain("hello");
    expect(result).toEqual({ ok: true, failedStep: null, exitCode: 0 });
  });

  it("stops at the first failing Step and reports which one failed", async () => {
    const { result, events } = await run(
      toolOf('console.log("one")', "process.exit(3)", 'console.log("never")'),
    );

    expect(result).toEqual({ ok: false, failedStep: 1, exitCode: 3 });
    expect(outputText(events, "stdout")).toContain("one");
    expect(outputText(events, "stdout")).not.toContain("never");
  });

  it("delivers stderr separately from stdout", async () => {
    const { events } = await run(
      toolOf('console.error("oops"); console.log("fine")'),
    );

    expect(outputText(events, "stderr")).toContain("oops");
    expect(outputText(events, "stdout")).not.toContain("oops");
    expect(outputText(events, "stdout")).toContain("fine");
  });

  it("delivers output while the command is still running, not at the end", async () => {
    const { events } = await run(
      toolOf(
        'console.log("early"); setTimeout(() => console.log("late"), 1500)',
      ),
    );

    const early = events.find((e) => e.type === "output" && e.text.includes("early"));
    const late = events.find((e) => e.type === "output" && e.text.includes("late"));
    // 1.5 s apart in the child; a generous 500 ms floor leaves 1 s of slack for a loaded machine.
    expect(late!.at - early!.at).toBeGreaterThan(500);
  });

  it("refuses a pause Step instead of silently skipping it", async () => {
    const tool: Tool = {
      ...toolOf('console.log("before")'),
      steps: [
        { kind: "command", command: 'console.log("before")' },
        { kind: "pause", message: "Quit Docker" },
        { kind: "command", command: 'console.log("after")' },
      ],
    };
    const { result, events } = await run(tool);

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe(1);
    expect(result.error).toMatch(/pause/i);
    expect(outputText(events, "stdout")).not.toContain("after");
  });

  it("fails the Run on a Step whose kind is unknown, instead of skipping it", async () => {
    const odd = {
      ...toolOf('console.log("before")'),
      steps: [
        { kind: "command", command: 'console.log("before")' },
        { kind: "sleep", seconds: 5 },
      ],
    } as unknown as Tool;
    const { result } = await run(odd);

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe(1);
    expect(result.error).toMatch(/unknown step kind "sleep"/i);
  });

  it("fails the Run when one PowerShell statement errors even though a later one succeeds", async () => {
    const tool = toolOf("Get-Item C:\\no_such_folder_zzz; 'still ok'");
    const result = await runTool(tool, POWERSHELL, () => {});

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe(0);
  });

  it("reports a native command's real exit code through PowerShell", async () => {
    const result = await runTool(toolOf("cmd /c exit 5"), POWERSHELL, () => {});

    expect(result).toMatchObject({ ok: false, failedStep: 0, exitCode: 5 });
  });

  it("delivers non-ASCII PowerShell output intact", async () => {
    const events: RunEvent[] = [];
    await runTool(toolOf("Write-Output 'héllo wörld'"), POWERSHELL, (e) => events.push(e));

    expect(outputText(events, "stdout")).toContain("héllo wörld");
  });

  it("still runs a read-only pipeline through PowerShell and succeeds", async () => {
    const result = await runTool(toolOf("Get-PSDrive C | Out-String"), POWERSHELL, () => {});

    expect(result).toEqual({ ok: true, failedStep: null, exitCode: 0 });
  });

  it("fails the Run, without throwing, when the shell cannot be started", async () => {
    const result = await runTool(toolOf("anything"), { file: "no-such-shell-xyz", args: [] }, () => {});

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe(0);
    expect(result.error).toMatch(/no-such-shell-xyz/);
  });
});
