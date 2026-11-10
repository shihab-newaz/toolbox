import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildStartProcessCommand, relaunchElevated } from "./elevation";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * Starts Node through the real PowerShell command with `args` and returns the
 * arguments it received. A folder with a space in its name stands in for
 * "Program Files" or "My Apps".
 */
async function argsReceivedBy(args: string[]): Promise<{ received: string[]; dir: string }> {
  const dir = mkdtempSync(path.join(tmpdir(), "toolbox space "));
  tempDirs.push(dir);
  const script = path.join(dir, "argv script.js");
  const out = path.join(dir, "out.json");
  writeFileSync(
    script,
    'require("fs").writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)))',
  );

  const command = buildStartProcessCommand(process.execPath, [script, out, ...args], {
    runAs: false,
  });
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    windowsHide: true,
  });
  // The child creates the file before it finishes writing it: wait for complete JSON.
  for (let i = 0; i < 100; i++) {
    if (existsSync(out)) {
      try {
        return { received: JSON.parse(readFileSync(out, "utf8")), dir };
      } catch {
        // still being written
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("the started process never wrote its arguments");
}

describe("buildStartProcessCommand", () => {
  it("passes each argument through intact, including paths with spaces and quotes", async () => {
    const args = [
      "C:\\My Apps\\toolbox",
      "--elevated",
      'say "hi"',
      "trailing\\",
      "it's here",
      "C:\\dir with space\\",
    ];

    const { received } = await argsReceivedBy(args);

    expect(received).toEqual(args);
  }, 20000);

  it("treats typographic single quotes in an argument as plain text, never as a quote mark or code", async () => {
    // PowerShell reads U+2018, U+2019, U+201A and U+201B as single quotes too.
    const marker = path.join(tmpdir(), `toolbox-injected-${process.pid}.txt`);
    tempDirs.push(marker);
    const args = [
      "C:\\Bob’s Tools\\app",
      "a‘b‚c‛d",
      `x’; Set-Content -LiteralPath '${marker}' -Value pwned; ’y`,
    ];

    const { received } = await argsReceivedBy(args);

    expect(received).toEqual(args);
    expect(existsSync(marker)).toBe(false);
  }, 20000);

  it("keeps a typographic quote in the program path from breaking the command", () => {
    const command = buildStartProcessCommand("C:\\Bob’s Tools\\no-such-app.exe", [], {
      runAs: false,
    });
    const run = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { windowsHide: true, encoding: "utf8" },
    );

    // It must get as far as looking for the program, not fail to parse the command.
    expect(run.stderr).toMatch(/cannot find the file/i);
    expect(run.stderr).not.toMatch(/terminator|ParserError|unexpected token/i);
  }, 20000);

  it("leaves out -ArgumentList when there are no arguments", () => {
    expect(buildStartProcessCommand("app.exe", [], { runAs: false })).not.toContain("-ArgumentList");
  });

  it("asks for administrator rights only when runAs is set", () => {
    expect(buildStartProcessCommand("app.exe", ["a"], { runAs: true })).toContain("-Verb RunAs");
    expect(buildStartProcessCommand("app.exe", ["a"], { runAs: false })).not.toContain("RunAs");
  });
});

describe("relaunchElevated", () => {
  it("reports ok when PowerShell started the elevated copy", async () => {
    const result = await relaunchElevated("app.exe", ["x"], async () => ({ exitCode: 0 }));

    expect(result).toEqual({ ok: true });
  });

  it("reports that rights were not granted when PowerShell exits non-zero, with its message", async () => {
    const result = await relaunchElevated("app.exe", ["x"], async () => ({
      exitCode: 1,
      error: "The operation was canceled by the user.",
    }));

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringMatching(/administrator rights.*canceled by the user/is) });
  });

  it("shows only the reason from PowerShell's error, not its line numbers and category text", async () => {
    const raw = [
      "Start-Process : This command cannot be run due to the error: The operation was canceled by the user.",
      "At line:1 char:1",
      "+ Start-Process -FilePath 'C:\\Projects\\toolbox\\node_modules\\electron\\di ...",
      "+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
      "    + CategoryInfo          : InvalidOperation: (:) [Start-Process], InvalidOperationException",
      "    + FullyQualifiedErrorId : InvalidOperationException,Microsoft.PowerShell.Commands.StartProcessCommand",
    ].join("\r\n");

    const result = await relaunchElevated("app.exe", ["x"], async () => ({ exitCode: 1, error: raw }));

    expect(result).toEqual({
      ok: false,
      error: "Could not relaunch with administrator rights: The operation was canceled by the user.",
    });
  });

  it("reports a failure to start PowerShell at all", async () => {
    const result = await relaunchElevated("app.exe", ["x"], async () => ({
      exitCode: null,
      error: "spawn powershell.exe ENOENT",
    }));

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringMatching(/ENOENT/) });
  });

  it("runs the command that asks for administrator rights", async () => {
    let seen = "";
    await relaunchElevated("C:\\My Apps\\toolbox.exe", ["--elevated"], async (command) => {
      seen = command;
      return { exitCode: 0 };
    });

    expect(seen).toContain("-Verb RunAs");
    expect(seen).toContain("toolbox.exe");
  });
});
