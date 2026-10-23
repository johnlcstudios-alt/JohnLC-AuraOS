import { useEffect, useRef, useState } from 'react'
import { AlarmClock, BellRing, Flag, Globe, Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AppProps } from '../../core/apps/types'
import { bridge } from '../../core/ipc/bridge'
import { bus, EVT, type AppArgsEvent } from '../../core/bus'
import { notify } from '../../core/notifications'

type Tab = 'world' | 'alarms' | 'timer' | 'stopwatch'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'world', label: 'World Clock', icon: Globe },
  { id: 'alarms', label: 'Alarms', icon: AlarmClock },
  { id: 'timer', label: 'Timer', icon: BellRing },
  { id: 'stopwatch', label: 'Stopwatch', icon: Flag },
]

/** Real IANA zones, so every listed clock is the actual time in that city. */
const CITIES: { city: string; zone: string }[] = [
  { city: 'Local', zone: '' },
  { city: 'London', zone: 'Europe/London' },
  { city: 'New York', zone: 'America/New_York' },
  { city: 'Los Angeles', zone: 'America/Los_Angeles' },
  { city: 'Berlin', zone: 'Europe/Berlin' },
  { city: 'Dubai', zone: 'Asia/Dubai' },
  { city: 'Kolkata', zone: 'Asia/Kolkata' },
  { city: 'Tokyo', zone: 'Asia/Tokyo' },
  { city: 'Sydney', zone: 'Australia/Sydney' },
]

const TIMER_PRESETS = [1, 5, 10, 25]
const ALARM_KEY = 'clock.alarms'

interface Alarm {
  id: string
  /** 24h "HH:MM" in local time */
  time: string
  label: string
  enabled: boolean
}

function pad2(n: number): string {
  return String(Math.floor(n)).padStart(2, '0')
}

function makeAlarm(time: string, label: string): Alarm {
  return { id: `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, time, label, enabled: true }
}

function timeIn(zone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(zone ? { timeZone: zone } : {}),
  }).format(now)
}

function dateIn(zone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(zone ? { timeZone: zone } : {}),
  }).format(now)
}

function ymd(zone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(zone ? { timeZone: zone } : {}),
  }).format(now)
}

/** +1 when that zone has already rolled over to tomorrow, -1 when it lags. */
function dayShift(zone: string, now: Date): number {
  if (!zone) return 0
  const there = Date.parse(`${ymd(zone, now)}T00:00:00Z`)
  const here = Date.parse(`${ymd('', now)}T00:00:00Z`)
  return Math.round((there - here) / 86_400_000)
}

function shiftLabel(shift: number): string {
  if (shift === 1) return 'Tomorrow'
  if (shift === -1) return 'Yesterday'
  if (shift > 1) return `+${shift} days`
  if (shift < -1) return `${shift} days`
  return 'Today'
}

function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`
}

function stopwatch(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000)
  return `${pad2(total / 60)}:${pad2(total % 60)}.${pad2((ms % 1000) / 10)}`
}

// ---------------------------------------------------------------------------

function WorldClock({ now }: { now: Date }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {CITIES.map((city) => {
        const shift = dayShift(city.zone, now)
        return (
          <div key={city.city} className="card flex items-center justify-between gap-3" data-clock-city={city.city}>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{city.city}</div>
              <div className="text-[11px] text-faint">
                {dateIn(city.zone, now)} · {shiftLabel(shift)}
              </div>
            </div>
            <div className="mono shrink-0 text-[20px] font-light tabular-nums" data-clock-time={city.city}>
              {timeIn(city.zone, now)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Alarms({ now }: { now: Date }) {
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [time, setTime] = useState(() => `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`)
  const [label, setLabel] = useState('')
  const fired = useRef<Set<string>>(new Set())

  useEffect(() => {
    void bridge.config
      .get<Alarm[] | null>(ALARM_KEY, null)
      .then((stored) => {
        if (Array.isArray(stored)) setAlarms(stored.filter((a) => a && typeof a.time === 'string'))
      })
      .catch(() => undefined)
  }, [])

  const save = (next: Alarm[]) => {
    setAlarms(next)
    void bridge.config.set(ALARM_KEY, next).catch(() => undefined)
  }

  const ring = (alarm: Alarm) => {
    notify({
      title: `${alarm.time} · Alarm`,
      body: alarm.label || 'Time is up',
      kind: 'warn',
      icon: AlarmClock,
      appId: 'clock',
      actions: [
        {
          id: 'snooze',
          label: 'Snooze 5 min',
          run: () => {
            const later = new Date(Date.now() + 5 * 60_000)
            save(alarms.map((a) => (a.id === alarm.id ? { ...a, time: `${pad2(later.getHours())}:${pad2(later.getMinutes())}` } : a)))
          },
        },
        { id: 'dismiss', label: 'Dismiss', run: () => save(alarms.map((a) => (a.id === alarm.id ? { ...a, enabled: false } : a))) },
      ],
    })
    bus.emit(EVT.TOAST, { text: 'Alarm ringing', kind: 'warn' })
  }

  const stamp = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  useEffect(() => {
    for (const alarm of alarms) {
      if (!alarm.enabled || alarm.time !== stamp) continue
      const key = `${alarm.id}@${stamp}`
      if (fired.current.has(key)) continue
      fired.current.add(key)
      ring(alarm)
    }
    // `ring` intentionally closes over the current list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, alarms])

  const sorted = [...alarms].sort((a, b) => a.time.localeCompare(b.time))

  return (
    <div className="mx-auto max-w-[560px]">
      <div className="card flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-faint">
          Time
          <input
            type="time"
            className="field !w-[112px] text-[13px]"
            value={time}
            data-clock-alarm-time
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-[11px] text-faint">
          Label
          <input
            className="field text-[12.5px]"
            placeholder="Wake up"
            value={label}
            data-clock-alarm-label
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn"
          data-variant="accent"
          data-clock-alarm-add
          onClick={() => {
            if (!time) return
            save([...alarms, makeAlarm(time, label.trim())])
            setLabel('')
          }}
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {sorted.map((alarm) => (
          <div key={alarm.id} className="card flex items-center gap-3" data-clock-alarm={alarm.id}>
            <AlarmClock size={16} className={alarm.enabled ? 'text-accent' : 'text-faint'} />
            <div className="min-w-0 flex-1">
              <div className="mono text-[17px] tabular-nums">{alarm.time}</div>
              <div className="truncate text-[11.5px] text-muted">{alarm.label || 'Alarm'}</div>
            </div>
            <button
              type="button"
              className="btn !h-[26px] text-[11.5px]"
              data-variant={alarm.enabled ? 'accent' : 'ghost'}
              onClick={() => save(alarms.map((a) => (a.id === alarm.id ? { ...a, enabled: !a.enabled } : a)))}
            >
              {alarm.enabled ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Delete alarm"
              aria-label="Delete alarm"
              onClick={() => save(alarms.filter((a) => a.id !== alarm.id))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!sorted.length ? <p className="py-6 text-center text-[12px] text-faint">No alarms yet</p> : null}
      </div>
    </div>
  )
}

function Timer() {
  const [total, setTotal] = useState(5 * 60_000)
  const [left, setLeft] = useState(5 * 60_000)
  const [running, setRunning] = useState(false)
  const endRef = useRef(0)

  useEffect(() => {
    if (!running) return
    endRef.current = Date.now() + left
    const id = window.setInterval(() => {
      const remain = endRef.current - Date.now()
      if (remain <= 0) {
        window.clearInterval(id)
        setLeft(0)
        setRunning(false)
        const minutes = Math.max(1, Math.round(total / 60_000))
        notify({
          title: 'Timer finished',
          body: `${minutes} minute timer is up`,
          kind: 'success',
          icon: BellRing,
          appId: 'clock',
        })
        bus.emit(EVT.TOAST, { text: 'Timer finished', kind: 'success' })
      } else {
        setLeft(remain)
      }
    }, 150)
    return () => window.clearInterval(id)
    // `left` is read once when the countdown starts, which is what we want
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const apply = (minutes: number, seconds = 0) => {
    const ms = Math.max(0, minutes * 60_000 + seconds * 1000)
    setRunning(false)
    setTotal(ms || 60_000)
    setLeft(ms || 60_000)
  }

  const pct = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0
  const circumference = 2 * Math.PI * 54

  return (
    <div className="mx-auto flex max-w-[420px] flex-col items-center gap-4">
      <div className="relative grid place-items-center">
        <svg viewBox="0 0 120 120" className="h-[190px] w-[190px] -rotate-90">
          <circle cx="60" cy="60" r="54" fill="none" stroke="var(--line)" strokeWidth="7" />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={(1 - pct) * circumference}
            style={{ transition: 'stroke-dashoffset 160ms linear' }}
          />
        </svg>
        <div className="mono absolute text-[30px] font-light tabular-nums" data-clock-timer>
          {Math.floor(left / 3_600_000) > 0 ? `${Math.floor(left / 3_600_000)}:` : ''}
          {pad2(left / 60_000)}:{pad2((left % 60_000) / 1000)}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {TIMER_PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className="btn !h-[26px] text-[11.5px]"
            data-clock-preset={minutes}
            onClick={() => apply(minutes)}
          >
            {minutes} min
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button type="button" className="btn" data-variant="accent" data-clock-timer-toggle onClick={() => setRunning((r) => !r)}>
          {running ? <Pause size={14} /> : <Play size={14} />}
          {running ? 'Pause' : 'Start'}
        </button>
        <button
          type="button"
          className="btn"
          data-clock-timer-reset
          onClick={() => {
            setRunning(false)
            setLeft(total)
          }}
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>
    </div>
  )
}

function Stopwatch() {
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [laps, setLaps] = useState<number[]>([])
  const baseRef = useRef(0)
  const startRef = useRef(0)

  useEffect(() => {
    if (!running) return
    startRef.current = Date.now()
    const id = window.setInterval(() => {
      setElapsed(baseRef.current + (Date.now() - startRef.current))
    }, 47)
    return () => window.clearInterval(id)
  }, [running])

  const pause = () => {
    baseRef.current += Date.now() - startRef.current
    setElapsed(baseRef.current)
    setRunning(false)
  }

  const reset = () => {
    baseRef.current = 0
    setElapsed(0)
    setLaps([])
    setRunning(false)
  }

  return (
    <div className="mx-auto flex max-w-[420px] flex-col items-center gap-4">
      <div className="mono text-[46px] font-light tabular-nums" data-clock-watch>
        {stopwatch(elapsed)}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn"
          data-variant="accent"
          data-clock-watch-toggle
          onClick={() => (running ? pause() : setRunning(true))}
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
          {running ? 'Stop' : 'Start'}
        </button>
        <button type="button" className="btn" disabled={running} data-clock-watch-lap onClick={() => setLaps((prev) => [elapsed, ...prev])}>
          <Flag size={14} />
          Lap
        </button>
        <button type="button" className="btn" data-clock-watch-reset onClick={reset}>
          <RotateCcw size={14} />
          Reset
        </button>
      </div>

      <div className="w-full">
        {laps.map((lap, i) => {
          const previous = laps[i + 1] ?? 0
          return (
            <div key={`${lap}-${i}`} className="list-row text-[12px]">
              <span className="w-[54px] text-faint">Lap {laps.length - i}</span>
              <span className="mono flex-1 text-right tabular-nums">{stopwatch(lap - previous)}</span>
              <span className="mono w-[86px] text-right tabular-nums text-muted">{stopwatch(lap)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Clock — World Clock (real IANA zones), Alarms (persisted through the config
 * bridge, with snooze actions in the notification centre), Timer and Stopwatch.
 */
export function ClockApp({ windowId, args }: AppProps) {
  const [tab, setTab] = useState<Tab>(
    args.tab === 'alarms' || args.tab === 'timer' || args.tab === 'stopwatch' ? args.tab : 'world',
  )
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    return bus.on<AppArgsEvent>(EVT.APP_ARGS, (event) => {
      if (event.windowId !== windowId) return
      const next = event.args.tab
      if (next === 'world' || next === 'alarms' || next === 'timer' || next === 'stopwatch') setTab(next)
    })
  }, [windowId])

  return (
    <div className="flex h-full w-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b px-3 pt-2" style={{ borderColor: 'var(--line)' }}>
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              className="tab text-[12px]"
              data-active={tab === t.id ? 'true' : 'false'}
              data-clock-tab={t.id}
              onClick={() => setTab(t.id)}
            >
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'world' ? <WorldClock now={now} /> : null}
        {tab === 'alarms' ? <Alarms now={now} /> : null}
        {tab === 'timer' ? <Timer /> : null}
        {tab === 'stopwatch' ? <Stopwatch /> : null}
      </div>
    </div>
  )
}

export default ClockApp

