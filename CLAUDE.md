## Agent skills

### Issue tracker

Issues live as local markdown files under `.claude/.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (bug, enhancement, needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the root. See `docs/agents/domain.md`.

### Design

UI work follows `DESIGN.md` at the root: typography (Figtree), colour tokens, layout, components and states. Use the terms in `CONTEXT.md`. Its open questions are not settled decisions.

### External peers

Mode `claude`: code-review and jury call the claude CLI as the peer. See `docs/agents/cross-model.json`.
