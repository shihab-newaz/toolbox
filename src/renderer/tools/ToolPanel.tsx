import { useEffect, useRef } from "react";
import "./tools.css";
import type { Tool } from "@shared/types";
import { RiskChip, RISK_SUMMARY } from "./RiskChip";
import { isRunning, type RunState } from "./runState";

function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** The outcome of the latest Run: one line a person can read, then what the Run took. */
function RunResultSummary({ state }: { state: RunState }) {
  const { result, startedAt, endedAt } = state;
  if (result === null) return null;
  const step = result.failedStep !== null ? ` at Step ${result.failedStep + 1}` : "";
  const code = result.exitCode !== null ? ` (exit code ${result.exitCode})` : "";
  return (
    <div className={`run-result ${result.ok ? "result-ok" : "result-failed"}`} role="status">
      <p className="result-title">{result.ok ? "Finished" : `Failed${step}${code}`}</p>
      {result.error && <p>{result.error}</p>}
      {endedAt !== null && (
        <p className="muted">
          Took {duration(endedAt - startedAt)} · ended at{" "}
          {new Date(endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}

/** The right pane: the selected Tool, its Run button, and its output. */
export function ToolPanel({
  tool,
  state,
  onRun,
}: {
  tool: Tool | null;
  state: RunState | undefined;
  onRun: () => void;
}) {
  const outputRef = useRef<HTMLPreElement>(null);
  const outputLength = state?.output.length ?? 0;
  useEffect(() => {
    // Follow live output to its newest line.
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [outputLength]);

  if (tool === null) {
    return (
      <section className="tool-panel empty" aria-label="Tool panel">
        <h2>Pick a Tool to get started</h2>
        <p className="muted">Choose something from the list on the left. Nothing runs until you press Run.</p>
      </section>
    );
  }

  const running = isRunning(state);
  return (
    <section className="tool-panel" aria-label="Tool panel">
      <header className="panel-head">
        <h2>{tool.name}</h2>
        <RiskChip risk={tool.risk} />
      </header>
      <p className="muted">{RISK_SUMMARY[tool.risk]}</p>
      <p>{tool.description}</p>
      <div className="panel-actions">
        <button type="button" className="primary" onClick={onRun} disabled={running}>
          {running ? "Running…" : state?.result ? "Run again" : "Run"}
        </button>
      </div>
      {state && <RunResultSummary state={state} />}
      <h3>Output</h3>
      {state ? (
        <pre ref={outputRef} className="output">
          {state.output.map((e) => e.text).join("")}
        </pre>
      ) : (
        <p className="muted">Nothing yet. Press Run and the result will appear here.</p>
      )}
    </section>
  );
}
