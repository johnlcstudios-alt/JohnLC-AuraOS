import type { LucideIcon } from 'lucide-react'

export interface ContextMenuItem {
  id?: string
  label?: string
  icon?: LucideIcon
  shortcut?: string
  disabled?: boolean
  separator?: boolean
  checked?: boolean
  danger?: boolean
  onSelect?: () => void
  /** nested items rendered as a submenu */
  submenu?: ContextMenuItem[]
}

export interface ContextMenuRequest {
  id: string
  x: number
  y: number
  items: ContextMenuItem[]
  /** optional header (e.g. the file name) */
  header?: string
}

/**
 * A single global context menu. Any surface can open it with `contextMenu.open`
 * and the <ContextMenuHost> renders it at the cursor, flipped to stay on screen.
 */
class ContextMenuStore {
  private current: ContextMenuRequest | null = null
  private listeners = new Set<() => void>()
  private seq = 0

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): ContextMenuRequest | null => this.current

  open(items: ContextMenuItem[], point: { x: number; y: number }, header?: string): void {
    this.seq += 1
    this.current = { id: `ctx-${this.seq}`, x: point.x, y: point.y, items, header }
    this.emit()
  }

  close(): void {
    if (!this.current) return
    this.current = null
    this.emit()
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn())
  }
}

export const contextMenu = new ContextMenuStore()
