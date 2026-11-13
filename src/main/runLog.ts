import fs from "node:fs";
import path from "node:path";
import type { RunLogEntry } from "../shared/types";

export const RUN_LOG_FILE = "run-log.json";

/** The saved Run log never holds more than this many Runs; older ones are dropped. */
const MAX_ENTRIES = 200;

export interface RunLog {
  /** Past Runs, newest first. */
  entries(): RunLogEntry[];
  add(entry: RunLogEntry): void;
}

const isText = (value: unknown): value is string => typeof value === "string";

function isEntry(value: unknown): value is RunLogEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  const result = entry.result as Record<string, unknown> | null | undefined;
  return (
    isText(entry.toolId) &&
    isText(entry.toolName) &&
    isText(entry.startedAt) &&
    isText(entry.endedAt) &&
    Array.isArray(entry.commands) &&
    entry.commands.every(isText) &&
    isText(entry.output) &&
    typeof result === "object" &&
    result !== null &&
    typeof result.ok === "boolean"
  );
}

/** A missing, unreadable or damaged file gives an empty log: the app must still start. */
function load(file: string): RunLogEntry[] {
  try {
    const saved: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(saved) ? saved.filter(isEntry).slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function save(file: string, entries: RunLogEntry[]): void {
  // Written beside the log and then renamed over it, so a crash mid-write cannot
  // leave half a file behind.
  const draft = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(draft, JSON.stringify(entries, null, 2), "utf8");
    fs.renameSync(draft, file);
  } catch (err) {
    // A Run that finished must not be reported as failed because its log entry
    // could not be saved; the entry stays listed until the app closes.
    console.error(`Could not save the Run log to ${file}:`, err);
    fs.rmSync(draft, { force: true });
  }
}

/**
 * The Run log, saved as one file in `folder` and loaded from it once, here.
 * Without a folder the log lives only as long as the app is open.
 */
export function createRunLog(folder?: string): RunLog {
  const file = folder === undefined ? null : path.join(folder, RUN_LOG_FILE);
  // Oldest first, as saved.
  let entries = file === null ? [] : load(file);

  return {
    entries: () => [...entries].reverse(),
    add(entry) {
      entries = [...entries, entry].slice(-MAX_ENTRIES);
      if (file !== null) save(file, entries);
    },
  };
}
