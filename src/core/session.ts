import { wm } from './wm/WindowManager'
import { bridge } from './ipc/bridge'
import type { DesktopInfo, Rect, SnapRegion, WMWindow, WindowVisualState } from './wm/types'

interface SessionWindow {
  appId: string
  title: string
  args: Record<string, unknown>
  rect: Rect
  restoreRect: Rect
  state: WindowVisualState
  restoreState: WindowVisualState
  snapRegion: SnapRegion | null
  zIndex: number
  desktop: string
  alwaysOnTop: boolean
  minSize: { w: number; h: number }
}

interface SessionSnapshot {
  version: 1
  desktops: DesktopInfo[]
  activeDesktop: string
  windows: SessionWindow[]
}

const CONFIG_KEY = 'session'
const RESTORE_KEY = 'sessionRestore'

function serialize(windows: WMWindow[]): SessionWindow[] {
  return windows.map((w) => ({
      appId: w.appId,
      title: w.title,
      args: safeArgs(w.args),
      rect: w.rect,
      restoreRect: w.restoreRect,
      // remember maximized/snapped geometry but never restore as minimized
      state: w.state === 'minimized' ? 'normal' : w.state,
      restoreState: w.restoreState,
      snapRegion: w.snapRegion,
      zIndex: w.zIndex,
      desktop: w.desktop,
      alwaysOnTop: w.alwaysOnTop,
      minSize: w.minSize,
    }))
}

/** args must survive JSON: drop anything that is not a primitive/plain value. */
function safeArgs(args: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(args ?? {})) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Session persistence: quietly snapshots the desktop layout (windows, geometry,
 * desktops) and restores it next launch. Serialized to the config store so it
 * works in both native and web modes.
 */
class SessionStore {
  private enabled = true
  private restoring = false
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private lastSerialized = ''
  private unsubscribe: (() => void) | null = null
  private started = false

  get isEnabled(): boolean {
    return this.enabled
  }

  /** Restore first, then start watching for changes. */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    try {
      this.enabled = await bridge.config.get<boolean>(RESTORE_KEY, true)
    } catch {
      this.enabled = true
    }
    if (this.enabled) await this.restore()
    this.unsubscribe = wm.subscribe(() => this.scheduleSave())
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.started = false
  }

  async setEnabled(next: boolean): Promise<void> {
    this.enabled = next
    try {
      await bridge.config.set(RESTORE_KEY, next)
    } catch {
      /* ignore */
    }
    if (!next) await bridge.config.set(CONFIG_KEY, { version: 1, desktops: wm.desktops, activeDesktop: wm.activeDesktop, windows: [] })
  }

  /** Forget the saved layout (next launch starts clean). */
  async clear(): Promise<void> {
    this.lastSerialized = ''
    try {
      await bridge.config.set(CONFIG_KEY, { version: 1, desktops: wm.desktops, activeDesktop: wm.activeDesktop, windows: [] })
    } catch {
      /* ignore */
    }
  }

  private async restore(): Promise<void> {
    let snapshot: SessionSnapshot | null = null
    try {
      snapshot = await bridge.config.get<SessionSnapshot | null>(CONFIG_KEY, null)
    } catch {
      snapshot = null
    }
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.windows) || !snapshot.windows.length) return

    this.restoring = true
    const now = Date.now()
    const restored: WMWindow[] = snapshot.windows.map((w, index) => ({
      id: `restore-${index}-${now.toString(36)}`,
      appId: w.appId,
      title: w.title,
      args: w.args ?? {},
      rect: w.rect,
      restoreRect: w.restoreRect ?? w.rect,
      state: w.state ?? 'normal',
      restoreState: w.restoreState ?? 'normal',
      snapRegion: w.snapRegion ?? null,
      zIndex: typeof w.zIndex === 'number' ? w.zIndex : index + 1,
      focused: false,
      minSize: w.minSize ?? { w: 320, h: 200 },
      hidden: false,
      createdAt: now + index,
      animNonce: 0,
      desktop: w.desktop,
      alwaysOnTop: !!w.alwaysOnTop,
    }))

    wm.hydrate({
      windows: restored,
      desktops: snapshot.desktops ?? wm.desktops,
      activeDesktop: snapshot.activeDesktop ?? wm.activeDesktop,
    })
    this.lastSerialized = JSON.stringify(snapshot)
    // let the hydrate propagate before resuming saves
    window.setTimeout(() => {
      this.restoring = false
    }, 400)
  }

  private scheduleSave(): void {
    if (this.restoring || !this.enabled) return
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.save(), 700)
  }

  private async save(): Promise<void> {
    const snapshot: SessionSnapshot = {
      version: 1,
      desktops: wm.desktops,
      activeDesktop: wm.activeDesktop,
      windows: serialize(wm.windows),
    }
    const json = JSON.stringify(snapshot)
    if (json === this.lastSerialized) return
    this.lastSerialized = json
    try {
      await bridge.config.set(CONFIG_KEY, snapshot)
    } catch {
      /* quota / disabled storage */
    }
  }
}

export const session = new SessionStore()
