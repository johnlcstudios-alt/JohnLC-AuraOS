import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ClipboardList, Copy, Image as ImageIcon, Pin, PinOff, Search, Trash2, X } from 'lucide-react'
import { clipboardHistory } from '../core/clipboard'
import { ui } from '../core/uiStore'
import { bridge } from '../core/ipc/bridge'
import { notify } from '../core/notifications'
import { useStore } from '../core/hooks'
import { EmptyState } from '../ui/controls'
import { prettyCombo } from '../core/shortcuts'
import type { ClipEntry } from '../core/clipboard'

function relative(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  return `${Math.floor(min / 60)}h`
}

async function copyEntry(entry: ClipEntry): Promise<void> {
  try {
    if (entry.kind === 'image') await bridge.clipboard.writeImage(entry.value)
    else await bridge.clipboard.writeText(entry.value)
    clipboardHistory.noteWrite(entry.kind === 'text' ? entry.value : entry.label)
    notify({ title: 'Copied to clipboard', kind: 'success', appId: 'clipboard', banner: false })
  } catch {
    notify({ title: 'Copy failed', kind: 'error', appId: 'clipboard' })
  }
}

/**
 * Clipboard History: everything copied anywhere in JohnLC AuraOS, pinned items first.
 * Click a card to put it back on the system clipboard.
 */
export function ClipboardHistory() {
  const uiState = useStore(ui)
  const open = uiState.clipboard
  const items = useStore(clipboardHistory)
  const [query, setQuery] = useState('')

  useEffect(() => {
    clipboardHistory.start(() => bridge.clipboard.readText())
    return () => clipboardHistory.stop()
  }, [])

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? items.filter((c) => c.label.toLowerCase().includes(q) || c.value.toLowerCase().includes(q)) : items
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.ts - a.ts)
  }, [items, query])

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div className="overlay-dim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => ui.close('clipboard')} />
          <motion.aside
            initial={{ x: 380, opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            data-overlay="clipboard"
            className="glass-strong absolute right-3 top-[36px] z-[24000] flex max-h-[calc(100%-120px)] w-[360px] flex-col overflow-hidden rounded-[18px]"
          >
            <header className="flex items-center gap-2 px-4 pb-2 pt-3.5">
              <ClipboardList size={15} className="text-muted" />
              <span className="flex-1 text-[13.5px] font-semibold text-ink">Clipboard</span>
              <button type="button" className="menu-item w-auto px-2 py-1 text-[11.5px]" onClick={() => clipboardHistory.clear()}>
                Clear unpinned
              </button>
              <button type="button" className="menu-item w-auto p-1.5" onClick={() => ui.close('clipboard')} aria-label="Close">
                <X size={14} />
              </button>
            </header>

            <div className="px-3 pb-2">
              <div className="flex items-center gap-2 rounded-[9px] border border-line px-2.5 py-1.5" style={{ background: 'var(--hover)' }}>
                <Search size={13} className="text-faint" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clipboard"
                  className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-faint"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {filtered.length === 0 ? (
                <EmptyState icon={ClipboardList} title="Nothing copied yet" hint="Copies appear here automatically" />
              ) : (
                <div className="flex flex-col gap-2">
                  {filtered.map((entry) => (
                    <motion.div
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 30 }}
                      className="group relative cursor-pointer rounded-[12px] border border-line p-2.5 transition-colors hover:border-[rgb(var(--accent-rgb)/0.6)]"
                      style={{ background: 'var(--hover)' }}
                      onClick={() => void copyEntry(entry)}
                    >
                      {entry.pinned ? (
                        <span className="absolute right-2 top-2 text-[10px] text-accent">
                          <Pin size={11} />
                        </span>
                      ) : null}
                      {entry.kind === 'image' ? (
                        <img src={entry.value} alt="clipboard" className="max-h-[120px] w-full rounded-[8px] object-contain" />
                      ) : (
                        <div className="mono line-clamp-3 whitespace-pre-wrap break-words pr-5 text-[11.5px] leading-snug text-ink">
                          {entry.label}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-1 text-[10.5px] text-faint">
                          {entry.kind === 'image' ? <ImageIcon size={11} /> : <Copy size={11} />}
                          {relative(entry.ts)}
                        </span>
                        <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            className="menu-item w-auto p-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              clipboardHistory.togglePin(entry.id)
                            }}
                            aria-label={entry.pinned ? 'Unpin' : 'Pin'}
                          >
                            {entry.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                          </button>
                          <button
                            type="button"
                            className="menu-item w-auto p-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              clipboardHistory.remove(entry.id)
                            }}
                            aria-label="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <footer className="border-t border-line px-4 py-2 text-center text-[11px] text-faint">
              Toggle with {prettyCombo('Mod+Shift+V')}
            </footer>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
