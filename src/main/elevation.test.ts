import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AccountResult,
  buildStartProcessCommand,
  currentAccount,
  decideLaunch,
  relaunchElevated,
} from "./elevation";

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

describe("currentAccount", () => {
  it("reports the account Windows says this process runs as, without the line ending", () => {
    const result = currentAccount(() => ({ exitCode: 0, output: "desktop-ab12\\mary ann\r\n" }));

    expect(result).toEqual({ ok: true, account: "desktop-ab12\\mary ann" });
  });

  it("reports a failure when the account cannot be read", () => {
    const failed = currentAccount(() => ({ exitCode: 1, output: "" }));
    const notStarted = currentAccount(() => ({
      exitCode: null,
      output: "",
      error: "spawn whoami ENOENT",
    }));
    const blank = currentAccount(() => ({ exitCode: 0, output: "\r\n" }));

    expect(failed.ok).toBe(false);
    expect(notStarted).toMatchObject({ ok: false, error: expect.stringMatching(/ENOENT/) });
    expect(blank.ok).toBe(false);
  });

  it.skipIf(process.platform !== "win32")("reads the real account of this process on Windows", () => {
    const result = currentAccount();

    expect(result).toMatchObject({
      ok: true,
      account: expect.stringMatching(/^[^\\\r\n]+\\[^\\\r\n]+$/),
    });
  });
});

describe("decideLaunch", () => {
  const exe = ["C:\\Apps\\electron.exe", "C:\\Apps\\toolbox"];
  const runningAs = (account: string) => (): AccountResult => ({ ok: true, account });
  const unelevated = (account: string) => ({
    isElevated: () => false,
    currentAccount: runningAs(account),
  });
  const elevated = (account: string) => ({
    isElevated: () => true,
    currentAccount: runningAs(account),
  });

  /** The arguments the elevated copy starts with after `account` launched the app. */
  function relaunchArgsFrom(account: string): string[] {
    const decision = decideLaunch(exe, unelevated(account));
    if (decision.action !== "relaunch") throw new Error(`expected a relaunch, got ${decision.action}`);
    return decision.args;
  }

  it("relaunches an unelevated start", () => {
    expect(decideLaunch(exe, unelevated("pc\\mary")).action).toBe("relaunch");
  });

  it("opens the window when the elevated copy runs as the account that started it", () => {
    const args = relaunchArgsFrom("pc\\mary");

    expect(decideLaunch([...exe, ...args], elevated("pc\\mary"))).toEqual({ action: "open" });
  });

  it("does not ask for administrator rights a second time in the elevated copy", () => {
    const args = relaunchArgsFrom("pc\\mary");

    // `net session` can fail in an elevated process when the Server service is stopped.
    expect(decideLaunch([...exe, ...args], unelevated("pc\\mary"))).toEqual({ action: "open" });
  });

  it("treats the same account written in different letter case as the same account", () => {
    const args = relaunchArgsFrom("DESKTOP-AB12\\Mary Ann");

    expect(decideLaunch([...exe, ...args], elevated("desktop-ab12\\mary ann"))).toEqual({
      action: "open",
    });
  });

  it("refuses when the elevated copy runs as a different account, naming both accounts", () => {
    const args = relaunchArgsFrom("pc\\kid");

    const decision = decideLaunch([...exe, ...args], elevated("pc\\parent"));

    expect(decision.action).toBe("refuse");
    const message = decision.action === "refuse" ? decision.message : "";
    expect(message).toContain("pc\\kid");
    expect(message).toContain("pc\\parent");
  });

  it("does not let a non-ASCII byte that looks like space or a capital pass for another name", () => {
    // whoami's bytes are read as latin1: U+00A0 is a no-break space, U+00C0 a capital.
    const spaceEnded = relaunchArgsFrom("pc\\pel ");
    const capital = relaunchArgsFrom("pc\\À");

    expect(decideLaunch([...exe, ...spaceEnded], elevated("pc\\pel")).action).toBe("refuse");
    expect(decideLaunch([...exe, ...capital], elevated("pc\\à")).action).toBe("refuse");
  });

  it("refuses the same name on a different machine or domain", () => {
    const args = relaunchArgsFrom("pc\\admin");

    expect(decideLaunch([...exe, ...args], elevated("corp\\admin")).action).toBe("refuse");
  });

  it("refuses when one name only begins with the other", () => {
    const args = relaunchArgsFrom("pc\\mary");

    expect(decideLaunch([...exe, ...args], elevated("pc\\mary ann")).action).toBe("refuse");
  });

  it("refuses an elevated copy that was not told which account started it", () => {
    const withoutAccount = relaunchArgsFrom("pc\\mary").filter((arg) => !arg.includes("mary"));

    expect(decideLaunch([...exe, ...withoutAccount], elevated("pc\\mary")).action).toBe("refuse");
  });

  it("refuses when the elevated copy cannot read its own account", () => {
    const args = relaunchArgsFrom("pc\\mary");

    const decision = decideLaunch([...exe, ...args], {
      isElevated: () => true,
      currentAccount: () => ({ ok: false, error: "Could not read the Windows account: boom" }),
    });

    expect(decision).toMatchObject({ action: "refuse", message: expect.stringMatching(/boom/) });
  });

  it("refuses to relaunch when the account that started the app cannot be read", () => {
    const decision = decideLaunch(exe, {
      isElevated: () => false,
      currentAccount: () => ({ ok: false, error: "Could not read the Windows account: boom" }),
    });

    expect(decision).toMatchObject({ action: "refuse", message: expect.stringMatching(/boom/) });
  });

  it("opens the window without a check when the app was started already elevated", () => {
    const neverAsked = () => {
      throw new Error("the account must not be read");
    };

    expect(decideLaunch(exe, { isElevated: () => true, currentAccount: neverAsked })).toEqual({
      action: "open",
    });
  });

  it("skips both elevation and the account check under the development flag", () => {
    const neverAsked = () => {
      throw new Error("must not be called under --no-elevate");
    };
    const mismatched = relaunchArgsFrom("pc\\kid");

    for (const argv of [
      [...exe, "--no-elevate"],
      [...exe, "--no-elevate", ...mismatched],
    ]) {
      expect(decideLaunch(argv, { isElevated: neverAsked, currentAccount: neverAsked })).toEqual({
        action: "open",
      });
    }
  });

  it("carries an account name with spaces and quotes through the real relaunch command", async () => {
    for (const account of ["My Laptop\\Mary Ann O'Neil", 'corp\\say "hi" ’x’']) {
      const { received } = await argsReceivedBy(relaunchArgsFrom(account));

      expect(decideLaunch([...exe, ...received], elevated(account))).toEqual({ action: "open" });
      expect(decideLaunch([...exe, ...received], elevated("pc\\someone else")).action).toBe(
        "refuse",
      );
    }
  }, 40000);
});
