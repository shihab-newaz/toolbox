# Toolbox design

Source of truth for the Toolbox design (Windows 11 desktop utility). Terms follow `CONTEXT.md`. Token names match the CSS custom properties in `src/renderer/styles/tokens.css`. The token sections come from the Claude Design token sheet; the layout behaviour and decisions come from the grilling sessions.

## Principles

- Calm, plain-spoken, safe. Never a hacker terminal. The main user is a non-technical person the author hands the app to.
- Show what will happen before it happens. Cancel is always reachable.
- One accent colour, for interactive elements only (buttons, links, selection, focus, the "done" mark).
- Risk colours (amber, red) are reserved for Risk level only. Status marks never use them.
- Risk and status are never colour alone: each pairs colour with an icon and a text label.
- Solid colours only. No gradients anywhere: no `linear-gradient`, `radial-gradient` or `conic-gradient`, in backgrounds, borders or fades. Depth comes from the surface tokens, borders and the one dialog shadow.
- Follows the Windows light or dark theme automatically. Both themes are below.
- A Tool has no screen of its own. Every Tool renders through the same list row, panel, confirmation and Run view.

## Platform

- Windows 11 desktop, one resizable window. Default 1100×720, minimum 900×600.
- The window keeps the **native Windows title bar**. The 52 px header (app name, search, Run log) sits below it. The caption-button tokens in the original sheet are not used.
- Windows 11 feel: soft corners, subtle elevation, one shadow for dialogs.

## Typography

| Role | Family | Fallbacks |
|---|---|---|
| UI text | **Figtree** | Segoe UI Variable Text, Segoe UI, system-ui, sans-serif |
| Console output, commands | **JetBrains Mono** | Cascadia Mono, Consolas, monospace |

Both fonts are bundled as local files under `src/renderer/fonts/` with their OFL licences, never loaded from Google Fonts: the CSP allows only `'self'`, and the app must look the same offline. Figtree is a variable font covering weights 400 to 700. JetBrains Mono ships weights 400 and 500, taken from the official v2.304 release.

| Token | Size / line | Weight | Used for |
|---|---|---|---|
| `type-title` | 26 / 1.2 | 600 | Tool name in the panel |
| `type-dialog-title` | 20 / 1.2 | 600 | Confirmation dialog title, empty-state title |
| `type-summary` | 17 / 1.3 | 600 | Run result summary ("Done. Temp files were cleared.") |
| `type-number` | 28 / 1.2 | 600 (700 for "Freed") | Free space before, after, freed |
| `type-body` | 14 / 1.55 | 400 | Descriptions, dialog text |
| `type-row-name` | 14 / 1.4 | 600 | Tool name in a list row, button labels |
| `type-label` | 13 / 1.4 | 600 | Field labels, section labels ("Output", "Inputs") |
| `type-caption` | 12.5-13 / 1.4 | 400 | Row descriptions, helper text, timestamps |
| `type-category` | 12 / 1.4 | 600, +0.02em | Category headings |
| `type-chip` | 12 (13 large) | 600 (700 for High) | Risk level chips |
| `type-mono` | 12.5 / 1.65 | 400 | Commands and live output (JetBrains Mono) |

## Colour: neutrals and accent

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#f3f3f3` | `#1f1f1f` | Window background |
| `--sf` | `#ffffff` | `#2a2a2a` | Panels, dialogs, cards |
| `--sf2` | `#f7f7f7` | `#303030` | Banners, dialog footers, secondary surfaces |
| `--hv` | `#ececec` | `#363636` | Hover, disabled fill |
| `--sel` | `#e3eefa` | `#2b4152` | Selected row, pause card fill |
| `--tx` | `#1b1b1b` | `#f5f5f5` | Primary text |
| `--mu` | `#5c5c5c` | `#b9b9b9` | Secondary text |
| `--bd` | `#e2e2e2` | `#3d3d3d` | Hairline borders |
| `--bds` | `#8d8d8d` | `#7a7a7a` | Strong borders, field bottom edge, dashed empty boxes |
| `--ac` | `#005fb8` | `#60cdff` | Accent (interactive only) |
| `--acon` | `#ffffff` | `#0a0a0a` | Text and icons on accent |
| `--fld` | `#ffffff` | `#333333` | Input field fill |
| `--btn2` | `#fdfdfd` | `#383838` | Secondary button fill |
| `--code` | `#f6f6f6` | `#202020` | Console and command block fill |
| `--scrim` | `rgba(0,0,0,.34)` | `rgba(0,0,0,.56)` | Dialog backdrop (over the right pane only) |

## Colour: Risk level (reserved)

| Level | Icon | Fill | Text | Border | Weight |
|---|---|---|---|---|---|
| Read-only | eye | transparent | `--rof` light `#3a3a3a`, dark `#e6e6e6` | `--robd` light `#8d8d8d`, dark `#8a8a8a` | 600 |
| Normal | pencil | `--nb` light `#fff1c2`, dark `#4a3a10` | `--nf` light `#5a3f00`, dark `#ffe28a` | `--nbd` light `#c79a00`, dark `#b08a1c` | 600 |
| High | warning triangle | `--hb` `#c42b1c` | `--hf` `#ffffff` | `--hbd` light `#c42b1c`, dark `#ea6a5c` | 700 |

Supporting tints, used only for the high dialog's header band and tiles (a normal dialog has a neutral header): `--ntint` light `#fff4ce`, dark `#3b3014`. `--htint` light `#fde7e9`, dark `#3f2326`.

Chip: pill, 22 px tall (26 px in headers and dialogs), 8 px horizontal padding (10 px large), 1 px border, 5 px gap to a 13 px icon.

## Status marks (never use Risk colours)

| State | Mark | Colour |
|---|---|---|
| Running | Spinner arc, 0.9 s linear loop | track `--bd`, arc `--ac` |
| Waiting for you (pause Step) | Filled circle, hand icon | `--ac` fill, `--acon` icon |
| Done | Filled circle, check | `--ac` fill, `--acon` icon |
| Failed | Filled circle, X | `--tx` fill, `--sf` icon |
| Cancelled | Outlined circle, dash | `--bds` 2 px ring, `--mu` icon |
| Pending | Empty ring | `--bd` 2 px ring |

Sizes: 18 px in list rows and the Run log, 20 px in Step lists, 30-32 px in result summaries. Needs restart mark: 20 px pill, 1 px `--bds` border, restart icon, 11.5 px text `--mu`.

## Spacing

Base unit 4 px. Common steps: 4, 8, 10, 12, 14, 16, 18, 24, 28, 36, 40.

| Token | Value |
|---|---|
| Panel padding | 28px 36px 20px |
| Panel section gap | 16-18px |
| Dialog padding | 24px (footer 14px 24px) |
| Tool row padding | 8px 10px 8px 16px, 2px between rows |
| Category heading padding | 14px 10px 6px |
| Run log row padding | 10px 12px 10px 18px |
| Window gutter | 12px (left list), 12px (panel right and bottom) |

## Layout tokens

| Token | Value |
|---|---|
| Window | 1100 x 720 default, 900 x 600 minimum |
| Header bar | 52px tall, below the native title bar |
| Search field | 360px wide, 34px tall |
| Tool list pane | 380px wide |
| Run log list pane | 440px wide |
| Confirmation dialog | 500px (normal), 540px (high) |

## Shape and elevation

| Token | Value |
|---|---|
| Window radius | 8px |
| Panel, card, dialog radius | 8px |
| Row and output pane radius | 6px |
| Button and field radius | 4px |
| Chip radius | 50% of height (pill) |
| `--shadow` (dialog) | light `0 16px 48px rgba(0,0,0,.28)`, dark `0 16px 48px rgba(0,0,0,.6)` |
| Border | 1px `--bd`; fields use `--bds` on the bottom edge |
| Selection indicator | 3px x 18px pill in `--ac`, 3px from the row's left edge |

## Components

**Button** 36px tall (32px in the header), 20px horizontal padding, 4px radius, 14px / 600, 8px gap to a 14px icon.
- Primary: `--ac` fill, `--acon` text.
- Secondary: `--btn2` fill, 1px `--bd` border with `--bds` bottom edge, `--tx` text.
- Danger (High confirm only): `--hb` fill, `--hf` text, `--hbd` border.
- Disabled: `--hv` fill, `--mu` text, `--bd` border.

**Tool row** Name (14 / 600) + Risk chip + optional Needs restart pill on line one; one-line description (12.5, `--mu`, ellipsis) on line two; 18px status slot on the right. Selected: `--sel` fill and accent indicator.

**Field** 36px tall, 4px radius, 1px `--bd` border with `--bds` bottom edge, `--fld` fill. Error: 2px `--tx` border, alert icon, message in 13 / 600. Helper text 13px `--mu`.

**Step list** Card with 1px `--bd` border, 8px radius. Rows 40px tall, 14px side padding, state mark, title, right-aligned state label (12.5, `--mu`).

**Pause card** `--sel` fill, 1px `--ac` border, 6px radius, title "Do this, then Continue" (14 / 600), primary Continue button.

**Output pane** `--code` fill, 1px `--bd` border, 6px radius, 12px 14px padding, JetBrains Mono 12.5 / 1.65, `white-space: pre`, auto-scroll. Command lines prefixed `$ `, console lines prefixed `> `.

**Dialog** Normal: neutral header, collapsed "Show commands" toggle (`--ac`, 13.5 / 600). High: `--htint` header with 40px `--hb` icon tile and `--hbd` border, plain-words loss list, Needs restart notice (1px `--bds` border), commands expanded, red Confirm. Footer `--sf2` with right-aligned Cancel and Confirm. The backdrop covers the right pane only.

**Restart callout** 2px `--tx` border, 8px radius, 24px restart icon, title 16 / 700.

**Empty-state box** 1px dashed `--bds`, 6px radius, centered 13.5px `--mu` text.

## Vocabulary (use exactly)

Tool, Category, Risk level (read-only, normal, high), Input, Needs restart, Run, Step, Run log. Avoid: action, job, group, history, parameter.

## Accessibility

- Text contrast 4.5:1 or better in both themes.
- Real `<button>`, `<input>` and `<label>` elements. Icon-only buttons carry `aria-label`. Status marks carry `role="img"` with a label.
- Touch and click targets 32px or taller (36px for primary actions).

## Layout behaviour

**Header.** App name, search box, "Run log" button. No Administrator banner or chip.

**Left pane: Tool list.** Flat list under Category headings. Row = name, Risk chip, one-line plain description, status slot, optional "Needs restart" badge. Search filters by name and description across all Categories.

**Row status slot.** Spinner while a Run is in progress. Done or failed mark when a Run has ended, kept until the user views that Tool. Several rows can show a spinner at once.

**Right pane: Tool panel.** Name, description, Risk level, Inputs (labelled fields with inline validation), Run button, Run output. Empty state when no Tool is selected.

**Run log view.** Replaces the whole two-pane window. Back control returns to the Tools. List of past Runs (Tool, time, outcome, Risk level) beside a detail pane with Inputs and output.

## States to cover

No Tool selected, no search results, Tool failed to start, cancelled Run, failed Run, invalid Input, empty Run log.

## Open questions

Not settled decisions:

1. **Needs restart in the confirmation.** The spec requires it. The Manifest and bridge do not carry the mark yet, so it is not drawn anywhere until ticket 16 lands.
2. **Features the contract cannot support yet.** Cancel, Inputs, continuing a paused Run, free-space before and after, secret output and per-Tool warning text need the bridge and Manifest to grow first (tickets 12, 13, 16, 21 and the warning field).
3. **Category naming.** The design says "Disk cleanup"; the spec says "Windows cleanup". The Manifest still says "Disk cleanup".
4. **Placeholder Tools.** The mockup's invented Tools and Steps must not leak into the build.
5. **Tool-specific states.** Whether any Tool needs UI beyond the shared components (for example Restart Explorer).
