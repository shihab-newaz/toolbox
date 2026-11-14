import { useEffect, useState } from "react";
import type { RiskLevel, RunLogEntry, ToolboxBridge } from "@shared/types";
import { RiskChip } from "../tools/RiskChip";
import "./runlog.css";

const localTime = (iso: string) => new Date(iso).toLocaleString();

function resultText({ result }: RunLogEntry): string {
  if (result.ok) return "Succeeded";
  const step = result.failedStep !== null ? ` at Step ${result.failedStep + 1}` : "";
  const exitCode = result.exitCode !== null ? ` (exit code ${result.exitCode})` : "";
  return `Failed${step}${exitCode}`;
}

/** "Today, 12:43", "Yesterday, 18:05", or the date for older Runs. */
function whenText(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (daysAgo === 0) return `Today, ${time}`;
  if (daysAgo === 1) return `Yesterday, ${time}`;
  return `${at.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

function tookText(entry: RunLogEntry): string {
  const seconds = Math.max(0, Math.round((Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** A Run's log entry as plain text, for pasting to whoever is helping. */
function entryText(entry: RunLogEntry): string {
  return [
    `Tool: ${entry.toolName}`,
    `Started: ${localTime(entry.startedAt)} (${entry.startedAt})`,
    `Ended: ${localTime(entry.endedAt)} (${entry.endedAt})`,
    `Result: ${resultText(entry)}`,
    ...(entry.result.error ? [`Error: ${entry.result.error}`] : []),
    "Commands:",
    ...entry.commands,
    "Output:",
    entry.output,
  ].join("\n");
}

/**
 * The Run log as a view of its own: past Runs on the left, newest first, and
 * the chosen Run on the right. Reads the Run log again whenever `refreshKey`
 * changes. `riskOf` gives a Tool's Risk level, or undefined for a Tool the
 * Manifest no longer has.
 */
export function RunLogView({
  bridge,
  refreshKey,
  riskOf,
  onBack,
}: {
  bridge: ToolboxBridge;
  refreshKey: number;
  riskOf: (toolId: string) => RiskLevel | undefined;
  onBack: () => void;
}) {
  const [entries, setEntries] = useState<RunLogEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState(0);
  const [copy, setCopy] = useState<{ entry: RunLogEntry; ok: boolean } | null>(null);

  useEffect(() => {
    // Two reads can overlap when Runs finish close together; only the latest may land.
    let latest = true;
    bridge
      .getRunLog()
      .then((log) => {
        if (!latest) return;
        setEntries(log);
        setChosen(0);
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

  const entry = entries[chosen];
  return (
    <section className="run-log" aria-label="Run log">
      {loadError && (
        <div role="alert" className="log-alert">
          <p>Could not load the Run log</p>
          <p>{loadError}</p>
        </div>
      )}
      {!loadError && entries.length === 0 && (
        <div className="log-empty">
          <h2>No Runs yet</h2>
          <p className="muted">
            When you run a Tool, a record of it shows up here, so you can look back at what happened.
          </p>
          <button type="button" className="secondary" onClick={onBack}>
            Back to Tools
          </button>
        </div>
      )}
      {entries.length > 0 && entry && (
        <>
          <ul className="log-list" aria-label="Past Runs">
            {entries.map((item, index) => {
              const risk = riskOf(item.toolId);
              return (
                // By position: Runs can share a start time and Tool, and a row holds no state of its own.
                <li key={index}>
                  <button
                    type="button"
                    className={`log-row${index === chosen ? " selected" : ""}`}
                    aria-pressed={index === chosen}
                    onClick={() => setChosen(index)}
                  >
                    <span className="log-row-text">
                      <span className="log-tool">{item.toolName}</span>
                      <span className="log-when">
                        {whenText(item.startedAt)} · {item.result.ok ? "Succeeded" : "Failed"}
                      </span>
                    </span>
                    {risk && <RiskChip risk={risk} />}
                  </button>
                </li>
              );
            })}
          </ul>
          <section className="log-detail" aria-label="Run details">
            <header className="panel-head">
              <h2>{entry.toolName}</h2>
              {riskOf(entry.toolId) && <RiskChip risk={riskOf(entry.toolId)!} />}
              <button type="button" className="secondary" onClick={() => copyEntry(entry)}>
                {copy?.entry === entry && copy.ok ? "Copied" : "Copy"}
              </button>
            </header>
            {copy?.entry === entry && !copy.ok && <p className="copy-failed">Could not copy this entry</p>}
            <p className={entry.result.ok ? "log-result" : "log-result log-result-failed"}>{resultText(entry)}</p>
            <p className="muted">
              Started {localTime(entry.startedAt)} · Ended {localTime(entry.endedAt)} · took {tookText(entry)}
            </p>
            {entry.result.error && <p>{entry.result.error}</p>}
            <h3>Commands</h3>
            <pre className="log-commands">{entry.commands.join("\n")}</pre>
            <h3>Output</h3>
            <pre className="log-output">{entry.output}</pre>
          </section>
        </>
      )}
    </section>
  );
}
