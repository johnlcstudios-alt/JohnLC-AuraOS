import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Film,
  Maximize2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { AppProps } from '../../core/apps/types'
import type { DirEntry } from '../../../shared/bridge'
import { bridge, isNative } from '../../core/ipc/bridge'
import { EmptyState, Slider } from '../../ui/controls'

const ROOT = '~/Videos'
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv'])

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds % 60)
  const m = Math.floor(seconds / 60) % 60
  const h = Math.floor(seconds / 3600)
  const mm = h ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * Videos — a player over `~/Videos`.
 *
 * Local files are streamed through `bridge.fs.readMediaUrl` (a data URL on the
 * native host, `null` in the browser mock), where the app is honest that
 * decoding local media needs the desktop host. The transport, seek bar,
 * volume and fullscreen all drive a real `<video>` element.
 */
export function VideosApp({ args }: AppProps) {
  const [files, setFiles] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<DirEntry | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const urlRef = useRef<string | null>(null)
  urlRef.current = url

  const scan = useCallback(async () => {
    setLoading(true)
    try {
      const entries = await bridge.fs.list(ROOT)
      setFiles(
        entries
          .filter((e) => e.kind === 'file' && VIDEO_EXT.has(e.ext.toLowerCase()))
          .sort((a, b) => b.mtime - a.mtime),
      )
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void scan()
  }, [scan])

  const open = useCallback(async (entry: DirEntry) => {
    setSelected(entry)
    setUrl(null)
    setNotice(null)
    setPlaying(false)
    setPosition(0)
    setDuration(0)
    const resolved = await bridge.fs.readMediaUrl(entry.path).catch(() => null)
    if (!resolved) {
      setNotice(
        isNative
          ? 'This file could not be opened — it may have moved, or the format is not supported.'
          : 'Playing local video needs the native host — the web preview has no file bytes to decode.',
      )
      return
    }
    setUrl(resolved)
  }, [])

  const closePlayer = () => {
    const el = videoRef.current
    if (el) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    setSelected(null)
    setUrl(null)
    setNotice(null)
    setPlaying(false)
    setPosition(0)
    setDuration(0)
  }

  const importFiles = useCallback(async () => {
    const picked = await bridge.dialog
      .openFile({
        title: 'Add videos',
        filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogv'] }],
        multi: false,
      })
      .catch(() => null)
    const path = picked?.[0]
    if (!path) return
    await open({
      name: path.split('/').pop() ?? path,
      path,
      kind: 'file',
      size: 0,
      mtime: Date.now(),
      ext: (path.split('.').pop() ?? '').toLowerCase(),
    })
  }, [open])

  // ---- player wiring ---------------------------------------------------
  useEffect(() => {
    const el = videoRef.current
    if (!el || !url) return
    el.volume = volume
    el.muted = muted
    void el.play().catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.volume = volume
    el.muted = muted
  }, [volume, muted])

  const toggle = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) void el.play().catch(() => undefined)
    else el.pause()
  }, [])

  const nudge = useCallback((delta: number) => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + delta))
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void el.requestFullscreen?.().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePlayer()
      else if (e.key === ' ') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'ArrowRight') nudge(5)
      else if (e.key === 'ArrowLeft') nudge(-5)
      else if (e.key.toLowerCase() === 'm') setMuted((m) => !m)
      else if (e.key.toLowerCase() === 'f') toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, toggle, nudge, toggleFullscreen])

  // ---- intents ---------------------------------------------------------
  useEffect(() => {
    if (args.intent === 'open') {
      void importFiles()
      return
    }
    const target = typeof args.file === 'string' ? args.file : null
    if (target) {
      void open({
        name: target.split('/').pop() ?? target,
        path: target,
        kind: 'file',
        size: 0,
        mtime: Date.now(),
        ext: (target.split('.').pop() ?? '').toLowerCase(),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const progress = duration > 0 ? Math.min(position, duration) : position

  if (selected) {
    return (
      <div
        className="flex h-full min-h-0 flex-col"
        data-videos-app
        data-videos-count={files.length}
        data-videos-player
        data-videos-title={selected.name}
        data-videos-state={playing ? 'playing' : 'paused'}
        data-videos-position={position.toFixed(2)}
        data-videos-duration={duration.toFixed(2)}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--line)' }}>
          <button type="button" className="icon-btn" title="Back to library" aria-label="Back to library" data-videos-action="back" onClick={closePlayer}>
            <ArrowLeft size={15} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{selected.name}</div>
            <div className="truncate text-[11px] text-faint">
              {duration > 0 ? clock(duration) : '—'} {isNative ? '' : '· web preview'}
            </div>
          </div>
          <button type="button" className="icon-btn" title="Fullscreen" aria-label="Fullscreen" data-videos-action="fullscreen" onClick={toggleFullscreen}>
            <Maximize2 size={15} />
          </button>
        </div>

        <div className="relative grid min-h-0 flex-1 place-items-center" style={{ background: '#05070c' }}>
          {notice ? (
            <div className="max-w-[420px] px-6 text-center">
              <Film size={26} className="mx-auto mb-2 text-white/40" />
              <div className="text-[12.5px] leading-relaxed text-white/70" data-videos-notice>
                {notice}
              </div>
            </div>
          ) : url ? (
            <video
              ref={videoRef}
              src={url}
              className="max-h-full max-w-full"
              playsInline
              controls={false}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onError={() =>
                setNotice('This file could not be decoded by the host — it may use a codec this build does not support.')
              }
              onClick={toggle}
            />
          ) : (
            <div className="text-[12px] text-white/55">Loading video…</div>
          )}
        </div>

        <div className="border-t px-4 py-2.5" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-3">
            <button type="button" className="icon-btn" title="Back 5 seconds" aria-label="Back 5 seconds" data-videos-action="rewind" onClick={() => nudge(-5)}>
              <SkipBack size={16} />
            </button>
            <button
              type="button"
              className="icon-btn !h-[32px] !w-[32px]"
              title={playing ? 'Pause' : 'Play'}
              aria-label={playing ? 'Pause' : 'Play'}
              data-videos-action="toggle"
              data-videos-state={playing ? 'playing' : 'paused'}
              style={{ background: 'var(--accent)', color: '#fff' }}
              onClick={toggle}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <button type="button" className="icon-btn" title="Forward" aria-label="Forward" data-videos-action="forward" onClick={() => nudge(5)}>
              <SkipForward size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Rotate"
              aria-label="Rotate"
              data-videos-action="rotate"
              onClick={() => {
                const el = videoRef.current
                if (!el) return
                const current = Number(el.dataset.rot ?? '0')
                const next = (current + 90) % 360
                el.dataset.rot = String(next)
                el.style.transform = `rotate(${next}deg)`
              }}
            >
              <RotateCw size={15} />
            </button>

            <span className="text-[11px] tabular-nums text-faint">{clock(progress)}</span>
            <Slider
              className="flex-1"
              value={progress}
              min={0}
              max={duration > 0 ? duration : 100}
              step={0.1}
              ariaLabel="Seek"
              onChange={(v) => {
                const el = videoRef.current
                if (el) el.currentTime = v
                setPosition(v)
              }}
            />
            <span className="text-[11px] tabular-nums text-faint">{clock(duration)}</span>

            <button
              type="button"
              className="icon-btn"
              title={muted ? 'Unmute' : 'Mute'}
              aria-label="Mute"
              data-videos-action="mute"
              data-active={muted ? 'true' : 'false'}
              onClick={() => setMuted((m) => !m)}
            >
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <Slider className="w-[96px]" value={muted ? 0 : volume} min={0} max={1} step={0.01} ariaLabel="Volume" onChange={(v) => setVolume(v)} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-videos-app data-videos-count={files.length}>
      <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: 'var(--line)' }}>
        <Film size={16} className="text-muted" />
        <div className="text-[13px] font-semibold">Videos</div>
        <div className="text-[11px] text-faint">
          {files.length} {files.length === 1 ? 'file' : 'files'} in {ROOT}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" className="btn !h-[26px] !px-2 text-[12px]" data-videos-action="refresh" onClick={() => void scan()}>
            <RefreshCw size={12} /> Refresh
          </button>
          <button type="button" className="btn !h-[26px] !px-2 text-[12px]" data-videos-action="import" onClick={() => void importFiles()}>
            <Plus size={12} /> Open…
          </button>
        </div>
      </div>

      {!isNative ? (
        <div className="border-b px-4 py-2 text-[11px] leading-snug text-faint" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
          Web preview: reading local video needs the native host. The player, seek bar and fullscreen are fully wired and
          activate as soon as JohnLC AuraOS runs on the desktop.
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading && !files.length ? (
          <div className="grid h-full place-items-center text-[12px] text-muted">Reading {ROOT}…</div>
        ) : files.length ? (
          <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3" data-videos-grid>
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                className="group overflow-hidden rounded-[12px] border text-left"
                style={{ borderColor: 'var(--line)', background: 'var(--surface-1)' }}
                data-videos-file={file.path}
                data-videos-size={file.size}
                onClick={() => void open(file)}
              >
                <span
                  className="relative grid h-[104px] place-items-center text-white"
                  style={{ background: 'linear-gradient(135deg, #1a2233, #2b1b3d)' }}
                >
                  <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-white/12 backdrop-blur">
                    <Play size={15} />
                  </span>
                </span>
                <span className="block px-2.5 py-2">
                  <span className="block truncate text-[12.5px] font-medium">{file.name}</span>
                  <span className="block text-[11px] text-faint">
                    {file.ext.toUpperCase()} · {fileSize(file.size)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid h-full place-items-center p-6">
            <EmptyState
              icon={Film}
              title="No videos"
              hint={`Put video files in ${ROOT} or use Open… (${Array.from(VIDEO_EXT).join(', ')})`}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default VideosApp
