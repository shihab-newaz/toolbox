import { createRoot } from "react-dom/client";
import type { ToolboxBridge } from "@shared/types";
import { App } from "./app/App";
import "./styles.css";

declare global {
  interface Window {
    toolbox: ToolboxBridge;
  }
}

createRoot(document.getElementById("root")!).render(<App bridge={window.toolbox} />);
