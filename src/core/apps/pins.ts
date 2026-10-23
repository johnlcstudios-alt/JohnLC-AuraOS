import { bridge } from '../ipc/bridge'

const CONFIG_KEY = 'appPins'

/**
 * User pin overrides for the Dock/Taskbar.
 *
 * The `pinned` flag in the app registry is only the *default*; anything the
 * user pins or unpins through a jump list is remembered here and persisted via
 * the config bridge, so it survives a restart in both native and web modes.
 */
class AppPinStore {
  private overrides: Record<string, boolean> = {}
  private listeners = new Set<() => void>()
  private started = false

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = (): Record<string, boolean> => this.overrides

  /** Load persisted overrides once at boot (best-effort). */
  async init(): Promise<void> {
    if (this.started) return
    this.started = true
    try {
      const stored = await bridge.config.get<Record<string, boolean> | null>(CONFIG_KEY, null)
      if (stored && typeof stored === 'object') {
        const next: Record<string, boolean> = {}
        for (const [id, value] of Object.entries(stored)) {
          if (typeof value === 'boolean') next[id] = value
        }
        this.overrides = next
      }
    } catch {
      /* a missing config store just means registry defaults */
    }
    this.emit()
  }

  /** Effective pinned state: an explicit override, else the registry default. */
  isPinned(id: string, fallback: boolean): boolean {
    const override = this.overrides[id]
    return typeof override === 'boolean' ? override : fallback
  }

  /** Flip the pin state; returns the new value. */
  toggle(id: string, fallback: boolean): boolean {
    const next = !this.isPinned(id, fallback)
    // an override that matches the default is noise: drop it
    if (next === fallback) delete this.overrides[id]
    else this.overrides[id] = next
    this.overrides = { ...this.overrides }
    this.emit()
    void bridge.config.set(CONFIG_KEY, this.overrides).catch(() => undefined)
    return next
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn())
  }
}

export const appPins = new AppPinStore()
