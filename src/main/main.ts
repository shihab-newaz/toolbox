import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { manifest } from "../shared/manifest";
import { validateManifest } from "../shared/validateManifest";
import { isElevated, relaunchElevated } from "./elevation";
import { killAllRunning, POWERSHELL } from "./runner";
import { createRunService } from "./runService";

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
  const runService = createRunService({
    getManifest: () => validateManifest(manifest),
    shell: POWERSHELL,
    logFolder: app.getPath("userData"),
  });

  ipcMain.handle("manifest:get", () => validateManifest(manifest));

  ipcMain.handle("runlog:get", () => runService.getRunLog());

  ipcMain.handle("tool:run", (event, toolId: string) =>
    runService.run(toolId, (output) => {
      // The window may have been closed while the command was still printing.
      if (!event.sender.isDestroyed()) {
        event.sender.send("tool:output", toolId, output);
      }
    }),
  );
}

app.whenReady().then(async () => {
  if (!skipElevation && !isElevated()) {
    // Ask Windows for administrator rights once, then let the elevated copy take over.
    const relaunch = await relaunchElevated(process.execPath, [app.getAppPath(), "--elevated"]);
    if (!relaunch.ok) {
      dialog.showErrorBox("Toolbox needs administrator rights", relaunch.error);
    }
    app.quit();
    return;
  }
  registerIpc();
  createWindow();
});

// Closing the window must not leave elevated PowerShell commands running.
app.on("before-quit", () => killAllRunning());

app.on("window-all-closed", () => app.quit());
