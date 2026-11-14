// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type {
  Manifest,
  OutputEvent,
  RunResult,
  ToolboxBridge,
} from "@shared/types";
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
    getVersions: async () => ({ app: "0.0.0", windows: "Windows" }),
    runTool: async () => ({ ok: true, failedStep: null, exitCode: 0 }) as RunResult,
    getRunLog: async () => [],
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

/** The Tool's row in the list. */
const row = (name: string) => within(screen.getByRole("region", { name: "Tools" })).getByText(name).closest("li")!;
const toolPanel = () => screen.getByRole("region", { name: "Tool panel" });

/** Chooses a Tool in the list, which opens it in the Tool panel. */
async function open(name: string) {
  const inList = within(await screen.findByRole("region", { name: "Tools" })).getByText(name);
  fireEvent.click(within(inList.closest("li")!).getByRole("button"));
}

/** Presses Run in the Tool panel. */
const pressRun = () => fireEvent.click(within(toolPanel()).getByRole("button", { name: "Run" }));
const runButton = () => within(toolPanel()).getByRole("button", { name: "Run" }) as HTMLButtonElement;

const spaceManifest: Manifest = {
  categories: [{ id: "c", name: "Disk", tools: [tool("space", "Free-space check")] }],
};

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

  it("shows each Tool's description and its Risk level on its row", async () => {
    const { bridge } = fakeBridge({
      categories: [
        {
          id: "c",
          name: "Cleanup",
          tools: [tool("a", "Peek", "read-only"), tool("b", "Tidy", "normal"), tool("c", "Purge", "high")],
        },
      ],
    });

    render(<App bridge={bridge} />);

    expect(await screen.findByText("Peek description")).toBeTruthy();
    expect(screen.getByText("Tidy description")).toBeTruthy();
    expect(screen.getByText("Purge description")).toBeTruthy();
    for (const [name, risk] of [["Peek", "Read-only"], ["Tidy", "Normal"], ["Purge", "High"]]) {
      expect(within(row(name!)).getByText(risk!)).toBeTruthy();
    }
  });

  it("asks the user to pick a Tool until one is chosen, and runs nothing meanwhile", async () => {
    let started = 0;
    const { bridge } = fakeBridge(spaceManifest, { runTool: async () => (started++, { ok: true, failedStep: null, exitCode: 0 }) });
    render(<App bridge={bridge} />);

    await screen.findByText("Free-space check");
    expect(within(toolPanel()).getByText("Pick a Tool to get started")).toBeTruthy();
    expect(within(toolPanel()).queryByRole("button", { name: "Run" })).toBeNull();
    expect(started).toBe(0);
  });

  it("opens the chosen Tool in the Tool panel with its name, Risk level, plain summary and description", async () => {
    const { bridge } = fakeBridge({
      categories: [{ id: "c", name: "Cleanup", tools: [tool("a", "Peek", "read-only"), tool("b", "Tidy", "normal")] }],
    });
    render(<App bridge={bridge} />);

    await open("Tidy");

    const panel = toolPanel();
    expect(within(panel).getByRole("heading", { name: "Tidy" })).toBeTruthy();
    expect(within(panel).getByText("Normal")).toBeTruthy();
    expect(within(panel).getByText("Changes things Windows rebuilds on its own")).toBeTruthy();
    expect(within(panel).getByText("Tidy description")).toBeTruthy();
    expect(within(panel).getByText(/nothing yet/i)).toBeTruthy();
    expect(row("Tidy").querySelector("button")!.getAttribute("aria-pressed")).toBe("true");
    expect(row("Peek").querySelector("button")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("runs a read-only Tool at once with no confirmation, shows its output as it arrives, then its result", async () => {
    let finish!: (r: RunResult) => void;
    const ran: Array<[string, boolean]> = [];
    const { bridge, emit } = fakeBridge(spaceManifest, {
      runTool: (toolId, confirmed) => {
        ran.push([toolId, confirmed]);
        return new Promise<RunResult>((resolve) => (finish = resolve));
      },
    });
    render(<App bridge={bridge} />);

    await open("Free-space check");
    pressRun();

    // Nothing was confirmed, and the request says so.
    expect(ran).toEqual([["space", false]]);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => emit("space", "239.2 GB free\n"));
    expect(await screen.findByText(/239\.2 GB free/)).toBeTruthy();
    act(() => emit("space", "second chunk\n"));
    expect(screen.getByText(/239\.2 GB free[\s\S]*second chunk/)).toBeTruthy();
    expect(screen.queryByText(/finished/i)).toBeNull();

    await act(async () => finish({ ok: true, failedStep: null, exitCode: 0 }));
    expect(within(toolPanel()).getByText(/finished/i)).toBeTruthy();
    expect(within(toolPanel()).getByText(/took \d+ s · ended at/i)).toBeTruthy();
  });

  it("ignores a second Run of a Tool that is already running, and re-enables Run when it ends", async () => {
    let finish!: (r: RunResult) => void;
    let started = 0;
    const { bridge } = fakeBridge(spaceManifest, {
      runTool: () => {
        started += 1;
        return new Promise<RunResult>((resolve) => (finish = resolve));
      },
    });
    render(<App bridge={bridge} />);

    await open("Free-space check");
    const button = runButton();
    fireEvent.click(button);
    fireEvent.click(button);

    expect(started).toBe(1);
    expect(button.disabled).toBe(true);

    await act(async () => finish({ ok: true, failedStep: null, exitCode: 0 }));
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Run again");
  });

  it("starts a Tool once even when two clicks land before the screen can re-render", async () => {
    let started = 0;
    const { bridge } = fakeBridge(spaceManifest, {
      runTool: () => {
        started += 1;
        return new Promise<RunResult>(() => {});
      },
    });
    render(<App bridge={bridge} />);

    await open("Free-space check");
    const button = runButton();
    // Both clicks run inside one act(): React cannot re-render (and disable the button) between them.
    act(() => {
      button.click();
      button.click();
    });

    expect(started).toBe(1);
  });

  it("shows a Failed result and re-enables Run when the call to run the Tool itself fails", async () => {
    const { bridge } = fakeBridge(spaceManifest, {
      runTool: async () => { throw new Error("IPC channel closed"); },
    });
    render(<App bridge={bridge} />);

    await open("Free-space check");
    const button = runButton();
    fireEvent.click(button);

    expect(await screen.findByText(/failed/i)).toBeTruthy();
    expect(screen.getByText(/ipc channel closed/i)).toBeTruthy();
    expect(screen.queryByText(/exit code/i)).toBeNull();
    expect(button.disabled).toBe(false);
  });

  it("clears the previous output when a Tool is run again", async () => {
    let runs = 0;
    let emitOutput!: (toolId: string, text: string) => void;
    const fake = fakeBridge(spaceManifest, {
      runTool: async (toolId) => {
        runs += 1;
        emitOutput(toolId, `output of run ${runs}`);
        return { ok: true, failedStep: null, exitCode: 0 };
      },
    });
    emitOutput = (toolId, text) => fake.emit(toolId, text);
    render(<App bridge={fake.bridge} />);

    await open("Free-space check");
    const run = runButton();
    fireEvent.click(run);
    await screen.findByText(/output of run 1/);
    fireEvent.click(run);
    await screen.findByText(/output of run 2/);

    expect(screen.queryByText(/output of run 1/)).toBeNull();
  });

  it("shows a failed Run as failed, with its exit code and error", async () => {
    const { bridge } = fakeBridge(spaceManifest, {
      runTool: async () => ({
        ok: false,
        failedStep: 0,
        exitCode: 3,
        error: "Could not start powershell.exe",
      }),
    });
    render(<App bridge={bridge} />);

    await open("Free-space check");
    pressRun();

    expect(await screen.findByText(/failed/i)).toBeTruthy();
    expect(screen.getByText(/exit code 3/i)).toBeTruthy();
    expect(screen.getByText(/at step 1/i)).toBeTruthy();
    expect(screen.getByText(/could not start powershell\.exe/i)).toBeTruthy();
    expect(screen.queryByText(/finished/i)).toBeNull();
  });

  it("says so when a Run produced no output, instead of leaving the output empty", async () => {
    const { bridge } = fakeBridge(spaceManifest, {
      runTool: async () => ({ ok: false, failedStep: 0, exitCode: 1 }),
    });
    render(<App bridge={bridge} />);
    await open("Free-space check");

    pressRun();

    expect(await within(toolPanel()).findByText("This Run produced no output.")).toBeTruthy();
  });

  it("shows the Run in the panel of the Tool it belongs to, not in another Tool's panel", async () => {
    const { bridge, emit } = fakeBridge({
      categories: [{ id: "c", name: "Disk", tools: [tool("a", "First"), tool("b", "Second")] }],
    });
    render(<App bridge={bridge} />);
    await open("First");
    pressRun();
    act(() => emit("a", "first tool output"));
    await screen.findByText(/first tool output/);

    await open("Second");

    expect(screen.queryByText(/first tool output/)).toBeNull();
    expect(within(toolPanel()).getByText(/nothing yet/i)).toBeTruthy();
  });

  describe("row status", () => {
    const twoTools: Manifest = {
      categories: [{ id: "c", name: "Disk", tools: [tool("a", "First"), tool("b", "Second")] }],
    };

    it("shows a spinner on a running Tool's row, even while another Tool is open, and lets other Tools run too", async () => {
      const finishers: Record<string, (r: RunResult) => void> = {};
      const { bridge } = fakeBridge(twoTools, {
        runTool: (toolId) => new Promise<RunResult>((resolve) => (finishers[toolId] = resolve)),
      });
      render(<App bridge={bridge} />);
      await open("First");
      pressRun();

      await open("Second");
      expect(within(row("First")).getByRole("img", { name: "Running" })).toBeTruthy();
      expect(within(row("Second")).queryByRole("img")).toBeNull();

      // Concurrent Runs: the second Tool starts while the first is still going.
      pressRun();
      expect(within(row("Second")).getByRole("img", { name: "Running" })).toBeTruthy();
      expect(within(row("First")).getByRole("img", { name: "Running" })).toBeTruthy();

      await act(async () => finishers["a"]!({ ok: true, failedStep: null, exitCode: 0 }));
      expect(within(row("First")).queryByRole("img", { name: "Running" })).toBeNull();
      expect(within(row("Second")).getByRole("img", { name: "Running" })).toBeTruthy();
    });

    it("keeps a Finished mark on the row of a Run that ended elsewhere, until that Tool is opened", async () => {
      let finish!: (r: RunResult) => void;
      const { bridge } = fakeBridge(twoTools, {
        runTool: () => new Promise<RunResult>((resolve) => (finish = resolve)),
      });
      render(<App bridge={bridge} />);
      await open("First");
      pressRun();
      await open("Second");

      await act(async () => finish({ ok: true, failedStep: null, exitCode: 0 }));
      expect(within(row("First")).getByRole("img", { name: "Finished" })).toBeTruthy();

      await open("First");
      expect(within(row("First")).queryByRole("img")).toBeNull();
    });

    it("keeps a Failed mark on the row of a failed Run until that Tool is opened", async () => {
      let finish!: (r: RunResult) => void;
      const { bridge } = fakeBridge(twoTools, {
        runTool: () => new Promise<RunResult>((resolve) => (finish = resolve)),
      });
      render(<App bridge={bridge} />);
      await open("First");
      pressRun();
      await open("Second");

      await act(async () => finish({ ok: false, failedStep: 0, exitCode: 1 }));
      expect(within(row("First")).getByRole("img", { name: "Failed" })).toBeTruthy();

      await open("First");
      expect(within(row("First")).queryByRole("img")).toBeNull();
    });

    it("shows no mark for a Run that ends in the panel the user is looking at", async () => {
      let finish!: (r: RunResult) => void;
      const { bridge } = fakeBridge(twoTools, {
        runTool: () => new Promise<RunResult>((resolve) => (finish = resolve)),
      });
      render(<App bridge={bridge} />);
      await open("First");
      pressRun();

      await act(async () => finish({ ok: true, failedStep: null, exitCode: 0 }));

      expect(within(row("First")).queryByRole("img")).toBeNull();
    });
  });

  describe("confirmation", () => {
    const cleanup2 = (risk: "normal" | "high", extra = {}): Manifest => ({
      categories: [
        {
          id: "c",
          name: "Cleanup",
          tools: [
            {
              ...tool("temp", "Clear temp", risk),
              steps: [
                { kind: "command", command: "Remove-Item first-thing" },
                { kind: "command", command: "Remove-Item second-thing" },
              ],
              ...extra,
            },
          ],
        },
      ],
    });

    it("keeps the commands of a normal Tool collapsed until asked, then shows every command of every Step, and runs it only once confirmed", async () => {
      const ran: Array<[string, boolean]> = [];
      const { bridge } = fakeBridge(cleanup2("normal"), {
        runTool: async (toolId, confirmed) => {
          ran.push([toolId, confirmed]);
          return { ok: true, failedStep: null, exitCode: 0 };
        },
      });
      render(<App bridge={bridge} />);
      await open("Clear temp");
      expect(screen.queryByRole("dialog")).toBeNull();

      pressRun();

      const dialog = screen.getByRole("dialog", { name: "Confirm Clear temp" });
      expect(within(dialog).getByText("Normal")).toBeTruthy();
      expect(within(dialog).getByText("This changes things on your PC that Windows rebuilds by itself.")).toBeTruthy();
      expect(within(dialog).queryByText("Remove-Item first-thing")).toBeNull();
      const toggle = within(dialog).getByRole("button", { name: "Show commands" });
      expect(toggle.getAttribute("aria-expanded")).toBe("false");

      fireEvent.click(toggle);
      expect(within(dialog).getByText("Remove-Item first-thing")).toBeTruthy();
      expect(within(dialog).getByText("Remove-Item second-thing")).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Hide commands" }).getAttribute("aria-expanded")).toBe("true");
      expect(ran).toEqual([]);

      fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));

      expect(ran).toEqual([["temp", true]]);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(await within(toolPanel()).findByText(/finished/i)).toBeTruthy();
    });

    it("shows the commands of a high Tool open from the start, and says in plain words that something may be lost", async () => {
      const ran: Array<[string, boolean]> = [];
      const { bridge } = fakeBridge(cleanup2("high"), {
        runTool: async (toolId, confirmed) => {
          ran.push([toolId, confirmed]);
          return { ok: true, failedStep: null, exitCode: 0 };
        },
      });
      render(<App bridge={bridge} />);
      await open("Clear temp");

      pressRun();

      const dialog = screen.getByRole("dialog", { name: "Confirm Clear temp" });
      expect(within(dialog).getByText("High")).toBeTruthy();
      expect(within(dialog).getByText(/you may lose something you want back, and there is no undo/i)).toBeTruthy();
      expect(within(dialog).getByText("Remove-Item first-thing")).toBeTruthy();
      expect(within(dialog).getByText("Remove-Item second-thing")).toBeTruthy();
      expect(within(dialog).getByRole("button", { name: "Hide commands" })).toBeTruthy();
      // No type-to-confirm: there is no text field, and one click confirms.
      expect(within(dialog).queryByRole("textbox")).toBeNull();
      fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
      expect(ran).toEqual([["temp", true]]);
    });

    it("runs nothing when the confirmation is cancelled, and Run can be chosen again", async () => {
      let started = 0;
      const { bridge } = fakeBridge(cleanup2("normal"), {
        runTool: async () => {
          started += 1;
          return { ok: true, failedStep: null, exitCode: 0 };
        },
      });
      render(<App bridge={bridge} />);
      await open("Clear temp");
      const run = runButton();
      fireEvent.click(run);
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(started).toBe(0);
      expect(within(toolPanel()).queryByText(/finished|failed/i)).toBeNull();
      expect(run.disabled).toBe(false);

      fireEvent.click(run);
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(started).toBe(0);
    });

    it("keeps the page behind the confirmation out of reach while it is open, and gives it back when it closes", async () => {
      const { bridge } = fakeBridge(cleanup2("normal"));
      const { container } = render(<App bridge={bridge} />);
      await open("Clear temp");
      expect(container.querySelectorAll("[inert]")).toHaveLength(0);

      pressRun();

      // The header, both panes and the status line are all inert; the dialog is not.
      expect(container.querySelectorAll("[inert]").length).toBeGreaterThan(0);
      expect(screen.getByRole("dialog").closest("[inert]")).toBeNull();
      expect(container.querySelector("header")!.hasAttribute("inert")).toBe(true);
      expect(container.querySelector(".panes")!.hasAttribute("inert")).toBe(true);

      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

      expect(container.querySelectorAll("[inert]")).toHaveLength(0);
    });

    it("cancels the confirmation when Escape is pressed", async () => {
      let started = 0;
      const { bridge } = fakeBridge(cleanup2("normal"), {
        runTool: async () => (started++, { ok: true, failedStep: null, exitCode: 0 }),
      });
      render(<App bridge={bridge} />);
      await open("Clear temp");
      pressRun();

      fireEvent.keyDown(window, { key: "Escape" });

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(started).toBe(0);
    });

    it("shows a pause Step's message in order with the commands", async () => {
      const { bridge } = fakeBridge({
        categories: [
          {
            id: "c",
            name: "Developer",
            tools: [
              {
                ...tool("shrink", "Docker shrink", "normal"),
                steps: [
                  { kind: "command", command: "docker system prune" },
                  { kind: "pause", message: "Quit Docker Desktop, then continue" },
                  { kind: "command", command: "Optimize-VHD disk" },
                ],
              },
              tool("npm", "Clear npm cache", "normal"),
            ],
          },
        ],
      });
      render(<App bridge={bridge} />);
      await open("Docker shrink");
      pressRun();
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Show commands" }));

      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog").textContent).toMatch(
        /docker system prune[\s\S]*Quit Docker Desktop, then continue[\s\S]*Optimize-VHD disk/,
      );
    });
  });

  it("shows the app version and the Windows version", async () => {
    const { bridge } = fakeBridge(
      { categories: [] },
      { getVersions: async () => ({ app: "4.5.6", windows: "Windows 11 (build 26100)" }) },
    );

    render(<App bridge={bridge} />);

    expect(await screen.findByText(/Toolbox 4\.5\.6/)).toBeTruthy();
    expect(screen.getByText(/Windows 11 \(build 26100\)/)).toBeTruthy();
  });

  it("still lists the Tools when the versions cannot be read", async () => {
    let rejected: Promise<never> = new Promise(() => undefined);
    const { bridge } = fakeBridge(
      { categories: [{ id: "c", name: "Quokka care", tools: [tool("t1", "Feed quokkas")] }] },
      {
        getVersions: () => {
          rejected = Promise.reject(new Error("no versions"));
          return rejected;
        },
      },
    );

    render(<App bridge={bridge} />);

    expect(await screen.findByText("Feed quokkas")).toBeTruthy();
    // Let the rejection reach the window before checking that nothing was shown.
    await act(async () => {
      await rejected.catch(() => undefined);
    });
    expect(screen.queryByText(/Toolbox \d/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
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

  it("shows no Administrator banner or chip", async () => {
    const { bridge } = fakeBridge(spaceManifest);
    render(<App bridge={bridge} />);

    await screen.findByText("Free-space check");

    expect(screen.queryByText(/administrator/i)).toBeNull();
  });
});

describe("App views", () => {
  it("opens the Run log as a view of its own from the header, and returns to the Tools with the back control", async () => {
    const { bridge } = fakeBridge(spaceManifest);
    render(<App bridge={bridge} />);
    await open("Free-space check");

    fireEvent.click(await screen.findByRole("button", { name: "Run log" }));

    expect(await screen.findByRole("heading", { name: "Run log", level: 1 })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Tools" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Tool panel" })).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Tools" }));

    expect(screen.getByRole("region", { name: "Tools" })).toBeTruthy();
    // The Tool that was open is still open.
    expect(within(toolPanel()).getByRole("heading", { name: "Free-space check" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Run log", level: 1 })).toBeNull();
  });

  it("keeps a Run going, with its output, while the Run log is open", async () => {
    let finish!: (r: RunResult) => void;
    const { bridge, emit } = fakeBridge(spaceManifest, {
      runTool: () => new Promise<RunResult>((resolve) => (finish = resolve)),
    });
    render(<App bridge={bridge} />);
    await open("Free-space check");
    pressRun();
    act(() => emit("space", "still going\n"));

    fireEvent.click(screen.getByRole("button", { name: "Run log" }));
    fireEvent.click(screen.getByRole("button", { name: "Tools" }));

    expect(screen.getByText(/still going/)).toBeTruthy();
    expect((within(toolPanel()).getByRole("button", { name: "Running…" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish({ ok: true, failedStep: null, exitCode: 0 }));
    expect(within(toolPanel()).getByText(/finished/i)).toBeTruthy();
  });
});

describe("App search box", () => {
  const zoo: Manifest = {
    categories: [
      {
        id: "net",
        name: "Network",
        tools: [
          { ...tool("dns", "Flush DNS cache"), description: "Fixes sites that will not load" },
          { ...tool("wifi", "Show Wi-Fi password"), description: "Reads the saved key of a WLAN network" },
        ],
      },
      {
        id: "fix",
        name: "Fix-it",
        tools: [
          { ...tool("spool", "Clear print queue"), description: "Unsticks a printer that will not print" },
          { ...tool("icons", "Rebuild icon cache"), description: "Repairs blank desktop icons" },
        ],
      },
      {
        id: "disk",
        name: "Disk cleanup",
        tools: [{ ...tool("space", "Free-space check"), description: "Reports how full each drive is" }],
      },
    ],
  };

  async function search(text: string) {
    const box = await screen.findByRole("searchbox", { name: "Search Tools" });
    fireEvent.change(box, { target: { value: text } });
  }

  const list = () => within(screen.getByRole("region", { name: "Tools" }));
  const shownTools = () =>
    list()
      .queryAllByRole("listitem")
      .map((item) => item.querySelector(".tool-name")!.textContent);
  const noMatchMessage = /no tool matches/i;
  const shownCategories = () =>
    list()
      .queryAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);

  it("shows the matching Tools from every Category, each under its Category name", async () => {
    const { bridge } = fakeBridge(zoo);
    render(<App bridge={bridge} />);

    await search("cache");

    expect(shownCategories()).toEqual(["Network", "Fix-it"]);
    expect(shownTools()).toEqual(["Flush DNS cache", "Rebuild icon cache"]);
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("cache");
    const network = screen.getByText("Network").closest("section")!;
    expect(within(network).getByText("Flush DNS cache")).toBeTruthy();
    const fixIt = screen.getByText("Fix-it").closest("section")!;
    expect(within(fixIt).getByText("Rebuild icon cache")).toBeTruthy();
  });

  it("matches a Tool's name whatever the case of the search or the name", async () => {
    const { bridge } = fakeBridge(zoo);
    render(<App bridge={bridge} />);

    await search("dns");
    expect(shownTools()).toEqual(["Flush DNS cache"]);

    await search("FREE-SPACE");
    expect(shownTools()).toEqual(["Free-space check"]);
  });

  it("matches a Tool's description as well as its name, ignoring case", async () => {
    const { bridge } = fakeBridge(zoo);
    render(<App bridge={bridge} />);

    await search("PRINTER");

    expect(shownCategories()).toEqual(["Fix-it"]);
    expect(shownTools()).toEqual(["Clear print queue"]);

    await search("wlan");

    expect(shownTools()).toEqual(["Show Wi-Fi password"]);
  });

  it("says so when no Tool matches the search", async () => {
    const { bridge } = fakeBridge(zoo);
    render(<App bridge={bridge} />);
    await search("cache");
    expect(screen.queryByText(noMatchMessage)).toBeNull();

    await search("quokka");

    expect(shownCategories()).toEqual([]);
    expect(shownTools()).toEqual([]);
    expect(screen.getByText(noMatchMessage).textContent).toContain("quokka");
    expect(screen.getByText(/check the spelling/i)).toBeTruthy();
  });

  it("ignores spaces around the search, and treats a search of only spaces as empty", async () => {
    const { bridge } = fakeBridge(zoo);
    render(<App bridge={bridge} />);

    await search("  printer ");
    expect(shownTools()).toEqual(["Clear print queue"]);

    await search("  quokka ");
    expect(screen.getByText(noMatchMessage).textContent).toMatch(/"quokka"/);

    await search("   ");
    expect(shownCategories()).toEqual(["Network", "Fix-it", "Disk cleanup"]);
    expect(screen.queryByText(noMatchMessage)).toBeNull();
  });

  it("keeps showing a Category that has no Tools while nothing is searched for", async () => {
    const { bridge } = fakeBridge({
      categories: [...zoo.categories, { id: "dev", name: "Developer", tools: [] }],
    });
    render(<App bridge={bridge} />);

    await search("");
    expect(shownCategories()).toEqual(["Network", "Fix-it", "Disk cleanup", "Developer"]);

    await search("cache");
    expect(shownCategories()).toEqual(["Network", "Fix-it"]);
  });

  it("does not report a failed search for a Manifest with no Categories", async () => {
    const { bridge } = fakeBridge({ categories: [] });
    render(<App bridge={bridge} />);

    await screen.findByRole("searchbox");

    expect(screen.queryByText(noMatchMessage)).toBeNull();
  });

  it("offers no search box when the Manifest cannot be loaded", async () => {
    const { bridge } = fakeBridge(zoo, { getManifest: async () => { throw new Error("broken"); } });
    render(<App bridge={bridge} />);

    await screen.findByText(/could not load the manifest/i);

    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("restores the full Category list when the search is cleared", async () => {
    const { bridge } = fakeBridge(zoo);
    render(<App bridge={bridge} />);
    await search("quokka");

    await search("");

    expect(shownCategories()).toEqual(["Network", "Fix-it", "Disk cleanup"]);
    expect(shownTools()).toEqual([
      "Flush DNS cache",
      "Show Wi-Fi password",
      "Clear print queue",
      "Rebuild icon cache",
      "Free-space check",
    ]);
    expect(screen.queryByText(noMatchMessage)).toBeNull();
  });

  it("runs a Tool found by search the same way as from the Category list", async () => {
    let finish!: (r: RunResult) => void;
    const ran: string[] = [];
    const { bridge, emit } = fakeBridge(zoo, {
      runTool: (toolId) => {
        ran.push(toolId);
        return new Promise<RunResult>((resolve) => (finish = resolve));
      },
    });
    render(<App bridge={bridge} />);
    await search("printer");

    await open("Clear print queue");
    const button = runButton();
    fireEvent.click(button);

    expect(ran).toEqual(["spool"]);
    expect(button.disabled).toBe(true);
    act(() => emit("spool", "Spooler stopped\n"));
    expect(screen.getByText(/Spooler stopped/)).toBeTruthy();

    await act(async () => finish({ ok: true, failedStep: null, exitCode: 0 }));
    expect(screen.getByText(/finished/i)).toBeTruthy();
  });

  it("keeps a Tool's output and result when a search hides the Tool and then shows it again", async () => {
    const { bridge, emit } = fakeBridge(zoo, {
      runTool: async (toolId) => {
        emit(toolId, "Spooler stopped\n");
        return { ok: true, failedStep: null, exitCode: 0 };
      },
    });
    render(<App bridge={bridge} />);
    await open("Clear print queue");
    pressRun();
    await screen.findByText(/finished/i);

    await search("dns");
    // The open Tool stays open in its panel; only the list is narrowed.
    expect(shownTools()).toEqual(["Flush DNS cache"]);
    await search("");

    expect(within(toolPanel()).getByText(/Spooler stopped/)).toBeTruthy();
    expect(within(toolPanel()).getByText(/finished/i)).toBeTruthy();
  });
});
