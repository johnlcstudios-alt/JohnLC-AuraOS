import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bluetooth,
  BluetoothOff,
  Check,
  ChevronDown,
  Moon,
  MoonStar,
  Music2,
  Pause,
  Play,
  Radar,
  SkipBack,
  SkipForward,
  Sun,
  SunDim,
  Volume1,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useSystem, useTheme, useStore, useMedia } from '../core/hooks'
import { system } from '../core/system/systemStore'
import { media, AURAOS_RADIO } from '../core/media'
import { theme } from '../core/theme/ThemeEngine'
import { ui } from '../core/uiStore'
import { ACCENTS } from '../core/theme/accents'
import { Slider, Segmented } from '../ui/controls'
import type { ThemeMode } from '../core/theme/ThemeEngine'

function Tile({
  icon: Icon,
  label,
  sub,
  on,
  onClick,
  onDetail,
}: {
  icon: typeof Wifi
  label: string
  sub: string
  on: boolean
  onClick: () => void
  onDetail?: () => void
}) {
  return (
    <div
      className="relative flex flex-col items-start gap-2 rounded-[14px] border p-2.5"
      style={{
        background: on ? 'rgb(var(--accent-rgb) / 0.16)' : 'var(--hover)',
        borderColor: on ? 'rgb(var(--accent-rgb) / 0.5)' : 'var(--line)',
      }}
    >
      <button
        type="button"
        className="absolute inset-0 rounded-[14px] transition-transform duration-150 active:scale-[0.98]"
        aria-label={label}
        onClick={onClick}
      />
      <span
        className="pointer-events-none grid h-[30px] w-[30px] place-items-center rounded-full transition-colors"
        style={{
          background: on ? 'var(--accent)' : 'var(--line-strong)',
          color: on ? '#fff' : 'var(--text-muted)',
        }}
      >
        <Icon size={15} />
      </span>
      <span className="pointer-events-none min-w-0">
        <span className="block truncate text-[11.5px] font-medium leading-tight">{label}</span>
        <span className="block truncate text-[10px] leading-tight text-faint">{sub}</span>
      </span>
      {onDetail ? (
        <button
          type="button"
          className="absolute right-1.5 top-1.5 grid h-[20px] w-[20px] place-items-center rounded-full text-muted transition-colors hover:bg-[var(--active)]"
          aria-label={`${label} options`}
          onClick={onDetail}
        >
          <ChevronDown size={13} />
        </button>
      ) : null}
    </div>
  )
}

function VolumeIcon({ volume, muted }: { volume: number; muted: boolean }) {
  if (muted || volume === 0) return <VolumeX size={15} />
  if (volume < 0.4) return <Volume1 size={15} />
  return <Volume2 size={15} />
}

/** Static, clearly-labelled placeholder lists (there is no real radio in a browser). */
const NETWORKS = [
  { name: 'AuraOS-5G', signal: 3 },
  { name: 'AuraOS-2.4G', signal: 2 },
  { name: 'HomeNet', signal: 3 },
  { name: 'Cafe-Guest', signal: 1 },
]
const DEVICES = ['AirPods Pro', 'MX Master 3', 'Magic Keyboard']

function mmss(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return '0:00'
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Unified quick-settings flyout.
 * macOS mode: anchored under the top bar (Control Center).
 * Taskbar mode: anchored above the taskbar (Windows 11 Quick Settings).
 */
export function ControlCenter() {
  const uiState = useStore(ui)
  const open = uiState['control-center']
  const systemState = useSystem()
  const themeState = useTheme()
  const nowPlaying = useMedia()
  const [detail, setDetail] = useState<'wifi' | 'bluetooth' | null>(null)
  const [connected, setConnected] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  // keep the media engine's own volume in step with the shell volume control
  useEffect(() => {
    media.setVolume(systemState.volume)
  }, [systemState.volume])
  useEffect(() => {
    media.setMuted(systemState.muted)
  }, [systemState.muted])

  useEffect(() => {
    if (!open) setDetail(null)
  }, [open])

  const anchor =
    themeState.shellMode === 'taskbar' ? { right: 10, bottom: 58 } : { right: 8, top: 34 }

  const togglePlay = () => {
    if (!nowPlaying.current) {
      media.setQueue([AURAOS_RADIO], 0)
      void media.play()
      return
    }
    media.toggle()
  }

  const seekFromEvent = (clientX: number) => {
    const el = barRef.current
    if (!el || !nowPlaying.duration) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    media.seek(ratio * nowPlaying.duration)
  }

  const progress = nowPlaying.duration ? nowPlaying.position / nowPlaying.duration : 0

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
            onPointerDown={() => ui.close('control-center')}
          />
          <motion.div
            className="glass-strong absolute z-[20001] w-[330px] rounded-[20px] p-3"
            style={anchor}
            initial={{ opacity: 0, y: themeState.shellMode === 'taskbar' ? 14 : -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: themeState.shellMode === 'taskbar' ? 10 : -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            data-overlay="control-center"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-medium text-muted">Control Center</span>
              <span className="text-[10.5px] text-faint">{systemState.activeNetwork ?? 'Offline'}</span>
            </div>

            <div className="mb-2.5 grid grid-cols-3 gap-2">
              <Tile
                icon={systemState.wifi ? Wifi : WifiOff}
                label="Wi-Fi"
                sub={systemState.wifi ? systemState.activeNetwork ?? 'On' : 'Off'}
                on={systemState.wifi}
                onClick={() => system.toggle('wifi')}
                onDetail={() => setDetail((d) => (d === 'wifi' ? null : 'wifi'))}
              />
              <Tile
                icon={systemState.bluetooth ? Bluetooth : BluetoothOff}
                label="Bluetooth"
                sub={systemState.bluetooth ? connected ?? 'On' : 'Off'}
                on={systemState.bluetooth}
                onClick={() => system.toggle('bluetooth')}
                onDetail={() => setDetail((d) => (d === 'bluetooth' ? null : 'bluetooth'))}
              />
              <Tile
                icon={Radar}
                label="AirDrop"
                sub={systemState.nearbyShare ? 'Everyone' : 'Off'}
                on={systemState.nearbyShare}
                onClick={() => system.toggle('nearbyShare')}
              />
              <Tile
                icon={systemState.focus ? MoonStar : Moon}
                label="Focus"
                sub={systemState.focus ? 'On' : 'Off'}
                on={systemState.focus}
                onClick={() => system.toggle('focus')}
              />
              <Tile
                icon={SunDim}
                label="Night Light"
                sub={systemState.nightLight ? 'On' : 'Off'}
                on={systemState.nightLight}
                onClick={() => system.toggle('nightLight')}
              />
              <Tile
                icon={themeState.resolved === 'dark' ? Moon : Sun}
                label={themeState.resolved === 'dark' ? 'Dark Mode' : 'Light Mode'}
                sub={themeState.mode === 'auto' ? 'Auto' : 'Manual'}
                on={themeState.resolved === 'dark'}
                onClick={() => theme.toggleDark()}
              />
            </div>

            <AnimatePresence initial={false}>
              {detail ? (
                <motion.div
                  key={detail}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="mb-2.5 overflow-hidden"
                >
                  <div className="rounded-[14px] border p-2" style={{ background: 'var(--hover)', borderColor: 'var(--line)' }}>
                    <div className="mb-1 flex items-center justify-between px-1">
                      <span className="side-title !mb-0 !pt-0">{detail === 'wifi' ? 'Networks' : 'Devices'}</span>
                      <span className="text-[10px] text-faint">simulated</span>
                    </div>
                    {detail === 'wifi' ? (
                      NETWORKS.map((net) => {
                        const active = systemState.wifi && systemState.activeNetwork === net.name
                        return (
                          <button
                            key={net.name}
                            type="button"
                            className="list-row !h-[34px] w-full"
                            data-selected={active ? 'true' : 'false'}
                            onClick={() => {
                              system.patch({ wifi: true, activeNetwork: net.name })
                            }}
                          >
                            <Wifi size={14} className={active ? 'text-[var(--accent)]' : 'text-muted'} />
                            <span className="flex-1 truncate text-[12.5px]">{net.name}</span>
                            {active ? <Check size={14} className="text-[var(--accent)]" /> : null}
                            <span className="flex items-end gap-[2px]" aria-hidden>
                              {[1, 2, 3].map((level) => (
                                <span
                                  key={level}
                                  className="w-[3px] rounded-sm"
                                  style={{
                                    height: `${3 + level * 3}px`,
                                    background: level <= net.signal ? 'var(--text-muted)' : 'var(--line-strong)',
                                  }}
                                />
                              ))}
                            </span>
                          </button>
                        )
                      })
                    ) : (
                      DEVICES.map((device) => {
                        const isConnected = systemState.bluetooth && connected === device
                        return (
                          <button
                            key={device}
                            type="button"
                            className="list-row !h-[34px] w-full"
                            data-selected={isConnected ? 'true' : 'false'}
                            onClick={() => setConnected((cur) => (cur === device ? null : device))}
                          >
                            <Bluetooth size={14} className={isConnected ? 'text-[var(--accent)]' : 'text-muted'} />
                            <span className="flex-1 truncate text-[12.5px]">{device}</span>
                            {isConnected ? <Check size={14} className="text-[var(--accent)]" /> : null}
                          </button>
                        )
                      })
                    )}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="mb-2 space-y-2.5 rounded-[14px] border p-3" style={{ background: 'var(--hover)', borderColor: 'var(--line)' }}>
              <Slider
                value={systemState.brightness}
                min={0.25}
                max={1}
                step={0.01}
                icon={Sun}
                ariaLabel="Brightness"
                onChange={(v) => system.set('brightness', Math.round(v * 100) / 100)}
              />
              <div className="flex items-center gap-2.5">
                <button type="button" className="icon-btn" aria-label="Mute" onClick={() => system.toggle('muted')}>
                  <VolumeIcon volume={systemState.volume} muted={systemState.muted} />
                </button>
                <Slider
                  value={systemState.muted ? 0 : systemState.volume}
                  ariaLabel="Volume"
                  onChange={(v) => {
                    system.set('volume', Math.round(v * 100) / 100)
                    if (systemState.muted && v > 0) system.set('muted', false)
                  }}
                />
              </div>
            </div>

            <div className="mb-2 rounded-[14px] border p-3" style={{ background: 'var(--hover)', borderColor: 'var(--line)' }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted">Accent colour</span>
                <span className="text-[10.5px] text-faint">{themeState.accent}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((accent) => (
                  <button
                    key={accent.id}
                    type="button"
                    title={accent.name}
                    aria-label={`Accent: ${accent.name}`}
                    className="h-[18px] w-[18px] rounded-full transition-transform hover:scale-110"
                    style={{
                      background: accent.hex,
                      boxShadow:
                        themeState.accent === accent.id
                          ? '0 0 0 2px var(--panel), 0 0 0 3.5px var(--text-muted)'
                          : 'inset 0 1px 0 rgba(255,255,255,.4)',
                    }}
                    onClick={() => theme.set({ accent: accent.id })}
                  />
                ))}
              </div>
            </div>

            {/* Now playing — driven by the real media engine */}
            <div
              className="rounded-[14px] border p-3"
              style={{ background: 'var(--hover)', borderColor: 'var(--line)' }}
              data-nowplaying={nowPlaying.playing ? 'playing' : 'paused'}
            >
              <div className="flex items-center gap-3">
                <span
                  className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-[10px] text-white"
                  style={{
                    backgroundImage: `linear-gradient(145deg, ${
                      nowPlaying.current?.tint ? nowPlaying.current.tint.join(', ') : 'var(--accent), #a06bff'
                    })`,
                  }}
                >
                  <Music2 size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">
                    {nowPlaying.current?.title ?? 'Nothing playing'}
                  </span>
                  <span className="block truncate text-[11px] text-faint">
                    {nowPlaying.current?.artist ?? 'Press play for AuraOS Radio'}
                  </span>
                </span>
              </div>

              <div
                ref={barRef}
                className="mt-2.5 h-[4px] w-full cursor-pointer rounded-full"
                style={{ background: 'var(--line-strong)' }}
                onPointerDown={(e) => seekFromEvent(e.clientX)}
                role="slider"
                aria-label="Seek"
                aria-valuenow={Math.round(progress * 100)}
              >
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.round(progress * 100)}%`, background: 'var(--accent)' }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] tabular-nums text-faint">
                  {mmss(nowPlaying.position)} / {mmss(nowPlaying.duration)}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" className="icon-btn !h-[30px] !w-[30px]" aria-label="Previous" onClick={() => media.prev()}>
                    <SkipBack size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn !h-[32px] !w-[32px]"
                    style={{ background: 'var(--active)' }}
                    aria-label={nowPlaying.playing ? 'Pause' : 'Play'}
                    data-playing={nowPlaying.playing ? 'true' : 'false'}
                    onClick={togglePlay}
                  >
                    {nowPlaying.playing ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <button type="button" className="icon-btn !h-[30px] !w-[30px]" aria-label="Next" onClick={() => media.next()}>
                    <SkipForward size={15} />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-2.5 flex justify-center">
              <Segmented<ThemeMode>
                value={themeState.mode}
                onChange={(mode) => theme.set({ mode })}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'auto', label: 'Auto' },
                ]}
              />
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
