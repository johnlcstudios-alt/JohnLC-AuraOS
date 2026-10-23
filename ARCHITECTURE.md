# JohnLC AuraOS Architecture

This document explains how JohnLC AuraOS is put together: the two-tier process model, the
file tree, every module's responsibility, the IPC contract, and the window-manager
state machine.

---

## 1. Process model

JohnLC AuraOS is a **two-tier** application that can also degrade gracefully to one tier.

```
┌──────────────────────────────── Renderer (sandboxed Chromium) ───────────────────────────────┐
│                                                                                             │
│   React 18 + Tailwind + Framer Motion                                                       │
│                                                                                             │
│   Shell ──┬── Wallpaper / DesktopIcons                                                      │
│           ├── WindowLayer ── WindowFrame ── <lazy app component>                            │
│           ├── TopBar · Dock · Taskbar                                                       │
│           └── Spotlight · ControlCenter · Widgets · StartMenu · Toaster                     │
│                                                                                             │
│   Core (framework-agnostic stores)                                                          │
│     WindowManager (reducer + observable)   ThemeEngine   systemStore   bus   uiStore        │
│                                                                                             │
│   window.auraos  ◄── contextBridge ── preload.ts                                            │
└───────────────────────────────┬─────────────────────────────────────────────────────────────┘
                                │  typed IPC  ({ ok, value | error })
┌───────────────────────────────▼─────────────────────────────────────────────────────────────┐
│                              Main process (Node / Electron)                                  │
│   main.ts ── frameless BrowserWindow · single-instance lock · IPC handlers                   │
│   services/                                                                                 │
│     configService  fsService  shellService  metricsService                                   │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Native mode** (`bridge.mode === 'native'`): `window.auraos` is injected by the
  sandboxed preload script; every call round-trips to a real main-process service.
- **Web mode** (`bridge.mode === 'web'`): `src/core/ipc/bridge.ts` can't find
  `window.auraos`, so it constructs a `MockBridge` that fulfils the identical
  interface in memory. The entire UI is unchanged — only the data source differs.

Swapping the implementation is a single line in `src/core/ipc/bridge.ts`:

```ts
function resolveBridge(): AuraOSBridge {
  if (typeof window !== 'undefined' && window.auraos) return window.auraos
  return createMockBridge()
}
```

---

## 2. File tree

```
auraos/
├── index.html                      # Vite entry (inline SVG favicon)
├── package.json                    # scripts + myos/start-os bins
├── tsconfig.json                   # renderer (noEmit, bundler resolution, jsx)
├── tsconfig.electron.json          # type-check config for the main process tier
├── vite.config.ts                  # base './' + build-only CSP injection
├── tailwind.config.js
├── postcss.config.js
├── install.sh · install.ps1        # platform wrappers
├── build/                          # packaging resources (committed)
│   ├── icon.png                    # 512×512 app icon
│   └── icon.ico                    # 256×256 Windows exe/installer icon
├── release/                        # generated installers + unpacked app (gitignored)
│
├── bin/
│   └── myos.mjs                    # `myos` / `start-os` CLI (launch|dev|web|build|doctor|reset)
│
├── installer/
│   └── setup.mjs                   # zero-dependency bootstrap + doctor
│
├── scripts/
│   ├── dev.mjs                     # bundle electron → boot vite → wait → launch electron
│   ├── build-electron.mjs          # esbuild: bundle main + preload → dist-electron/
│   ├── make-icon.mjs               # zero-dependency PNG/ICO generator (matches favicon)
│   ├── smoke.mjs · smoke-web.mjs   # CDP-driven native + browser smoke runners
│   └── lib/cdp.mjs                 # dependency-free CDP client + shared UI checks
│
├── shared/                         # imported by BOTH tiers
│   ├── channels.ts                 # CH: single source of truth for IPC channel names
│   └── bridge.ts                   # AuraOSBridge contract + DTOs + Window augmentation
│
├── electron/                       # main process
│   ├── main.ts                     # window, lifecycle, input hooks, IPC registration
│   ├── preload.ts                  # contextBridge: builds `window.auraos` from CH
│   └── services/
│       ├── configService.ts        # JSON key/value store in userData
│       ├── fsService.ts            # list/stat/read/mkdir/remove/pickImage
│       ├── shellService.ts         # line-oriented command execution (+ killTree)
│       └── metricsService.ts       # CPU/RAM sampler + process table + kill
│
└── src/                            # renderer
    ├── main.tsx                    # createRoot + StrictMode + global CSS
    ├── App.tsx                     # boot splash, theme/system init, desktop seeding
    ├── styles/global.css           # design tokens, glass/acrylic, wallpapers, chrome
    │
    ├── core/                       # framework-agnostic engine
    │   ├── bus.ts                  # typed pub/sub (APP_ARGS, TOAST, OVERLAY)
    │   ├── hooks.ts                # useStore/useTheme/useSystem/useMedia
    │   ├── uiStore.ts              # overlay + selection UI state
    │   ├── actions.ts              # runnable-action registry
    │   ├── builtinActions.ts       # every built-in command (menus/search reuse)
    │   ├── shortcuts.ts            # combo normalisation + rebindable bindings
    │   ├── calc.ts                 # safe arithmetic evaluator (Spotlight calc)
    │   ├── media.ts                # shared now-playing engine (+ synth radio track)
    │   ├── notifications.ts        # history + DND-aware banners
    │   ├── apps/
    │   │   ├── types.ts            # AppDef / AppProps / AppTask
    │   │   ├── registry.ts         # APPS map, launchApp (singleton re-navigation)
    │   │   └── pins.ts             # persisted Dock/Start pin overrides
    │   ├── ipc/
    │   │   ├── bridge.ts           # native-vs-mock selection
    │   │   └── mockBridge.ts       # full in-memory fallback (fs, shell, metrics)
    │   ├── search/
    │   │   └── search.ts           # fuzzyScore + searchEverything + searchFiles
    │   ├── system/
    │   │   └── systemStore.ts      # persisted hardware toggles (wifi, volume, ...)
    │   ├── theme/
    │   │   ├── accents.ts          # 10 accents
    │   │   ├── wallpapers.ts       # 6 CSS wallpapers
    │   │   └── ThemeEngine.ts      # persisted theme + resolved light/dark
    │   ├── previews.ts             # dock/taskbar window-preview popover store
    │   └── wm/
    │       ├── types.ts            # WMState / WMWindow / WMAction / SnapRegion
    │       ├── snap.ts             # snap regions, magnet edges, work-area maths
    │       ├── WindowManager.ts    # pure reducer + observable store
    │       └── useWindowManager.ts # React binding + dock-anchor + work-area helpers
    │
    ├── ui/
    │   └── controls.tsx            # GlassPanel, Toggle, Slider, Segmented, MenuList, ...
    │
    ├── windows/
    │   ├── WindowLayer.tsx         # renders every window + snap preview
    │   ├── WindowFrame.tsx         # chrome, drag/resize/snap, minimize animation
    │   └── SnapLayoutsMenu.tsx     # Windows 11 layout chooser
    │
    ├── shell/
    │   ├── Shell.tsx               # composes palette, icons, windows and overlays
    │   ├── Wallpaper.tsx           # preset / live / custom image layer
    │   ├── DesktopIcons.tsx        # desktop shortcuts
    │   ├── TopBar.tsx              # global menu bar + status area
    │   ├── Dock.tsx                # macOS dock with magnification + jump lists
    │   ├── Taskbar.tsx             # Windows 11 centred taskbar
    │   ├── jumpList.ts             # shared Dock/Taskbar jump-list builder
    │   ├── useAppHover.ts          # hover-intent timer for window previews
    │   ├── AppPreviewHost.tsx      # live window-thumbnail popover host
    │   ├── StartMenu.tsx           # app grid / list
    │   ├── Spotlight.tsx           # universal search
    │   ├── ControlCenter.tsx       # macOS control centre
    │   ├── Widgets.tsx             # widgets slide-out panel
    │   ├── Toaster.tsx             # transient notifications
    │   └── useGlobalShortcuts.ts   # global keybindings
    │
    └── apps/
        ├── files/FilesApp.tsx      # dual-pane browser + tags + preview
        ├── terminal/TerminalApp.tsx# tabs + real shell + built-ins
        ├── settings/{SettingsApp.tsx, sections.ts}
        ├── taskmgr/TaskManagerApp.tsx
        ├── about/AboutApp.tsx
        ├── calculator/CalculatorApp.tsx  # core/calc evaluator + paper tape
        ├── notes/NotesApp.tsx      # config-backed note library
        ├── clock/ClockApp.tsx      # world clock, alarms, timer, stopwatch
        ├── textedit/TextEditApp.tsx# plain-text editor + unsaved-work guard
        ├── reminders/RemindersApp.tsx # lists + due notifications w/ actions
        ├── calendar/CalendarApp.tsx  # month grid, events, ICS import/export
        ├── contacts/ContactsApp.tsx   # address book + vCard import/export
        ├── photos/PhotosApp.tsx      # library, preview/zoom/rotate, favourites
        ├── music/MusicApp.tsx        # generated stations + local disk playback
        └── videos/VideosApp.tsx      # video library + native playback
```

---

## 3. Module responsibilities

### shared/
- **`channels.ts`** — the canonical list of IPC channel strings. Imported by
  `main.ts`, `preload.ts` and the renderer, so a name can never drift.
- **`bridge.ts`** — the `AuraOSBridge` interface plus DTOs (`DirEntry`, `FileStat`,
  `SysInfo`, `MetricSample`, `ProcEntry`, `ShellResult`). Declares
  `Window.auraos?: AuraOSBridge`.

### electron/ (main process)
- **`main.ts`** — creates the frameless 1440×900 `BrowserWindow` (sandbox on,
  contextIsolation on), applies the single-instance lock, wires `F11`/`F12`/`Ctrl+R`
  through `before-input-event`, and registers every IPC handler through a `handle()`
  helper that wraps results in `{ ok, value | error }`.
- **`preload.ts`** — rebuilds `window.auraos` from the `CH` map, unwrapping the
  envelope so renderer callers either get a value or a thrown `Error`.
- **`services/fsService.ts`** — path-normalised filesystem access, text/image
  read+write, copy/move/trash (`shell.trashItem`, `fs.cp`), recursive search, zip/unzip
  (via `toolRunner`) and a native `dialog` picker for wallpapers.
- **`services/toolRunner.ts`** — one place that spawns host tools (archivers) with a
  timeout and a normalised exit code, so `fs:zip` works on Windows/macOS/Linux.
- **`services/clipboardService.ts`** — Electron `clipboard` read/write for text and PNG
  images, backing clipboard history.
- **`services/screenService.ts`** — `desktopCapturer` screenshots returned as data-URLs.
- **`services/powerService.ts`** — suspend / lock / restart / shutdown plus a
  `powerSaveBlocker`-based prevent-sleep toggle.
- **`services/dialogService.ts`** — native open/save/message dialogs mapped onto the
  async dialog store.
- **`services/shellService.ts`** — `spawn(command, { shell: true })` with an ANSI
  stripper, a 1 MB output cap and a 30 s default timeout; `killTree` uses
  `taskkill /T /F` on Windows and `SIGKILL` elsewhere.
- **`services/metricsService.ts`** — samples `os.cpus()` deltas for CPU%/per-core,
  pulls a Windows process table from PowerShell (`Get-Process … | ConvertTo-Json`)
  with delta-based CPU% and falls back to `tasklist`; pushes samples to the renderer
  every 1500 ms and refreshes the process list every ~3 s.
- **`services/configService.ts`** — debounced JSON persistence in `userData`.

### src/core/ (renderer engine)
- **`wm/`** — the window manager. `types.ts` defines the data model; `snap.ts`
  computes snap rectangles and edge magnetism; `WindowManager.ts` is a **pure
  reducer** wrapped in a tiny observable store; `useWindowManager.ts` is the React
  binding and also computes the work area and the minimize animation target.
- **`theme/`** — `ThemeEngine` persists prefs, resolves `light`/`dark` (live via
  `matchMedia` in Auto mode) and writes `data-*` attributes + the `--accent` custom
  property on `<html>`; all CSS keys off those attributes.
- **`system/systemStore.ts`** — persisted toggles (Wi-Fi, Bluetooth, Focus, Night
  Light, brightness, volume, battery) shared by the Control Center, Taskbar tray and
  Settings.
- **`ipc/`** — bridge selection and the full mock fallback.
- **`apps/`** — the lazy app registry. Every app is one `AppDef` entry in
  `registry.ts` plus a lazily imported module, so adding an app never touches the
  shell. `launchApp` opens a new window, or re-focuses and re-navigates a singleton
  (e.g. Settings to a specific pane, Clock to a tab, Calculator to a mode) via
  `bus`/`APP_ARGS`. `AppTask`s declared on the entry become the Dock/Taskbar **jump
  list** items (new window, "New Note", app sub-sections) and reuse the same
  re-navigation path, and `pins.ts` stores the user's pin/unpin overrides
  (`bridge.config` key `appPins`) on top of the registry's default `pinned` flag.
- **`previews.ts`** — the single global window-preview popover store (open delay,
  hover grace period, active app) driven by `shell/AppPreviewHost.tsx`.
- **`actions.ts` / `builtinActions.ts`** — a registry of every command in the OS
  (open app, window/desktop ops, appearance, capture, quit…). Menus, Spotlight, the
  command palette and Settings all enumerate the same list, so nothing is hard-coded
  twice.
- **`shortcuts.ts`** — key-combo normalisation (`keyToken`/`eventCombo`), the default
  binding table and a `ShortcutRegistry` that maps combos → action ids, supports
  rebinding and persists overrides. `useGlobalShortcuts` is the single keydown owner.
- **`uiStore.ts`** — the overlay flags (Spotlight, Control Center, Mission Control,
  Notification Center, Clipboard, Widgets, Quick Look, Force Quit…) as one observable
  store, so any surface can `open`/`toggle`/`closeTopmost` them.
- **`bus.ts`** — the tiny typed event bus (`TOAST`, `APP_ARGS`, `OVERLAY`).
- **`notifications.ts`** — notification history + unread state; emitting `TOAST`
  feeds the Toaster banners.
- **`clipboard.ts`** — clipboard history (text/image/files), pinned entries and a
  poller that mirrors the OS clipboard through the bridge.
- **`dialogs.ts` / `contextMenu.ts` / `quickLook.ts`** — imperatively driven UI
  services: async alert/confirm/prompt, a single global context menu and the Space
  Quick Look preview target.
- **`calc.ts`** — a dependency-free, `eval`-free arithmetic evaluator (tokenizer +
  recursive-descent parser) powering Spotlight's inline calculator.
- **`ics.ts` / `vcard.ts`** — dependency-free interchange writers/parsers: an
  RFC 5545 subset (VEVENT, dates, alarms, escaping, folding) behind Calendar's
  import/export, and a vCard 3.0 subset (N/FN/TEL/EMAIL/ADR/ORG, escaping,
  folding) behind Contacts' import/export.
- **`media.ts`** — the shared now-playing engine. Real audio streams through a hidden
  `<audio>` element; the built-in "AuraOS Radio" track is *synthesised* offline
  (`OfflineAudioContext` → WAV blob), so the transport is genuinely audible with zero
  assets. Mirrors state to the Media Session API and holds a `powerSaveBlocker`.
- **`search/search.ts`** — universal search: fuzzy scoring over apps, the **action
  registry** (commands), settings panes and places, an inline calculator result, a
  web-search fallback and async filename search. `Spotlight` merges the sync and
  async result sets and renders them grouped.
- **`switcher.ts`** — the hold-to-cycle window switcher state (Ctrl+Tab).
- **`hotCorners.ts`** — corner → action mapping, persisted, edge-triggered with a
  cooldown by `shell/HotCorners.tsx`.
- **`session.ts`** — optionally snapshots the window/desktop layout into config and
  rehydrates it on launch through the WM `hydrate` action.

### src/windows/
- **`WindowFrame.tsx`** owns the chrome and the pointer interactions. Drag/resize use
  pointer capture; while dragging it asks `snap.ts` for a magnet region and shows the
  preview; on release it applies the snap. Minimize animates toward the app's dock /
  taskbar icon via `findDockAnchor`, then dispatches `minimizeSettled` to hide the
  node once the animation finishes.
- **`SnapLayoutsMenu.tsx`** appears after hovering the maximise button and applies a
  quarter/third/half region through `wm.snapTo`.

### src/shell/
Each shell surface is a small component; `Shell.tsx` composes them and keeps the
window-manager work area in sync with the viewport and the active shell mode.

Beyond the chrome (TopBar/Dock/Taskbar/StartMenu/ControlCenter/Widgets/Spotlight)
the shell hosts the desktop surfaces introduced for feature parity: `DesktopIcons`,
`NotificationCenter`, `ClipboardHistory`, `MissionControl`, `QuickLook`,
`ForceQuit`, `WindowSwitcher`, `WorkspaceBar` (the desktop pager) and `HotCorners`,
plus the two global hosts `ContextMenuHost` and `DialogHost`. Non-active desktops
stay mounted but hidden (`WindowFrame`'s `onScreen`), so app state survives a
desktop switch.

`Dock` and `Taskbar` share two behaviours through `shell/` helpers:

- **Jump lists** — right-clicking an icon opens a `contextMenu` built by
  `jumpList.ts` from the app's `AppTask`s, its open windows (activate/close),
  Keep/Remove from Dock (`appPins`) and Quit. The tooltip is suppressed while a
  preview or menu owns the icon.
- **Window previews** — hovering a running icon (after `PREVIEW_OPEN_DELAY`) opens
  one global popover (`AppPreviewHost`) listing a card per window. Each thumbnail is
  a **live clone** of the window's `.win-body` subtree, scaled with a CSS transform
  and marked inert (`pointer-events: none`), with a tinted gradient card as the
  fallback layer until the clone paints. Clicking a card focuses that window
  (`wm.activateWindow`); a grace period keeps the popover alive while the pointer
  travels to it, and Escape/outside-pointerdown/leaving dismisses it.

The mutable shell surfaces share stores rather than props: `ControlCenter` and the
`Widgets` **Now Playing** card both drive `media`; the **Focus (DND)** tile writes
`system.focus`, which `notifications.push` reads to suppress banners; `StartMenu`
and `Spotlight` both render `searchEverything` results. `Toaster` keeps a small
stack so notifications never clobber one another.

---

## 3a. Testing

`scripts/lib/cdp.mjs` is a dependency-free Chrome DevTools Protocol client plus the
shared UI checks. Two runners use it:

- **`npm run smoke`** (`scripts/smoke.mjs`) — builds, launches the Electron app with
  `--remote-debugging-port` and an isolated `--user-data-dir`, then drives the real
  UI with synthetic key events (overlays opening/closing, launching apps,
  snapping/maximising, virtual desktops, Quick Look, Settings panes) and asserts on
  the DOM. It also fails the run if the renderer logs an unexpected console error.
- **`npm run smoke:web`** (`scripts/smoke-web.mjs`) — starts Vite pinned to
  `127.0.0.1`, launches headless Chrome at it and runs the same checks through
  MockBridge, covering the browser path end to end.

Small, stable hooks make this possible: overlays render `data-overlay="…"`, windows
render `data-app` / `data-state` / `data-focused` / `data-onscreen` / `data-desktop`,
Dock/Taskbar icons render `data-dock-app` / `data-taskbar-app`, the global context
menu renders `data-menu="context"` and apps expose their own handles
(`data-calc-key`/`data-calc-display`, `data-notes-row`/`data-notes-action`,
`data-clock-tab`/`data-clock-time`, `data-textedit-*` (dirty/counts/actions),
`data-reminders-*` (count/done/filters/rows/notification actions),
`data-calendar-*` (month/selected/day chips/event editor) and
`data-contacts-*` (count/search/rows/editor)). Unpinned apps are launched in the
checks through Spotlight (`launchViaSpotlight`). The suite covers shell chrome,
window
management, virtual desktops and every shipped app, including the jump lists, the
pin round-trip, the live window previews, and the Settings → System startup card
(honestly reported as unavailable when running outside an installed build).

## 3b. App contract

An app is **one entry in `apps/registry.ts` + one lazy module**; nothing else in the
shell is touched. The entry carries the identity (id, name, subtitle, icon, tint,
keywords, category), sizing (`defaultSize`/`minSize`) and behaviour flags
(`singleton`, `pinned`, `searchable`), the optional `tasks` that feed the Dock/
Taskbar jump lists, and `component: lazy(() => import(…))`. The module default-exports
a component that takes `AppProps` (`windowId`, `args`), reads its own data through
`bridge`, and, when it is a singleton, subscribes to `APP_ARGS` to re-navigate.

Shipped apps: **files**, **terminal**, **settings**, **taskmgr**, **about**,
**calculator** (expression keypad + tape over `core/calc`), **notes** (debounced
config-backed library), **clock** (world clock/alarms/timer/stopwatch),
**textedit** (editor over `fs:readText`/`fs:writeText` with a `wm.addCloseGuard`
unsaved-work prompt), **reminders** (config-backed lists; overdue items raise real
notifications with working *Mark done* / *Snooze 10 min* actions),
**calendar** (month grid + events over `core/ics`), **contacts** (searchable
address book over `core/vcard`), **photos** (thumbnail library with preview,
rotate/favourite and import into `~/Pictures`), **music** (offline-synthesised
stations plus real local files through the shared `media` engine) and **videos**
(library + native `<video>` transport). Only a handful of apps are pinned to the Dock by
default (user pin overrides persist through `bridge.config` key `appPins`); the
rest launch through Spotlight, jump-list tasks or `wm.open`. Apps that
need honest cross-app behaviour reuse the shared services instead of faking it:
`bridge.config` for persistence, `notifications` for alarms/timer completion (with
real action buttons), `dialogs`, `contextMenu` and `toast` for feedback.

## 3c. Packaging, installer and auto-start

`npm run dist` runs the normal build and then electron-builder with the config in
`package.json` → `build`. The target is an x64 **NSIS assisted installer** named
`release/JohnLC-AuraOS-Setup-<version>.exe`; `release/win-unpacked/` holds the same
app unpacked for quick testing (`npm run dist:dir`).

- **Content:** `dist/**`, `dist-electron/**` and `package.json` are packed into
  `app.asar`. The renderer is bundled by Vite and the main/preload tiers by esbuild,
  so production `node_modules` are excluded (`!node_modules/**/*`) and
  `npmRebuild` is off. The installer therefore needs nothing on the target machine.
- **Install scope:** `perMachine: false` installs per user under
  `%LOCALAPPDATA%\Programs\JohnLC AuraOS` without elevation, while
  `allowToChangeInstallationDirectory` keeps the wizard's directory chooser. The
  product is **JohnLC AuraOS**; the shortcut name is the short form **AuraOS**.
- **Shortcuts:** `createDesktopShortcut: "always"` and
  `createStartMenuShortcut: true` create `AuraOS.lnk`; `runAfterFinish` offers to
  launch the app. NSIS registers the uninstaller in Apps & Features and keeps
  `%APPDATA%\JohnLC AuraOS` unless the user removes it.
- **Icon:** `scripts/make-icon.mjs` deterministically renders the favicon artwork to
  `build/icon.png` (512×512) and `build/icon.ico` (256×256 PNG-in-ICO) using only
  Node built-ins (`zlib` for PNG). The ICO is used for the executable and installer.
- **Signing:** none by default, so SmartScreen can warn. Add a code-signing
  certificate to the electron-builder config for public distribution.

Auto-start is a runtime user preference, not an installer option:

1. **Settings → System → Startup** calls `bridge.app.getAutoLaunch()` on mount and
   `setAutoLaunch(enabled)` on toggle.
2. Those map to `app:autoLaunchGet` / `app:autoLaunchSet` (`shared/channels.ts`,
   preload, and `handle()` in `electron/main.ts`).
3. The main process reads/writes the OS registration with
   `app.getLoginItemSettings()` / `app.setLoginItemSettings({ openAtLogin,
   path: process.execPath })`. On Windows that is the per-user
   `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value; macOS uses login
   items.
4. The feature is gated on `app.isPackaged` and Windows/macOS. Dev builds and the
   browser MockBridge return `supported: false` with an "Available after installing
   JohnLC AuraOS" hint, so `npm run dev` never registers `electron.exe` to start at
   login. The Settings toggle reflects the real OS state rather than a config file.

Validation performed against the built installer: silent install to a temporary
directory, desktop/Start Menu shortcut target checks, launching the installed app,
enabling then disabling auto-start while watching the `Run` key, and a silent
uninstall that removed the files, shortcuts and Apps & Features entry.

## 4. IPC contract

Every channel returns an envelope `{ ok: true, value } | { ok: false, error }`; the
preload unwraps it so renderer code looks like ordinary async calls.

| Group | Channel | Signature |
| --- | --- | --- |
| system | `sys:info` | `() => SysInfo` |
| | `sys:metrics` | `() => MetricSample` (pull) / push to renderer |
| | `sys:processes` | `() => ProcEntry[]` |
| | `sys:kill` | `(pid) => { ok, error? }` |
| | `sys:openPath` / `sys:beep` / `sys:print` / `sys:setBadge` / `sys:flashFrame` | host integration |
| fs | `fs:home` / `fs:list` / `fs:stat` | browse |
| | `fs:readText` / `fs:writeText` | UTF-8 text (`maxBytes` cap on read) |
| | `fs:readDataUrl` / `fs:writeDataUrl` | image previews / saved assets |
| | `fs:mkdir` / `fs:remove` | directory + file management |
| | `fs:pickImage` | native image picker |
| | `fs:copy` / `fs:move` / `fs:trash` | recursive copy/move, OS trash |
| | `fs:search` | recursive filename search (skips `node_modules`, dot-dirs…) |
| | `fs:reveal` / `fs:openWith` | hand off to the OS file manager / default app |
| | `fs:zip` / `fs:unzip` | archives via the system tool runner |
| clipboard | `clip:readText` / `clip:writeText` / `clip:readImage` / `clip:writeImage` | text + PNG image clipboard |
| screen | `screen:listDisplays` / `screen:captureDisplay` | `desktopCapturer` screenshots |
| power | `power:status` / `power:lock` / `power:sleep` / `power:restart` / `power:shutdown` / `power:preventSleep` | power + session control |
| dialog | `dialog:openFile` / `dialog:saveFile` / `dialog:message` | native pickers + message boxes |
| shell | `shell:exec` | `(command, { cwd?, timeoutMs? }) => ShellResult` |
| config | `cfg:all` / `cfg:get` / `cfg:set` | `ConfigBag` access |
| app | `app:quit` / `app:openExternal` | host control |
| | `app:autoLaunchGet` / `app:autoLaunchSet` | `() => AutoLaunchStatus` / `(enabled) => AutoLaunchStatus` (installed Windows/macOS only) |

Zip/unzip are delegated to `services/toolRunner.ts`, which shells out to
`Compress-Archive`/`Expand-Archive` on Windows and `zip`/`unzip` elsewhere (a
missing tool yields code `-1`). The renderer never talks to those tools directly —
it only knows the two bridge calls, so MockBridge can simulate them in the browser.

---

## 5. Window-manager state machine

```
state: WMState {
  windows: WMWindow[]        // ordered back → front
  focusedId, phase, interaction, snapPreview, workArea, seq,
  desktops: DesktopInfo[],   // virtual desktops (Spaces)
  activeDesktop
}

WMWindow {
  id, appId, title, args,
  rect, restoreRect,         // geometry to return to on un-maximize/un-snap
  state: 'normal' | 'maximized' | 'snapped' | 'minimized',
  restoreState,              // visual state to return to on un-minimize
  snapRegion, zIndex, focused,
  minSize, hidden,           // hidden = minimize animation finished
  desktop, alwaysOnTop,      // which Space it lives on / floats above the rest
  createdAt, animNonce       // bumped per minimize/restore animation
}
```

Key transitions (all in `wmReducer`):

- `open` — cascade-placement, raise, focus.
- `dragStart` / `dragMove` / `dragEnd` — move + magnet preview; `dragEnd` applies the
  snap if a region was previewed. Dragging a maximized/snapped window "tears it off".
- `resizeStart` / `resizeMove` / `resizeEnd` — 8-way resize clamped to `minSize` and
  the work area; resizing drops a maximized/snapped window back to `normal`.
- `applySnap(region, rect)` — used by edge magnetism, the Snap Layouts menu and the
  keyboard shortcuts.
- `toggleMaximize` — maximizes or restores to `restoreRect`; `maximize` / `unmaximize`
  are the idempotent forms used by the shortcut and window menu.
- `minimize` → animation → `minimizeSettled(nonce)` → `hidden`; `restore` reverses it.
- `workArea` — re-fits every maximized/snapped window on viewport or shell-mode change.
- `desktopSwitch` / `desktopAdd` / `desktopRemove` / `windowToDesktop` — Spaces
  management; `toggleAlwaysOnTop` floats a window above all others (its effective
  z-index is `(alwaysOnTop ? 100000 : 0) + zIndex`).
- `hydrate(snapshot)` — replaces the whole state, used by session restore.

`SnapRegion` covers `max`, halves, quarters, thirds and two-thirds, so the same
primitive backs Windows 11 layouts and macOS-style tiling.

---

## 6. Theming

All visual state is expressed as data attributes / custom properties on `<html>`:

```
data-theme      = light | dark
data-shell-mode = dock | taskbar
data-chrome     = macos | windows
data-transparency, data-reduce-motion
--accent, --accent-rgb
```

`global.css` defines the surface tokens (`--surface`, `--panel`, `--text`, `--line`,
…), the `.glass` / `.glass-strong` acrylic primitives, the wallpaper classes
(`.wp-aurora`, `.wp-mesh`, …) and every shell/window class. Components never hard-code
a palette — they read tokens, so switching theme, accent or shell mode repaints the
entire environment with no re-render of app internals.

---

## 7. Boot sequence

1. `electron/main.ts` → `app.whenReady()` → load config → register IPC → create window
   → start the metrics sampler.
2. `src/main.tsx` mounts `<App/>`.
3. `App.tsx` shows a boot splash, runs `theme.init()` and `system.init()` (both read
   persisted config through the bridge), then reveals the `Shell`.
4. Once ready, JohnLC AuraOS seeds a Files window so the first run feels like a real desktop
   (guarded against React StrictMode's double-mount).

---

## 8. Why these choices

- **No native modules** — avoids `node-gyp`/compiler pain. The trade-off is that
  interactive TUIs (vim, htop) are out of scope for the Terminal; everything else works.
- **No binary assets** — wallpapers and icons are CSS/SVG, so the repo stays tiny and
  text-only, and the shell renders identically everywhere.
- **Framework-agnostic core** — the window manager, theme engine and stores are plain
  observables surfaced through `useSyncExternalStore`, so they can be tested and reused
  without React.
- **One contract for two worlds** — the `AuraOSBridge` interface is the seam that
  keeps the desktop usable with or without Electron.
- **Bundled Electron tier** — `scripts/build-electron.mjs` (esbuild) inlines the
  `shared/` imports into a self-contained preload. This is required because a
  *sandboxed* preload's `require()` can only resolve built-in Electron/Node modules,
  never relative paths like `../shared/channels`. Type safety still comes from
  `tsc --noEmit`; esbuild only produces the JavaScript.
