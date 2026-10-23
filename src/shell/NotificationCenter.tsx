import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellOff, Check, Info, TriangleAlert, X } from 'lucide-react'
import { notifications } from '../core/notifications'
import { ui } from '../core/uiStore'
import { useStore } from '../core/hooks'
import { EmptyState } from '../ui/controls'
import { prettyCombo } from '../core/shortcuts'

const KIND_ICON = {
  info: Info,
  success: Check,
  warn: TriangleAlert,
  error: TriangleAlert,
}

const KIND_TINT: Record<string, string> = {
  info: 'var(--accent)',
  success: 'var(--success)',
  warn: 'var(--warn)',
  error: 'var(--danger)',
}

function relative(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

/**
 * macOS-style Notification Center: a right-side glass panel listing the
 * notification history with per-item dismiss and a clear-all action.
 */
export function NotificationCenter() {
  const uiState = useStore(ui)
  const open = uiState['notification-center']
  const items = useStore(notifications)

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="overlay-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => ui.close('notification-center')}
          />
          <motion.aside
            initial={{ x: 380, opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            data-overlay="notification-center"
            className="glass-strong absolute right-3 top-[36px] z-[24000] flex max-h-[calc(100%-120px)] w-[360px] flex-col overflow-hidden rounded-[18px]"
          >
            <header className="flex items-center justify-between px-4 pb-2 pt-3.5">
              <div className="flex items-center gap-2">
                <Bell size={15} className="text-muted" />
                <span className="text-[13.5px] font-semibold text-ink">Notifications</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="menu-item w-auto px-2 py-1 text-[11.5px]"
                  onClick={() => notifications.markAllRead()}
                >
                  Mark read
                </button>
                <button type="button" className="menu-item w-auto px-2 py-1 text-[11.5px]" onClick={() => notifications.clear()}>
                  Clear
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {items.length === 0 ? (
                <EmptyState icon={BellOff} title="No notifications" hint="Alerts from apps will land here" />
              ) : (
                <div className="flex flex-col gap-2">
                  {/* items animate their own exit; without a local AnimatePresence
                      dismissing the last one would stall the panel's unmount */}
                  <AnimatePresence initial={false}>
                    {items.map((n) => {
                      const Icon = n.icon ?? KIND_ICON[n.kind]
                      return (
                        <motion.div
                          key={n.id}
                          layout
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 40 }}
                          className="group relative flex gap-2.5 rounded-[13px] border border-line p-3"
                          style={{ background: n.read ? 'var(--hover)' : 'var(--active)' }}
                          onMouseEnter={() => !n.read && notifications.markAllRead()}
                        >
                          <span
                            className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[7px] text-white"
                            style={{ background: KIND_TINT[n.kind] }}
                          >
                            <Icon size={13} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-[12.5px] font-medium text-ink">{n.title}</span>
                              <span className="shrink-0 text-[10.5px] text-faint">{relative(n.ts)}</span>
                            </div>
                            {n.body ? <div className="mt-0.5 text-[12px] leading-snug text-muted">{n.body}</div> : null}
                            {n.actions?.length ? (
                              <div className="mt-2 flex gap-1.5">
                                {n.actions.map((a) => (
                                  <button
                                    key={a.id}
                                    type="button"
                                    data-notification-action={a.id}
                                    className="rounded-[7px] px-2 py-1 text-[11.5px] text-white"
                                    style={{ background: 'var(--accent)' }}
                                    onClick={() => {
                                      void a.run()
                                      notifications.dismiss(n.id)
                                    }}
                                  >
                                    {a.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            className="absolute right-2 top-2 rounded-full p-1 text-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
                            style={{ background: 'var(--hover)' }}
                            onClick={() => notifications.dismiss(n.id)}
                            aria-label="Dismiss notification"
                          >
                            <X size={12} />
                          </button>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>

            <footer className="border-t border-line px-4 py-2 text-center text-[11px] text-faint">
              Toggle anytime with {prettyCombo('Mod+Shift+N')}
            </footer>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
