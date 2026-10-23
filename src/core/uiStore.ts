export type OverlayId =
  | 'spotlight'
  | 'command-palette'
  | 'control-center'
  | 'widgets'
  | 'start'
  | 'notification-center'
  | 'mission-control'
  | 'clipboard'
  | 'force-quit'

export const OVERLAY_IDS: OverlayId[] = [
  'spotlight',
  'command-palette',
  'control-center',
  'widgets',
  'start',
  'notification-center',
  'mission-control',
  'clipboard',
  'force-quit',
]

type UIState = Record<OverlayId, boolean>

/** Esc closes the most recently useful overlay first. */
const ESC_ORDER: OverlayId[] = [
  'command-palette',
  'spotlight',
  'control-center',
  'start',
  'clipboard',
  'notification-center',
  'mission-control',
  'force-quit',
  'widgets',
]

/**
 * Shell overlay visibility (Spotlight, Command Palette, Control Center, Widgets,
 * Start, Notification Center, Mission Control, Clipboard, Force Quit).
 * Kept outside React so the Top Bar, Dock, Taskbar and global shortcuts can
 * all drive the same panels without prop drilling.
 */
class UIStore {
  private state: UIState = {
    spotlight: false,
    'command-palette': false,
    'control-center': false,
    widgets: false,
    start: false,
    'notification-center': false,
    'mission-control': false,
    clipboard: false,
    'force-quit': false,
  }
  private listeners = new Set<() => void>()

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): UIState => this.state

  private update(patch: Partial<UIState>): void {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn())
  }

  private allClosed(): UIState {
    const next = {} as UIState
    for (const id of OVERLAY_IDS) next[id] = false
    return next
  }

  open(name: OverlayId): void {
    const next = this.allClosed()
    next[name] = true
    this.update(next)
  }

  close(name: OverlayId): void {
    if (!this.state[name]) return
    this.update({ [name]: false } as Partial<UIState>)
  }

  toggle(name: OverlayId): void {
    if (this.state[name]) this.close(name)
    else this.open(name)
  }

  closeAll(): void {
    this.update(this.allClosed())
  }

  get anyOpen(): boolean {
    return OVERLAY_IDS.some((id) => this.state[id])
  }

  closeTopmost(): void {
    for (const id of ESC_ORDER) {
      if (this.state[id]) {
        this.close(id)
        return
      }
    }
  }
}

export const ui = new UIStore()
