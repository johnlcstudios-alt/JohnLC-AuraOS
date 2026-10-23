import { AnimatePresence, motion } from 'framer-motion'
import { Power, X } from 'lucide-react'
import { ui } from '../core/uiStore'
import { wm } from '../core/wm/WindowManager'
import { useWindowManager } from '../core/wm/useWindowManager'
import { useStore } from '../core/hooks'
import { getApp } from '../core/apps/registry'
import { AppIconTile, EmptyState } from '../ui/controls'
import { notify } from '../core/notifications'

/**
 * Force Quit: a compact list of every window that can be closed on the spot
 * (macOS ⌥⌘⎋ / Windows "End task").
 */
export function ForceQuit() {
  const uiState = useStore(ui)
  const state = useWindowManager()
  const open = uiState['force-quit']

  const close = (id: string, name: string): void => {
    wm.forceClose(id)
    notify({ title: `Closed ${name}`, kind: 'info', appId: 'system', banner: true })
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[23500] grid place-items-center"
          data-overlay="force-quit"
          style={{ background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(3px)' }}
          onClick={() => ui.close('force-quit')}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong flex max-h-[70vh] w-[420px] max-w-[90vw] flex-col overflow-hidden rounded-[16px]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Power size={15} className="text-danger" />
              <span className="flex-1 text-[13.5px] font-semibold text-ink">Force Quit</span>
              <button type="button" className="menu-item w-auto p-1.5" onClick={() => ui.close('force-quit')}>
                <X size={14} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {state.windows.length === 0 ? (
                <EmptyState icon={Power} title="No running windows" />
              ) : (
                <div className="flex flex-col gap-1.5">
                  {[...state.windows].reverse().map((win) => {
                    const app = getApp(win.appId)
                    if (!app) return null
                    const Icon = app.icon
                    return (
                      <div
                        key={win.id}
                        className="flex items-center gap-2.5 rounded-[11px] px-2.5 py-2"
                        style={{ background: win.focused ? 'var(--active)' : 'var(--hover)' }}
                      >
                        <AppIconTile icon={Icon} tint={app.tint} size={28} radius={8} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12.5px] text-ink">{win.title}</div>
                          <div className="truncate text-[10.5px] text-faint">{app.name}</div>
                        </div>
                        <button
                          type="button"
                          className="rounded-[8px] px-2.5 py-1 text-[11.5px] font-medium text-white"
                          style={{ background: 'var(--danger)' }}
                          onClick={() => close(win.id, app.name)}
                        >
                          Quit
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
