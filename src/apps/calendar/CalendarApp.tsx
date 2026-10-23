import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock, Download, MapPin, Trash2, Upload } from 'lucide-react'
import type { AppProps } from '../../core/apps/types'
import { bridge } from '../../core/ipc/bridge'
import { bus, EVT, type AppArgsEvent } from '../../core/bus'
import { notify } from '../../core/notifications'
import { parseIcs, serializeIcs, type IcsEvent } from '../../core/ics'

const CONFIG_KEY = 'calendar.data'
const SAVE_DEBOUNCE = 400

export const EVENT_COLORS = ['#4f8cff', '#a06bff', '#2ecf7f', '#febc2e', '#ff5f57'] as const

export interface CalendarEvent {
  id: string
  title: string
  /** epoch ms */
  start: number
  /** epoch ms (exclusive when allDay) */
  end: number
  allDay: boolean
  location: string
  notes: string
  color: string
  created: number
  updated: number
}

interface CalendarFile {
  version: 1
  events: CalendarEvent[]
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY = 86_400_000

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Stable `yyyy-mm-dd` key in local time. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function toDatetimeInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function timeLabel(ms: number): string {
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function newEventId(): string {
  return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

interface EditorDraft {
  id: string | null
  title: string
  allDay: boolean
  start: string
  end: string
  location: string
  notes: string
  color: string
}

function draftFromEvent(event: CalendarEvent): EditorDraft {
  return {
    id: event.id,
    title: event.title,
    allDay: event.allDay,
    start: event.allDay ? dayKey(event.start) : toDatetimeInput(event.start),
    end: event.allDay ? dayKey(event.end > event.start ? event.end - DAY : event.start) : toDatetimeInput(event.end),
    location: event.location,
    notes: event.notes,
    color: event.color,
  }
}

function emptyDraft(dayMs: number): EditorDraft {
  const start = startOfDay(dayMs) + 9 * 3600_000
  return {
    id: null,
    title: '',
    allDay: false,
    start: toDatetimeInput(start),
    end: toDatetimeInput(start + 3600_000),
    location: '',
    notes: '',
    color: EVENT_COLORS[0],
  }
}

/**
 * Calendar — a real month planner with a persistent local event store.
 *
 * Events live in the config bridge and round-trip through iCalendar (.ics) via
 * `core/ics`, so they can be exported to disk and re-imported (backup, sharing,
 * moving between machines).
 */
export function CalendarApp({ windowId, args }: AppProps) {
  const today = useMemo(() => startOfDay(Date.now()), [])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selectedDay, setSelectedDay] = useState(today)
  const [draft, setDraft] = useState<EditorDraft | null>(null)
  const [loaded, setLoaded] = useState(false)

  const eventsRef = useRef<CalendarEvent[]>([])
  eventsRef.current = events
  const loadedRef = useRef(false)
  const saveTimer = useRef<number | null>(null)

  // ---- load / save -----------------------------------------------------
  useEffect(() => {
    let cancelled = false
    void bridge.config
      .get<CalendarFile | null>(CONFIG_KEY, null)
      .then((stored) => {
        if (cancelled) return
        if (stored && Array.isArray(stored.events)) {
          setEvents(stored.events.filter((e) => e && typeof e.id === 'string'))
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
    const payload: CalendarFile = { version: 1, events: eventsRef.current }
    void bridge.config.set(CONFIG_KEY, payload).catch(() => undefined)
  }, [])

  const mutate = useCallback(
    (next: CalendarEvent[]) => {
      setEvents(next)
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null
        flush()
      }, SAVE_DEBOUNCE)
    },
    [flush],
  )

  useEffect(() => () => flush(), [flush])

  // ---- jump-list / Spotlight intents -----------------------------------
  const applyIntent = useCallback((incoming: Record<string, unknown>) => {
    if (incoming.intent === 'new-event') {
      const d = new Date()
      setCursor({ year: d.getFullYear(), month: d.getMonth() })
      setSelectedDay(startOfDay(Date.now()))
      setDraft(emptyDraft(Date.now()))
    }
    if (incoming.intent === 'today') {
      const d = new Date()
      setCursor({ year: d.getFullYear(), month: d.getMonth() })
      setSelectedDay(startOfDay(Date.now()))
    }
  }, [])

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
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const first = startOfDay(event.start)
      const last = event.allDay ? startOfDay(Math.max(event.start, event.end - 1)) : first
      for (let ms = first; ms <= last; ms += DAY) {
        const key = dayKey(ms)
        const list = map.get(key)
        if (list) list.push(event)
        else map.set(key, [event])
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.allDay === b.allDay ? a.start - b.start : a.allDay ? -1 : 1))
    }
    return map
  }, [events])

  const grid = useMemo(() => {
    const firstOfMonth = new Date(cursor.year, cursor.month, 1)
    const start = new Date(cursor.year, cursor.month, 1 - firstOfMonth.getDay())
    const cells: { ms: number; key: string; inMonth: boolean }[] = []
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      cells.push({ ms: d.getTime(), key: dayKey(d.getTime()), inMonth: d.getMonth() === cursor.month })
    }
    return cells
  }, [cursor])

  const todayKey = dayKey(today)
  const selectedKey = dayKey(selectedDay)
  const selectedEvents = byDay.get(selectedKey) ?? []

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const goToday = () => {
    const d = new Date()
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
    setSelectedDay(startOfDay(Date.now()))
  }

  // ---- editing ---------------------------------------------------------
  const saveDraft = () => {
    if (!draft) return
    const allDay = draft.allDay
    let start = allDay ? new Date(`${draft.start}T00:00`).getTime() : new Date(draft.start).getTime()
    let end = allDay ? new Date(`${draft.end}T00:00`).getTime() + DAY : new Date(draft.end).getTime()
    if (!Number.isFinite(start)) start = Date.now()
    if (!Number.isFinite(end) || end <= start) end = start + (allDay ? DAY : 3600_000)
    const title = draft.title.trim() || '(untitled)'

    const existing = draft.id ? events.find((e) => e.id === draft.id) : undefined
    const nextEvent: CalendarEvent = {
      id: draft.id ?? newEventId(),
      title,
      start,
      end,
      allDay,
      location: draft.location,
      notes: draft.notes,
      color: draft.color,
      created: existing?.created ?? Date.now(),
      updated: Date.now(),
    }
    mutate(existing ? events.map((e) => (e.id === nextEvent.id ? nextEvent : e)) : [...events, nextEvent])
    setSelectedDay(startOfDay(start))
    setCursor({ year: new Date(start).getFullYear(), month: new Date(start).getMonth() })
    setDraft(null)
  }

  const deleteEvent = (id: string) => {
    mutate(events.filter((e) => e.id !== id))
    setDraft(null)
  }

  /** Flipping "All day" must convert the field values between the two formats. */
  const toggleAllDay = (next: boolean) => {
    setDraft((current) => {
      if (!current || current.allDay === next) return current
      const startMs = current.allDay ? new Date(`${current.start}T00:00`).getTime() : new Date(current.start).getTime()
      const endMs = current.allDay ? new Date(`${current.end}T00:00`).getTime() : new Date(current.end).getTime()
      if (next) {
        const s = Number.isFinite(startMs) ? startMs : Date.now()
        return { ...current, allDay: true, start: dayKey(s), end: dayKey(Number.isFinite(endMs) ? endMs : s) }
      }
      const s = Number.isFinite(startMs) ? startMs : Date.now()
      const e = Number.isFinite(endMs) && endMs > s ? endMs : s + 3600_000
      return { ...current, allDay: false, start: toDatetimeInput(s), end: toDatetimeInput(e) }
    })
  }

  // ---- iCalendar -------------------------------------------------------
  const exportIcs = async () => {
    if (!events.length) {
      notify({ title: 'Nothing to export', body: 'Add an event first', kind: 'warn', appId: 'calendar' })
      return
    }
    const payload: IcsEvent[] = events.map((e) => ({
      uid: e.id,
      summary: e.title,
      description: e.notes,
      location: e.location,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
    }))
    const target = await bridge.dialog
      .saveFile({
        title: 'Export calendar',
        defaultPath: '~/Documents/auraos-calendar.ics',
        filters: [{ name: 'iCalendar', extensions: ['ics'] }],
      })
      .catch(() => null)
    if (!target) return
    try {
      await bridge.fs.writeText(target, serializeIcs(payload))
      notify({ title: 'Calendar exported', body: `${events.length} event(s) → ${target}`, kind: 'success', appId: 'calendar' })
    } catch (err) {
      notify({
        title: 'Export failed',
        body: err instanceof Error ? err.message : String(err),
        kind: 'error',
        appId: 'calendar',
      })
    }
  }

  const importIcs = async () => {
    const picked = await bridge.dialog
      .openFile({ title: 'Import calendar', filters: [{ name: 'iCalendar', extensions: ['ics'] }], defaultPath: '~/Documents' })
      .catch(() => null)
    const target = picked?.[0]
    if (!target) return
    try {
      const text = await bridge.fs.readText(target)
      const parsed = parseIcs(text)
      if (!parsed.length) {
        notify({ title: 'No events found', body: `${target} had no VEVENT entries`, kind: 'warn', appId: 'calendar' })
        return
      }
      const known = new Set(events.map((e) => e.id))
      const additions: CalendarEvent[] = parsed
        .filter((e) => !known.has(e.uid))
        .map((e) => ({
          id: e.uid,
          title: e.summary,
          start: e.start,
          end: e.end,
          allDay: e.allDay,
          location: e.location,
          notes: e.description,
          color: EVENT_COLORS[0],
          created: Date.now(),
          updated: Date.now(),
        }))
      mutate([...events, ...additions])
      notify({
        title: 'Calendar imported',
        body: additions.length ? `${additions.length} event(s) added` : 'Everything was already there',
        kind: 'success',
        appId: 'calendar',
      })
    } catch (err) {
      notify({
        title: 'Import failed',
        body: err instanceof Error ? err.message : String(err),
        kind: 'error',
        appId: 'calendar',
      })
    }
  }

  return (
    <div
      className="relative flex h-full w-full min-h-0 flex-col"
      data-calendar-events={events.length}
      data-calendar-month={`${cursor.year}-${pad2(cursor.month + 1)}`}
      data-calendar-selected={selectedKey}
    >
      <div className="flex items-center gap-1.5 px-3 py-2" style={{ borderBottom: '1px solid var(--line)' }}>
        <button type="button" className="icon-btn" title="Previous month" aria-label="Previous month" data-calendar-action="prev" onClick={() => shiftMonth(-1)}>
          <ChevronLeft size={16} />
        </button>
        <button type="button" className="icon-btn" title="Next month" aria-label="Next month" data-calendar-action="next" onClick={() => shiftMonth(1)}>
          <ChevronRight size={16} />
        </button>
        <div className="ml-1 text-[14px] font-semibold" data-calendar-title>
          {MONTHS[cursor.month]} {cursor.year}
        </div>
        <button type="button" className="btn ml-2 !h-[26px] text-[12px]" data-calendar-action="today" onClick={goToday}>
          Today
        </button>
        <span className="ml-auto flex items-center gap-1.5">
          <button type="button" className="btn !h-[26px] text-[12px]" data-calendar-action="import" onClick={() => void importIcs()}>
            <Upload size={13} /> Import
          </button>
          <button type="button" className="btn !h-[26px] text-[12px]" data-calendar-action="export" onClick={() => void exportIcs()}>
            <Download size={13} /> Export
          </button>
          <button
            type="button"
            className="btn !h-[26px] text-[12px]"
            data-variant="accent"
            data-calendar-action="new"
            onClick={() => setDraft(emptyDraft(selectedDay))}
          >
            <CalendarPlus size={13} /> New
          </button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="grid grid-cols-7 px-1 pt-1">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-1 text-center text-[10.5px] uppercase tracking-wide text-faint">
                {day}
              </div>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-[2px] p-1" data-calendar-grid>
            {grid.map((cell) => {
              const dayEvents = byDay.get(cell.key) ?? []
              const isToday = cell.key === todayKey
              const isSelected = cell.key === selectedKey
              return (
                <button
                  key={cell.key}
                  type="button"
                  className="flex min-h-0 flex-col items-stretch gap-[2px] overflow-hidden rounded-[8px] border px-1.5 py-1 text-left transition-colors"
                  data-calendar-day={cell.key}
                  data-calendar-day-in-month={cell.inMonth ? 'true' : 'false'}
                  data-calendar-day-events={dayEvents.length}
                  data-calendar-selected-day={isSelected ? 'true' : 'false'}
                  style={{
                    borderColor: isSelected ? 'rgb(var(--accent-rgb) / 0.75)' : 'var(--line)',
                    background: isSelected ? 'rgb(var(--accent-rgb) / 0.16)' : cell.inMonth ? 'var(--hover)' : 'transparent',
                    opacity: cell.inMonth ? 1 : 0.45,
                  }}
                  onClick={() => setSelectedDay(cell.ms)}
                  onDoubleClick={() => setDraft(emptyDraft(cell.ms))}
                >
                  <span className="flex items-center gap-1">
                    <span
                      className="grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 text-[11px]"
                      style={isToday ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-muted)' }}
                    >
                      {new Date(cell.ms).getDate()}
                    </span>
                  </span>
                  {dayEvents.slice(0, 2).map((event) => (
                    <span
                      key={event.id}
                      className="flex items-center gap-1 truncate rounded-[4px] px-1 py-[1px] text-[10.5px]"
                      style={{ background: `${event.color}33`, color: 'var(--text)' }}
                      title={event.title}
                    >
                      <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: event.color }} />
                      <span className="truncate">{event.title}</span>
                    </span>
                  ))}
                  {dayEvents.length > 2 ? <span className="px-1 text-[10px] text-faint">+{dayEvents.length - 2} more</span> : null}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex w-[262px] flex-[0_0_262px] flex-col border-l" style={{ borderColor: 'var(--line)' }}>
          <div className="px-3 pb-2 pt-3">
            <div className="text-[12.5px] font-semibold">
              {new Date(selectedDay).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <div className="text-[11px] text-faint" data-calendar-day-count>
              {selectedEvents.length} event{selectedEvents.length === 1 ? '' : 's'}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {selectedEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                className="mb-1 block w-full rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-[var(--hover)]"
                data-calendar-event={event.id}
                onClick={() => setDraft(draftFromEvent(event))}
              >
                <span className="flex items-center gap-2">
                  <span className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ background: event.color }} />
                  <span className="truncate text-[12.5px] font-medium">{event.title}</span>
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-[16px] text-[11px] text-faint">
                  <span className="flex items-center gap-1">
                    {event.allDay ? <CalendarDays size={11} /> : <Clock size={11} />}
                    {event.allDay ? 'All day' : `${timeLabel(event.start)}–${timeLabel(event.end)}`}
                  </span>
                  {event.location ? (
                    <span className="flex min-w-0 items-center gap-1">
                      <MapPin size={11} />
                      <span className="truncate">{event.location}</span>
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
            {!selectedEvents.length ? (
              <p className="px-2.5 py-6 text-center text-[11.5px] text-faint">
                Nothing scheduled. Double-click a day or press New.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {draft ? (
        <div
          className="absolute inset-0 z-20 grid place-items-center p-4"
          style={{ background: 'rgba(0,0,0,0.34)' }}
          data-calendar-form
          onClick={() => setDraft(null)}
        >
          <div className="glass-strong w-[420px] max-w-full rounded-[14px] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-[13.5px] font-semibold">{draft.id ? 'Edit event' : 'New event'}</div>
            <div className="flex flex-col gap-2.5">
              <input
                className="field"
                placeholder="Event title"
                autoFocus
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveDraft()
                  if (e.key === 'Escape') setDraft(null)
                }}
                data-calendar-field="title"
              />
              <label className="row text-[12px] text-muted">
                <input
                  type="checkbox"
                  checked={draft.allDay}
                  onChange={(e) => toggleAllDay(e.target.checked)}
                  data-calendar-field="all-day"
                />
                All day
              </label>
              <div className="flex items-center gap-2">
                <span className="w-[42px] shrink-0 text-[11.5px] text-faint">Start</span>
                <input
                  type={draft.allDay ? 'date' : 'datetime-local'}
                  className="field flex-1"
                  value={draft.start}
                  onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                  data-calendar-field="start"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-[42px] shrink-0 text-[11.5px] text-faint">End</span>
                <input
                  type={draft.allDay ? 'date' : 'datetime-local'}
                  className="field flex-1"
                  value={draft.end}
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                  data-calendar-field="end"
                />
              </div>
              <input
                className="field"
                placeholder="Location"
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                data-calendar-field="location"
              />
              <textarea
                className="field min-h-[64px] resize-none py-1.5 text-[12px]"
                placeholder="Notes"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                data-calendar-field="notes"
              />
              <div className="flex items-center gap-1.5">
                <span className="text-[11.5px] text-faint">Colour</span>
                {EVENT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Colour ${color}`}
                    data-calendar-color={color}
                    className="h-[18px] w-[18px] rounded-full transition-transform"
                    style={{
                      background: color,
                      transform: draft.color === color ? 'scale(1.18)' : 'scale(1)',
                      boxShadow: draft.color === color ? '0 0 0 2px var(--panel)' : 'none',
                    }}
                    onClick={() => setDraft({ ...draft, color })}
                  />
                ))}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              {draft.id ? (
                <button
                  type="button"
                  className="btn text-[12.5px] hover:!text-[var(--danger)]"
                  data-variant="ghost"
                  data-calendar-action="delete"
                  onClick={() => deleteEvent(draft.id as string)}
                >
                  <Trash2 size={13} /> Delete
                </button>
              ) : null}
              <span className="ml-auto flex items-center gap-2">
                <button type="button" className="btn text-[12.5px]" data-calendar-action="cancel" onClick={() => setDraft(null)}>
                  Cancel
                </button>
                <button type="button" className="btn text-[12.5px]" data-variant="accent" data-calendar-action="save" onClick={saveDraft}>
                  Save
                </button>
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default CalendarApp
