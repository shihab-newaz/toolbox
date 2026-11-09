import { spawn, spawnSync } from "node:child_process";

/** `net session` succeeds only in an elevated (administrator) process. */
export function isElevated(): boolean {
  return spawnSync("net", ["session"], { windowsHide: true }).status === 0;
}

/**
 * Starts this same app again through a UAC prompt. The caller should quit
 * afterwards so the user ends up with a single, elevated window.
 */
export function relaunchElevated(exePath: string, args: string[]): void {
  const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const argList = args.map(quote).join(",");
  const command =
    `Start-Process -FilePath ${quote(exePath)} ` +
    (args.length > 0 ? `-ArgumentList ${argList} ` : "") +
    "-Verb RunAs";
  spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}
