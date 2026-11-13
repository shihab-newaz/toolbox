import type { VersionInfo } from "../shared/types";

// Windows 10 and 11 both report release 10.0.x; the build number tells them apart.
const FIRST_WINDOWS_11_BUILD = 22000;

function describeWindows(osRelease: string): string {
  const match = /^10\.0\.(\d+)/.exec(osRelease);
  if (!match) return osRelease ? `Windows ${osRelease}` : "Windows";
  const build = Number(match[1]);
  return `Windows ${build >= FIRST_WINDOWS_11_BUILD ? 11 : 10} (build ${build})`;
}

/** The versions the window shows, so a user can report them when asking for help. */
export function getVersionInfo(source: { appVersion: string; osRelease: string }): VersionInfo {
  return { app: source.appVersion, windows: describeWindows(source.osRelease) };
}
