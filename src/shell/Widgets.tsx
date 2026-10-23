import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CloudSun, Cpu, MemoryStick, Music2, Pause, Play, SkipForward, StickyNote } from 'lucide-react'
import { ui } from '../core/uiStore'
import { useStore, useTheme, useMedia } from '../core/hooks'
import { bridge } from '../core/ipc/bridge'
import { media, AURAOS_RADIO } from '../core/media'
import type { MetricSample } from '../../shared/bridge'

function useMetrics(): MetricSample | null {
  const [sample, setSample] = useState<MetricSample | null>(null)
  useEffect(() => {
    let cancelled = false
    void bridge.system
      .metrics()
      .then((s) => {
        if (!cancelled) setSample(s)
      })
      .catch(() => undefined)
    const off = bridge.system.onMetrics((s) => setSample(s))
    return () => {
      cancelled = true
      off()
    }
  }, [])
  return sample
}

function MiniCalendar() {
  const [now] = useState(() => new Date())
  const year = now.getFullYear()
  const month = now.getMonth()
  const first = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ]
  return (
    <div className="card">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold">
          {now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <span className="text-[11px] text-faint">Today {now.getDate()}</span>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[10.5px] text-faint">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-1 text-center text-[11.5px]">
        {cells.map((day, i) => (
          <span
            key={i}
            className="mx-auto grid h-[20px] w-[20px] place-items-center rounded-full"
            style={
              day === now.getDate()
                ? { background: 'var(--accent)', color: '#fff' }
                : day
                  ? { color: 'var(--text)' }
                  : { opacity: 0 }
            }
          >
            {day ?? '·'}
          </span>
        ))}
      </div>
    </div>
  )
}

function Gauge({ label, icon: Icon, pct, detail }: { label: string; icon: typeof Cpu; pct: number; detail: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px]"
        style={{ background: 'rgb(var(--accent-rgb) / 0.16)', color: 'var(--accent)' }}
      >
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between">
          <span className="text-[11.5px] text-muted">{label}</span>
          <span className="text-[11.5px] font-medium tabular-nums">{detail}</span>
        </span>
        <span className="mt-1 block h-[5px] w-full overflow-hidden rounded-full" style={{ background: 'var(--line-strong)' }}>
          <span
            className="block h-full rounded-full transition-[width] duration-500"
            style={{ width: `${Math.min(100, pct)}%`, background: 'var(--accent)' }}
          />
        </span>
      </span>
    </div>
  )
}

/** Small Now Playing widget backed by the shared media engine. */
function NowPlaying() {
  const np = useMedia()
  const play = () => {
    if (!np.current) media.setQueue([AURAOS_RADIO], 0)
    void media.play()
  }
  return (
    <div className="card" data-nowplaying={np.playing ? 'playing' : 'paused'}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12.5px] font-medium">Now Playing</span>
        {np.current?.generated ? <span className="text-[10px] text-faint">generated</span> : null}
      </div>
      <div className="flex items-center gap-3">
        <span
          className="grid h-[36px] w-[36px] shrink-0 place-items-center rounded-[10px] text-white"
          style={{ backgroundImage: 'linear-gradient(145deg, var(--accent), #a06bff)' }}
        >
          <Music2 size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px]">{np.current?.title ?? 'Nothing playing'}</span>
          <span className="block truncate text-[11px] text-faint">{np.current?.artist ?? 'AuraOS Radio'}</span>
        </span>
        <button
          type="button"
          className="icon-btn !h-[30px] !w-[30px]"
          style={{ background: 'var(--active)' }}
          aria-label={np.playing ? 'Pause' : 'Play'}
          onClick={() => (np.playing ? media.pause() : play())}
        >
          {np.playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button type="button" className="icon-btn !h-[30px] !w-[30px]" aria-label="Next" onClick={() => media.next()}>
          <SkipForward size={15} />
        </button>
      </div>
    </div>
  )
}

/**
 * Widgets slide-out (right edge) - clock, weather, now playing, live system
 * gauges, mini calendar and a sticky note. Opened from the tray clock or the
 * Win11 weather pill.
 */
export function Widgets() {
  const uiState = useStore(ui)
  const open = uiState.widgets
  const themeState = useTheme()
  const sample = useMetrics()
  const [now, setNow] = useState(() => new Date())
  const [note, setNote] = useState('')
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!open) return
    void bridge.config
      .get<string>('widgets.note', '')
      .then((v) => setNote(v))
      .catch(() => undefined)
  }, [open])

  const onNote = (value: string) => {
    setNote(value)
    if (noteTimer.current) clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(() => void bridge.config.set('widgets.note', value), 400)
  }

  const bottom = themeState.shellMode === 'taskbar' ? 56 : 92

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="absolute inset-0 z-[19998]"
            style={{ background: 'transparent' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onPointerDown={() => ui.close('widgets')}
          />
          <motion.aside
            className="glass absolute z-[20001] flex w-[336px] flex-col gap-2.5 overflow-y-auto rounded-[20px] p-3"
            style={{ top: 34, right: 8, bottom }}
            initial={{ opacity: 0, x: 60, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 440, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
            onPointerDownCapture={(e) => e.stopPropagation()}
            data-overlay="widgets"
          >
            {/* clock */}
            <div
              className="card relative overflow-hidden"
              style={{ backgroundImage: 'linear-gradient(140deg, rgb(var(--accent-rgb) / .35), transparent 70%)' }}
            >
              <div className="text-[34px] font-light leading-none tabular-nums">
                {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
              </div>
              <div className="mt-1.5 text-[12px] text-muted">
                {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
            </div>

            {/* weather */}
            <div className="card flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CloudSun size={30} style={{ color: 'var(--accent)' }} />
                <div>
                  <div className="text-[22px] font-light leading-none">21°C</div>
                  <div className="text-[11.5px] text-faint">Partly sunny · H 24° L 14°</div>
                </div>
              </div>
              <div className="text-right text-[11px] text-muted">
                <div>Copenhagen</div>
                <div className="text-faint">Wind 12 km/h</div>
                <span
                  className="mt-1 inline-block rounded-full px-1.5 py-[1px] text-[9px] uppercase tracking-wide"
                  style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}
                  title="Static sample data — no live weather provider configured"
                >
                  demo
                </span>
              </div>
            </div>

            <NowPlaying />

            {/* live system gauges */}
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-medium">System</span>
                <span className="text-[10.5px] text-faint">live</span>
              </div>
              <Gauge
                label="CPU"
                icon={Cpu}
                pct={sample?.cpu ?? 0}
                detail={`${Math.round(sample?.cpu ?? 0)}%`}
              />
              <Gauge
                label="Memory"
                icon={MemoryStick}
                pct={sample ? (sample.memUsed / sample.memTotal) * 100 : 0}
                detail={sample ? `${(sample.memUsed / 1e9).toFixed(1)} / ${(sample.memTotal / 1e9).toFixed(0)} GB` : '—'}
              />
            </div>

            <MiniCalendar />

            {/* sticky note */}
            <div className="card">
              <div className="mb-1.5 flex items-center gap-2 text-[12.5px] font-medium">
                <StickyNote size={14} className="text-muted" />
                Quick note
              </div>
              <textarea
                className="field h-[76px] resize-none !py-1.5 text-[12px]"
                placeholder="Jot something down…"
                value={note}
                onChange={(e) => onNote(e.target.value)}
              />
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
