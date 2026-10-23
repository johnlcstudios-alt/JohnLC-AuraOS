export type ClipKind = 'text' | 'image' | 'files'

export interface ClipEntry {
  id: string
  kind: ClipKind
  /** text content, image data-url, or newline-joined paths */
  value: string
  /** short human label shown in the history list */
  label: string
  ts: number
  /** pinned entries survive "clear all" and trimming */
  pinned: boolean
}

const MAX_ENTRIES = 50

function labelFor(kind: ClipKind, value: string): string {
  if (kind === 'image') return 'Image'
  if (kind === 'files') {
    const parts = value.split('\n')
    return parts.length > 1 ? `${parts.length} items` : (parts[0].split('/').pop() ?? value)
  }
  const single = value.replace(/\s+/g, ' ').trim()
  return single.length > 90 ? `${single.slice(0, 90)}…` : single
}

/**
 * Clipboard history. Polls the system clipboard through the bridge so copies
 * made in any window are captured, and writes back the selected entry.
 */
class ClipboardStore {
  private items: ClipEntry[] = []
  private listeners = new Set<() => void>()
  private lastSeen = ''
  private timer: ReturnType<typeof setInterval> | null = null
  private seq = 0
  private writing = false

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): ClipEntry[] => this.items

  private emit(): void {
    this.listeners.forEach((fn) => fn())
  }

  add(kind: ClipKind, value: string): void {
    if (!value) return
    if (kind === 'text') this.lastSeen = value
    const existing = this.items.find((c) => c.kind === kind && c.value === value)
    if (existing) {
      // bump to the top, keep pin status
      this.items = [existing, ...this.items.filter((c) => c.id !== existing.id)]
      this.emit()
      return
    }
    this.seq += 1
    const entry: ClipEntry = {
      id: `clip-${Date.now()}-${this.seq}`,
      kind,
      value,
      label: labelFor(kind, value),
      ts: Date.now(),
      pinned: false,
    }
    const pinned = this.items.filter((c) => c.pinned)
    const rest = this.items.filter((c) => !c.pinned).slice(0, MAX_ENTRIES - pinned.length - 1)
    this.items = [...pinned, entry, ...rest]
    this.emit()
  }

  togglePin(id: string): void {
    this.items = this.items.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c))
    this.emit()
  }

  remove(id: string): void {
    this.items = this.items.filter((c) => c.id !== id)
    this.emit()
  }

  clear(): void {
    this.items = this.items.filter((c) => c.pinned)
    this.emit()
  }

  /** Mark a write so the poller does not immediately re-add our own value. */
  private markWrite(value: string): void {
    this.writing = true
    this.lastSeen = value
    window.setTimeout(() => {
      this.writing = false
    }, 400)
  }

  /** Begin polling the OS clipboard (no-op when already running). */
  start(getText: () => Promise<string>, intervalMs = 1200): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      if (this.writing) return
      void getText()
        .then((text) => {
          if (!text || text === this.lastSeen) return
          this.add('text', text)
        })
        .catch(() => undefined)
    }, intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Called by the UI right after it writes an entry back to the clipboard. */
  noteWrite(value: string): void {
    this.markWrite(value)
    this.add('text', value)
  }
}

export const clipboardHistory = new ClipboardStore()
