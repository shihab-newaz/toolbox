# Toolbox

A "swiss knife" desktop app for Windows: one window of Tools for the everyday problems a Windows user hits, such as a broken network, a stuck shell, or a full disk. Built for its author and for people the author hands it to.

## Language

**Toolbox**:
The whole app: the set of all Tools, grouped into Categories.

**Tool**:
One runnable thing in the Toolbox, with a name, a description, a Risk level, zero or more Inputs, and one or more Steps.
_Avoid_: Action, task, cleanup, command

**Category**:
A named group of related Tools, such as Network, Fix-it or Disk cleanup.
_Avoid_: Group, section

**Risk level**:
How much a Tool can change or lose: **read-only** (changes nothing), **normal** (changes things that regenerate), or **high** (loses something the user may want back).

**Input**:
A value the user gives a Tool before its Run, such as a port number or a Wi-Fi network name.
_Avoid_: Parameter, argument, option

**Needs restart**:
A mark on a Tool whose effect only completes after Windows is restarted.
_Avoid_: Reboot flag

**Run**:
One execution of a Tool, from confirmation to finish or cancellation, including its Inputs and its output.
_Avoid_: Job, execution

**Step**:
One part of a Tool's Run, either a command or a pause that asks the user to do something before continuing.

**Run log**:
The saved record of past Runs, kept across restarts of the app.
_Avoid_: History, output log

**Manifest**:
The list that defines every Tool and Category; adding a Tool means adding an entry to it.

## Relationships

- The Toolbox has many Categories; a Category has many Tools; a Tool has one or more Steps and zero or more Inputs.
- Every Tool has exactly one Risk level; confirming a Run shows the exact commands its Steps will execute.
- A Tool of **read-only** Risk level runs without confirmation.
- A Tool that frees disk space says so, and only its Runs report free space before and after.
- A Tool marked **Needs restart** says so in its confirmation and again when its Run finishes.
- Any Run can be cancelled while it is in progress.
- Every Run is recorded in the Run log, except output a Tool marks as secret.
- Every Tool is fully described by its Manifest entry; no Tool has a screen of its own.

## Flagged ambiguities

- "Action" and "Group" were considered and dropped in favour of **Tool** and **Category**.
- "Disk analyzer" was a planned Category with its own screen (folder tree and largest files). It was dropped on 2026-11-13; the term no longer names anything in the Toolbox.
