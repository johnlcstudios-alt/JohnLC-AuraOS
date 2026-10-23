/**
 * Window switcher (hold Mod+Tab to cycle, release to commit).
 *
 * The OS reserves real Alt+Tab, so we bind Mod+Tab (Ctrl+Tab / Cmd+Tab) which
 * always reaches the renderer. The list is captured when the switcher opens so
 * the order stays stable while the user cycles.
 */
class SwitcherStore {
  private open = false
  private index = 1
  private ids: string[] = []
  private listeners = new Set<() => void>()
  /** cached so useSyncExternalStore sees a stable reference between changes */
  private snapshot: { open: boolean; index: number; ids: string[] } = { open: false, index: 0, ids: [] }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): { open: boolean; index: number; ids: string[] } => this.snapshot

  /** ids are ordered front-to-back (most recently used first). */
  show(ids: string[]): void {
    if (!ids.length) return
    if (!this.open) {
      this.ids = ids
      this.index = ids.length > 1 ? 1 : 0
      this.open = true
    } else {
      this.index = (this.index + 1) % this.ids.length
    }
    this.emit()
  }

  /** Move the highlight back (Shift+Mod+Tab). */
  back(): void {
    if (!this.open) return
    this.index = (this.index - 1 + this.ids.length) % this.ids.length
    this.emit()
  }

  commit(): string | null {
    if (!this.open) return null
    const id = this.ids[this.index] ?? null
    this.reset()
    return id
  }

  cancel(): void {
    this.reset()
  }

  get isOpen(): boolean {
    return this.open
  }

  private reset(): void {
    this.open = false
    this.ids = []
    this.index = 0
    this.emit()
  }

  private emit(): void {
    this.snapshot = { open: this.open, index: this.index, ids: this.ids }
    this.listeners.forEach((fn) => fn())
  }
}

export const switcher = new SwitcherStore()
