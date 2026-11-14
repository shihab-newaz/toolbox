import type { Category } from "@shared/types";
import "./tools.css";
import { ToolRow } from "./ToolRow";
import type { RunState } from "./runState";

/** The left pane: every Category with its Tools, or what a search left of them. */
export function ToolList({
  categories,
  runs,
  selectedId,
  onSelect,
  noMatchFor,
}: {
  categories: Category[];
  runs: Record<string, RunState>;
  selectedId: string | null;
  onSelect: (toolId: string) => void;
  /** The search text when it matched no Tool; null otherwise. */
  noMatchFor: string | null;
}) {
  return (
    <section className="tool-list" aria-label="Tools">
      {noMatchFor !== null && (
        <div className="no-match">
          <p className="no-match-title">No Tool matches "{noMatchFor}"</p>
          <p className="muted">Check the spelling, or try a word like "print" or "network".</p>
        </div>
      )}
      {categories.map((category) => (
        <section key={category.id} aria-labelledby={`category-${category.id}`}>
          <h2 id={`category-${category.id}`}>{category.name}</h2>
          <ul>
            {category.tools.map((tool) => (
              <ToolRow
                key={tool.id}
                tool={tool}
                state={runs[tool.id]}
                selected={selectedId === tool.id}
                onSelect={() => onSelect(tool.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
