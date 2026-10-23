/**
 * Quick Look: press Space on a selected file to preview it, Space/Esc to close.
 * A single overlay instance, driven from anywhere (Files, Spotlight, desktop…).
 */
class QuickLookStore {
  private path: string | null = null
  private listeners = new Set<() => void>()

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): string | null => this.path

  open(path: string): void {
    if (this.path === path) return
    this.path = path
    this.emit()
  }

  close(): void {
    if (this.path === null) return
    this.path = null
    this.emit()
  }

  toggle(path: string): void {
    if (this.path === path) this.close()
    else this.open(path)
  }

  get isOpen(): boolean {
    return this.path !== null
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn())
  }
}

export const quickLook = new QuickLookStore()
