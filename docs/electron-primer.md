# Electron primer

For someone who knows Next.js and Nest.js and wants to read or change this app. Every example points at a real file in this repo.

## The core idea

Electron bundles **Chromium** (renders the UI) and **Node.js** (runs backend code) into one desktop app. There are two kinds of process, and most of the learning curve is the wall between them.

| Electron | Web-dev analogy | In this repo |
|---|---|---|
| **Main process** | Nest.js backend | `src/main/` (`main.ts`, `runService.ts`, `runner.ts`, `elevation.ts`) |
| **Renderer process** | Next.js client | `src/renderer/` (React app, built by Vite) |
| **Preload script** | A typed SDK / API client | `src/preload/preload.ts` |
| **IPC** | HTTP/RPC between client and server | `ipcMain.handle` / `ipcRenderer.invoke` |
| Shared types | A shared DTO package | `src/shared/` (`types.ts`, `manifest.ts`) |

The main process is a server that only your own UI may call. The renderer is a frontend that never touches the OS directly.

## How a request flows here

Running a tool end to end:

```
Renderer (React)                Preload                     Main
─────────────────               ───────                     ────
window.toolbox.runTool(id) ──▶  ipcRenderer.invoke   ──▶   ipcMain.handle("tool:run")
                                  ("tool:run", id)            └─ runService.run(id, onOutput)
                                                                   └─ spawns PowerShell
        ◀── tool:output events ◀── ipcRenderer.on ◀──  event.sender.send("tool:output", …)
        ◀── resolved Promise ◀─────────────────────────  handler's return value
```

Two IPC shapes appear in `src/main/main.ts`:

- **Request/response** (`invoke` / `handle`): the renderer asks, main returns a Promise. Like a REST call. Used by `manifest:get` and `tool:run`.
- **Push** (`webContents.send` / `ipcRenderer.on`): main streams data to the renderer. Like a WebSocket message. Used by `tool:output` for live command output.

## The three layers, as this app writes them

**Main** creates windows and registers "controllers" (`src/main/main.ts`):

```ts
ipcMain.handle("tool:run", (event, toolId: string) =>
  runService.run(toolId, (output) => {
    if (!event.sender.isDestroyed()) event.sender.send("tool:output", toolId, output);
  }),
);
```

The handler is thin and delegates to `runService`, which is plain testable Node code (see `runService.test.ts`). Keep it that way: IPC handlers are controllers, services hold the logic.

**Preload** is the only bridge (`src/preload/preload.ts`):

```ts
contextBridge.exposeInMainWorld("toolbox", bridge);
```

The page sees `window.toolbox`, typed by `ToolboxBridge` in `src/shared/types.ts`. It never sees `ipcRenderer` itself.

**Renderer** is an ordinary React app that calls `window.toolbox.*` instead of `fetch('/api/...')`.

## Security rules (non-negotiable)

`createWindow()` in `main.ts` sets `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true`. Keep all three.

1. **Never expose raw `ipcRenderer`, or `require`, to the page.** Expose narrow named functions only. If the page ever renders untrusted content, a wide bridge becomes remote code execution on the user's machine. This app runs elevated, so the stakes are higher.
2. **Validate everything in main handlers**, as you would request bodies in Nest. The renderer is untrusted. Note how `tool:run` takes only a `toolId` and `runService` looks it up in a validated manifest, so the renderer cannot send arbitrary commands.
3. **IPC arguments are serialized** (structured clone). Functions and class instances cannot cross.
4. **Return an unsubscribe function** from any `on` wrapper (see `onOutput` in the preload) so React effects can clean up.

## Lifecycle

`main.ts` follows the standard sequence:

1. `app.whenReady()` is the entry point, like Nest's `bootstrap()`.
2. Register IPC handlers, then create the window.
3. `before-quit` runs cleanup. Here it calls `killAllRunning()` so elevated PowerShell commands do not outlive the app.
4. `window-all-closed` quits the app (Windows-only app, so no macOS keep-alive).

## Windows elevation (specific to this app)

On launch, if the process is not elevated, `main.ts` relaunches itself through UAC with `--elevated` and quits the original copy. Flags:

- `--elevated`: this is the relaunched copy; never relaunch again.
- `--no-elevate`: skip elevation entirely. `npm run start:dev` uses this so development does not trigger a UAC prompt on every run.

If the user declines UAC, the app shows `dialog.showErrorBox` with the reason and quits.

## Build and run

Unlike many Electron templates, there is no dev server or hot reload:

| Script | What it does |
|---|---|
| `npm run build:main` | `tsc -p tsconfig.node.json` compiles main and preload to `dist-electron/` |
| `npm run build:renderer` | `vite build` bundles the React app to `dist/renderer/` |
| `npm start` | Build both, then `electron .` (with elevation) |
| `npm run start:dev` | Build both, then `electron . --no-elevate` |
| `npm test` | Vitest (main services are tested as plain Node; renderer with Testing Library and jsdom) |
| `npm run typecheck` | Typechecks both tsconfigs |

`package.json` `"main"` points at `dist-electron/main/main.js`. That is the entry Electron loads. In `createWindow()`, `win.loadFile(...)` loads the built `dist/renderer/index.html`. Many tutorials use `loadURL('http://localhost:5173')` against a Vite dev server instead; this app does not.

## Where things go

| I want to… | Put it in |
|---|---|
| Touch the OS (files, processes, dialogs) | `src/main/`, as a service; expose via an IPC handler |
| Add a renderer-callable function | 1) handler in `main.ts` 2) method in `preload.ts` 3) type in `src/shared/types.ts` |
| Share a type between processes | `src/shared/` (no Node or DOM imports) |
| Build UI | `src/renderer/` |

When adding a new IPC channel, update all three places together. A channel missing from the preload fails silently at the `window.toolbox` boundary.

## Gotchas

- **Main is single-threaded Node.** CPU-heavy work blocks every window. Spawn child processes (as `runner.ts` does) or use `utilityProcess` / worker threads.
- **Child processes need cleanup.** Kill them on `before-quit`, or they outlive the app.
- **Window destroyed mid-stream.** Check `event.sender.isDestroyed()` before `send`, as `main.ts` does.
- **Paths differ between dev and packaged builds.** Use `app.getPath('userData')` for app data; resolve bundled files relative to `__dirname`.
- **Native modules** must be rebuilt against Electron's Node version (`@electron/rebuild`).
- **Debugging.** Renderer: DevTools (`win.webContents.openDevTools()`). Main: `console.log` to the terminal, or attach a debugger with `--inspect`.
- **Bundle size** is 100 MB+ because you ship a browser. That is normal.
- **No Next.js here.** The renderer is Vite + React. If you ever move to Next, you would need `output: 'export'` (static files only: no SSR, API routes or middleware), because the packaged app has no Next server.

## Further reading

- [Electron: Process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron: Context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron: IPC](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron: Security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
