# Toolbox design

Draft, derived from the Claude Design mockup (`Toolbox.html`, 11 pages) and the decisions in the grilling session. Terms follow `CONTEXT.md`. Status: **draft, open questions at the bottom are not settled.**

## Principles

- The main user is a non-technical person the author hands the app to. Calm, plain-spoken, never a hacker terminal.
- Show what will happen before it happens. Cancel is always reachable.
- Risk level is the only thing that uses red, amber and green. The accent colour is for interaction only.
- A Tool has no screen of its own. Every Tool renders through the same list row, panel, confirmation and Run view.

## Platform

- Windows 11 desktop, one resizable window. Default 1100×720, minimum 900×600.
- Follows the Windows light or dark theme. No in-app theme setting.
- Windows 11 feel: 6 px control radius, 8 px window radius, one shadow for dialogs.

## Typography

- **Figtree** for all UI text. Weights 400, 500, 600, 700. Bundled with the app as local font files, not loaded from Google Fonts at run time, so the app looks the same offline.
- Fallback stack: `'Figtree', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif`.
- Monospace for commands and Run output: `'Cascadia Mono', Consolas, monospace`.
- Sizes: body 14 px, secondary 12 to 13 px, chips 12 px. Line height 1.4.

## Colour tokens

Taken from the mockup. Define as CSS custom properties on `:root`, overridden under `prefers-color-scheme: dark`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #f3f3f3 | #1f1f1f | Window background |
| `--sf` | #ffffff | #2a2a2a | Panels, dialogs |
| `--sf2` | #f7f7f7 | #303030 | Secondary surface |
| `--hv` | #ececec | #363636 | Row hover |
| `--sel` | #e3eefa | #2b4152 | Selected row |
| `--tx` | #1b1b1b | #f5f5f5 | Text |
| `--mu` | #5c5c5c | #b9b9b9 | Secondary text |
| `--bd` | #e2e2e2 | #3d3d3d | Borders |
| `--ac` | #005fb8 | #60cdff | Accent (buttons, focus, links) |
| `--acon` | #ffffff | #0a0a0a | Text on accent |
| `--code` | #f6f6f6 | #202020 | Command and output background |
| `--scrim` | rgba(0,0,0,.34) | rgba(0,0,0,.56) | Dialog backdrop |

Risk level tokens (reserved for Risk level only):

| Level | Chip background | Chip text | Border | Dialog tint |
|---|---|---|---|---|
| read-only | transparent | #3a3a3a (dark #e6e6e6) | #8d8d8d (dark #8a8a8a) | none |
| normal | #fff1c2 (dark #4a3a10) | #5a3f00 (dark #ffe28a) | #c79a00 (dark #b08a1c) | #fff4ce (dark #3b3014) |
| high | #c42b1c | #ffffff | #c42b1c (dark #ea6a5c) | #fde7e9 (dark #3f2326) |

Every chip carries an icon and a text label as well as colour, so Risk level never depends on colour alone.

## Layout

**Header.** App name, search box, "Run log" button. No Administrator banner or chip.

**Left pane: Tool list.** Flat list under Category headings. Row = status slot, name, one-line plain description, Risk chip, optional "Needs restart" badge. Search filters by name and description across all Categories.

**Row status slot.** Spinner while a Run is in progress. Done or failed mark when a Run has ended, kept until the user views that Tool. Several rows can show a spinner at once.

**Right pane: Tool panel.** Name, description, Risk level, Inputs (labelled fields with inline validation), Run button, Run output. Empty state when no Tool is selected.

**Run log view.** Replaces the whole two-pane window. Back control returns to the Tools. List of past Runs (Tool, time, outcome, Risk level) beside a detail pane with Inputs and output.

## Components

- **Risk chip.** Icon, label, colour per the table above.
- **Needs restart badge.** Icon and label, shown on the row and in the confirmation and finished states.
- **Confirmation dialog.** Over the panel, for normal and high only; read-only Tools run with no confirmation. Shows Risk level, a "Show commands" toggle (collapsed for normal, expanded for high), the Needs restart notice, Cancel and Confirm. High: red styling, plain statement of what may be lost, no type-to-confirm.
- **Run in progress.** Step list (pending, running, done, failed, waiting for you), inline "Do this, then Continue" card for pause Steps, live monospace output that auto-scrolls, Cancel always visible.
- **Run finished.** Success or failure summary with duration. Free-space before, after and freed only for Tools that free disk space. "Restart Windows to finish" callout for Needs restart Tools. Run again.
- **Cancelled and failed Runs.** State per Step, plus "Anything a finished step already did stays done" on cancel.
- **Run log entry.** Secret output shows "Output hidden (secret)".

## States to cover

No Tool selected, no search results, Tool failed to start, cancelled Run, failed Run, invalid Input, empty Run log.

## Open questions

These come from comparing the mockup with the spec and are for the grilling session:

1. **Font hosting.** Figtree must ship inside the app so it works offline. Confirm bundling the font files, and which weights.
2. **Needs restart in the confirmation.** The spec requires it; the mockup shows it only on the row and the finished state.
3. **List length.** The mockup has 12 Tools; the plan is about 28. How Category headings and scrolling behave at that size is untested.
4. **Category naming.** The mockup says "Disk cleanup"; the spec says "Windows cleanup". The manifest still says "Disk cleanup".
5. **Placeholder Tools.** The mockup invents Tools and Steps (Close your web browser, Empty Recycle Bin) that are not in the manifest. They must not leak into the build.
6. **Concurrent spinner rendering.** Not verified in a rendered page.
7. **Windows Explorer restart and other Tool-specific states.** Whether any Tool needs UI beyond the shared components.
