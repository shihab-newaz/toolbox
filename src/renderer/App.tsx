import { useEffect, useRef, useState } from "react";
import type { Manifest, OutputEvent, RunResult, ToolboxBridge } from "../shared/types";
import { RunLogPanel } from "./RunLogPanel";

interface RunState {
  output: OutputEvent[];
  result: RunResult | null;
}

export function App({ bridge }: { bridge: ToolboxBridge }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [runs, setRuns] = useState<Record<string, RunState>>({});

  const [loadError, setLoadError] = useState<string | null>(null);
  // Counts Runs that have ended, so the log panel knows when to read the Run log again.
  const [endedRuns, setEndedRuns] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    bridge
      .getManifest()
      .then(setManifest)
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : String(err)),
      );
  }, [bridge]);

  useEffect(
    () =>
      bridge.onOutput((toolId, event) =>
        setRuns((prev) => {
          const run = prev[toolId] ?? { output: [], result: null };
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
    setRuns((prev) => ({ ...prev, [toolId]: { output: [], result: null } }));
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
    setRuns((prev) => ({
      ...prev,
      [toolId]: { output: prev[toolId]?.output ?? [], result },
    }));
  }

  const needle = query.trim().toLowerCase();
  const contains = (text: string) => text.toLowerCase().includes(needle);
  const visibleCategories = (manifest?.categories ?? [])
    .map((category) => ({
      ...category,
      tools: category.tools.filter((tool) => contains(tool.name) || contains(tool.description)),
    }))
    .filter((category) => needle === "" || category.tools.length > 0);

  return (
    <main>
      {loadError && (
        <div role="alert">
          <p>Could not load the Manifest</p>
          <p>{loadError}</p>
        </div>
      )}
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
      {needle !== "" && visibleCategories.length === 0 && (
        <p>No Tool matches "{query.trim()}"</p>
      )}
      {visibleCategories.map((category) => (
        <section key={category.id}>
          <h2>{category.name}</h2>
          <ul>
            {category.tools.map((tool) => {
              const state = runs[tool.id];
              return (
                <li key={tool.id}>
                  <span>{tool.name}</span>
                  <button
                    onClick={() =>
                      tool.risk === "read-only" ? run(tool.id, false) : setConfirming(tool.id)
                    }
                    disabled={state !== undefined && state.result === null}
                  >
                    Run
                  </button>
                  <p className="meta">{tool.description}</p>
                  <p className="meta">Risk: {tool.risk}</p>
                  {confirming === tool.id && (
                    <div role="dialog" aria-label={`Confirm ${tool.name}`} className="confirm">
                      <p>Running this Tool will execute:</p>
                      {tool.steps.map((step, index) =>
                        step.kind === "command" ? (
                          <pre key={index}>{step.command}</pre>
                        ) : (
                          <p key={index}>Pause: {step.message}</p>
                        ),
                      )}
                      <button
                        onClick={() => {
                          setConfirming(null);
                          run(tool.id, true);
                        }}
                      >
                        Confirm
                      </button>
                      <button className="secondary" onClick={() => setConfirming(null)}>
                        Cancel
                      </button>
                    </div>
                  )}
                  {state && (
                    <>
                      <pre>{state.output.map((e) => e.text).join("")}</pre>
                      {state.result?.ok && <p>Finished</p>}
                      {state.result && !state.result.ok && (
                        <>
                          <p>
                            Failed
                            {state.result.exitCode !== null &&
                              ` (exit code ${state.result.exitCode})`}
                          </p>
                          {state.result.error && <p>{state.result.error}</p>}
                        </>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <RunLogPanel bridge={bridge} refreshKey={endedRuns} />
    </main>
  );
}
