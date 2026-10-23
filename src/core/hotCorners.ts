export type HotCornerId = 'tl' | 'tr' | 'bl' | 'br'

export interface HotCornerConfig {
  enabled: boolean
  /** action id to run in each corner, or 'none' */
  tl: string
  tr: string
  bl: string
  br: string
}

export const DEFAULT_HOT_CORNERS: HotCornerConfig = {
  enabled: true,
  tl: 'missionControl.toggle',
  tr: 'notificationCenter.toggle',
  bl: 'desktop.showDesktop',
  br: 'widgets.open',
}

class HotCornerStore {
  private state: HotCornerConfig = { ...DEFAULT_HOT_CORNERS }
  private listeners = new Set<() => void>()
  private loaded = false

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): HotCornerConfig => this.state

  async init(get: <T>(key: string, fallback: T) => Promise<T>, set: (key: string, value: unknown) => Promise<void>): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    this.set_ = set
    try {
      const saved = await get<HotCornerConfig>('hotCorners', DEFAULT_HOT_CORNERS)
      if (saved && typeof saved === 'object') this.state = { ...DEFAULT_HOT_CORNERS, ...saved }
    } catch {
      /* defaults */
    }
    this.emit()
  }

  private set_: ((key: string, value: unknown) => Promise<void>) | null = null

  update(patch: Partial<HotCornerConfig>): void {
    this.state = { ...this.state, ...patch }
    void this.set_?.('hotCorners', this.state)
    this.emit()
  }

  get enabled(): boolean {
    return this.state.enabled
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn())
  }
}

export const hotCorners = new HotCornerStore()
