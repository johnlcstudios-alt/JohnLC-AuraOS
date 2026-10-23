import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { wm } from '../core/wm/WindowManager'
import { useWindowManager } from '../core/wm/useWindowManager'
import { useTheme } from '../core/hooks'
import { contextMenu } from '../core/contextMenu'
import { ui } from '../core/uiStore'

/**
 * Desktop pager (a.k.a. Spaces / virtual-desktop switcher).
 * Appears bottom-centre just above the Dock/Taskbar once more than one desktop
 * exists. Click a chip to switch, right-click for rename/close.
 */
export function WorkspaceBar() {
  const state = useWindowManager()
  const themeState = useTheme()

  const visible = state.desktops.length > 1
  const bottom = themeState.shellMode === 'dock' ? 88 : 58

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="pointer-events-auto absolute left-1/2 z-[200] -translate-x-1/2"
          data-overlay="workspace-bar"
          style={{ bottom }}
        >
          <div className="glass flex items-center gap-1.5 rounded-full px-2 py-1.5">
            {state.desktops.map((desktop) => {
              const count = state.windows.filter((w) => w.desktop === desktop.id).length
              const active = desktop.id === state.activeDesktop
              return (
                <button
                  key={desktop.id}
                  type="button"
                  onClick={() => wm.switchDesktop(desktop.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    contextMenu.open(
                      [
                        {
                          label: 'Rename…',
                          onSelect: () => {
                            const name = window.prompt('Rename desktop', desktop.name)
                            if (name) wm.renameDesktop(desktop.id, name)
                          },
                        },
                        {
                          label: 'Close desktop',
                          danger: true,
                          disabled: state.desktops.length <= 1,
                          onSelect: () => wm.removeDesktop(desktop.id),
                        },
                      ],
                      { x: e.clientX, y: e.clientY },
                      desktop.name,
                    )
                  }}
                  onDoubleClick={() => {
                    const name = window.prompt('Rename desktop', desktop.name)
                    if (name) wm.renameDesktop(desktop.id, name)
                  }}
                  className="group flex items-center gap-1.5 rounded-full px-2 py-1 transition-all"
                  style={{
                    background: active ? 'var(--accent)' : 'var(--hover)',
                    minWidth: active ? 44 : 22,
                  }}
                  title={desktop.name}
                >
                  <span
                    className="text-[10.5px] font-medium"
                    style={{ color: active ? '#fff' : 'var(--text-muted)' }}
                  >
                    {active ? desktop.name : ''}
                  </span>
                  <span className="flex items-center gap-0.5">
                    {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: active ? 'rgba(255,255,255,.85)' : 'var(--text-faint)' }}
                      />
                    ))}
                  </span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => wm.addDesktop()}
              className="grid h-[22px] w-[22px] place-items-center rounded-full transition-colors"
              style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}
              title="New desktop"
              aria-label="New desktop"
            >
              <Plus size={12} />
            </button>
            <button
              type="button"
              onClick={() => ui.open('mission-control')}
              className="rounded-full px-2 py-1 text-[10.5px] transition-colors"
              style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}
              title="Mission Control"
            >
              Overview
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
