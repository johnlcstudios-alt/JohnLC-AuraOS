import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BellRing, CalendarDays, Check, ChevronRight, Flag, ListChecks, Plus, Search, Trash2 } from 'lucide-react'
import type { AppProps } from '../../core/apps/types'
import { bridge } from '../../core/ipc/bridge'
import { bus, EVT, type AppArgsEvent } from '../../core/bus'
import { notify } from '../../core/notifications'
import { EmptyState } from '../../ui/controls'

const CONFIG_KEY = 'reminders.data'
const SAVE_DEBOUNCE = 400
const DUE_POLL_MS = 15_000

export type ReminderPriority = 0 | 1 | 2

export interface Reminder {
  id: string
  title: string
  notes: string
  done: boolean
  /** epoch ms, or null when it has no date */
  due: number | null
  priority: ReminderPriority
  created: number
  updated: number
  completedAt: number | null
  /** when the due notification was raised, so it fires exactly once */
  notifiedAt: number | null
}

interface RemindersFile {
  version: 1
  reminders: Reminder[]
}

type Filter = 'all' | 'today' | 'upcoming' | 'flagged' | 'completed'

const FILTERS: { id: Filter; label: string; icon: typeof ListChecks }[] = [
  { id: 'today', label: 'Today', icon: CalendarDays },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarDays },
  { id: 'all', label: 'All', icon: ListChecks },
  { id: 'flagged', label: 'Flagged', icon: Flag },
  { id: 'completed', label: 'Completed', icon: Check },
]

const DAY = 86_400_000

function newId(): string {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** "Today 14:30" / "Tomorrow" / "Mon 20 Jan, 09:00" / "2 days ago". */
function dueLabel(ms: number): string {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const d = new Date(ms)
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0
  const diffDays = Math.round((day - start) / 86_400_000)
  const time = hasTime ? ` ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}` : ''
  if (diffDays === 0) return `Today${time}`
  if (diffDays === 1) return `Tomorrow${time}`
  if (diffDays === -1) return `Yesterday${time}`
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}${time}`
}

function isOverdue(reminder: Reminder, now: number): boolean {
  return !reminder.done && reminder.due !== null && reminder.due < now
}

function newReminder(partial: Partial<Reminder> = {}): Reminder {
  const ts = Date.now()
  return {
    id: `r-${ts.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    notes: '',
    done: false,
    due: null,
    priority: 0,
    created: ts,
    updated: ts,
    completedAt: null,
    notifiedAt: null,
    ...partial,
  }
}

/** Value for a `<input type="datetime-local">` from epoch ms. */
function toLocalInput(ms: number | null): string {
  if (ms === null) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value: string): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * Reminders — a real to-do list.
 *
 * The list persists through the config bridge, and due reminders raise genuine
 * notifications with working "Mark done" / "Snooze" actions. Overdue items are
 * highlighted, and the Dock jump list can create one straight away.
 */
export function RemindersApp({ windowId, args }: AppProps) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [draftDue, setDraftDue] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const remindersRef = useRef<Reminder[]>([])
  remindersRef.current = reminders
  const loadedRef = useRef(false)
  const saveTimer = useRef<number | null>(null)

  // ---- load / save -----------------------------------------------------
  useEffect(() => {
    let cancelled = false
    void bridge.config
      .get<RemindersFile | null>(CONFIG_KEY, null)
      .then((stored) => {
        if (cancelled) return
        if (stored && Array.isArray(stored.reminders)) {
          setReminders(
            stored.reminders
              .filter((r) => r && typeof r.id === 'string')
              .map((r) => ({ ...newReminder(), ...r })),
          )
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          loadedRef.current = true
          setLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const flush = useCallback(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (!loadedRef.current) return
    const payload: RemindersFile = { version: 1, reminders: remindersRef.current }
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

  // ---- mutations -------------------------------------------------------
  const patch = useCallback(
    (id: string, changes: Partial<Reminder>) => {
      setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes, updated: Date.now() } : r)))
      scheduleSave()
    },
    [scheduleSave],
  )

  const addReminder = useCallback(
    (title = '') => {
      const due = draftDue ? fromLocalInput(draftDue) : null
      const reminder = newReminder({ title: title.trim(), due })
      setReminders((prev) => [reminder, ...prev])
      setDraft('')
      setDraftDue('')
      setFilter((current) => (current === 'completed' ? 'all' : current))
      scheduleSave()
      return reminder
    },
    [draftDue, scheduleSave],
  )

  const toggleDone = useCallback(
    (id: string) => {
      setReminders((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, done: !r.done, completedAt: !r.done ? Date.now() : null, updated: Date.now() } : r,
        ),
      )
      scheduleSave()
    },
    [scheduleSave],
  )

  const patchFields = useCallback(
    (id: string, changes: Partial<Reminder>) => {
      setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes, updated: Date.now() } : r)))
      scheduleSave()
    },
    [scheduleSave],
  )

  const remove = useCallback(
    (id: string) => {
      setReminders((prev) => prev.filter((r) => r.id !== id))
      scheduleSave()
    },
    [scheduleSave],
  )

  const snooze = useCallback(
    (id: string, minutes: number) => {
      setReminders((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, due: Date.now() + minutes * 60_000, notifiedAt: null, updated: Date.now() } : r,
        ),
      )
      scheduleSave()
    },
    [scheduleSave],
  )

  const markDone = useCallback(
    (id: string) => {
      setReminders((prev) =>
        prev.map((r) => (r.id === id ? { ...r, done: true, completedAt: Date.now(), updated: Date.now() } : r)),
      )
      scheduleSave()
    },
    [scheduleSave],
  )

  /** Raise notifications for anything newly due. Safe to call on every change. */
  const fireDue = useCallback(() => {
    const stamp = Date.now()
    const due = remindersRef.current.filter((r) => !r.done && r.due !== null && r.due <= stamp && !r.notifiedAt)
    if (!due.length) return
    const ids = new Set(due.map((r) => r.id))
    setReminders((prev) => prev.map((r) => (ids.has(r.id) ? { ...r, notifiedAt: stamp } : r)))
    scheduleSave()
    for (const reminder of due) {
      notify({
        title: reminder.title.trim() || 'Reminder',
        body: reminder.due !== null ? `Due ${dueLabel(reminder.due)}` : undefined,
        kind: 'info',
        appId: 'reminders',
        icon: BellRing,
        actions: [
          { id: `done-${reminder.id}`, label: 'Mark done', run: () => markDone(reminder.id) },
          { id: `snooze-${reminder.id}`, label: 'Snooze 10 min', run: () => snooze(reminder.id, 10) },
        ],
      })
    }
  }, [markDone, snooze, scheduleSave])

  useEffect(() => {
    if (!loaded) return
    fireDue()
    const timer = window.setInterval(() => {
      setNow(Date.now())
      fireDue()
    }, DUE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [loaded, fireDue])

  // an edit (e.g. setting a past due date) is reflected immediately
  useEffect(() => {
    if (!loaded) return
    setNow(Date.now())
    fireDue()
  }, [reminders, loaded, fireDue])

  const addDraft = useCallback(() => {
    const created = addReminder(draft)
    setExpanded(created.id)
    setDraft('')
    setDraftDue('')
  }, [addReminder, draft])

  // ---- jump-list / Spotlight intents -----------------------------------
  const applyIntent = useCallback(
    (incoming: Record<string, unknown>) => {
      if (incoming.intent === 'new-reminder') {
        setFilter((f) => (f === 'completed' ? 'all' : f))
        window.setTimeout(() => document.getElementById(`reminders-draft-${windowId}`)?.focus(), 40)
      }
      if (typeof incoming.filter === 'string') setFilter(incoming.filter as Filter)
    },
    [windowId],
  )

  useEffect(() => {
    return bus.on<AppArgsEvent>(EVT.APP_ARGS, (event) => {
      if (event.windowId !== windowId) return
      applyIntent(event.args)
    })
  }, [windowId, applyIntent])

  useEffect(() => {
    if (loaded) applyIntent(args)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  // ---- derived ---------------------------------------------------------
  const counts = useMemo(() => {
    const open = reminders.filter((r) => !r.done)
    return {
      all: reminders.length,
      open: open.length,
      today: open.filter((r) => r.due !== null && new Date(r.due).toDateString() === new Date(now).toDateString()).length,
      upcoming: open.filter((r) => r.due !== null && r.due > now).length,
      flagged: open.filter((r) => r.priority > 0).length,
      completed: reminders.filter((r) => r.done).length,
    }
  }, [reminders, now])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const dayStart = new Date(now)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = dayStart.getTime() + 86_400_000

    let list = [...reminders]
    if (filter === 'today') list = list.filter((r) => !r.done && r.due !== null && r.due >= dayStart.getTime() && r.due < dayEnd)
    else if (filter === 'upcoming') list = list.filter((r) => !r.done && r.due !== null && r.due >= dayEnd)
    else if (filter === 'flagged') list = list.filter((r) => !r.done && r.priority > 0)
    else if (filter === 'completed') list = list.filter((r) => r.done)
    else list = list.filter((r) => !r.done)

    if (q) list = list.filter((r) => `${r.title}\n${r.notes}`.toLowerCase().includes(q))

    return list.sort((a, b) => {
      // dated items first (soonest first, overdue at the very top), then priority
      if (a.due !== b.due) {
        if (a.due === null) return 1
        if (b.due === null) return -1
        return a.due - b.due
      }
      if (a.priority !== b.priority) return b.priority - a.priority
      return b.created - a.created
    })
  }, [reminders, filter, query, now])

  return (
    <div
      className="flex h-full w-full min-h-0"
      data-reminders-count={reminders.length}
      data-reminders-open={counts.open}
      data-reminders-done={counts.completed}
      data-reminders-filter-active={filter}
    >
      <div className="sidebar">
        <div className="side-title !pt-1">Smart lists</div>
        {FILTERS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="side-item"
            data-reminders-filter={id}
            data-active={filter === id ? 'true' : 'false'}
            onClick={() => setFilter(id)}
          >
            <Icon size={15} />
            <span className="flex-1">{label}</span>
            <span className="text-[11px] text-faint">
              {id === 'all' ? counts.open : id === 'completed' ? counts.completed : (counts[id] as number)}
            </span>
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <div className="relative flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="field !h-[28px] !pl-7 text-[12px]"
              placeholder="Search reminders"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-reminders-search
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 pb-3">
          <input
            id={`reminders-draft-${windowId}`}
            className="field !h-[30px] flex-1"
            placeholder="Add a reminder…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) addDraft()
            }}
            data-reminders-input
          />
          <input
            type="datetime-local"
            className="field !h-[30px] !w-[186px] text-[11.5px]"
            value={draftDue}
            onChange={(e) => setDraftDue(e.target.value)}
            title="Due date"
            data-reminders-due-input
          />
          <button
            type="button"
            className="btn"
            data-variant="accent"
            data-disabled={draft.trim() ? 'false' : 'true'}
            data-reminders-action="add"
            onClick={() => draft.trim() && addDraft()}
          >
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {visible.map((reminder) => {
            const overdue = isOverdue(reminder, now)
            const open = expanded === reminder.id
            return (
              <div
                key={reminder.id}
                className="mb-[2px] rounded-[9px]"
                data-reminders-row={reminder.id}
                data-reminders-row-done={reminder.done ? 'true' : 'false'}
                data-reminders-overdue={isOverdue(reminder, now) ? 'true' : 'false'}
                style={expanded === reminder.id ? { background: 'var(--hover)' } : undefined}
              >
                <div className="group flex items-center gap-2.5 px-2.5 py-2">
                  <button
                    type="button"
                    className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] border"
                    style={{
                      borderColor: reminder.done ? 'transparent' : 'var(--line-strong)',
                      background: reminder.done ? 'var(--accent)' : 'transparent',
                    }}
                    aria-label={reminder.done ? 'Mark as not done' : 'Mark done'}
                    data-reminders-toggle
                    onClick={() => toggleDone(reminder.id)}
                  >
                    {reminder.done ? <Check size={12} className="text-white" /> : null}
                  </button>

                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    data-reminders-expand
                    onClick={() => setExpanded((current) => (current === reminder.id ? null : reminder.id))}
                  >
                    <ChevronRight
                      size={13}
                      className="shrink-0 text-faint transition-transform"
                      style={{ transform: expanded === reminder.id ? 'rotate(90deg)' : undefined }}
                    />
                    <span
                      className={`truncate text-[13px] ${reminder.done ? 'text-faint line-through' : ''}`}
                    >
                      {reminder.title.trim() || 'New reminder'}
                    </span>
                    {reminder.priority > 0 ? (
                      <span
                        className="shrink-0 rounded-[5px] px-1.5 py-[1px] text-[10px]"
                        style={{
                          background: reminder.priority === 2 ? 'rgb(255 95 87 / 0.2)' : 'rgb(254 188 46 / 0.2)',
                          color: reminder.priority === 2 ? 'var(--danger)' : 'var(--warn)',
                        }}
                      >
                        {reminder.priority === 2 ? 'High' : 'Low'}
                      </span>
                    ) : null}
                    {reminder.due !== null ? (
                      <span
                        className="ml-auto shrink-0 rounded-[5px] px-1.5 py-[1px] text-[10.5px]"
                        style={
                          isOverdue(reminder, now)
                            ? { background: 'rgb(255 95 87 / 0.18)', color: 'var(--danger)' }
                            : { color: 'var(--text-faint)' }
                        }
                        data-reminders-due-label
                      >
                        {dueLabel(reminder.due)}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="icon-btn !h-[22px] !w-[22px] opacity-0 transition-opacity hover:!text-[var(--danger)] group-hover:opacity-100"
                    title="Delete reminder"
                    aria-label="Delete reminder"
                    data-reminders-delete
                    onClick={() => remove(reminder.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {expanded === reminder.id ? (
                  <div className="flex flex-col gap-2 px-3 pb-3" data-reminders-editor>
                    <input
                      className="field !h-[28px] text-[12.5px]"
                      placeholder="Title"
                      value={reminder.title}
                      onChange={(e) => patchFields(reminder.id, { title: e.target.value })}
                      data-reminders-title
                    />
                    <textarea
                      className="field min-h-[62px] resize-none py-1.5 text-[12px] leading-snug"
                      placeholder="Notes"
                      value={reminder.notes}
                      onChange={(e) => patchFields(reminder.id, { notes: e.target.value })}
                      data-reminders-notes
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="datetime-local"
                        className="field !h-[28px] !w-[186px] text-[11.5px]"
                        value={toLocalInput(reminder.due)}
                        onChange={(e) => patchFields(reminder.id, { due: fromLocalInput(e.target.value), notifiedAt: null })}
                        data-reminders-due
                      />
                      <span className="flex items-center gap-1">
                        {([0, 1, 2] as const).map((level) => (
                          <button
                            key={level}
                            type="button"
                            className="btn !h-[26px] !px-2 text-[11px]"
                            data-variant={reminder.priority === level ? 'accent' : 'ghost'}
                            data-reminders-priority={level}
                            onClick={() => patchFields(reminder.id, { priority: level })}
                          >
                            {level === 0 ? <Flag size={12} /> : level === 1 ? <Flag size={12} /> : <Flag size={12} />}
                            {level === 0 ? 'None' : level === 1 ? 'Low' : 'High'}
                          </button>
                        ))}
                      </span>
                      <span className="ml-auto flex items-center gap-2">
                        <button type="button" className="btn !h-[26px] text-[11.5px]" onClick={() => toggleDone(reminder.id)}>
                          <Check size={12} />
                          {reminder.done ? 'Mark open' : 'Complete'}
                        </button>
                        <button
                          type="button"
                          className="btn !h-[26px] text-[11.5px] hover:!text-[var(--danger)]"
                          data-variant="ghost"
                          data-reminders-action="delete"
                          onClick={() => remove(reminder.id)}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}

          {loaded && !visible.length ? (
            <div className="flex-1">
              <EmptyState
                icon={ListChecks}
                title={reminders.length ? 'Nothing in this list' : 'No reminders yet'}
                hint={reminders.length ? 'Try another smart list' : 'Add one above or right-click the Dock icon'}
              />
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between px-4 py-1.5 text-[10.5px] text-faint" style={{ borderTop: '1px solid var(--line)' }}>
          <span>{counts.open} open · {counts.completed} completed</span>
          <span>{filter === 'all' ? 'All open' : FILTERS.find((f) => f.id === filter)?.label}</span>
        </div>
      </div>
    </div>
  )
}

export default RemindersApp
