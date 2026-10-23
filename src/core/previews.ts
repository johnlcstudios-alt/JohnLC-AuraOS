export type PreviewOrigin = 'dock' | 'taskbar'

export interface PreviewAnchor {
  /** centre x of the icon in viewport coordinates */
  x: number
  /** top edge of the icon */
  y: number
}

export interface PreviewRequest {
  id: string
  appId: string
  anchor: PreviewAnchor
  origin: PreviewOrigin
}

/** How long the pointer must rest on an icon before previews appear (ms). */
export const PREVIEW_OPEN_DELAY = 170
/** Grace period that keeps the popover alive while the pointer travels to it. */
export const PREVIEW_GRACE_MS = 140

/**
 * Window previews for the Dock/Taskbar.
 *
 * A single global popover (like the context menu) is nicer than one per icon:
 * the Dock magnifies and re-measures its items on every pointer move, so
 * anchoring the preview to the icon at open time keeps it stable.
 */
class PreviewStore {
  private current: PreviewRequest | null = null
  private listeners = new Set<() => void>()
  private hideTimer: ReturnType<typeof setTimeout> | null = null
  private seq = 0

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = (): PreviewRequest | null => this.current

  /** Point the popover at an icon (already measured) and show it. */
  show(appId: string, el: HTMLElement, origin: PreviewOrigin): void {
    this.clearTimer()
    const rect = el.getBoundingClientRect()
    const anchor: PreviewAnchor = { x: rect.left + rect.width / 2, y: rect.top }
    const same =
      this.current !== null &&
      this.current.appId === appId &&
      Math.abs(this.current.anchor.x - anchor.x) < 2 &&
      Math.abs(this.current.anchor.y - anchor.y) < 2
    if (same) return
    this.seq += 1
    this.current = { id: `pv-${this.seq}`, appId, anchor, origin }
    this.emit()
  }

  /** Hide the popover now, or after a grace period so it can be entered. */
  hide(delayMs = 0): void {
    this.clearTimer()
    if (delayMs <= 0) {
      this.close()
      return
    }
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null
      this.close()
    }, delayMs)
  }

  /** The pointer moved onto the popover: cancel a pending hide. */
  cancelHide(): void {
    this.clearTimer()
  }

  private close(): void {
    if (!this.current) return
    this.current = null
    this.emit()
  }

  private clearTimer(): void {
    if (this.hideTimer === null) return
    clearTimeout(this.hideTimer)
    this.hideTimer = null
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn())
  }
}

export const previews = new PreviewStore()
