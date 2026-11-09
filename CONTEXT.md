# Toolbox

A personal "swiss knife" desktop app for Windows: a collection of maintenance tools run from one window, starting with disk cleanup and disk analysis.

## Language

**Toolbox**:
The whole app: the set of all Tools, grouped into Categories.

**Tool**:
One runnable thing in the Toolbox, with a name, a description, a Risk level, and one or more Steps.
_Avoid_: Action, task, cleanup, command

**Category**:
A named group of related Tools, such as Disk cleanup or Disk analyzer.
_Avoid_: Group, section

**Risk level**:
How much a Tool can change or lose: **read-only** (changes nothing), **normal** (changes things that regenerate), or **high** (loses something the user may want back).

**Run**:
One execution of a Tool, from confirmation to finish, including its output and the free space before and after.
_Avoid_: Job, execution

**Step**:
One part of a Tool's Run, either a command or a pause that asks the user to do something before continuing.

**Manifest**:
The list that defines every Tool and Category; adding a Tool means adding an entry to it.

**Disk analyzer**:
The Category that shows where disk space goes: a folder tree with drill-down and a list of the largest files.

## Relationships

- The Toolbox has many Categories; a Category has many Tools; a Tool has one or more Steps.
- Every Tool has exactly one Risk level; confirming a Run shows the exact commands its Steps will execute.
- A Tool of **read-only** Risk level runs without confirmation.

## Flagged ambiguities

- "Action" and "Group" were considered and dropped in favour of **Tool** and **Category**.
