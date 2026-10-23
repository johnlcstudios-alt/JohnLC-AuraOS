import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ListMusic,
  Music,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { AppProps } from '../../core/apps/types'
import type { DirEntry } from '../../../shared/bridge'
import { bridge, isNative } from '../../core/ipc/bridge'
import { useMedia } from '../../core/hooks'
import { MEDIA_STATIONS, media, type MediaTrack } from '../../core/media'
import { notify } from '../../core/notifications'
import { EmptyState, Slider } from '../../ui/controls'

const MUSIC_DIR = '~/Music'
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'])

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Music — a real player over the shared `media` engine.
 *
 * The generated "stations" are synthesised at play time from a chord recipe
 * (see `renderAmbientLoop`), so they work on both the native host and the web
 * preview. Files in `~/Music` are streamed through `bridge.fs.readMediaUrl`,
 * which the browser mock honestly reports as unavailable.
 */
export function MusicApp({ args }: AppProps) {
  const snapshot = useMedia()
  const [folder, setFolder] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState<Record<string, boolean>>({})

  const resolvedRef = useRef<Record<string, string | null>>({})

  useEffect(() => {
    let cancelled = false
    void bridge.fs
      .list(MUSIC_DIR)
      .then((entries) => {
        if (!cancelled) setFolder(entries.filter((e) => e.kind === 'file' && AUDIO_EXT.has(e.ext.toLowerCase())))
      })
      .catch(() => {
        if (!cancelled) setFolder([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const stationTracks = useMemo(() => MEDIA_STATIONS, [])

  const playStation = (i: number) => {
    media.setQueue(stationTracks, i)
    void media.play()
  }

  const playFiles = async (entries: DirEntry[], startIndex = 0) => {
    const tracks: MediaTrack[] = []
    const missing: string[] = []
    for (const entry of entries) {
      const key = entry.path
      let url = resolvedRef.current[key]
      if (url === undefined) {
        url = await bridge.fs.readMediaUrl(key).catch(() => null)
        resolvedRef.current[key] = url
      }
      if (!url) {
        missing.push(basename(key))
        continue
      }
      tracks.push({
        id: `file:${key}`,
        title: basename(key),
        artist: 'Music folder',
        src: url,
        duration: 0,
        tint: ['#4f8cff', '#a06bff'],
      })
    }
    if (missing.length) {
      setUnavailable((prev) => {
        const next = { ...prev }
        for (const name of missing) next[name] = true
        return next
      })
      notify({
        title: missing.length === 1 ? 'Cannot play this file' : `${missing.length} files skipped`,
        body: isNative
          ? 'Unsupported format or larger than the in-memory limit.'
          : 'Reading local audio needs the native host — the generated stations play everywhere.',
        kind: 'info',
        appId: 'music',
        banner: false,
      })
    }
    if (!tracks.length) return
    const wantedId = `file:${entries[Math.min(startIndex, entries.length - 1)]?.path ?? ''}`
    const at = tracks.findIndex((t) => t.id === wantedId)
    media.setQueue(tracks, at >= 0 ? at : 0)
    void media.play()
  }

  const importFiles = async () => {
    const picked = await bridge.dialog
      .openFile({
        title: 'Add music',
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'] }],
      })
      .catch(() => null)
    if (!picked || !picked.length) return
    const pseudo: DirEntry[] = picked.map((path) => ({
      name: basename(path),
      path,
      kind: 'file',
      size: 0,
      mtime: Date.now(),
      ext: (path.split('.').pop() ?? '').toLowerCase(),
    }))
    await playFiles(pseudo)
  }

  // ---- intents ---------------------------------------------------------
  useEffect(() => {
    if (args.intent === 'radio') playStation(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = snapshot.current
  const libraryCount = stationTracks.length + folder.length
  const progress = snapshot.duration > 0 ? Math.min(snapshot.position, snapshot.duration) : snapshot.position

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-music-app
      data-music-count={libraryCount}
      data-music-playing={snapshot.playing ? 'true' : 'false'}
      data-music-audio={snapshot.audioAvailable ? 'ok' : 'unavailable'}
      data-music-title={current?.title ?? ''}
      data-music-position={snapshot.position.toFixed(2)}
      data-music-duration={snapshot.duration.toFixed(2)}
      data-music-repeat={snapshot.repeat}
      data-music-shuffle={snapshot.shuffle ? 'true' : 'false'}
    >
      <div className="flex min-h-0 flex-1">
        <div className="sidebar flex w-[196px] shrink-0 flex-col p-2">
          <div className="section-title">Stations</div>
          <div className="px-2 pb-2 text-[11px] leading-snug text-faint">
            Synthesised on this device — no downloads.
          </div>
          <div className="section-title mt-1">Music folder</div>
          <div className="flex items-center justify-between px-2">
            <span className="truncate text-[11.5px] text-muted">{MUSIC_DIR}</span>
            <span className="text-[11px] text-faint">{folder.length}</span>
          </div>
          <button type="button" className="btn mt-2 !h-[26px] !px-2 text-[12px]" data-music-action="import" onClick={() => void importFiles()}>
            <Plus size={12} /> Add files…
          </button>
          {!isNative ? (
            <div className="mt-2 rounded-[8px] px-2 py-1.5 text-[10.5px] leading-snug text-faint" style={{ background: 'var(--surface-2)' }}>
              Web preview: reading files needs the native host. Stations play everywhere.
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
            <span
              className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[10px] text-white"
              style={{ background: `linear-gradient(135deg, ${current?.tint?.[0] ?? '#4f8cff'}, ${current?.tint?.[1] ?? '#a06bff'})` }}
            >
              {snapshot.playing ? <MediaBars /> : <Music size={20} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold" data-music-now>
                {current?.title ?? 'Nothing playing'}
              </div>
              <div className="truncate text-[11.5px] text-muted">{current?.artist ?? 'Pick a station or a file to begin'}</div>
            </div>
            {current && !snapshot.audioAvailable ? (
              <span className="rounded-full px-2 py-[3px] text-[10.5px] text-warn" style={{ background: 'var(--surface-2)' }}>
                audio unavailable in this host
              </span>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3" data-music-library>
            <div className="section-title !mb-1">Stations</div>
            <div className="card !p-1">
              {stationTracks.map((track, i) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  active={current?.id === track.id}
                  playing={snapshot.playing && current?.id === track.id}
                  onPlay={() => playStation(i)}
                  hook="station"
                />
              ))}
            </div>

            <div className="section-title !mb-1 mt-4">Music folder</div>
            {loading ? (
              <div className="px-2 py-3 text-[12px] text-muted">Reading {MUSIC_DIR}…</div>
            ) : folder.length ? (
              <div className="card !p-1">
                {folder.map((entry, i) => (
                  <TrackRow
                    key={entry.path}
                    track={{ id: `file:${entry.path}`, title: entry.name, artist: 'Music folder', duration: 0 }}
                    active={current?.id === `file:${entry.path}`}
                    playing={snapshot.playing && current?.id === `file:${entry.path}`}
                    onPlay={() => void playFiles(folder, i)}
                    hook="file"
                    path={entry.path}
                    note={unavailable[entry.name] ? 'unavailable' : undefined}
                  />
                ))}
              </div>
            ) : (
              <div className="grid place-items-center py-6">
                <EmptyState icon={ListMusic} title="No audio files" hint={`Copy songs into ${MUSIC_DIR} or use Add files…`} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t px-4 py-2.5" style={{ borderColor: 'var(--line)' }} data-music-transport>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="icon-btn"
            title="Shuffle"
            aria-label="Shuffle"
            data-music-action="shuffle"
            data-active={snapshot.shuffle ? 'true' : 'false'}
            onClick={() => media.toggleShuffle()}
          >
            <Shuffle size={15} />
          </button>
          <button type="button" className="icon-btn" title="Previous" aria-label="Previous" data-music-action="prev" onClick={() => media.prev()}>
            <SkipBack size={17} />
          </button>
          <button
            type="button"
            className="icon-btn !h-[34px] !w-[34px]"
            title={snapshot.playing ? 'Pause' : 'Play'}
            aria-label={snapshot.playing ? 'Pause' : 'Play'}
            data-music-action="toggle"
            data-music-state={snapshot.playing ? 'playing' : 'paused'}
            style={{ background: 'var(--accent)', color: '#fff' }}
            onClick={() => {
              if (!snapshot.current && stationTracks.length) playStation(0)
              else if (snapshot.playing) media.pause()
              else void media.play()
            }}
          >
            {snapshot.playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button type="button" className="icon-btn" title="Next" aria-label="Next" data-music-action="next" onClick={() => media.next()}>
            <SkipForward size={17} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title={`Repeat: ${snapshot.repeat}`}
            aria-label="Repeat"
            data-music-action="repeat"
            data-active={snapshot.repeat !== 'off' ? 'true' : 'false'}
            onClick={() => media.cycleRepeat()}
          >
            <Repeat size={15} />
          </button>

          <span className="text-[11px] tabular-nums text-faint">{clock(progress)}</span>
          <Slider
            className="flex-1"
            value={progress}
            min={0}
            max={snapshot.duration > 0 ? snapshot.duration : 100}
            step={0.5}
            ariaLabel="Seek"
            onChange={(v) => media.seek(v)}
          />
          <span className="text-[11px] tabular-nums text-faint">{clock(snapshot.duration)}</span>

          <button
            type="button"
            className="icon-btn"
            title={snapshot.muted ? 'Unmute' : 'Mute'}
            aria-label="Mute"
            data-music-action="mute"
            data-active={snapshot.muted ? 'true' : 'false'}
            onClick={() => media.toggleMuted()}
          >
            {snapshot.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <Slider className="w-[96px]" value={snapshot.muted ? 0 : snapshot.volume} min={0} max={1} step={0.01} ariaLabel="Volume" onChange={(v) => media.setVolume(v)} />
        </div>
      </div>
    </div>
  )
}

function TrackRow({
  track,
  active,
  playing,
  onPlay,
  hook,
  path,
  note,
}: {
  track: MediaTrack
  active: boolean
  playing: boolean
  onPlay: () => void
  hook: 'station' | 'file'
  path?: string
  note?: string
}) {
  return (
    <div
      className="list-row flex items-center gap-3"
      data-selected={active ? 'true' : 'false'}
      data-music-track={track.id}
      {...(hook === 'station' ? { 'data-music-station': track.id } : {})}
      {...(path ? { 'data-music-file': path } : {})}
    >
      <span
        className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] text-white"
        style={{ background: `linear-gradient(135deg, ${track.tint?.[0] ?? '#4f8cff'}, ${track.tint?.[1] ?? '#a06bff'})` }}
      >
        {hook === 'station' ? <Radio size={14} /> : <Music size={14} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium">{track.title}</div>
        <div className="truncate text-[11px] text-faint">
          {track.artist}
          {track.duration ? ` · ${clock(track.duration)}` : ''}
          {note ? ' · unavailable here' : ''}
        </div>
      </div>
      <button
        type="button"
        className="icon-btn !h-[26px] !w-[26px]"
        title={playing ? 'Pause' : 'Play'}
        aria-label={playing ? 'Pause' : 'Play'}
        data-music-play={track.id}
        data-active={playing ? 'true' : 'false'}
        onClick={() => (playing ? media.pause() : onPlay())}
      >
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
    </div>
  )
}

/** Tiny equaliser bars used while a track is playing. */
function MediaBars() {
  return (
    <span className="flex items-end gap-[3px]">
      {[8, 15, 11].map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-white"
          style={{ height: h, animation: `music-bar 900ms ease-in-out ${i * 140}ms infinite alternate` }}
        />
      ))}
    </span>
  )
}

export default MusicApp
