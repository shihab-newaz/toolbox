# Inputs reach commands as environment variables

A Tool's Inputs are passed to its PowerShell commands as environment variables that the command reads, never substituted into the command text. The Toolbox runs as administrator, and an Input such as a Wi-Fi network name can contain quotes or `;`; passing values out of band means user text is never parsed as code, so injection is ruled out by construction instead of depending on escaping being correct. Each Input is also validated by type before the Run (a port is 1 to 65535, a path must exist).

## Consequences

- The confirmation shows the command with its variable names, plus the Input values beside it, not a command with values spliced in.
- A Manifest author must write `$env:NAME` in commands and must not build command strings from Inputs with `Invoke-Expression`.
