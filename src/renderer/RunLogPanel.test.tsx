// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Manifest, RunLogEntry, ToolboxBridge } from "../shared/types";
import { App } from "./App";

afterEach(cleanup);

const manifest: Manifest = {
  categories: [
    {
      id: "c",
      name: "Disk",
      tools: [
        {
          id: "space",
          name: "Free-space check",
          description: "",
          risk: "read-only",
          steps: [{ kind: "command", command: "Get-PSDrive C" }],
        },
      ],
    },
  ],
};

const entry = (overrides: Partial<RunLogEntry> = {}): RunLogEntry => ({
  toolId: "space",
  toolName: "Free-space check",
  startedAt: "2026-11-13T09:15:00.000Z",
  endedAt: "2026-11-13T09:15:02.000Z",
  commands: ["Get-PSDrive C"],
  output: "239.2 GB free\n",
  result: { ok: true, failedStep: null, exitCode: 0 },
  ...overrides,
});

function fakeBridge(overrides: Partial<ToolboxBridge> = {}): ToolboxBridge {
  return {
    getManifest: async () => manifest,
    runTool: async () => ({ ok: true, failedStep: null, exitCode: 0 }),
    getRunLog: async () => [],
    onOutput: () => () => {},
    ...overrides,
  };
}

/** Stands in for the system clipboard, which jsdom does not have. */
function fakeClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

const logPanel = () => screen.getByRole("region", { name: "Run log" });
const localTime = (iso: string) => new Date(iso).toLocaleString();

describe("Run log panel", () => {
  it("says so when there are no Runs yet", async () => {
    render(<App bridge={fakeBridge()} />);

    expect(await within(logPanel()).findByText(/no runs yet/i)).toBeTruthy();
  });

  it("shows a past Run with its Tool, start and end time, commands, output and result", async () => {
    const run = entry();
    render(<App bridge={fakeBridge({ getRunLog: async () => [run] })} />);

    const row = (await within(logPanel()).findByText("Free-space check")).closest("li")!;
    expect(within(row).getByText("Succeeded")).toBeTruthy();
    expect(within(row).getByText(new RegExp(`Started ${escape(localTime(run.startedAt))}`))).toBeTruthy();
    expect(within(row).getByText(new RegExp(`Ended ${escape(localTime(run.endedAt))}`))).toBeTruthy();
    expect(within(row).getByText("Get-PSDrive C")).toBeTruthy();
    expect(within(row).getByText(/239\.2 GB free/)).toBeTruthy();
  });

  it("shows a failed Run as failed, with its failing Step, exit code and error output", async () => {
    const failed = entry({
      toolName: "Flush DNS",
      commands: ["ipconfig /flushdns", "ipconfig /registerdns"],
      output: "Access is denied.\n",
      result: { ok: false, failedStep: 1, exitCode: 5, error: "Could not start powershell.exe" },
    });
    render(<App bridge={fakeBridge({ getRunLog: async () => [failed] })} />);

    const row = (await within(logPanel()).findByText("Flush DNS")).closest("li")!;
    expect(within(row).getByText("Failed at Step 2 (exit code 5)")).toBeTruthy();
    expect(within(row).getByText(/access is denied/i)).toBeTruthy();
    expect(within(row).getByText(/could not start powershell\.exe/i)).toBeTruthy();
    expect(within(row).queryByText("Succeeded")).toBeNull();
  });

  it("lists Runs in the order the Run log gives them, newest first", async () => {
    const log = [
      entry({ toolName: "Newest", startedAt: "2026-11-13T12:00:00.000Z" }),
      entry({ toolName: "Middle", startedAt: "2026-11-13T11:00:00.000Z" }),
      entry({ toolName: "Oldest", startedAt: "2026-11-13T10:00:00.000Z" }),
    ];
    render(<App bridge={fakeBridge({ getRunLog: async () => log })} />);

    await within(logPanel()).findByText("Newest");
    const names = within(logPanel())
      .getAllByRole("listitem")
      .map((row) => row.querySelector("span")!.textContent);
    expect(names).toEqual(["Newest", "Middle", "Oldest"]);
  });

  it("adds a Run to the panel when it finishes", async () => {
    const log: RunLogEntry[] = [];
    const bridge = fakeBridge({
      getRunLog: async () => [...log],
      runTool: async () => {
        log.unshift(entry({ output: "fresh output\n" }));
        return { ok: true, failedStep: null, exitCode: 0 };
      },
    });
    render(<App bridge={bridge} />);
    await within(logPanel()).findByText(/no runs yet/i);

    fireEvent.click(await screen.findByRole("button", { name: "Run" }));

    expect(await within(logPanel()).findByText(/fresh output/)).toBeTruthy();
    expect(within(logPanel()).queryByText(/no runs yet/i)).toBeNull();
  });

  it("lists every Run exactly once, even when saved Runs share a start time and Tool, when the log is trimmed", async () => {
    // Newest first: one distinct Run on top of Runs that share a start time and Tool.
    const log = [
      entry({ toolName: "Top", startedAt: "2026-11-13T10:00:00.000Z", output: "top" }),
      ...["one", "two", "three", "four"].map((output) => entry({ output })),
    ];
    const bridge = fakeBridge({
      getRunLog: async () => [...log],
      runTool: async () => {
        // The log is full: a new Run goes on top and the oldest one drops off.
        log.pop();
        log.unshift(entry({ toolName: "Fresh", startedAt: "2026-11-13T11:00:00.000Z", output: "fresh" }));
        return { ok: true, failedStep: null, exitCode: 0 };
      },
    });
    render(<App bridge={bridge} />);
    await within(logPanel()).findByText(/top/);
    expect(within(logPanel()).getAllByRole("listitem")).toHaveLength(5);

    fireEvent.click(await screen.findByRole("button", { name: "Run" }));

    await within(logPanel()).findByText(/fresh/);
    const rows = within(logPanel()).getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector("pre:last-of-type")!.textContent)).toEqual([
      "fresh",
      "top",
      "one",
      "two",
      "three",
    ]);
  });

  it("copies a Run's log entry to the clipboard", async () => {
    const copied: string[] = [];
    fakeClipboard(async (text) => void copied.push(text));
    const first = entry({ toolName: "Flush DNS", commands: ["ipconfig /flushdns"], output: "Flushed.\n" });
    const second = entry({
      toolName: "Renew IP",
      commands: ["ipconfig /release", "ipconfig /renew"],
      output: "No adapter\n",
      result: { ok: false, failedStep: 1, exitCode: 2, error: "Lease refused" },
    });
    render(<App bridge={fakeBridge({ getRunLog: async () => [first, second] })} />);

    const row = (await within(logPanel()).findByText("Renew IP")).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Copy" }));

    expect(await within(row).findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(copied).toHaveLength(1);
    const text = copied[0]!;
    expect(text).toContain("Renew IP");
    expect(text).toContain(localTime(second.startedAt));
    expect(text).toContain(localTime(second.endedAt));
    // Exact, zone-free times too, so whoever reads the paste in another time zone can place the Run.
    expect(text).toContain(second.startedAt);
    expect(text).toContain(second.endedAt);
    expect(text).toContain("ipconfig /release");
    expect(text).toContain("ipconfig /renew");
    expect(text).toContain("No adapter");
    expect(text).toContain("Failed at Step 2 (exit code 2)");
    expect(text).toContain("Lease refused");
    // Only the chosen Run, not its neighbours.
    expect(text).not.toContain("Flush DNS");
    const otherRow = within(logPanel()).getByText("Flush DNS").closest("li")!;
    expect(within(otherRow).getByRole("button", { name: "Copy" })).toBeTruthy();
  });

  it("says so when the entry could not be copied", async () => {
    fakeClipboard(async () => {
      throw new Error("Clipboard is busy");
    });
    render(<App bridge={fakeBridge({ getRunLog: async () => [entry()] })} />);

    const row = (await within(logPanel()).findByText("Free-space check")).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Copy" }));

    expect(await within(row).findByText(/could not copy/i)).toBeTruthy();
  });

  it("shows a message, and still lists the Tools, when the Run log cannot be read", async () => {
    const bridge = fakeBridge({
      getRunLog: async () => {
        throw new Error("IPC channel closed");
      },
    });
    render(<App bridge={bridge} />);

    expect(await within(logPanel()).findByText(/could not load the run log/i)).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Run" })).toBeTruthy();
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
