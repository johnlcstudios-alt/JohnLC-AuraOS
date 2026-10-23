import type { LucideIcon } from 'lucide-react'
import { bus, EVT } from './bus'
import { system } from './system/systemStore'

export type NotificationKind = 'info' | 'success' | 'warn' | 'error'

export interface NotificationAction {
  id: string
  label: string
  run: () => void | Promise<void>
}

export interface OSNotification {
  id: string
  appId?: string
  title: string
  body?: string
  kind: NotificationKind
  icon?: LucideIcon
  ts: number
  read: boolean
  /** actions are memory-only, never persisted */
  actions?: NotificationAction[]
  /** true for the transient banner as well as the history entry */
  banner?: boolean
}

export interface NotifyInput {
  title: string
  body?: string
  kind?: NotificationKind
  appId?: string
  icon?: LucideIcon
  actions?: NotificationAction[]
  /** show a banner immediately (default true) */
  banner?: boolean
}

const MAX_HISTORY = 60

/**
 * The JohnLC AuraOS notification centre.
 * Kept outside React so any module (apps, shell, bridges) can raise a
 * notification without prop drilling. Banners are rendered by <Toaster>,
 * history by <NotificationCenter>.
 */
class NotificationStore {
  private items: OSNotification[] = []
  private listeners = new Set<() => void>()
  private seq = 0

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): OSNotification[] => this.items

  push(input: NotifyInput): OSNotification {
    this.seq += 1
    const entry: OSNotification = {
      id: `n-${Date.now()}-${this.seq}`,
      appId: input.appId,
      title: input.title,
      body: input.body,
      kind: input.kind ?? 'info',
      icon: input.icon,
      ts: Date.now(),
      read: false,
      actions: input.actions,
      banner: input.banner ?? true,
    }
    this.items = [entry, ...this.items].slice(0, MAX_HISTORY)
    this.emit()
    // While Focus (Do Not Disturb) is on, banners are silenced but the
    // notification is still recorded in the Notification Center.
    if (entry.banner && !system.getSnapshot().focus) {
      bus.emit(EVT.TOAST, {
        text: entry.body ? `${entry.title} — ${entry.body}` : entry.title,
        kind: entry.kind,
      })
    }
    return entry
  }

  dismiss(id: string): void {
    const next = this.items.filter((n) => n.id !== id)
    if (next.length === this.items.length) return
    this.items = next
    this.emit()
  }

  clear(): void {
    if (!this.items.length) return
    this.items = []
    this.emit()
  }

  markAllRead(): void {
    if (this.items.every((n) => n.read)) return
    this.items = this.items.map((n) => (n.read ? n : { ...n, read: true }))
    this.emit()
  }

  get unread(): number {
    return this.items.reduce((count, n) => count + (n.read ? 0 : 1), 0)
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn())
  }
}

export const notifications = new NotificationStore()

/** Convenience helper mirroring the shell toast API. */
export function notify(input: NotifyInput): OSNotification {
  return notifications.push(input)
}
