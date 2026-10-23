import { AnimatePresence, motion } from 'framer-motion'
import { switcher } from '../core/switcher'
import { wm } from '../core/wm/WindowManager'
import { useWindowManager } from '../core/wm/useWindowManager'
import { useStore } from '../core/hooks'
import { getApp } from '../core/apps/registry'
import { AppIconTile } from '../ui/controls'

/**
 * Hold Mod+Tab to cycle through open windows; release to focus the highlight.
 * Rendered as a centred row of app icons with the window title underneath.
 */
export function WindowSwitcher() {
  const state = useStore(switcher)
  const wmState = useWindowManager()
  if (!state.open) return null

  const items = state.ids
    .map((id) => wmState.windows.find((w) => w.id === id))
    .filter((w): w is NonNullable<typeof w> => Boolean(w))
  const active = items[state.index]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute left-1/2 top-1/2 z-[24500] -translate-x-1/2 -translate-y-1/2"
        data-overlay="window-switcher"
      >
        <div className="glass-strong flex max-w-[82vw] items-center gap-2 overflow-hidden rounded-[18px] p-3">
          {items.map((win, index) => {
            const app = getApp(win.appId)
            if (!app) return null
            const Icon = app.icon
            const selected = index === state.index
            return (
              <div
                key={win.id}
                className="flex w-[92px] flex-col items-center gap-1.5 rounded-[13px] px-1.5 py-2 transition-colors"
                style={{ background: selected ? 'var(--active)' : 'transparent' }}
              >
                <AppIconTile icon={Icon} tint={app.tint} size={48} radius={12} />
                <span className="line-clamp-2 text-center text-[10.5px] leading-tight text-muted">{win.title}</span>
              </div>
            )
          })}
        </div>
        {active ? (
          <div className="mt-2 text-center text-[12px] font-medium text-ink">
            {active.title}
            <span className="ml-2 text-[11px] text-faint">{wm.desktops.find((d) => d.id === active.desktop)?.name}</span>
          </div>
        ) : null}
      </motion.div>
    </AnimatePresence>
  )
}
