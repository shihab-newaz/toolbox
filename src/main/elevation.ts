import { spawn, spawnSync } from "node:child_process";

/** `net session` succeeds only in an elevated (administrator) process. */
export function isElevated(): boolean {
  return spawnSync("net", ["session"], { windowsHide: true }).status === 0;
}

export type RelaunchResult = { ok: true } | { ok: false; error: string };

export interface ExecuteResult {
  exitCode: number | null;
  error?: string;
}

/** Quotes one argument the way Windows (CommandLineToArgvW) splits a command line. */
function quoteWindowsArg(arg: string): string {
  if (arg !== "" && !/[\s"]/.test(arg)) return arg;
  let quoted = '"';
  let backslashes = 0;
  for (const ch of arg) {
    if (ch === "\\") {
      backslashes++;
    } else if (ch === '"') {
      quoted += "\\".repeat(backslashes * 2 + 1) + '"';
      backslashes = 0;
    } else {
      quoted += "\\".repeat(backslashes) + ch;
      backslashes = 0;
    }
  }
  return quoted + "\\".repeat(backslashes * 2) + '"';
}

// PowerShell treats the typographic quotes U+2018, U+2019, U+201A and U+201B as
// single quotes too; each one inside a single-quoted string must be doubled.
const psQuote = (s: string) => `'${s.replace(/['‘’‚‛]/g, (c) => c + c)}'`;

/**
 * The PowerShell command that starts `exePath` with `args`. Start-Process joins
 * array items with spaces and never quotes them, so the arguments are quoted
 * here into one string: a path with a space stays one argument.
 */
export function buildStartProcessCommand(
  exePath: string,
  args: string[],
  options: { runAs: boolean },
): string {
  return (
    `Start-Process -FilePath ${psQuote(exePath)}` +
    (args.length > 0 ? ` -ArgumentList ${psQuote(args.map(quoteWindowsArg).join(" "))}` : "") +
    (options.runAs ? " -Verb RunAs" : "")
  );
}

function runPowerShell(command: string): Promise<ExecuteResult> {
  return new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text: string) => (stderr += text));
    child.on("error", (err) => resolve({ exitCode: null, error: err.message }));
    child.on("close", (code) => resolve({ exitCode: code, error: stderr.trim() || undefined }));
  });
}

/**
 * PowerShell's error text is the reason on its first line, followed by line numbers,
 * a caret underline and category fields. Keep the reason, without its
 * "Start-Process :" and "This command cannot be run due to the error:" prefixes.
 */
function firstLineOfReason(error: string): string {
  const first = error.split(/\r?\n/).find((line) => line.trim() !== "") ?? error;
  return first
    .replace(/^Start-Process\s*:\s*/, "")
    .replace(/^This command cannot be run due to the error:\s*/, "")
    .trim();
}

/**
 * Starts this same app again through a UAC prompt and reports whether Windows
 * accepted it. Declining the prompt makes PowerShell exit non-zero.
 */
export async function relaunchElevated(
  exePath: string,
  args: string[],
  execute: (command: string) => Promise<ExecuteResult> = runPowerShell,
): Promise<RelaunchResult> {
  const { exitCode, error } = await execute(
    buildStartProcessCommand(exePath, args, { runAs: true }),
  );
  if (exitCode === 0) return { ok: true };
  const reason = error ? firstLineOfReason(error) : `PowerShell exited with code ${exitCode}`;
  return { ok: false, error: `Could not relaunch with administrator rights: ${reason}` };
}
