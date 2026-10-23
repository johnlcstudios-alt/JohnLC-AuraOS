import type { OverlayId } from './uiStore'

type Handler<T = unknown> = (payload: T) => void

/**
 * Tiny typed-ish pub/sub used for cross-module shell messages
 * (singleton app re-navigation, toasts, terminal `open` command, ...).
 */
class Bus {
  private map = new Map<string, Set<Handler<never>>>()

  on<T>(event: string, fn: Handler<T>): () => void {
    let set = this.map.get(event)
    if (!set) {
      set = new Set()
      this.map.set(event, set)
    }
    set.add(fn as Handler<never>)
    return () => {
      set?.delete(fn as Handler<never>)
    }
  }

  emit<T>(event: string, payload: T): void {
    const set = this.map.get(event)
    if (!set) return
    set.forEach((fn) => (fn as unknown as Handler<T>)(payload))
  }
}

export const bus = new Bus()

export const EVT = {
  /** re-navigate a singleton window, e.g. Settings to a specific pane */
  APP_ARGS: 'app:args',
  /** transient toast in the shell */
  TOAST: 'shell:toast',
  /** open/close shell overlays */
  OVERLAY: 'shell:overlay',
} as const

export interface AppArgsEvent {
  windowId: string
  args: Record<string, unknown>
}

export interface ToastEvent {
  text: string
  kind?: 'info' | 'success' | 'warn' | 'error'
}

export type OverlayName = OverlayId
export interface OverlayEvent {
  name: OverlayName
  open?: boolean
}
