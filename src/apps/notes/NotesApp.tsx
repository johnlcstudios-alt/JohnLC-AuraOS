import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NotebookPen, Plus, Search, Trash2 } from 'lucide-react'
import type { AppProps } from '../../core/apps/types'
import { bridge } from '../../core/ipc/bridge'
import { bus, EVT, type AppArgsEvent } from '../../core/bus'
import { notify } from '../../core/notifications'
import { EmptyState } from '../../ui/controls'

const CONFIG_KEY = 'notes.data'
const SAVE_DEBOUNCE = 500

interface Note {
  id: string
  title: string
  body: string
  updated: number
}

interface NotesFile {
  version: 1
  notes: Note[]
}

function newId(): string {
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function makeNote(title = '', body = ''): Note {
  return { id: newId(), title, body, updated: Date.now() }
}

/** "just now" / "12 min ago" / "3 d ago" / a date for anything older. */
function relative(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} d ago`
  return new Date(ts).toLocaleDateString()
}

function snippet(note: Note): string {
  const text = note.body.replace(/\s+/g, ' ').trim()
  return text || 'No additional text'
}

function titleOf(note: Note): string {
  const first = note.title.trim() || note.body.trim().split('\n')[0] || ''
  return first.slice(0, 80) || 'New Note'
}

/**
 * Notes — a real note store: the library is persisted through the config
 * bridge (native JSON file in Electron, localStorage in web mode), edits are
 * saved on a short debounce and the Dock jump list can create a note directly.
 */
export function NotesApp({ windowId, args }: AppProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef<number | null>(null)
  const notesRef = useRef<Note[]>([])
  const loadedRef = useRef(false)
  notesRef.current = notes

  // ---- load ------------------------------------------------------------
  const seed = useCallback(() => {
    const note = makeNote(
      'Welcome to Notes',
      [
        'Everything you type here is saved automatically and stays on this machine.',
        '',
        '• Right-click the Notes icon in the Dock → New Note',
        '• Search filters the whole library',
        '• Notes are stored through the AuraOS config bridge',
      ].join('\n'),
    )
    setNotes([note])
    setActiveId(note.id)
    return [note]
  }, [])

  useEffect(() => {
    let cancelled = false
    void bridge.config
      .get<NotesFile | null>(CONFIG_KEY, null)
      .then((stored) => {
        if (cancelled) return
        const list = stored?.notes?.filter((n) => n && typeof n.id === 'string') ?? []
        // an existing store wins even when the user deleted every note, so the
        // welcome note only ever appears on a genuinely fresh library
        if (stored && Array.isArray(stored.notes)) {
          const sorted = [...list].sort((a, b) => b.updated - a.updated)
          setNotes(sorted)
          setActiveId(sorted[0]?.id ?? null)
        } else {
          seed()
        }
      })
      .catch(() => {
        if (!cancelled) seed()
      })
      .finally(() => {
        if (!cancelled) {
          loadedRef.current = true
          setLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [seed])

  // ---- save (debounced) ------------------------------------------------
  // `loadedRef` guards the store: React StrictMode mounts, unmounts and re-mounts
  // effects in development, and the unmount flush must never write an empty
  // library over data that has not been read yet.
  const flush = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (!loadedRef.current) return
    const payload: NotesFile = { version: 1, notes: notesRef.current }
    void bridge.config.set(CONFIG_KEY, payload).catch(() => undefined)
  }, [])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      flush()
    }, SAVE_DEBOUNCE)
  }, [flush])

  useEffect(() => () => flush(), [flush])

  // ---- intents from the jump list / Spotlight --------------------------
  const createNote = useCallback(
    (activate = true) => {
      const note = makeNote()
      setNotes((prev) => [note, ...prev])
      if (activate) setActiveId(note.id)
      setQuery('')
      scheduleSave()
      return note
    },
    [scheduleSave],
  )

  useEffect(() => {
    return bus.on<AppArgsEvent>(EVT.APP_ARGS, (event) => {
      if (event.windowId !== windowId) return
      if (event.args.intent === 'new-note') createNote()
    })
  }, [windowId, createNote])

  // a note created before the window existed (jump list / Spotlight on cold start)
  useEffect(() => {
    if (args.intent === 'new-note' && loaded) createNote()
  }, [loaded, args.intent, createNote])

  // ---- mutations -------------------------------------------------------
  const patch = (id: string, changes: Partial<Note>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...changes, updated: Date.now() } : n)))
    scheduleSave()
  }

  const remove = (id: string) => {
    const note = notes.find((n) => n.id === id)
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id)
      if (activeId === id) setActiveId(next[0]?.id ?? null)
      return next
    })
    scheduleSave()
    if (note) notify({ title: 'Note deleted', body: titleOf(note), kind: 'info', appId: 'notes', banner: false })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...notes].sort((a, b) => b.updated - a.updated)
    if (!q) return sorted
    return sorted.filter((n) => `${n.title}\n${n.body}`.toLowerCase().includes(q))
  }, [notes, query])

  const active = notes.find((n) => n.id === activeId) ?? null
  const words = active ? active.body.split(/\s+/).filter(Boolean).length : 0

  return (
    <div className="flex h-full w-full min-h-0" data-notes-count={notes.length}>
      <div className="flex w-[248px] flex-[0_0_248px] flex-col border-r" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-2 px-3 pt-3">
          <div className="relative flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="field !h-[28px] !pl-7 text-[12px]"
              placeholder="Search notes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-notes-search
            />
          </div>
          <button
            type="button"
            className="icon-btn"
            title="New Note"
            aria-label="New Note"
            data-notes-action="new"
            onClick={() => createNote()}
          >
            <Plus size={15} />
          </button>
        </div>

        <div className="mt-2 flex-1 overflow-y-auto px-2 pb-2">
          {filtered.map((note) => (
            <button
              key={note.id}
              type="button"
              className="mb-[2px] block w-full rounded-[8px] px-2.5 py-2 text-left transition-colors"
              data-notes-row={note.id}
              data-selected={note.id === activeId ? 'true' : 'false'}
              style={note.id === activeId ? { background: 'rgb(var(--accent-rgb) / 0.24)' } : undefined}
              onClick={() => setActiveId(note.id)}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12.5px] font-medium">{titleOf(note)}</span>
                <span className="shrink-0 text-[10.5px] text-faint">{relative(note.updated)}</span>
              </div>
              <div className="truncate text-[11.5px] text-muted">{snippet(note)}</div>
            </button>
          ))}
          {loaded && !filtered.length ? (
            <p className="px-2.5 py-6 text-center text-[11.5px] text-faint">
              {notes.length ? 'No notes match that search' : 'No notes yet'}
            </p>
          ) : null}
        </div>
      </div>

      {active ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 px-4 pt-3">
            <input
              className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none"
              placeholder="Title"
              value={active.title}
              onChange={(e) => patch(active.id, { title: e.target.value })}
              data-notes-title
            />
            <button
              type="button"
              className="icon-btn"
              title="Delete note"
              aria-label="Delete note"
              data-notes-action="delete"
              onClick={() => remove(active.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <textarea
            className="mt-1 min-h-0 flex-1 resize-none bg-transparent px-4 pb-3 text-[13px] leading-relaxed outline-none"
            placeholder="Start typing…"
            value={active.body}
            spellCheck
            onChange={(e) => patch(active.id, { body: e.target.value })}
            data-notes-body
          />
          <div className="flex items-center justify-between border-t px-4 py-2 text-[10.5px] text-faint" style={{ borderColor: 'var(--line)' }}>
            <span>
              {words} word{words === 1 ? '' : 's'}
            </span>
            <span>Edited {relative(active.updated)}</span>
          </div>
        </div>
      ) : (
        <div className="flex-1">
          <EmptyState icon={NotebookPen} title="No note selected" hint="Create a note to get started" />
        </div>
      )}
    </div>
  )
}

export default NotesApp

