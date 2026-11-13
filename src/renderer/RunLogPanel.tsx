import { useEffect, useState } from "react";
import type { RunLogEntry, ToolboxBridge } from "../shared/types";

const localTime = (iso: string) => new Date(iso).toLocaleString();

function resultText({ result }: RunLogEntry): string {
  if (result.ok) return "Succeeded";
  const step = result.failedStep !== null ? ` at Step ${result.failedStep + 1}` : "";
  const exitCode = result.exitCode !== null ? ` (exit code ${result.exitCode})` : "";
  return `Failed${step}${exitCode}`;
}

/** A Run's log entry as plain text, for pasting to whoever is helping. */
function entryText(entry: RunLogEntry): string {
  return [
    `Tool: ${entry.toolName}`,
    `Started: ${localTime(entry.startedAt)}`,
    `Ended: ${localTime(entry.endedAt)}`,
    `Result: ${resultText(entry)}`,
    ...(entry.result.error ? [`Error: ${entry.result.error}`] : []),
    "Commands:",
    ...entry.commands,
    "Output:",
    entry.output,
  ].join("\n");
}

/**
 * Lists the Run log, newest Run first. Reads it again whenever `refreshKey`
 * changes, which is how a Run that just finished gets in.
 */
export function RunLogPanel({ bridge, refreshKey }: { bridge: ToolboxBridge; refreshKey: number }) {
  const [entries, setEntries] = useState<RunLogEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copy, setCopy] = useState<{ entry: RunLogEntry; ok: boolean } | null>(null);

  useEffect(() => {
    // Two reads can overlap when Runs finish close together; only the latest may land.
    let latest = true;
    bridge
      .getRunLog()
      .then((log) => {
        if (!latest) return;
        setEntries(log);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (latest) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      latest = false;
    };
  }, [bridge, refreshKey]);

  async function copyEntry(entry: RunLogEntry) {
    let ok = true;
    try {
      await navigator.clipboard.writeText(entryText(entry));
    } catch {
      ok = false;
    }
    setCopy({ entry, ok });
  }

  return (
    <section className="run-log" aria-labelledby="run-log-heading">
      <h2 id="run-log-heading">Run log</h2>
      {loadError && (
        <div role="alert">
          <p>Could not load the Run log</p>
          <p>{loadError}</p>
        </div>
      )}
      {!loadError && entries.length === 0 && <p className="meta">No Runs yet</p>}
      <ul>
        {entries.map((entry) => (
          <li key={`${entry.startedAt} ${entry.toolId}`}>
            <span>{entry.toolName}</span>
            <button onClick={() => copyEntry(entry)}>
              {copy?.entry === entry && copy.ok ? "Copied" : "Copy"}
            </button>
            {copy?.entry === entry && !copy.ok && <p>Could not copy this entry</p>}
            <p>{resultText(entry)}</p>
            <p className="meta">
              Started {localTime(entry.startedAt)} · Ended {localTime(entry.endedAt)}
            </p>
            <pre>{entry.commands.join("\n")}</pre>
            <pre>{entry.output}</pre>
            {entry.result.error && <p>{entry.result.error}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
