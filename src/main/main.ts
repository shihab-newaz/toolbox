import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { manifest } from "../shared/manifest";
import { validateManifest } from "../shared/validateManifest";
import { isElevated, relaunchElevated } from "./elevation";
import { POWERSHELL, runTool } from "./runner";

// `--elevated` marks the copy we relaunched through UAC, so it never relaunches again.
const skipElevation =
  process.argv.includes("--no-elevate") || process.argv.includes("--elevated");

function createWindow(): void {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    title: "Toolbox",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
}

function registerIpc(): void {
  ipcMain.handle("manifest:get", () => validateManifest(manifest));

  ipcMain.handle("tool:run", async (event, toolId: string) => {
    const tool = validateManifest(manifest)
      .categories.flatMap((c) => c.tools)
      .find((t) => t.id === toolId);
    if (!tool) {
      return {
        ok: false,
        failedStep: null,
        exitCode: null,
        error: `Unknown tool "${toolId}"`,
      };
    }
    return runTool(tool, POWERSHELL, (output) =>
      event.sender.send("tool:output", toolId, output),
    );
  });
}

app.whenReady().then(() => {
  if (!skipElevation && !isElevated()) {
    // Ask Windows for administrator rights once, then let the elevated copy take over.
    relaunchElevated(process.execPath, [app.getAppPath(), "--elevated"]);
    app.quit();
    return;
  }
  registerIpc();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
