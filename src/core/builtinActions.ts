import {
  AppWindow,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Camera,
  ClipboardList,
  Command,
  Grid2x2,
  Layers,
  Lock,
  Maximize2,
  Minus,
  Monitor,
  MoonStar,
  PanelTop,
  Pin,
  Power,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
  SunMoon,
  TerminalSquare,
  X,
} from 'lucide-react'
import { actions, type ActionDef } from './actions'
import { wm } from './wm/WindowManager'
import { ui } from './uiStore'
import { launchApp } from './apps/registry'
import { theme } from './theme/ThemeEngine'
import { bridge } from './ipc/bridge'
import { notify } from './notifications'
import { system } from './system/systemStore'
import { ACCENTS } from './theme/accents'

/** The focused window id, if any. Every window action resolves its target here. */
function focusedId(): string | null {
  return wm.getSnapshot().focusedId
}

function desktopIndex(): number {
  return wm.desktops.findIndex((d) => d.id === wm.activeDesktop)
}

function moveBy(delta: number): void {
  const list = wm.desktops
  if (list.length < 2) return
  const index = desktopIndex()
  const next = (index + delta + list.length) % list.length
  wm.switchDesktop(list[next].id)
}

/**
 * Every command the shell can run, registered once.
 *
 * The keyboard layer binds these ids to combos (see shortcuts.ts) and menus can
 * invoke them directly, so behaviour stays in exactly one place.
 */
export function registerBuiltinActions(): void {
  const defs: ActionDef[] = [
    // ---- apps ------------------------------------------------------------
    {
      id: 'spotlight.open',
      title: 'Spotlight Search',
      subtitle: 'Search apps, files, settings and actions',
      category: 'Apps',
      keywords: ['find', 'launch', 'open'],
      icon: Search,
      run: () => ui.toggle('spotlight'),
    },
    {
      id: 'settings.open',
      title: 'Open Settings',
      category: 'Apps',
      icon: SettingsIcon,
      run: () => void launchApp('settings'),
    },
    {
      id: 'taskmanager.open',
      title: 'Open Task Manager',
      category: 'Apps',
      keywords: ['processes', 'cpu', 'kill'],
      icon: Layers,
      run: () => void launchApp('taskmanager'),
    },
    {
      id: 'terminal.new',
      title: 'New Terminal Window',
      category: 'Apps',
      icon: TerminalSquare,
      run: () => void launchApp('terminal'),
    },
    {
      id: 'files.new',
      title: 'New Files Window',
      category: 'Apps',
      icon: AppWindow,
      run: () => void launchApp('files'),
    },

    // ---- window ----------------------------------------------------------
    {
      id: 'window.close',
      title: 'Close Window',
      category: 'Window',
      icon: X,
      run: () => {
        const id = focusedId()
        if (id) wm.close(id)
      },
    },
    {
      id: 'window.minimize',
      title: 'Minimize Window',
      category: 'Window',
      icon: Minus,
      run: () => {
        const id = focusedId()
        if (id) wm.minimize(id)
      },
    },
    {
      id: 'window.maximize',
      title: 'Maximize Window',
      category: 'Window',
      icon: Maximize2,
      run: () => {
        const id = focusedId()
        if (id) wm.maximize(id)
      },
    },
    {
      id: 'window.restore',
      title: 'Restore Window',
      category: 'Window',
      run: () => {
        const win = wm.focused
        if (!win) return
        if (win.state === 'minimized') wm.restore(win.id)
        else wm.unmaximize(win.id)
      },
    },
    {
      id: 'window.snapLeft',
      title: 'Snap Window Left',
      category: 'Window',
      icon: ArrowLeftToLine,
      run: () => {
        const id = focusedId()
        if (id) wm.snapTo(id, 'left')
      },
    },
    {
      id: 'window.snapRight',
      title: 'Snap Window Right',
      category: 'Window',
      icon: ArrowRightToLine,
      run: () => {
        const id = focusedId()
        if (id) wm.snapTo(id, 'right')
      },
    },
    {
      id: 'window.snapUp',
      title: 'Snap Window Top',
      category: 'Window',
      icon: ArrowUpToLine,
      run: () => {
        const id = focusedId()
        if (id) wm.snapTo(id, 'top')
      },
    },
    {
      id: 'window.snapDown',
      title: 'Snap Window Bottom',
      category: 'Window',
      icon: ArrowDownToLine,
      run: () => {
        const id = focusedId()
        if (id) wm.snapTo(id, 'bottom')
      },
    },
    {
      id: 'window.alwaysOnTop',
      title: 'Toggle Always on Top',
      category: 'Window',
      keywords: ['float', 'pin'],
      icon: Pin,
      run: () => {
        const id = focusedId()
        if (!id) return
        wm.toggleAlwaysOnTop(id)
        const win = wm.getSnapshot().windows.find((w) => w.id === id)
        notify({ title: win?.alwaysOnTop ? 'Always on Top: on' : 'Always on Top: off', kind: 'info', appId: 'system', banner: true })
      },
    },
    {
      id: 'window.fullscreen',
      title: 'Toggle Full Screen',
      category: 'Window',
      run: () => {
        void document.documentElement.requestFullscreen?.().catch(() => undefined)
      },
    },

    // ---- desktops --------------------------------------------------------
    {
      id: 'desktop.next',
      title: 'Next Desktop',
      category: 'Desktop',
      icon: ArrowRightToLine,
      run: () => moveBy(1),
    },
    {
      id: 'desktop.prev',
      title: 'Previous Desktop',
      category: 'Desktop',
      icon: ArrowLeftToLine,
      run: () => moveBy(-1),
    },
    {
      id: 'desktop.new',
      title: 'New Desktop',
      category: 'Desktop',
      keywords: ['space', 'workspace'],
      run: () => {
        wm.addDesktop()
      },
    },
    {
      id: 'desktop.close',
      title: 'Close Current Desktop',
      category: 'Desktop',
      run: () => wm.removeDesktop(wm.activeDesktop),
    },
    {
      id: 'window.moveToDesktop.next',
      title: 'Move Window to Next Desktop',
      category: 'Desktop',
      run: () => {
        const id = focusedId()
        if (!id) return
        const list = wm.desktops
        if (list.length < 2) return
        const next = list[(desktopIndex() + 1) % list.length]
        wm.moveToDesktop(id, next.id)
      },
    },
    {
      id: 'window.moveToDesktop.prev',
      title: 'Move Window to Previous Desktop',
      category: 'Desktop',
      run: () => {
        const id = focusedId()
        if (!id) return
        const list = wm.desktops
        if (list.length < 2) return
        const next = list[(desktopIndex() - 1 + list.length) % list.length]
        wm.moveToDesktop(id, next.id)
      },
    },
    {
      id: 'desktop.showDesktop',
      title: 'Show Desktop',
      subtitle: 'Minimize or restore every window on this desktop',
      category: 'Desktop',
      keywords: ['minimize all', 'reveal desktop'],
      run: () => {
        const onDesk = wm.windowsOn(wm.activeDesktop)
        const anyVisible = onDesk.some((w) => w.state !== 'minimized')
        for (const w of onDesk) {
          if (anyVisible) wm.minimize(w.id)
          else wm.restore(w.id)
        }
      },
    },
    {
      id: 'missionControl.toggle',
      title: 'Mission Control',
      subtitle: 'Show every window across all desktops',
      category: 'View',
      keywords: ['expose', 'task view', 'overview'],
      icon: Grid2x2,
      run: () => ui.toggle('mission-control'),
    },

    // ---- shell surfaces --------------------------------------------------
    {
      id: 'controlCenter.open',
      title: 'Control Center',
      subtitle: 'Quick settings for Wi-Fi, sound, display and more',
      category: 'System',
      keywords: ['quick settings', 'wifi', 'bluetooth', 'volume', 'brightness', 'dnd'],
      icon: SlidersHorizontal,
      run: () => ui.toggle('control-center'),
    },
    {
      id: 'focus.toggle',
      title: 'Do Not Disturb',
      subtitle: 'Silence notification banners',
      category: 'System',
      keywords: ['focus', 'dnd', 'quiet', 'silence'],
      icon: MoonStar,
      run: () => system.toggle('focus'),
    },
    {
      id: 'notificationCenter.toggle',
      title: 'Notification Center',
      category: 'System',
      icon: PanelTop,
      run: () => ui.toggle('notification-center'),
    },
    {
      id: 'clipboardHistory.toggle',
      title: 'Clipboard History',
      category: 'System',
      keywords: ['paste', 'copy'],
      icon: ClipboardList,
      run: () => ui.toggle('clipboard'),
    },
    {
      id: 'widgets.open',
      title: 'Toggle Widgets',
      category: 'System',
      keywords: ['panel', 'weather', 'calendar'],
      run: () => ui.toggle('widgets'),
    },
    {
      id: 'forceQuit.open',
      title: 'Force Quit…',
      subtitle: 'Close a misbehaving window immediately',
      category: 'System',
      keywords: ['kill', 'end task', 'quit'],
      icon: Power,
      run: () => ui.toggle('force-quit'),
    },

    // ---- appearance ------------------------------------------------------
    {
      id: 'theme.toggle',
      title: 'Toggle Light / Dark',
      category: 'Appearance',
      icon: SunMoon,
      run: () => theme.toggleDark(),
    },
    {
      id: 'shellMode.toggle',
      title: 'Toggle Dock / Taskbar',
      category: 'Appearance',
      icon: Monitor,
      run: () => theme.set({ shellMode: theme.get('shellMode') === 'dock' ? 'taskbar' : 'dock' }),
    },
    {
      id: 'accent.cycle',
      title: 'Cycle Accent Colour',
      category: 'Appearance',
      run: () => {
        const current = theme.get('accent')
        const index = ACCENTS.findIndex((a) => a.id === current)
        const next = ACCENTS[(index + 1) % ACCENTS.length]
        theme.set({ accent: next.id })
      },
    },

    // ---- system ----------------------------------------------------------
    {
      id: 'screenshot.capture',
      title: 'Capture Screen to Clipboard',
      category: 'System',
      keywords: ['screenshot', 'snip', 'grab'],
      icon: Camera,
      run: async () => {
        const dataUrl = await bridge.screen.captureDisplay().catch(() => null)
        if (!dataUrl) {
          notify({ title: 'Screen capture failed', body: 'Not available in this mode', kind: 'warn', appId: 'system' })
          return
        }
        await bridge.clipboard.writeImage(dataUrl).catch(() => undefined)
        notify({ title: 'Screenshot copied', body: 'The capture is on your clipboard', kind: 'success', appId: 'system' })
      },
    },
    {
      id: 'system.lock',
      title: 'Lock',
      category: 'System',
      icon: Lock,
      run: () => void bridge.power.lock().catch(() => undefined),
    },
    {
      id: 'commandPalette.open',
      title: 'Command Palette',
      subtitle: 'Search and run any command',
      category: 'System',
      keywords: ['commands', 'run', 'actions', 'palette'],
      icon: Command,
      run: () => ui.toggle('command-palette'),
    },
    {
      id: 'app.quit',
      title: 'Quit JohnLC AuraOS',
      category: 'System',
      icon: Power,
      run: () => void bridge.app.quit().catch(() => undefined),
    },
  ]

  actions.registerAll(defs)
}
