import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CornerDownLeft, Eye, Search } from 'lucide-react'
import { ui } from '../core/uiStore'
import { useStore } from '../core/hooks'
import { searchEverything, searchFiles, orderResults, type SearchGroup, type SearchResult } from '../core/search/search'
import { quickLook } from '../core/quickLook'
import { AppIconTile } from '../ui/controls'

/**
 * Spotlight-style universal search (Ctrl/Cmd + Space).
 * Fuzzy-searches apps, commands, settings panes, places, files, an inline
 * calculator and the web, with full keyboard navigation. Space Quick-Looks the
 * highlighted file.
 */
export function Spotlight() {
  const uiState = useStore(ui)
  const open = uiState.spotlight
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [fileResults, setFileResults] = useState<SearchResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const sync = useMemo(() => (query.trim() ? searchEverything(query, 14) : []), [query])
  const results = useMemo(() => orderResults([...sync, ...fileResults]), [sync, fileResults])

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      setFileResults([])
      const id = window.setTimeout(() => inputRef.current?.focus(), 30)
      return () => window.clearTimeout(id)
    }
    return
  }, [open])

  // async, debounced file search
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setFileResults([])
      return
    }
    let cancelled = false
    const id = window.setTimeout(() => {
      void searchFiles(q, 6).then((found) => {
        if (!cancelled) setFileResults(found)
      })
    }, 170)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [query, open])

  useEffect(() => {
    setIndex(0)
  }, [query])

  useEffect(() => {
    const row = listRef.current?.querySelector(`[data-row="${index}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [index, results.length])

  const run = (result: SearchResult) => {
    void result.run()
    ui.close('spotlight')
  }

  const onKeyDown = (e: RKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const result = results[index]
      if (result) run(result)
    } else if (e.key === ' ') {
      // Space Quick-Looks the highlighted file (unless typing a literal space)
      const result = results[index]
      if (result?.previewPath) {
        e.preventDefault()
        quickLook.toggle(result.previewPath)
      }
    }
  }

  let lastGroup: SearchGroup | null = null

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
            onPointerDown={() => ui.close('spotlight')}
          />
          <motion.div
            className="glass-strong absolute left-1/2 z-[20001] w-[640px] max-w-[94vw] rounded-[18px]"
            style={{ top: '13vh', transformOrigin: 'top center' }}
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            data-overlay="spotlight"
          >
            <div className="flex items-center gap-3 px-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <Search size={19} className="shrink-0" style={{ color: 'var(--accent)' }} />
              <input
                ref={inputRef}
                className="h-[54px] w-full bg-transparent text-[19px] outline-none placeholder:text-faint"
                placeholder="Spotlight Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                spellCheck={false}
                autoComplete="off"
              />
              <span className="shrink-0 text-[11px] text-faint">esc</span>
            </div>

            <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-2">
              {results.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12.5px] text-faint">
                  {query.trim() ? 'No results' : 'Type to search apps, commands, files and the web'}
                </div>
              ) : (
                results.map((result, i) => {
                  const showGroup = result.group !== lastGroup
                  lastGroup = result.group
                  const Icon = result.icon
                  const selected = i === index
                  return (
                    <div key={result.id}>
                      {showGroup ? <div className="side-title !pt-1.5 !pb-1">{result.group}</div> : null}
                      <button
                        type="button"
                        data-row={i}
                        className="list-row !h-[44px] w-full"
                        data-selected={selected ? 'true' : 'false'}
                        onMouseMove={() => setIndex(i)}
                        onClick={() => run(result)}
                      >
                        {result.tint ? (
                          <AppIconTile icon={Icon} tint={result.tint} size={30} radius={8} />
                        ) : (
                          <span
                            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg"
                            style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}
                          >
                            <Icon size={16} />
                          </span>
                        )}
                        <span className="flex min-w-0 flex-col items-start">
                          <span className="truncate text-[13.5px]">{result.title}</span>
                          <span className="truncate text-[11.5px] text-faint">{result.subtitle}</span>
                        </span>
                        {selected && result.previewPath ? (
                          <span className="ml-auto flex items-center gap-1 text-faint">
                            <Eye size={13} />
                            <span className="text-[10.5px]">space</span>
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
              <span>↑ ↓ navigate · ↵ open · space preview · esc dismiss</span>
              <span>{results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'JohnLC AuraOS universal search'}</span>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
