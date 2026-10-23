import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  AppWindow,
  ArrowDown,
  ArrowUp,
  Cpu,
  MemoryStick,
  Minus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import type { AppProps } from '../../core/apps/types'
import type { MetricSample, ProcEntry } from '../../../shared/bridge'
import { bridge } from '../../core/ipc/bridge'
import { bus, EVT } from '../../core/bus'
import { useWindowManager } from '../../core/wm/useWindowManager'
import { wm } from '../../core/wm/WindowManager'
import { getApp } from '../../core/apps/registry'
import { AppIconTile, EmptyState, Spinner } from '../../ui/controls'

type TabId = 'processes' | 'performance' | 'windows'
type SortKey = 'name' | 'pid' | 'cpu' | 'mem'

const HISTORY = 80

function bytes(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toFixed(1)} MB`
}

function bytesFromBytes(n: number): string {
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function clockFromSeconds(total: number): string {
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`
}

/** Simple SVG area chart normalised to 0..100. */
function Sparkline({ data, max = 100, color }: { data: number[]; max?: number; color: string }) {
  const w = 100
  const h = 32
  if (data.length < 2) {
    return <div className="flex h-[86px] items-center justify-center text-[11px] text-faint">Collecting samples…</div>
  }
  const step = w / (HISTORY - 1)
  const offset = HISTORY - data.length
  const pts = data.map((v, i) => {
    const x = (i + offset) * step
    const y = h - Math.min(1, Math.max(0, v / max)) * h
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const line = pts.join(' ')
  const area = `${(offset * step).toFixed(2)},${h} ${line} ${w},${h}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-[86px] w-full">
      <defs>
        <linearGradient id={`grad-${color.replace(/[^a-z]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.42" />
          <stop offset="1" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#grad-${color.replace(/[^a-z]/gi, '')})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[12px] p-3" style={{ background: 'var(--hover)' }}>
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-1 text-[20px] font-semibold leading-none">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-faint">{sub}</div> : null}
    </div>
  )
}

/**
 * Task Manager / Activity Monitor.
 * Reads live telemetry from the main process (or the mock bridge in web mode)
 * and lets you inspect processes, kill them, and manage open windows.
 */
export function TaskManagerApp({ windowId }: AppProps) {
  const wmState = useWindowManager()
  const [tab, setTab] = useState<TabId>('processes')
  const [procs, setProcs] = useState<ProcEntry[]>([])
  const [procLoading, setProcLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('cpu')
  const [sortAsc, setSortAsc] = useState(false)
  const [sample, setSample] = useState<MetricSample | null>(null)
  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [memHistory, setMemHistory] = useState<number[]>([])
  const [killing, setKilling] = useState<number | null>(null)
  const procTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadProcesses = useCallback(async () => {
    try {
      const list = await bridge.system.processes()
      setProcs(list)
    } catch {
      /* ignore transient failures */
    } finally {
      setProcLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProcesses()
    procTimer.current = setInterval(() => void loadProcesses(), 3000)
    return () => {
      if (procTimer.current) clearInterval(procTimer.current)
    }
  }, [loadProcesses])

  useEffect(() => {
    const off = bridge.system.onMetrics((s) => {
      setSample(s)
      setCpuHistory((prev) => [...prev, s.cpu].slice(-HISTORY))
      setMemHistory((prev) => [...prev, (s.memUsed / s.memTotal) * 100].slice(-HISTORY))
    })
    return off
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? procs.filter((p) => p.name.toLowerCase().includes(q) || String(p.pid).includes(q)) : procs.slice()
    const dir = sortAsc ? 1 : -1
    list.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dir
        case 'pid':
          return (a.pid - b.pid) * dir
        case 'mem':
          return (a.mem - b.mem) * dir
        default:
          return (a.cpu - b.cpu) * dir
      }
    })
    return list
  }, [procs, query, sortKey, sortAsc])

  const totals = useMemo(() => {
    const cpu = procs.reduce((acc, p) => acc + p.cpu, 0)
    const mem = procs.reduce((acc, p) => acc + p.mem, 0)
    return { cpu, mem, count: procs.length }
  }, [procs])

  const requestSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((v) => !v)
    else {
      setSortKey(key)
      setSortAsc(key === 'name')
    }
  }

  const kill = async (proc: ProcEntry) => {
    if (proc.pid <= 4) {
      bus.emit(EVT.TOAST, { text: `Refusing to end protected process ${proc.pid}`, kind: 'warn' })
      return
    }
    if (!window.confirm(`End task "${proc.name}" (PID ${proc.pid})?`)) return
    setKilling(proc.pid)
    try {
      const result = await bridge.system.kill(proc.pid)
      if (result.ok) {
        bus.emit(EVT.TOAST, { text: `Ended ${proc.name}`, kind: 'success' })
        await loadProcesses()
      } else {
        bus.emit(EVT.TOAST, { text: result.error ?? 'Could not end process', kind: 'error' })
      }
    } finally {
      setKilling(null)
    }
  }

  const memoryPct = sample ? (sample.memUsed / sample.memTotal) * 100 : 0

  const tabs: Array<{ id: TabId; label: string; icon: typeof Activity }> = [
    { id: 'processes', label: 'Processes', icon: Activity },
    { id: 'performance', label: 'Performance', icon: Cpu },
    { id: 'windows', label: 'Windows', icon: AppWindow },
  ]

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortAsc ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : null

  return (
    <div className="flex h-full w-full min-h-0 flex-col">
      <div className="tab-strip" style={{ borderBottom: '1px solid var(--line)' }}>
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.id} type="button" className="tab" data-active={tab === t.id ? 'true' : 'false'} onClick={() => setTab(t.id)}>
              <Icon size={13} />
              <span>{t.label}</span>
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-2 pr-1">
          {tab === 'processes' ? (
            <>
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  className="field !h-[26px] w-[180px] !pl-7 text-[12px]"
                  placeholder="Filter processes"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <button type="button" className="icon-btn !h-[26px] !w-[26px]" title="Refresh now" onClick={() => void loadProcesses()}>
                <RefreshCw size={13} />
              </button>
            </>
          ) : null}
          {tab === 'performance' ? (
            <span className="mono text-[11px] text-faint">
              {sample ? `${clockFromSeconds(sample.uptime)} uptime` : 'waiting for telemetry…'}
            </span>
          ) : null}
        </div>
      </div>

      {tab === 'processes' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-4 px-4 py-2 text-[11.5px] text-muted" style={{ borderBottom: '1px solid var(--line)' }}>
            <span>
              <span className="text-faint">Processes </span>
              {totals.count}
            </span>
            <span>
              <span className="text-faint">CPU </span>
              {totals.cpu.toFixed(1)}%
            </span>
            <span>
              <span className="text-faint">Memory </span>
              {bytes(totals.mem)}
            </span>
          </div>

          <div className="grid shrink-0 items-center gap-2 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-faint" style={{ gridTemplateColumns: '1.9fr 0.7fr 0.6fr 0.8fr 70px', borderBottom: '1px solid var(--line)' }}>
            <button type="button" className="flex items-center gap-1 text-left hover:text-[var(--text)]" onClick={() => requestSort('name')}>
              Name {sortIndicator('name')}
            </button>
            <button type="button" className="flex items-center justify-end gap-1 hover:text-[var(--text)]" onClick={() => requestSort('pid')}>
              PID {sortIndicator('pid')}
            </button>
            <button type="button" className="flex items-center justify-end gap-1 hover:text-[var(--text)]" onClick={() => requestSort('cpu')}>
              CPU {sortIndicator('cpu')}
            </button>
            <button type="button" className="flex items-center justify-end gap-1 hover:text-[var(--text)]" onClick={() => requestSort('mem')}>
              Memory {sortIndicator('mem')}
            </button>
            <span />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {procLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-[12px] text-muted">
                <Spinner size={14} /> Reading the process table…
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState icon={Activity} title="No matching processes" hint={query ? `Nothing matches "${query}"` : undefined} />
            ) : (
              filtered.map((p) => (
                <div
                  key={p.pid}
                  className="group grid items-center gap-2 px-4 py-[6px] text-[12.5px]"
                  style={{ gridTemplateColumns: '1.9fr 0.7fr 0.6fr 0.8fr 70px', borderBottom: '1px solid var(--line)' }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: p.cpu > 20 ? 'var(--danger)' : p.cpu > 5 ? 'var(--warning, #f5c542)' : 'var(--success)' }} />
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="mono text-right text-[11.5px] text-muted">{p.pid}</span>
                  <span className="mono text-right text-[11.5px]">{p.cpu.toFixed(1)}%</span>
                  <span className="mono text-right text-[11.5px] text-muted">{bytes(p.mem)}</span>
                  <span className="flex justify-end">
                    <button
                      type="button"
                      className="btn !h-[22px] !px-2 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ color: 'var(--danger)' }}
                      disabled={killing === p.pid}
                      onClick={() => void kill(p)}
                    >
                      {killing === p.pid ? <Spinner size={11} /> : <Trash2 size={11} />}
                      End
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {tab === 'performance' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="CPU" value={sample ? `${sample.cpu.toFixed(0)}%` : '—'} sub={`${sample?.cores.length ?? 0} logical cores`} />
            <StatCard label="Memory" value={sample ? `${memoryPct.toFixed(0)}%` : '—'} sub={sample ? `${bytesFromBytes(sample.memUsed)} / ${bytesFromBytes(sample.memTotal)}` : undefined} />
            <StatCard label="Processes" value={String(totals.count)} sub={`${bytes(totals.mem)} total`} />
            <StatCard label="Uptime" value={sample ? clockFromSeconds(sample.uptime) : '—'} sub={bridge.mode === 'native' ? 'host session' : 'simulated'} />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="card">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[12.5px]"><Cpu size={14} className="text-muted" /> CPU utilization</span>
                <span className="mono text-[12px]" style={{ color: 'var(--accent)' }}>{sample ? `${sample.cpu.toFixed(1)}%` : '—'}</span>
              </div>
              <Sparkline data={cpuHistory} color="var(--accent)" />
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                {(sample?.cores ?? []).map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-[26px] shrink-0 text-[10.5px] text-faint">#{i}</span>
                    <span className="h-[5px] flex-1 overflow-hidden rounded-full" style={{ background: 'var(--line-strong)' }}>
                      <span className="block h-full rounded-full" style={{ width: `${c}%`, background: 'var(--accent)' }} />
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[12.5px]"><MemoryStick size={14} className="text-muted" /> Memory pressure</span>
                <span className="mono text-[12px]" style={{ color: 'var(--accent)' }}>{memoryPct.toFixed(1)}%</span>
              </div>
              <Sparkline data={memHistory} color="#a06bff" />
              <div className="mt-3 space-y-1 text-[11.5px] text-muted">
                <div className="flex justify-between"><span className="text-faint">In use</span><span className="mono">{sample ? bytesFromBytes(sample.memUsed) : '—'}</span></div>
                <div className="flex justify-between"><span className="text-faint">Available</span><span className="mono">{sample ? bytesFromBytes(sample.memTotal - sample.memUsed) : '—'}</span></div>
                <div className="flex justify-between"><span className="text-faint">Total</span><span className="mono">{sample ? bytesFromBytes(sample.memTotal) : '—'}</span></div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'windows' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {wmState.windows.length === 0 ? (
            <EmptyState icon={AppWindow} title="No open windows" hint="Launch an app from the Dock or Spotlight." />
          ) : (
            <div className="card !p-0">
              {[...wmState.windows]
                .sort((a, b) => b.zIndex - a.zIndex)
                .map((win) => {
                  const def = getApp(win.appId)
                  const focused = wmState.focusedId === win.id
                  return (
                    <div
                      key={win.id}
                      className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0"
                      style={{ borderColor: 'var(--line)', background: focused ? 'rgb(var(--accent-rgb) / 0.08)' : 'transparent' }}
                    >
                      {def ? <AppIconTile icon={def.icon} tint={def.tint} size={30} radius={8} /> : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px]">{win.title}</span>
                        <span className="block truncate text-[11px] text-faint">
                          {def?.name ?? win.appId} · {win.state}
                          {win.state !== 'normal' ? '' : ` · ${win.rect.w}×${win.rect.h}`}
                          {focused ? ' · focused' : ''}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <button type="button" className="icon-btn !h-[26px] !w-[26px]" title="Focus" onClick={() => wm.focus(win.id)}>
                          <Square size={13} />
                        </button>
                        <button type="button" className="icon-btn !h-[26px] !w-[26px]" title="Minimize" onClick={() => wm.minimize(win.id)}>
                          <Minus size={13} />
                        </button>
                        <button type="button" className="icon-btn !h-[26px] !w-[26px]" title="Close" onClick={() => wm.close(win.id)}>
                          <X size={13} />
                        </button>
                      </span>
                    </div>
                  )
                })}
            </div>
          )}
          <p className="mt-3 text-[11px] text-faint">
            Window {windowId} · {wmState.windows.length} open · drag a title bar to the screen edge to snap.
          </p>
        </div>
      ) : null}

      <motion.div
        className="flex items-center justify-between px-4 py-1 text-[10.5px] text-faint"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        <span>{bridge.mode === 'native' ? 'Native host · live telemetry' : 'Web preview · simulated telemetry'}</span>
        <span>{tab === 'processes' ? `Auto-refresh 3s · ${filtered.length}/${procs.length} shown` : tab === 'performance' ? 'Sampling every 1.5s' : `${wmState.windows.length} windows`}</span>
      </motion.div>
    </div>
  )
}

export default TaskManagerApp
