import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildStartProcessCommand, relaunchElevated } from "./elevation";

describe("buildStartProcessCommand", () => {
  it("passes each argument through intact, including paths with spaces and quotes", async () => {
    // A folder with a space in its name, as under "Program Files" or "My Apps".
    const dir = mkdtempSync(path.join(tmpdir(), "toolbox space "));
    const script = path.join(dir, "argv script.js");
    const out = path.join(dir, "out.json");
    writeFileSync(
      script,
      'require("fs").writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)))',
    );
    const args = [
      script,
      out,
      "C:\\My Apps\\toolbox",
      "--elevated",
      'say "hi"',
      "trailing\\",
      "it's here",
      "C:\\dir with space\\",
    ];

    const command = buildStartProcessCommand(process.execPath, args, { runAs: false });
    spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
      windowsHide: true,
    });
    for (let i = 0; i < 100 && !existsSync(out); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual([
      "C:\\My Apps\\toolbox",
      "--elevated",
      'say "hi"',
      "trailing\\",
      "it's here",
      "C:\\dir with space\\",
    ]);
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
