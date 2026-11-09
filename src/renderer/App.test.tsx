// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type {
  Manifest,
  OutputEvent,
  RunResult,
  ToolboxBridge,
} from "../shared/types";
import { App } from "./App";

afterEach(cleanup);

const tool = (id: string, name: string, risk: "read-only" | "normal" | "high" = "read-only") => ({
  id,
  name,
  description: `${name} description`,
  risk,
  steps: [{ kind: "command" as const, command: "x" }],
});

function fakeBridge(manifest: Manifest, overrides: Partial<ToolboxBridge> = {}) {
  const listeners = new Set<(toolId: string, e: OutputEvent) => void>();
  const bridge: ToolboxBridge = {
    getManifest: async () => manifest,
    runTool: async () => ({ ok: true, failedStep: null, exitCode: 0 }) as RunResult,
    onOutput: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    ...overrides,
  };
  const emit = (toolId: string, text: string, stream: "stdout" | "stderr" = "stdout") =>
    listeners.forEach((l) => l(toolId, { type: "output", stream, text }));
  return { bridge, emit };
}

describe("App", () => {
  it("lists every Category and Tool that the Manifest defines", async () => {
    const { bridge } = fakeBridge({
      categories: [
        { id: "c1", name: "Quokka care", tools: [tool("t1", "Feed quokkas")] },
        { id: "c2", name: "Penguin care", tools: [tool("t2", "Chill penguins"), tool("t3", "Count penguins")] },
      ],
    });

    render(<App bridge={bridge} />);

    expect(await screen.findByText("Quokka care")).toBeTruthy();
    expect(screen.getByText("Feed quokkas")).toBeTruthy();
    expect(screen.getByText("Penguin care")).toBeTruthy();
    expect(screen.getByText("Chill penguins")).toBeTruthy();
    expect(screen.getByText("Count penguins")).toBeTruthy();
  });

  it("runs a read-only Tool, shows its output as it arrives, then its result", async () => {
    let finish!: (r: RunResult) => void;
    const ran: string[] = [];
    const { bridge, emit } = fakeBridge(
      { categories: [{ id: "c", name: "Disk", tools: [tool("space", "Free-space check")] }] },
      {
        runTool: (toolId) => {
          ran.push(toolId);
          return new Promise<RunResult>((resolve) => (finish = resolve));
        },
      },
    );
    render(<App bridge={bridge} />);

    const row = (await screen.findByText("Free-space check")).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Run" }));

    expect(ran).toEqual(["space"]);
    act(() => emit("space", "239.2 GB free\n"));
    expect(await screen.findByText(/239\.2 GB free/)).toBeTruthy();
    act(() => emit("space", "second chunk\n"));
    expect(screen.getByText(/239\.2 GB free[\s\S]*second chunk/)).toBeTruthy();
    expect(screen.queryByText(/finished/i)).toBeNull();

    await act(async () => finish({ ok: true, failedStep: null, exitCode: 0 }));
    expect(screen.getByText(/finished/i)).toBeTruthy();
  });

  it("ignores a second Run of a Tool that is already running, and re-enables Run when it ends", async () => {
    let finish!: (r: RunResult) => void;
    let started = 0;
    const { bridge } = fakeBridge(
      { categories: [{ id: "c", name: "Disk", tools: [tool("space", "Free-space check")] }] },
      {
        runTool: () => {
          started += 1;
          return new Promise<RunResult>((resolve) => (finish = resolve));
        },
      },
    );
    render(<App bridge={bridge} />);

    const row = (await screen.findByText("Free-space check")).closest("li")!;
    const button = within(row).getByRole("button", { name: "Run" }) as HTMLButtonElement;
    fireEvent.click(button);
    fireEvent.click(button);

    expect(started).toBe(1);
    expect(button.disabled).toBe(true);

    await act(async () => finish({ ok: true, failedStep: null, exitCode: 0 }));
    expect(button.disabled).toBe(false);
  });

  it("shows a Failed result and re-enables Run when the call to run the Tool itself fails", async () => {
    const { bridge } = fakeBridge(
      { categories: [{ id: "c", name: "Disk", tools: [tool("space", "Free-space check")] }] },
      { runTool: async () => { throw new Error("IPC channel closed"); } },
    );
    render(<App bridge={bridge} />);

    const row = (await screen.findByText("Free-space check")).closest("li")!;
    const button = within(row).getByRole("button", { name: "Run" }) as HTMLButtonElement;
    fireEvent.click(button);

    expect(await screen.findByText(/failed/i)).toBeTruthy();
    expect(screen.getByText(/ipc channel closed/i)).toBeTruthy();
    expect(screen.queryByText(/exit code/i)).toBeNull();
    expect(button.disabled).toBe(false);
  });

  it("clears the previous output when a Tool is run again", async () => {
    let runs = 0;
    let emitOutput!: (toolId: string, text: string) => void;
    const fake = fakeBridge(
      { categories: [{ id: "c", name: "Disk", tools: [tool("space", "Free-space check")] }] },
      {
        runTool: async (toolId) => {
          runs += 1;
          emitOutput(toolId, `output of run ${runs}`);
          return { ok: true, failedStep: null, exitCode: 0 };
        },
      },
    );
    emitOutput = (toolId, text) => fake.emit(toolId, text);
    render(<App bridge={fake.bridge} />);

    const row = (await screen.findByText("Free-space check")).closest("li")!;
    const run = within(row).getByRole("button", { name: "Run" });
    fireEvent.click(run);
    await screen.findByText(/output of run 1/);
    fireEvent.click(run);
    await screen.findByText(/output of run 2/);

    expect(screen.queryByText(/output of run 1/)).toBeNull();
  });

  it("shows a failed Run as failed, with its exit code and error", async () => {
    const { bridge } = fakeBridge(
      { categories: [{ id: "c", name: "Disk", tools: [tool("space", "Free-space check")] }] },
      {
        runTool: async () => ({
          ok: false,
          failedStep: 0,
          exitCode: 3,
          error: "Could not start powershell.exe",
        }),
      },
    );
    render(<App bridge={bridge} />);

    const row = (await screen.findByText("Free-space check")).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Run" }));

    expect(await screen.findByText(/failed/i)).toBeTruthy();
    expect(screen.getByText(/exit code 3/i)).toBeTruthy();
    expect(screen.getByText(/could not start powershell\.exe/i)).toBeTruthy();
    expect(screen.queryByText(/finished/i)).toBeNull();
  });

  it("does not offer Run for a Tool that is not read-only until confirmation exists", async () => {
    const { bridge } = fakeBridge({
      categories: [
        {
          id: "c",
          name: "Cleanup",
          tools: [tool("temp", "Clear temp", "normal"), tool("hib", "Disable hibernation", "high")],
        },
      ],
    });
    render(<App bridge={bridge} />);

    for (const name of ["Clear temp", "Disable hibernation"]) {
      const row = (await screen.findByText(name)).closest("li")!;
      const button = within(row).getByRole("button", { name: "Run" }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    }
  });

  it("shows a message when the Manifest cannot be loaded", async () => {
    const { bridge } = fakeBridge(
      { categories: [] },
      { getManifest: async () => { throw new Error("Manifest must contain a categories list"); } },
    );
    render(<App bridge={bridge} />);

    expect(await screen.findByText(/could not load the manifest/i)).toBeTruthy();
    expect(screen.getByText(/must contain a categories list/i)).toBeTruthy();
  });
});
