import type { RiskLevel } from "@shared/types";

const LABEL: Record<RiskLevel, string> = {
  "read-only": "Read-only",
  normal: "Normal",
  high: "High",
};

/** What each Risk level means, in the plain words the Toolbox uses for it. */
export const RISK_SUMMARY: Record<RiskLevel, string> = {
  "read-only": "Changes nothing on your PC",
  normal: "Changes things Windows rebuilds on its own",
  high: "Changes things you cannot get back",
};

/** A distinct icon per level, so the Risk level never depends on colour alone. */
function RiskIcon({ risk }: { risk: RiskLevel }) {
  const common = { width: 14, height: 14, viewBox: "0 0 16 16", "aria-hidden": true, fill: "none" };
  if (risk === "read-only") {
    return (
      <svg {...common} stroke="currentColor" strokeWidth="1.5">
        <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
        <circle cx="8" cy="8" r="2" />
      </svg>
    );
  }
  if (risk === "normal") {
    return (
      <svg {...common} stroke="currentColor" strokeWidth="1.5">
        <path d="M8 1.5 14.5 8 8 14.5 1.5 8z" />
        <circle cx="8" cy="8" r="1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...common} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M8 2 14.5 13.5h-13z" />
      <path d="M8 6.5v3.2M8 11.7v.1" strokeLinecap="round" />
    </svg>
  );
}

export function RiskChip({ risk }: { risk: RiskLevel }) {
  return (
    <span className={`risk-chip risk-${risk}`}>
      <RiskIcon risk={risk} />
      {LABEL[risk]}
    </span>
  );
}
