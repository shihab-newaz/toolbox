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

  it("shows each Tool's description and its Risk level", async () => {
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
    for (const [name, risk] of [["Peek", "read-only"], ["Tidy", "normal"], ["Purge", "high"]]) {
      const row = screen.getByText(name!).closest("li")!;
      expect(within(row).getByText(`Risk: ${risk}`)).toBeTruthy();
    }
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

  it("starts a Tool once even when two clicks land before the screen can re-render", async () => {
    let started = 0;
    const { bridge } = fakeBridge(
      { categories: [{ id: "c", name: "Disk", tools: [tool("space", "Free-space check")] }] },
      {
        runTool: () => {
          started += 1;
          return new Promise<RunResult>(() => {});
        },
      },
    );
    render(<App bridge={bridge} />);

    const row = (await screen.findByText("Free-space check")).closest("li")!;
    const button = within(row).getByRole("button", { name: "Run" }) as HTMLButtonElement;
    // Both clicks run inside one act(): React cannot re-render (and disable the button) between them.
    act(() => {
      button.click();
      button.click();
    });

    expect(started).toBe(1);
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

  const shownTools = () =>
    screen.queryAllByRole("listitem").map((row) => row.querySelector("span")!.textContent);
  const noMatchMessage = /no tool matches/i;
  const shownCategories = () => screen.queryAllByRole("heading", { level: 2 }).map((h) => h.textContent);

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

    const row = screen.getByText("Clear print queue").closest("li")!;
    const button = within(row).getByRole("button", { name: "Run" }) as HTMLButtonElement;
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
    const row = (await screen.findByText("Clear print queue")).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Run" }));
    await screen.findByText(/finished/i);

    await search("dns");
    expect(screen.queryByText(/Spooler stopped/)).toBeNull();
    await search("");

    const shownAgain = screen.getByText("Clear print queue").closest("li")!;
    expect(within(shownAgain).getByText(/Spooler stopped/)).toBeTruthy();
    expect(within(shownAgain).getByText(/finished/i)).toBeTruthy();
  });
});
