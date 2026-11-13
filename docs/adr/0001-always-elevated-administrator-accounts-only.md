# Always elevated, administrator accounts only

The Toolbox asks for administrator rights once at launch and runs every Tool elevated, even though many Tools (IP info, port lookup, restart Explorer) need no admin rights. We chose this over per-Tool elevation because it is simple and matches what comparable utilities do; the cost is a UAC prompt on every launch.

## Consequences

- If the Windows account is not an administrator, UAC elevates to a *different* account, and per-user Tools (temp cleanup, saved Wi-Fi profiles, npm cache) would silently act on that other account's profile. The Toolbox therefore detects this at launch and refuses to run, with a clear message. Standard-user accounts are not supported.

## Considered Options

- **Launch unelevated, relaunch as administrator on demand.** Rejected for now: more moving parts, and most Categories need admin rights anyway.
- **Support standard users by running per-user Tools as the original user.** Rejected: a large change for an audience of mostly single-administrator home PCs.
