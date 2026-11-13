import { spawn, spawnSync } from "node:child_process";

/** `net session` succeeds only in an elevated (administrator) process. */
export function isElevated(): boolean {
  return spawnSync("net", ["session"], { windowsHide: true }).status === 0;
}

export type AccountResult = { ok: true; account: string } | { ok: false; error: string };

export interface WhoamiResult {
  exitCode: number | null;
  output: string;
  error?: string;
}

function runWhoami(): WhoamiResult {
  // latin1 keeps every byte apart, so two different names never read as the same text.
  const run = spawnSync("whoami", [], { windowsHide: true, encoding: "latin1" });
  return { exitCode: run.status, output: run.stdout ?? "", error: run.error?.message };
}

/** The Windows account this process runs as, in `whoami` form: `machine-or-domain\name`. */
export function currentAccount(execute: () => WhoamiResult = runWhoami): AccountResult {
  const { exitCode, output, error } = execute();
  const account = output.trim();
  if (exitCode === 0 && account !== "") return { ok: true, account };
  const reason = error ?? (exitCode === 0 ? "whoami printed nothing" : `whoami exited with code ${exitCode}`);
  return { ok: false, error: `Could not read the Windows account: ${reason}` };
}

/** Development flag: run unelevated, with no relaunch and no account check. */
const NO_ELEVATE_FLAG = "--no-elevate";
/** Marks the copy relaunched through UAC, so it never relaunches again. */
const ELEVATED_FLAG = "--elevated";
/** Tells the elevated copy which Windows account started the app. */
const STARTED_BY_PREFIX = "--started-by=";

export type LaunchDecision =
  | { action: "open" }
  | { action: "relaunch"; args: string[] }
  | { action: "refuse"; title: string; message: string };

const sameAccount = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const refuse = (message: string): LaunchDecision => ({
  action: "refuse",
  title: "Toolbox cannot run from this account",
  message,
});

/**
 * What this copy of the app does at launch: open the window, relaunch through UAC
 * with `args`, or refuse to run. UAC switches to another account when a standard
 * user types an administrator's password; the Tools would then act on that other
 * account's files, so the elevated copy refuses (ADR 0001).
 */
export function decideLaunch(
  argv: string[],
  system: { isElevated: () => boolean; currentAccount: () => AccountResult } = {
    isElevated,
    currentAccount,
  },
): LaunchDecision {
  if (argv.includes(NO_ELEVATE_FLAG)) return { action: "open" };

  if (!argv.includes(ELEVATED_FLAG)) {
    if (system.isElevated()) return { action: "open" };
    const current = system.currentAccount();
    if (!current.ok) return refuse(current.error);
    return { action: "relaunch", args: [ELEVATED_FLAG, STARTED_BY_PREFIX + current.account] };
  }

  const startedBy = argv
    .find((arg) => arg.startsWith(STARTED_BY_PREFIX))
    ?.slice(STARTED_BY_PREFIX.length)
    .trim();
  if (!startedBy) {
    return refuse("Toolbox was not told which Windows account started it. Start Toolbox again.");
  }
  const current = system.currentAccount();
  if (!current.ok) return refuse(current.error);
  if (sameAccount(startedBy, current.account)) return { action: "open" };
  return refuse(
    `Toolbox was started by the Windows account ${startedBy}, but Windows gave it ` +
      `administrator rights as ${current.account}. Its Tools would act on that other ` +
      "account's files, so Toolbox will not run.\n\n" +
      "Standard accounts are not supported. Sign in to Windows with an administrator account " +
      "and start Toolbox there.",
  );
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
