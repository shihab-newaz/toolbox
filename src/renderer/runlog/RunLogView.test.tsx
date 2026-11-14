// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Manifest, RunLogEntry, ToolboxBridge } from "@shared/types";
import { App } from "../app/App";

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
        {
          id: "flush",
          name: "Flush DNS",
          description: "",
          risk: "normal",
          steps: [{ kind: "command", command: "ipconfig /flushdns" }],
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
    getVersions: async () => ({ app: "0.0.0", windows: "Windows" }),
    onOutput: () => () => {},
    ...overrides,
  };
}

/** Stands in for the system clipboard, which jsdom does not have. */
function fakeClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

/** Opens the Run log, which is a view of its own. */
const openLog = () => fireEvent.click(screen.getByRole("button", { name: "Run log" }));
const openTool = async (name: string) =>
  fireEvent.click(within((await screen.findByText(name)).closest("li")!).getByRole("button"));
const pressRun = () =>
  fireEvent.click(within(screen.getByRole("region", { name: "Tool panel" })).getByRole("button", { name: "Run" }));

const logView = () => screen.getByRole("region", { name: "Run log" });
const pastRuns = () => within(logView()).getByRole("list", { name: "Past Runs" });
const details = () => within(logView()).getByRole("region", { name: "Run details" });
/** The row of a past Run, by Tool name (the first when a Tool appears more than once). */
const runRow = (toolName: string) =>
  within(pastRuns()).getAllByText(toolName)[0]!.closest("li")!;
const localTime = (iso: string) => new Date(iso).toLocaleString();

describe("Run log view", () => {
  it("says so, and offers a way back to the Tools, when there are no Runs yet", async () => {
    render(<App bridge={fakeBridge()} />);
    openLog();

    expect(await within(logView()).findByText(/no runs yet/i)).toBeTruthy();
    expect(within(logView()).getByText(/a record of it shows up here/i)).toBeTruthy();

    fireEvent.click(within(logView()).getByRole("button", { name: "Back to Tools" }));

    expect(screen.getByRole("region", { name: "Tools" })).toBeTruthy();
  });

  it("shows the newest Run's Tool, start and end time, commands, output and result at once", async () => {
    const run = entry();
    render(<App bridge={fakeBridge({ getRunLog: async () => [run] })} />);
    openLog();

    await within(logView()).findByRole("list", { name: "Past Runs" });
    expect(within(details()).getByRole("heading", { name: "Free-space check" })).toBeTruthy();
    expect(within(details()).getByText("Succeeded")).toBeTruthy();
    expect(within(details()).getByText(new RegExp(`Started ${escape(localTime(run.startedAt))}`))).toBeTruthy();
    expect(within(details()).getByText(new RegExp(`Ended ${escape(localTime(run.endedAt))}`))).toBeTruthy();
    expect(within(details()).getByText(/took 2 s/)).toBeTruthy();
    expect(within(details()).getByText("Get-PSDrive C")).toBeTruthy();
    expect(within(details()).getByText(/239\.2 GB free/)).toBeTruthy();
  });

  it("shows a failed Run as failed, with its failing Step, exit code and error output", async () => {
    const failed = entry({
      toolName: "Flush DNS",
      toolId: "flush",
      commands: ["ipconfig /flushdns", "ipconfig /registerdns"],
      output: "Access is denied.\n",
      result: { ok: false, failedStep: 1, exitCode: 5, error: "Could not start powershell.exe" },
    });
    render(<App bridge={fakeBridge({ getRunLog: async () => [failed] })} />);
    openLog();

    await within(logView()).findByRole("list", { name: "Past Runs" });
    expect(within(details()).getByText("Failed at Step 2 (exit code 5)")).toBeTruthy();
    expect(within(details()).getByText(/access is denied/i)).toBeTruthy();
    expect(within(details()).getByText(/could not start powershell\.exe/i)).toBeTruthy();
    expect(within(details()).queryByText("Succeeded")).toBeNull();
    expect(within(runRow("Flush DNS")).getByText(/failed/i)).toBeTruthy();
  });

  it("lists Runs in the order the Run log gives them, newest first, each with its outcome", async () => {
    const log = [
      entry({ toolName: "Newest", startedAt: "2026-11-13T12:00:00.000Z" }),
      entry({ toolName: "Middle", startedAt: "2026-11-13T11:00:00.000Z", result: { ok: false, failedStep: 0, exitCode: 1 } }),
      entry({ toolName: "Oldest", startedAt: "2026-11-13T10:00:00.000Z" }),
    ];
    render(<App bridge={fakeBridge({ getRunLog: async () => log })} />);
    openLog();

    await within(logView()).findByRole("list", { name: "Past Runs" });
    const names = within(pastRuns())
      .getAllByRole("listitem")
      .map((row) => row.querySelector(".log-tool")!.textContent);
    expect(names).toEqual(["Newest", "Middle", "Oldest"]);
    expect(within(runRow("Newest")).getByText(/succeeded/i)).toBeTruthy();
    expect(within(runRow("Middle")).getByText(/failed/i)).toBeTruthy();
  });

  it("shows the Risk level of each Run's Tool, and none for a Tool the Manifest no longer has", async () => {
    const log = [
      entry({ toolName: "Flush DNS", toolId: "flush" }),
      entry({ toolName: "Free-space check", toolId: "space" }),
      entry({ toolName: "Retired tool", toolId: "gone" }),
    ];
    render(<App bridge={fakeBridge({ getRunLog: async () => log })} />);
    openLog();

    await within(logView()).findByRole("list", { name: "Past Runs" });
    expect(within(runRow("Flush DNS")).getByText("Normal")).toBeTruthy();
    expect(within(runRow("Free-space check")).getByText("Read-only")).toBeTruthy();
    expect(within(runRow("Retired tool")).queryByText(/read-only|normal|high/i)).toBeNull();
  });

  it("shows the Run the user chooses in the details, with its own commands and output", async () => {
    const log = [
      entry({ toolName: "Newest", output: "newest output\n", commands: ["new-command"] }),
      entry({ toolName: "Older", output: "older output\n", commands: ["old-command"] }),
    ];
    render(<App bridge={fakeBridge({ getRunLog: async () => log })} />);
    openLog();
    await within(logView()).findByRole("list", { name: "Past Runs" });
    expect(within(details()).getByText(/newest output/)).toBeTruthy();
    expect(within(runRow("Newest")).getByRole("button").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(within(runRow("Older")).getByRole("button"));

    expect(within(details()).getByRole("heading", { name: "Older" })).toBeTruthy();
    expect(within(details()).getByText(/older output/)).toBeTruthy();
    expect(within(details()).getByText("old-command")).toBeTruthy();
    expect(within(details()).queryByText(/newest output/)).toBeNull();
    expect(within(runRow("Older")).getByRole("button").getAttribute("aria-pressed")).toBe("true");
    expect(within(runRow("Newest")).getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });

  it("adds a Run to the Run log when it finishes", async () => {
    const log: RunLogEntry[] = [];
    const bridge = fakeBridge({
      getRunLog: async () => [...log],
      runTool: async () => {
        log.unshift(entry({ output: "fresh output\n" }));
        return { ok: true, failedStep: null, exitCode: 0 };
      },
    });
    render(<App bridge={bridge} />);
    openLog();
    await within(logView()).findByText(/no runs yet/i);
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));

    await openTool("Free-space check");
    pressRun();
    await screen.findByText(/finished/i);
    openLog();

    expect(await within(logView()).findByText(/fresh output/)).toBeTruthy();
    expect(within(logView()).queryByText(/no runs yet/i)).toBeNull();
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
    openLog();
    await within(logView()).findByRole("list", { name: "Past Runs" });
    expect(within(pastRuns()).getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));

    await openTool("Free-space check");
    pressRun();
    await screen.findByText(/finished/i);
    openLog();

    await within(logView()).findByRole("heading", { name: "Fresh" });
    const rows = within(pastRuns()).getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector(".log-tool")!.textContent)).toEqual([
      "Fresh",
      "Top",
      "Free-space check",
      "Free-space check",
      "Free-space check",
    ]);
    // Each Run is chosen by position, so Runs that look alike open their own output.
    fireEvent.click(within(rows[3]!).getByRole("button"));
    expect(within(details()).getByText("two")).toBeTruthy();
  });

  it("copies the chosen Run's log entry to the clipboard", async () => {
    const copied: string[] = [];
    fakeClipboard(async (text) => void copied.push(text));
    const first = entry({ toolName: "Flush DNS", toolId: "flush", commands: ["ipconfig /flushdns"], output: "Flushed.\n" });
    const second = entry({
      toolName: "Renew IP",
      commands: ["ipconfig /release", "ipconfig /renew"],
      output: "No adapter\n",
      result: { ok: false, failedStep: 1, exitCode: 2, error: "Lease refused" },
    });
    render(<App bridge={fakeBridge({ getRunLog: async () => [first, second] })} />);
    openLog();
    await within(logView()).findByRole("list", { name: "Past Runs" });

    fireEvent.click(within(runRow("Renew IP")).getByRole("button"));
    fireEvent.click(within(details()).getByRole("button", { name: "Copy" }));

    expect(await within(details()).findByRole("button", { name: "Copied" })).toBeTruthy();
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
  });

  it("says so when the entry could not be copied", async () => {
    fakeClipboard(async () => {
      throw new Error("Clipboard is busy");
    });
    render(<App bridge={fakeBridge({ getRunLog: async () => [entry()] })} />);
    openLog();
    await within(logView()).findByRole("list", { name: "Past Runs" });

    fireEvent.click(within(details()).getByRole("button", { name: "Copy" }));

    expect(await within(details()).findByText(/could not copy/i)).toBeTruthy();
  });

  it("shows a message, and still lists the Tools, when the Run log cannot be read", async () => {
    const bridge = fakeBridge({
      getRunLog: async () => {
        throw new Error("IPC channel closed");
      },
    });
    render(<App bridge={bridge} />);
    openLog();

    expect(await within(logView()).findByText(/could not load the run log/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    expect(await screen.findByText("Free-space check")).toBeTruthy();
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
