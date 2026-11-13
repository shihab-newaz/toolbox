import { contextBridge, ipcRenderer } from "electron";
import type { OutputEvent, ToolboxBridge } from "../shared/types";

const bridge: ToolboxBridge = {
  getManifest: () => ipcRenderer.invoke("manifest:get"),
  getVersions: () => ipcRenderer.invoke("versions:get"),
  runTool: (toolId) => ipcRenderer.invoke("tool:run", toolId),
  onOutput: (listener) => {
    const handler = (_: unknown, toolId: string, event: OutputEvent) =>
      listener(toolId, event);
    ipcRenderer.on("tool:output", handler);
    return () => ipcRenderer.removeListener("tool:output", handler);
  },
};

contextBridge.exposeInMainWorld("toolbox", bridge);
