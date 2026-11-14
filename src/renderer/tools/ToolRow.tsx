import type { Tool } from "@shared/types";
import { RiskChip } from "./RiskChip";
import { isRunning, type RunState } from "./runState";

/** The row's status slot: a spinner while running, then a done or failed mark until the Run is viewed. */
function RowStatus({ state }: { state: RunState | undefined }) {
  if (isRunning(state)) {
    return <span className="row-status spinner" role="img" aria-label="Running" />;
  }
  if (state?.result && !state.viewed) {
    const ok = state.result.ok;
    return (
      <span
        className={`row-status mark ${ok ? "mark-ok" : "mark-failed"}`}
        role="img"
        aria-label={ok ? "Finished" : "Failed"}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {ok ? <path d="m3 8.5 3.2 3.2L13 4.8" /> : <path d="m4 4 8 8M12 4l-8 8" />}
        </svg>
      </span>
    );
  }
  return <span className="row-status" aria-hidden="true" />;
}

export function ToolRow({
  tool,
  state,
  selected,
  onSelect,
}: {
  tool: Tool;
  state: RunState | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`tool-row${selected ? " selected" : ""}`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <RowStatus state={state} />
        <span className="tool-row-text">
          <span className="tool-name">{tool.name}</span>
          <span className="tool-description">{tool.description}</span>
        </span>
        <RiskChip risk={tool.risk} />
      </button>
    </li>
  );
}
