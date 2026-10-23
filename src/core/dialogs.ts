import type { LucideIcon } from 'lucide-react'

export type DialogKind = 'alert' | 'confirm' | 'prompt'

export interface DialogRequest {
  id: string
  kind: DialogKind
  title?: string
  message: string
  detail?: string
  icon?: LucideIcon
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  defaultValue?: string
  placeholder?: string
  /** resolves when the user answers */
  resolve: (value: unknown) => void
}

export interface AlertOptions {
  title?: string
  message: string
  detail?: string
  icon?: LucideIcon
  confirmLabel?: string
}

export interface ConfirmOptions extends AlertOptions {
  cancelLabel?: string
  danger?: boolean
}

export interface PromptOptions extends AlertOptions {
  defaultValue?: string
  placeholder?: string
  cancelLabel?: string
}

/**
 * Imperative in-app dialogs (alert / confirm / prompt) rendered by <DialogHost>.
 * Async-awaitable and queue-backed so several requests never overlap.
 */
class DialogStore {
  private queue: DialogRequest[] = []
  private listeners = new Set<() => void>()
  private seq = 0

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): DialogRequest | null => this.queue[0] ?? null

  private enqueue(request: Omit<DialogRequest, 'id'>): void {
    this.seq += 1
    this.queue = [...this.queue, { ...request, id: `dlg-${this.seq}` }]
    this.emit()
  }

  /** Called by the host once the user answers. */
  settle(id: string, value: unknown): void {
    const current = this.queue.find((d) => d.id === id)
    if (!current) return
    current.resolve(value)
    this.queue = this.queue.filter((d) => d.id !== id)
    this.emit()
  }

  alert(opts: AlertOptions): Promise<void> {
    return new Promise((resolve) => {
      this.enqueue({
        kind: 'alert',
        title: opts.title,
        message: opts.message,
        detail: opts.detail,
        icon: opts.icon,
        confirmLabel: opts.confirmLabel,
        resolve: () => resolve(),
      })
    })
  }

  confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.enqueue({
        kind: 'confirm',
        title: opts.title,
        message: opts.message,
        detail: opts.detail,
        icon: opts.icon,
        confirmLabel: opts.confirmLabel,
        cancelLabel: opts.cancelLabel,
        danger: opts.danger,
        resolve: (value) => resolve(Boolean(value)),
      })
    })
  }

  prompt(opts: PromptOptions): Promise<string | null> {
    return new Promise((resolve) => {
      this.enqueue({
        kind: 'prompt',
        title: opts.title,
        message: opts.message,
        detail: opts.detail,
        icon: opts.icon,
        confirmLabel: opts.confirmLabel,
        cancelLabel: opts.cancelLabel,
        defaultValue: opts.defaultValue,
        placeholder: opts.placeholder,
        resolve: (value) => resolve(typeof value === 'string' ? value : null),
      })
    })
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn())
  }
}

export const dialogs = new DialogStore()
