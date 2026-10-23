import { bridge } from '../ipc/bridge'

/**
 * Small persisted store for hardware-ish toggles that the Control Center,
 * Quick Settings, Settings app and Top Bar tray all read/write.
 */
export interface SystemState {
  wifi: boolean
  bluetooth: boolean
  nearbyShare: boolean
  nightLight: boolean
  focus: boolean
  aeroPeek: boolean
  brightness: number // 0.2 .. 1
  volume: number // 0 .. 1
  muted: boolean
  battery: number // 0 .. 100
  charging: boolean
  activeNetwork: string | null
}

export const DEFAULT_SYSTEM: SystemState = {
  wifi: true,
  bluetooth: false,
  nearbyShare: false,
  nightLight: false,
  focus: false,
  aeroPeek: true,
  brightness: 1,
  volume: 0.65,
  muted: false,
  battery: 86,
  charging: true,
  activeNetwork: 'AuraOS-5G',
}

class SystemStore {
  private state: SystemState = { ...DEFAULT_SYSTEM }
  private listeners = new Set<() => void>()
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private started = false

  async init(): Promise<void> {
    if (this.started) return
    this.started = true
    try {
      const saved = await bridge.config.get<Partial<SystemState>>('system', {})
      this.state = { ...DEFAULT_SYSTEM, ...saved }
    } catch {
      /* defaults */
    }
    this.emit()
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): SystemState => this.state

  set<K extends keyof SystemState>(key: K, value: SystemState[K]): void {
    this.state = { ...this.state, [key]: value }
    this.emit()
  }

  patch(patch: Partial<SystemState>): void {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  toggle(key: 'wifi' | 'bluetooth' | 'nearbyShare' | 'nightLight' | 'focus' | 'aeroPeek' | 'muted'): void {
    this.set(key, !this.state[key] as never)
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn())
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      void bridge.config.set('system', this.state)
    }, 250)
  }
}

export const system = new SystemStore()
