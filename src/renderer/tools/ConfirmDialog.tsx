import { useEffect, useState } from "react";
import "./tools.css";
import type { Tool } from "@shared/types";
import { RiskChip } from "./RiskChip";

/**
 * Shown over the window before a normal or high Tool runs. It lists every
 * command of every Step. The commands start collapsed for a normal Tool and
 * open for a high one, which also says plainly that something may be lost.
 */
export function ConfirmDialog({
  tool,
  onConfirm,
  onCancel,
}: {
  tool: Tool;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const high = tool.risk === "high";
  const [showCommands, setShowCommands] = useState(high);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="scrim">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Confirm ${tool.name}`}
        className={`dialog ${high ? "dialog-high" : "dialog-normal"}`}
      >
        <div className="dialog-head">
          {high && (
            <span className="dialog-tile" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2 1.5 13.5h13L8 2Z" />
                <path d="M8 6.5v3.2M8 11.7v.1" />
              </svg>
            </span>
          )}
          <RiskChip risk={tool.risk} />
          <h2>Run {tool.name}?</h2>
        </div>
        {high ? (
          <>
            <p className="dialog-lead">You may lose something you want back, and there is no undo.</p>
            <p>Read the commands below before you confirm.</p>
          </>
        ) : (
          <p className="dialog-lead">This changes things on your PC that Windows rebuilds by itself.</p>
        )}
        <button
          type="button"
          className="link"
          aria-expanded={showCommands}
          onClick={() => setShowCommands((open) => !open)}
        >
          {showCommands ? "Hide commands" : "Show commands"}
        </button>
        {showCommands && (
          <div className="commands">
            <p className="muted">Running this Tool will execute:</p>
            {tool.steps.map((step, index) =>
              step.kind === "command" ? (
                <pre key={index}>{step.command}</pre>
              ) : (
                <p key={index} className="pause-step">
                  Pause: {step.message}
                </p>
              ),
            )}
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onCancel} autoFocus={high}>
            Cancel
          </button>
          <button
            type="button"
            className={high ? "danger" : "primary"}
            onClick={onConfirm}
            autoFocus={!high}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
