import { useEffect, useRef, useState } from "react";
import type { Manifest, RunResult, ToolboxBridge, VersionInfo } from "@shared/types";
import { RunLogView } from "../runlog/RunLogView";
import { ConfirmDialog } from "../tools/ConfirmDialog";
import { ToolList } from "../tools/ToolList";
import { ToolPanel } from "../tools/ToolPanel";
import type { RunState } from "../tools/runState";
import "./app.css";

export function App({ bridge }: { bridge: ToolboxBridge }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [runs, setRuns] = useState<Record<string, RunState>>({});

  const [loadError, setLoadError] = useState<string | null>(null);
  // Counts Runs that have ended, so the Run log view knows when to read the Run log again.
  const [endedRuns, setEndedRuns] = useState(0);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"tools" | "run-log">("tools");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Read when a Run ends: a Run that ends in the Tool panel on screen has been seen.
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  useEffect(() => {
    bridge
      .getManifest()
      .then(setManifest)
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : String(err)),
      );
  }, [bridge]);

  const [versions, setVersions] = useState<VersionInfo | null>(null);

  useEffect(() => {
    // The versions are only for reporting; the Toolbox works without them.
    bridge.getVersions().then(setVersions, () => undefined);
  }, [bridge]);

  useEffect(
    () =>
      bridge.onOutput((toolId, event) =>
        setRuns((prev) => {
          const run = prev[toolId] ?? {
            output: [],
            result: null,
            startedAt: Date.now(),
            endedAt: null,
            viewed: false,
          };
          return { ...prev, [toolId]: { ...run, output: [...run.output, event] } };
        }),
      ),
    [bridge],
  );

  // A ref, not state: two clicks before React re-renders must not both start the Tool.
  const inFlight = useRef(new Set<string>());

  // The id of the Tool whose confirmation is open, if any.
  const [confirming, setConfirming] = useState<string | null>(null);

  async function run(toolId: string, confirmed: boolean) {
    if (inFlight.current.has(toolId)) return;
    inFlight.current.add(toolId);
    setRuns((prev) => ({
      ...prev,
      [toolId]: { output: [], result: null, startedAt: Date.now(), endedAt: null, viewed: false },
    }));
    let result: RunResult;
    try {
      result = await bridge.runTool(toolId, confirmed);
    } catch (err) {
      result = {
        ok: false,
        failedStep: null,
        exitCode: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    inFlight.current.delete(toolId);
    setEndedRuns((count) => count + 1);
    setRuns((prev) => {
      const run = prev[toolId];
      return {
        ...prev,
        [toolId]: {
          output: run?.output ?? [],
          result,
          startedAt: run?.startedAt ?? Date.now(),
          endedAt: Date.now(),
          viewed: selectedRef.current === toolId,
        },
      };
    });
  }

  function select(toolId: string) {
    setSelectedId(toolId);
    // Choosing a Tool is looking at its latest Run.
    setRuns((prev) => {
      const run = prev[toolId];
      return run && run.result !== null && !run.viewed
        ? { ...prev, [toolId]: { ...run, viewed: true } }
        : prev;
    });
  }

  const allTools = (manifest?.categories ?? []).flatMap((category) => category.tools);
  const selectedTool = allTools.find((tool) => tool.id === selectedId) ?? null;
  const confirmingTool = allTools.find((tool) => tool.id === confirming) ?? null;

  const needle = query.trim().toLowerCase();
  const contains = (text: string) => text.toLowerCase().includes(needle);
  const visibleCategories = (manifest?.categories ?? [])
    .map((category) => ({
      ...category,
      tools: category.tools.filter((tool) => contains(tool.name) || contains(tool.description)),
    }))
    .filter((category) => needle === "" || category.tools.length > 0);

  // While a confirmation is open, nothing behind it can be reached or focused.
  const backgroundInert = confirmingTool !== null;

  return (
    <div className="window">
      <header className="topbar" inert={backgroundInert}>
        {view === "tools" ? (
          <>
            <h1>Toolbox</h1>
            {manifest && (
              <input
                className="search"
                type="search"
                aria-label="Search Tools"
                placeholder="Search Tools"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            <button type="button" className="secondary" onClick={() => setView("run-log")}>
              Run log
            </button>
          </>
        ) : (
          <>
            <button type="button" className="secondary" onClick={() => setView("tools")}>
              Tools
            </button>
            <h1>Run log</h1>
          </>
        )}
      </header>
      {view === "tools" ? (
        <div className="panes" inert={backgroundInert}>
          <div className="list-pane">
            {loadError && (
              <div role="alert">
                <p>Could not load the Manifest</p>
                <p>{loadError}</p>
              </div>
            )}
            <ToolList
              categories={visibleCategories}
              runs={runs}
              selectedId={selectedId}
              onSelect={select}
              noMatchFor={needle !== "" && visibleCategories.length === 0 ? query.trim() : null}
            />
          </div>
          <ToolPanel
            tool={selectedTool}
            state={selectedTool ? runs[selectedTool.id] : undefined}
            onRun={() => {
              if (!selectedTool) return;
              if (selectedTool.risk === "read-only") run(selectedTool.id, false);
              else setConfirming(selectedTool.id);
            }}
          />
        </div>
      ) : (
        <div className="log-view" inert={backgroundInert}>
          <RunLogView
            bridge={bridge}
            refreshKey={endedRuns}
            riskOf={(toolId) => allTools.find((tool) => tool.id === toolId)?.risk}
            onBack={() => setView("tools")}
          />
        </div>
      )}
      {versions && (
        <footer className="statusbar" inert={backgroundInert}>
          Toolbox {versions.app} · {versions.windows}
        </footer>
      )}
      {confirmingTool && (
        <ConfirmDialog
          tool={confirmingTool}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            run(confirmingTool.id, true);
          }}
        />
      )}
    </div>
  );
}
