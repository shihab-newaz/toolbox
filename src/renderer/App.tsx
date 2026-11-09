import { useEffect, useRef, useState } from "react";
import type { Manifest, OutputEvent, RunResult, ToolboxBridge } from "../shared/types";

interface RunState {
  output: OutputEvent[];
  result: RunResult | null;
}

export function App({ bridge }: { bridge: ToolboxBridge }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [runs, setRuns] = useState<Record<string, RunState>>({});

  const [loadError, setLoadError] = useState<string | null>(null);

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

  async function run(toolId: string) {
    if (inFlight.current.has(toolId)) return;
    inFlight.current.add(toolId);
    setRuns((prev) => ({ ...prev, [toolId]: { output: [], result: null } }));
    let result: RunResult;
    try {
      result = await bridge.runTool(toolId);
    } catch (err) {
      result = {
        ok: false,
        failedStep: null,
        exitCode: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    inFlight.current.delete(toolId);
    setRuns((prev) => ({
      ...prev,
      [toolId]: { output: prev[toolId]?.output ?? [], result },
    }));
  }

  return (
    <main>
      {loadError && (
        <div role="alert">
          <p>Could not load the Manifest</p>
          <p>{loadError}</p>
        </div>
      )}
      {manifest?.categories.map((category) => (
        <section key={category.id}>
          <h2>{category.name}</h2>
          <ul>
            {category.tools.map((tool) => {
              const state = runs[tool.id];
              return (
                <li key={tool.id}>
                  <span>{tool.name}</span>
                  <button
                    onClick={() => run(tool.id)}
                    disabled={
                      tool.risk !== "read-only" ||
                      (state !== undefined && state.result === null)
                    }
                  >
                    Run
                  </button>
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
    </main>
  );
}
