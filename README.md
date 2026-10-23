# JohnLC AuraOS

> An open-source desktop environment that fuses the **macOS** Dock / Spotlight / Top Bar
> with the **Windows 11** Snap Layouts, centred Taskbar and Quick Settings.

JohnLC AuraOS is not a Linux distribution or a bootloader — it is a complete, installable
desktop **shell** built with Electron, React, TypeScript and Tailwind. It runs full
screen on macOS, Windows and Linux, talks to your real filesystem and shell, and
renders a live glass/acrylic interface on top of your operating system.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ● AuraOS        File  Edit  View  Window  Help        ⌘  ⚙  🔋  80%  │  ← Top Bar
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│     ╭───────────────╮   ╭──────────────────────────╮                 │
│     │  Finder       │   │  Terminal                │                 │
│     │  ~/Projects   │   │  user@auraos:~$ sysinfo  │   ← windows     │
│     ╰───────────────╯   ╰──────────────────────────╯                 │
│                                                                      │
│                    ▚ ▚ ▚   dock / taskbar   ▚ ▚ ▚                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Highlights

**Window manager (from scratch)**
- Real-time drag, 8-way resize, dynamic z-index stacking and focus management.
- **Snap Layouts**: hover the maximise button for a Windows 11 style layout chooser.
- **Snap Assist** via edge magnetism — drag a window to a screen edge to tile it
  (left/right/top/bottom, quarters, thirds and two-thirds regions).
- Genie-style minimize animation that flies to the app's Dock/Taskbar icon.
- Maximize, restore, minimize and cascade placement, all keyboard-driven too.
- **Virtual desktops (Spaces)**, always-on-top windows and a bottom pager bar.

**Desktop & system surfaces**
- **Mission Control / Task View** (`F3`) with a per-desktop card grid and desktop strip.
- **Window switcher** — hold `Ctrl+Tab` to cycle windows, release to focus.
- **Notification Center** (`Ctrl+Shift+N`) with history, actions and unread badge.
- **Clipboard History** (`Ctrl+Shift+V`) — text + images, pin/search/re-copy.
- **Quick Look** — press `Space` (or use a context menu) for a large file preview.
- **Force Quit** (`Ctrl+Alt+Esc`) to close a window immediately.
- **Hot corners** (Mission Control, Notifications, Show Desktop, Widgets) — configurable.
- **Context menus** everywhere: desktop, desktop icons, window title bars and file lists.
- **Session restore** — open windows, positions and desktops come back on next launch.

**Two shells in one**
- macOS mode: floating glass Dock with icon **magnification**, Top menu bar, Control Center.
- Windows 11 mode: centred Taskbar, Start menu, Quick Settings, Widgets panel.
- Switch instantly in **Settings → Personalization**.

**Theme engine**
- Light / Dark / Auto (follows the OS colour scheme live).
- 10 accent colours, 6 CSS wallpapers (several with a drifting "live" layer) and
  custom wallpaper images.
- Translucency, reduce-motion and window-chrome style (traffic lights vs. Windows buttons).

**Built-in apps**
| App | What it does |
| --- | --- |
| **Files** | Dual-pane browser, breadcrumbs, quick tags, image/text preview, create/delete |
| **Terminal** | Tabs, acrylic backdrop, **real shell execution** plus AuraOS built-ins |
| **Settings** | Appearance, Personalization, Display, Sound, Network, Keyboard, System |
| **Task Manager** | Live CPU/RAM graphs, per-core meters, sortable process table, end-task |
| **About** | Version, host details, diagnostics |

**Command ecosystem**
- **Spotlight** universal search (`Ctrl/Cmd + Space`) across apps, **commands**, settings, files, places — plus an inline **calculator** and a **web-search** fallback. `Space` previews a highlighted file.
- **Control Center / Quick Settings** flyouts with Wi-Fi/Bluetooth device lists, Focus (Do Not Disturb), Night Light, volume, brightness — and a **real now-playing card** (a shared media engine with Media Session support).
- **Widgets** panel with clock, weather (flagged demo), a **Now Playing** widget, live system gauges, calendar and a persistent note.
- **Start menu** with search, a pinned grid that flips to an alphabetical **All apps** list, and a full power menu (Lock / Sleep / Restart / Shut Down).
- **Stacking toasts** and a **Focus (DND)** mode that silences notification banners while still recording them.

**Distribution & startup**
- **Self-contained Windows installer** — one `.exe` with Electron and the app inside,
  per-user install, an **AuraOS** desktop icon, Start Menu entry and uninstaller.
- **Open at login** option in **Settings → System → Startup**, backed by the real OS
  login-item registration and opt-in per user.

---

## Requirements

- **Node.js 18 or newer** (20+ recommended) and npm.
- A desktop OS: **Windows 10/11**, **macOS 11+** or a Linux desktop with a display server.
- No native build tools required — JohnLC AuraOS deliberately avoids native modules
  (no `node-pty`, no compiled addons), so `npm install` never needs a compiler.

---

## Install

### Windows installer (single `.exe`)

The release installer is **fully self-contained**: Electron, the renderer, and the
native host bridge are embedded, so the target PC needs no Node.js, npm, Git or
internet connection. Download the current build from the
[Releases page](https://github.com/johnlcstudios-alt/JohnLC-AuraOS/releases/latest), or
build it from source with:

```bash
npm install
npm run dist
```

Output: `release/JohnLC-AuraOS-Setup-<version>.exe` (about 80 MB).

What the installer does:

- installs **per user** (no admin prompt) into
  `%LOCALAPPDATA%\Programs\JohnLC AuraOS`, with a custom-directory option;
- creates an **AuraOS** desktop shortcut and a Start Menu entry;
- registers in **Settings → Apps → Installed apps** with a working uninstaller;
- offers to launch JohnLC AuraOS when setup finishes;
- leaves your profile and files in place when uninstalled.

The build is not code-signed, so Windows SmartScreen may show a warning for a
freshly built installer. Use **More info → Run anyway** only for a build you made
or obtained from a source you trust.

> **Build requirements:** the first `npm run dist` downloads the Electron and NSIS
> build artifacts (a few hundred MB) from GitHub. That download happens on the
> build machine only; the generated installer runs offline.

`npm run dist:dir` produces the unpacked app in `release/win-unpacked` without
building the installer, which is handy for testing.

### One-line installers

**macOS / Linux**

```bash
git clone https://github.com/johnlcstudios-alt/JohnLC-AuraOS.git
cd auraos
./install.sh
```

**Windows (PowerShell)**

```powershell
git clone https://github.com/johnlcstudios-alt/JohnLC-AuraOS.git
cd auraos
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Both wrappers check your Node version and then hand off to a shared,
**zero-dependency** installer (`installer/setup.mjs`) that:

1. runs `npm install`,
2. typechecks and builds the renderer + Electron tier,
3. registers the `myos` / `start-os` CLI via `npm link`.

Installer flags: `--skip-install` · `--skip-build` · `--no-link` · `--yes` ·
`--dev` · `--mirror <registry-url>` · `--doctor`.

### Manual install

```bash
npm install
npm run build
npm start          # or: npm run dev  (hot reload)
```

---

## Run

| Command | Mode | Description |
| --- | --- | --- |
| `npm run dev` | Electron | Vite dev server + Electron with hot reload |
| `npm start` | Electron | Runs the production build full screen |
| `npm run dev:web` | Browser | Browser-only preview (no Electron needed) |
| `npm run build` | — | Typecheck + build renderer and Electron tier |
| `npm run typecheck` | — | TypeScript checks only |
| `npm run smoke` | Electron | Build, then drive the built app over CDP (32 UI checks) |
| `npm run smoke:web` | Browser | Same checks in headless Chrome (browser + MockBridge) |
| `npm run dist` | — | Build the self-contained Windows installer into `release/` |
| `npm run dist:dir` | — | Build the unpacked Windows app (no installer) |
| `npm run icon` | — | Regenerate `build/icon.png` + `build/icon.ico` |
| `npm run doctor` | — | Diagnose your environment / install |

The installed CLI mirrors these:

```bash
myos launch     # build if needed, then open the desktop
myos dev        # hot-reloading dev mode
myos web        # browser-only preview
myos build      # production build
myos doctor     # environment diagnostics
myos reset      # clear build output + saved config (--force)
```

### Browser-only mode

`npm run dev:web` serves the exact same UI in a normal browser. A **MockBridge**
fulfils the whole `AuraOSBridge` contract with an in-memory filesystem, a small
shell interpreter and simulated telemetry, so the desktop stays fully explorable
without the native host. Real disk access, real commands and real CPU/RAM stats
require the Electron mode.

### Start at sign-in

Open **Settings → System → Startup** and enable **Open at login**. The installed app
registers its own executable with the OS (the per-user Windows `Run` key, or macOS
login items) and reflects the real state every time the panel opens. Turning the
toggle off removes the entry immediately. Auto-start is **opt-in** — the installer
never enables it for you.

The option is visible but disabled in `npm run dev` and in the browser preview,
with an honest "Available after installing JohnLC AuraOS" hint, because the dev
Electron binary is not an installed application.

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + Space` | Spotlight universal search |
| `Ctrl/Cmd + ,` | Settings |
| `Ctrl/Cmd + W` | Close focused window |
| `Ctrl/Cmd + M` | Minimize focused window |
| `Ctrl/Cmd + Alt + T` | New Terminal window |
| `Ctrl/Cmd + Alt + F` | New Files window |
| `Ctrl/Cmd + Alt + ← / →` | Snap focused window left / right |
| `Ctrl/Cmd + Alt + ↑` | Maximize focused window |
| `Ctrl/Cmd + Alt + ↓` | Restore focused window |
| `Ctrl/Cmd + Alt + P` | Toggle always-on-top for the focused window |
| `Ctrl/Cmd + Alt + N` | New virtual desktop |
| `Ctrl/Cmd + Alt + [ / ]` | Previous / next virtual desktop |
| `Ctrl/Cmd + Alt + Shift + [ / ]` | Move focused window to the previous / next desktop |
| `Ctrl/Cmd + Shift + Esc` | Task Manager |
| `Ctrl/Cmd + Alt + Esc` | Force Quit panel |
| `F3` | Mission Control / Task View |
| `Ctrl/Cmd + Shift + N` | Notification Center |
| `Ctrl/Cmd + Shift + V` | Clipboard History |
| `Ctrl/Cmd + Shift + S` | Capture screen to clipboard |
| `Ctrl/Cmd + Alt + D` | Toggle light / dark |
| `Ctrl/Cmd + Alt + M` | Toggle Dock / Taskbar shell |
| `Ctrl/Cmd + Alt + L` | Lock |
| `Ctrl + Tab` | Hold to cycle windows, release to focus |
| `Space` | Quick Look the selected file (in Files / desktop) |
| `Escape` | Dismiss the top overlay |
| `F11` | Toggle host full screen |
| `F12` | Toggle developer tools |

Shortcuts are rebindable in **Settings → Keyboard** (click a binding, press the
new keys, `Escape` to restore the default).

## Terminal built-ins

Beyond any real OS command (`git`, `npm`, `rg`, …), the Terminal understands:

```
help      clear     sysinfo / neofetch   theme [light|dark|auto]
accent [id]   open <app>   apps   cd <path>   pwd
echo <text>   date   whoami   history   version
```

`↑` / `↓` walk history, `Tab` completes built-ins, `Ctrl+L` clears the screen.

---

## Configuration & data

- **Saved preferences** live in the Electron user-data directory:
  - Windows: `%APPDATA%\JohnLC AuraOS\auraos-config.json`
  - macOS: `~/Library/Application Support/JohnLC AuraOS/auraos-config.json`
  - Linux: `~/.config/JohnLC AuraOS/auraos-config.json`
- **Browser mode** persists the same config to `localStorage` (`auraos.*`).
- Existing installs are migrated automatically on first launch: the old
  `%APPDATA%\openos\openos-config.json` is copied to the new location when the
  new config does not exist yet.

`myos reset --force` clears both the build output and this config.

---

## Security model

- The renderer is **sandboxed**; `contextIsolation` is on, `nodeIntegration` is off.
- The renderer never touches Node. It only sees the `window.auraos` object exposed by
  the preload script via `contextBridge`.
- All filesystem, shell and process work happens in the **main process** behind typed
  IPC channels with a uniform `{ ok, value | error }` envelope.
- External URLs are opened through the OS handler only after an `http(s)` check.

---

## Project layout

```
auraos/
├── bin/myos.mjs            # `myos` / `start-os` CLI
├── installer/setup.mjs     # zero-dependency bootstrap + doctor
├── install.sh / install.ps1
├── build/                  # app + installer icon (icon.png / icon.ico)
├── release/                # generated installer + unpacked app (npm run dist)
├── scripts/dev.mjs         # Vite + Electron dev orchestrator
├── scripts/build-electron.mjs  # esbuild bundle for the main process tier
├── scripts/make-icon.mjs   # deterministic PNG/ICO icon generator
├── scripts/smoke*.mjs      # CDP-driven native + browser smoke suites
├── electron/               # main process: window, preload, services
├── shared/                 # IPC contracts shared by both tiers
└── src/                    # renderer: shell, window manager, apps, theme
```

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full file tree, module
breakdown, IPC table and window-manager state machine.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Electron failed to install` during `npm install` | Re-run `npm install electron --force`, or use `npm run dev:web` for the browser preview. |
| Blank window / white screen | Run `npm run build` first, then `npm start`. `npm run doctor` reports missing build output. |
| Terminal says "command not found" | You are in browser mode; real shell access needs the Electron host (`npm run dev`). |
| Port 5173 already in use | Stop the other process or set `AURAOS_DEV_URL` and edit the Vite port. |
| Snap Layouts not appearing | Hover the maximise button of **any** window for ~350 ms. |
| SmartScreen warns about the installer | The build is unsigned. Use **More info → Run anyway** for an installer you built yourself or trust. |
| "Open at login" is greyed out | Auto-start only works in an installed build. Run `JohnLC-AuraOS-Setup-*.exe` (or `release\win-unpacked\JohnLC AuraOS.exe`), then reopen Settings. |

---

## License

MIT © The JohnLC AuraOS contributors. Built with Electron, React, TypeScript, Tailwind CSS,
Framer Motion and Lucide.
