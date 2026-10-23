import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CornerDownLeft, Terminal } from 'lucide-react'
import { ui } from '../core/uiStore'
import { useStore } from '../core/hooks'
import { actions, type ActionDef } from '../core/actions'
import { fuzzyScore } from '../core/search/search'
import { shortcuts, prettyCombo } from '../core/shortcuts'

interface CommandRow {
  def: ActionDef
  score: number
  group: string
}

/**
 * Command palette (Ctrl/Cmd + K) — a keyboard-first list of every registered
 * action, grouped by category, showing each one's (rebindable) shortcut.
 * Unlike Spotlight it does not search apps/files; it runs commands.
 */
export function CommandPalette() {
  const uiState = useStore(ui)
  const open = uiState['command-palette']
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // re-render when bindings change so hints stay accurate
  useStore(shortcuts)

  // computed on every render (no useMemo): the action registry is populated
  // asynchronously by shortcuts.init(), so a memo keyed on the query alone can
  // cache an empty list from the first render.
  const q = query.trim()
  const rows: CommandRow[] = []
  for (const def of actions.all()) {
    let score: number | null = q ? fuzzyScore(q, def.title) : 0
    if (q) {
      for (const kw of def.keywords ?? []) {
        const s = fuzzyScore(q, kw)
        if (s !== null) score = Math.max(score ?? s, s - 30)
      }
    }
    // with no query show everything; otherwise require an actual match
    if (score === null || (q && score <= 0)) continue
    rows.push({ def, score, group: def.category })
  }
  rows.sort((a, b) => {
    if (a.group !== b.group) return a.group.localeCompare(b.group)
    return b.score - a.score || a.def.title.localeCompare(b.def.title)
  })

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      const id = window.setTimeout(() => inputRef.current?.focus(), 30)
      return () => window.clearTimeout(id)
    }
    return
  }, [open])

  useEffect(() => {
    setIndex(0)
  }, [query])

  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index, rows.length])

  const run = (row: CommandRow) => {
    ui.close('command-palette')
    void actions.run(row.def.id)
  }

  const onKeyDown = (e: RKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(rows.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = rows[index]
      if (row) run(row)
    }
  }

  let lastGroup: string | null = null

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="overlay-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onPointerDown={() => ui.close('command-palette')}
          />
          <motion.div
            className="glass-strong absolute left-1/2 z-[20001] w-[560px] max-w-[94vw] rounded-[16px]"
            style={{ top: '18vh', transformOrigin: 'top center' }}
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 520, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            data-overlay="command-palette"
          >
            <div className="flex items-center gap-3 px-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <Terminal size={18} className="shrink-0" style={{ color: 'var(--accent)' }} />
              <input
                ref={inputRef}
                className="h-[50px] w-full bg-transparent text-[16px] outline-none placeholder:text-faint"
                placeholder="Type a command…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                spellCheck={false}
                autoComplete="off"
              />
              <span className="shrink-0 text-[11px] text-faint">{rows.length}</span>
            </div>

            <div ref={listRef} className="max-h-[44vh] overflow-y-auto p-2">
              {rows.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12.5px] text-faint">No matching commands</div>
              ) : (
                rows.map((row, i) => {
                  const showGroup = row.group !== lastGroup
                  lastGroup = row.group
                  const Icon = row.def.icon
                  const combo = shortcuts.bindingFor(row.def.id)
                  const selected = i === index
                  return (
                    <div key={row.def.id}>
                      {showGroup ? <div className="side-title !pt-1.5 !pb-1">{row.group}</div> : null}
                      <button
                        type="button"
                        data-row={i}
                        data-command={row.def.id}
                        className="list-row !h-[40px] w-full"
                        data-selected={selected ? 'true' : 'false'}
                        onMouseMove={() => setIndex(i)}
                        onClick={() => run(row)}
                      >
                        <span
                          className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg"
                          style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}
                        >
                          {Icon ? <Icon size={14} /> : <Terminal size={14} />}
                        </span>
                        <span className="flex min-w-0 flex-col items-start">
                          <span className="truncate text-[13px]">{row.def.title}</span>
                          {row.def.subtitle ? (
                            <span className="truncate text-[11px] text-faint">{row.def.subtitle}</span>
                          ) : null}
                        </span>
                        {combo ? (
                          <span className="ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] text-faint" style={{ background: 'var(--hover)' }}>
                            {prettyCombo(combo)}
                          </span>
                        ) : selected ? (
                          <CornerDownLeft size={14} className="ml-auto text-faint" />
                        ) : null}
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            <div
              className="flex items-center justify-between px-4 py-2 text-[11px] text-faint"
              style={{ borderTop: '1px solid var(--line)' }}
            >
              <span>↑ ↓ navigate · ↵ run · esc dismiss</span>
              <span>{rows.length ? `${rows.length} command${rows.length === 1 ? '' : 's'}` : 'All commands'}</span>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
