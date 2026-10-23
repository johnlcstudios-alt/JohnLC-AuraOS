import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Layers, Pin, Plus, X } from 'lucide-react'
import { ui } from '../core/uiStore'
import { wm } from '../core/wm/WindowManager'
import { useWindowManager } from '../core/wm/useWindowManager'
import { useStore } from '../core/hooks'
import { getApp } from '../core/apps/registry'
import { AppIconTile, EmptyState } from '../ui/controls'
import type { WMWindow } from '../core/wm/types'

function WindowCard({ win, onPick }: { win: WMWindow; onPick: () => void }) {
  const app = getApp(win.appId)
  if (!app) return null
  const Icon = app.icon
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      whileHover={{ scale: 1.03 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[14px] border border-line"
      style={{ background: 'var(--panel)' }}
      onClick={onPick}
    >
      {/* stylized preview: the app's gradient tint with a faint window chrome */}
      <div
        className="relative h-[120px] w-full overflow-hidden"
        style={{ backgroundImage: `linear-gradient(135deg, ${app.tint[0]}, ${app.tint[1]})` }}
      >
        <div className="absolute inset-x-3 top-3 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-white/70" />
          <span className="h-2 w-2 rounded-full bg-white/50" />
          <span className="h-2 w-2 rounded-full bg-white/30" />
        </div>
        <div className="absolute inset-x-3 bottom-3 rounded-[8px] bg-black/25 p-2 backdrop-blur-sm">
          <div className="truncate text-[12px] font-medium text-white">{win.title}</div>
          <div className="truncate text-[10.5px] text-white/70">{app.name}</div>
        </div>
        <span className="absolute right-2.5 top-2.5 opacity-90">
          <AppIconTile icon={Icon} tint={['rgba(255,255,255,.28)', 'rgba(255,255,255,.12)']} size={26} radius={7} />
        </span>
        {win.alwaysOnTop ? (
          <span className="absolute left-2.5 top-8 rounded-full bg-black/40 p-1 text-white" title="Always on top">
            <Pin size={11} />
          </span>
        ) : null}
        <button
          type="button"
          className="absolute right-2 top-2 hidden rounded-full bg-black/45 p-1 text-white group-hover:block"
          onClick={(e) => {
            e.stopPropagation()
            wm.close(win.id)
          }}
          aria-label="Close window"
        >
          <X size={12} />
        </button>
      </div>
      <div className="flex items-center justify-between px-2.5 py-1.5 text-[10.5px] text-faint">
        <span>{win.state === 'minimized' ? 'Minimized' : win.state === 'maximized' ? 'Maximized' : win.state === 'snapped' ? 'Snapped' : 'Window'}</span>
        <span>{wm.desktops.find((d) => d.id === win.desktop)?.name ?? ''}</span>
      </div>
    </motion.div>
  )
}

/**
 * Mission Control / Task View: every open window across all desktops, plus a
 * desktop strip for switching and reordering by drag-free clicks.
 */
export function MissionControl() {
  const uiState = useStore(ui)
  const open = uiState['mission-control']
  const state = useWindowManager()
  const [scope, setScope] = useState<'current' | 'all'>('current')

  const windows = scope === 'all' ? state.windows : state.windows.filter((w) => w.desktop === state.activeDesktop)

  const pick = (win: WMWindow): void => {
    if (win.desktop !== wm.activeDesktop) wm.switchDesktop(win.desktop)
    if (win.state === 'minimized') wm.restore(win.id)
    else wm.focus(win.id)
    ui.close('mission-control')
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[23000] flex flex-col"
          data-overlay="mission-control"
          style={{ background: 'rgba(8,10,16,0.55)', backdropFilter: 'blur(26px) saturate(150%)' }}
          onClick={() => ui.close('mission-control')}
        >
          <header className="flex items-center justify-between px-8 pt-7" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 text-white">
              <Layers size={18} />
              <span className="text-[16px] font-semibold">Mission Control</span>
            </div>
            <div className="flex items-center gap-1 rounded-[9px] border border-white/15 p-[3px]" style={{ background: 'rgba(255,255,255,.08)' }}>
              {(['current', 'all'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className="rounded-[7px] px-3 py-1 text-[12px] capitalize transition-colors"
                  style={{ background: scope === s ? 'rgba(255,255,255,.9)' : 'transparent', color: scope === s ? '#111' : '#fff' }}
                >
                  {s === 'current' ? 'This desktop' : 'All desktops'}
                </button>
              ))}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6" onClick={(e) => e.stopPropagation()}>
            {windows.length === 0 ? (
              <div className="grid h-full place-items-center text-white/70">
                <EmptyState icon={Layers} title="No open windows" hint="Launch an app to see it here" />
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
                <AnimatePresence>
                  {windows.map((win) => (
                    <WindowCard key={win.id} win={win} onPick={() => pick(win)} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          <footer
            className="flex items-center justify-center gap-2 border-t border-white/10 px-8 py-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            {state.desktops.map((desktop) => {
              const count = state.windows.filter((w) => w.desktop === desktop.id).length
              const active = desktop.id === state.activeDesktop
              return (
                <button
                  key={desktop.id}
                  type="button"
                  onClick={() => wm.switchDesktop(desktop.id)}
                  onDoubleClick={() => {
                    const name = window.prompt('Rename desktop', desktop.name)
                    if (name) wm.renameDesktop(desktop.id, name)
                  }}
                  className="flex min-w-[110px] flex-col items-start rounded-[11px] border px-3 py-2 text-left transition-colors"
                  style={{
                    borderColor: active ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.16)',
                    background: active ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)',
                    color: '#fff',
                  }}
                >
                  <span className="text-[12px] font-medium">{desktop.name}</span>
                  <span className="text-[10.5px] text-white/60">{count} window{count === 1 ? '' : 's'}</span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => wm.addDesktop()}
              className="flex h-[52px] w-[52px] items-center justify-center rounded-[11px] border border-white/20 text-white transition-colors hover:bg-white/10"
              aria-label="Add desktop"
            >
              <Plus size={18} />
            </button>
          </footer>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
