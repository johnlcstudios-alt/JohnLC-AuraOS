import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Lock, Moon, Power, PowerOff, RotateCw, Search } from 'lucide-react'
import { appList, launchApp, pinnedApps } from '../core/apps/registry'
import { appPins } from '../core/apps/pins'
import { ui } from '../core/uiStore'
import { useStore } from '../core/hooks'
import { searchEverything, type SearchResult } from '../core/search/search'
import { AppIconTile, MenuList } from '../ui/controls'
import { bridge } from '../core/ipc/bridge'
import { dialogs } from '../core/dialogs'

/**
 * Windows 11 style Start menu: search field on top, a pinned grid that flips to
 * an alphabetical "All apps" list, and an account + power footer.
 * Only rendered in taskbar shell mode.
 */
export function StartMenu() {
  const uiState = useStore(ui)
  const open = uiState.start
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'pinned' | 'all'>('pinned')
  const [powerOpen, setPowerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setView('pinned')
      setPowerOpen(false)
      const id = window.setTimeout(() => inputRef.current?.focus(), 40)
      return () => window.clearTimeout(id)
    }
    return
  }, [open])

  const apps = useMemo(() => appList(), [])
  const pins = useStore(appPins)
  const pinned = useMemo(() => pinnedApps().slice(0, 6), [pins])
  const allApps = useMemo(() => [...apps].sort((a, b) => a.name.localeCompare(b.name)), [apps])
  const results: SearchResult[] = query.trim() ? searchEverything(query, 8) : []

  const launch = (id: string) => {
    launchApp(id)
    ui.close('start')
  }

  const run = (result: SearchResult) => {
    void result.run()
    ui.close('start')
  }

  const confirmShutdown = async () => {
    setPowerOpen(false)
    const ok = await dialogs.confirm({
      title: 'Shut Down',
      message: 'Shut down JohnLC AuraOS?',
      detail: 'Unsaved work in apps will be lost. In the browser preview this only closes the session.',
      confirmLabel: 'Shut Down',
      danger: true,
      icon: PowerOff,
    })
    if (ok) await bridge.power.shutdown().catch(() => undefined)
  }

  const confirmRestart = async () => {
    setPowerOpen(false)
    const ok = await dialogs.confirm({
      title: 'Restart',
      message: 'Restart JohnLC AuraOS?',
      detail: 'Unsaved work in apps will be lost. In the browser preview this only reloads the shell.',
      confirmLabel: 'Restart',
      danger: true,
      icon: RotateCw,
    })
    if (ok) await bridge.power.restart().catch(() => undefined)
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="overlay-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onPointerDown={() => ui.close('start')}
          />
          <motion.div
            className="glass-strong absolute bottom-[56px] left-1/2 z-[20001] w-[580px] max-w-[92vw] rounded-[20px] p-4"
            style={{ transformOrigin: 'bottom center' }}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            data-overlay="start"
          >
            <div className="relative mb-4">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                ref={inputRef}
                className="field !h-[38px] !rounded-xl !pl-9 !text-[13.5px]"
                placeholder="Search for apps, settings, files and commands"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && results[0]) run(results[0])
                }}
              />
            </div>

            {results.length > 0 ? (
              <div className="mb-2">
                <div className="side-title !pt-0">Best match</div>
                <div className="flex flex-col gap-0.5">
                  {results.slice(0, 7).map((result) => {
                    const Icon = result.icon
                    return (
                      <button key={result.id} type="button" className="list-row !h-[42px]" onClick={() => run(result)}>
                        {result.tint ? (
                          <AppIconTile icon={Icon} tint={result.tint} size={30} radius={8} />
                        ) : (
                          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg" style={{ background: 'var(--hover)' }}>
                            <Icon size={16} className="text-muted" />
                          </span>
                        )}
                        <span className="flex min-w-0 flex-col items-start">
                          <span className="truncate text-[13px]">{result.title}</span>
                          <span className="truncate text-[11px] text-faint">{result.subtitle}</span>
                        </span>
                        <ArrowRight size={14} className="ml-auto text-faint" />
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : view === 'all' ? (
              <div className="flex h-[300px] flex-col">
                <div className="mb-2 flex items-center justify-between">
                  <button type="button" className="flex items-center gap-1.5 text-[11.5px] text-muted hover:text-[var(--text)]" onClick={() => setView('pinned')}>
                    <ArrowLeft size={13} /> Back
                  </button>
                  <span className="side-title !mb-0 !pt-0">All apps</span>
                  <span className="w-[42px]" />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  {allApps.map((app) => (
                    <button key={app.id} type="button" className="list-row !h-[42px] w-full" onClick={() => launch(app.id)}>
                      <AppIconTile icon={app.icon} tint={app.tint} size={28} radius={8} />
                      <span className="flex min-w-0 flex-col items-start">
                        <span className="truncate text-[13px]">{app.name}</span>
                        <span className="truncate text-[11px] text-faint">{app.subtitle}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="side-title !mb-0 !pt-0">Pinned</span>
                  <button type="button" className="text-[11px] text-faint hover:text-[var(--text)]" onClick={() => setView('all')}>
                    All apps <ArrowRight size={11} className="inline" />
                  </button>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {pinned.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 transition-colors hover:bg-[var(--hover)]"
                      onClick={() => launch(app.id)}
                    >
                      <AppIconTile icon={app.icon} tint={app.tint} size={38} radius={10} />
                      <span className="w-full truncate text-center text-[11px] text-muted">{app.name}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <div className="side-title">Recent</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {allApps.slice(0, 4).map((app) => (
                      <button key={app.id} type="button" className="list-row !h-[40px] w-full" onClick={() => launch(app.id)}>
                        <AppIconTile icon={app.icon} tint={app.tint} size={26} radius={7} />
                        <span className="truncate text-[12.5px]">{app.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--line)' }}>
              <div className="flex items-center gap-2.5">
                <span
                  className="grid h-[30px] w-[30px] place-items-center rounded-full text-[13px] font-semibold text-white"
                  style={{ backgroundImage: 'linear-gradient(145deg, var(--accent), #a06bff)' }}
                >
                  {bridge.platform === 'web' ? 'W' : 'L'}
                </span>
                <span className="text-[12.5px] text-muted">Local user</span>
              </div>
              <div className="relative">
                <button
                  type="button"
                  className="icon-btn !h-[32px] !w-[32px]"
                  title="Power"
                  aria-label="Power options"
                  onClick={() => setPowerOpen((v) => !v)}
                >
                  <Power size={16} />
                </button>
                <AnimatePresence>
                  {powerOpen ? (
                    <div className="absolute bottom-0 right-0">
                      <MenuList
                        width={200}
                        onClose={() => setPowerOpen(false)}
                        items={[
                          { label: 'Lock', icon: Lock, onSelect: () => void bridge.power.lock().catch(() => undefined) },
                          { label: 'Sleep', icon: Moon, onSelect: () => void bridge.power.sleep().catch(() => undefined) },
                          { label: 'Restart', icon: RotateCw, onSelect: () => void confirmRestart() },
                          { label: 'Shut Down', icon: PowerOff, danger: true, onSelect: () => void confirmShutdown() },
                          { separator: true },
                          { label: 'Reload Shell', onSelect: () => window.location.reload() },
                          { label: 'Quit JohnLC AuraOS', danger: true, onSelect: () => void bridge.app.quit() },
                        ]}
                      />
                    </div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
