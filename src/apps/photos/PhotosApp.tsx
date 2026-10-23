import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Heart,
  Image as ImageIcon,
  Images,
  RotateCw,
  Trash2,
  Upload,
  Wallpaper,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { AppProps } from '../../core/apps/types'
import type { DirEntry } from '../../../shared/bridge'
import { bridge, isNative } from '../../core/ipc/bridge'
import { notify } from '../../core/notifications'
import { theme } from '../../core/theme/ThemeEngine'
import { EmptyState } from '../../ui/controls'

const CONFIG_KEY = 'photos.favourites'
const ROOT = '~/Pictures'
const SAVE_DEBOUNCE = 400
const MAX_ALBUMS = 12
const THUMB_WORKERS = 4
/** How many previews are decoded at a time — protects large real libraries. */
const THUMB_BATCH = 120
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg'])

interface Album {
  name: string
  path: string
  files: DirEntry[]
}

function isImage(entry: DirEntry): boolean {
  return entry.kind === 'file' && IMAGE_EXT.has(entry.ext.toLowerCase())
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/**
 * Photos — a gallery over `~/Pictures`.
 *
 * Thumbnails arrive through `bridge.fs.readDataUrl` (real images on the native
 * host; the browser mock paints deterministic SVG previews). The viewer offers
 * zoom, rotate, previous/next, favourites, "set as wallpaper" and trash.
 */
export function PhotosApp({ args }: AppProps) {
  const [files, setFiles] = useState<DirEntry[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [view, setView] = useState('all')
  const [loading, setLoading] = useState(true)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [favourites, setFavourites] = useState<string[]>([])
  const [index, setIndex] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rotate, setRotate] = useState(0)
  const [previewCap, setPreviewCap] = useState(THUMB_BATCH)

  const favRef = useRef<string[]>([])
  favRef.current = favourites
  const loadedRef = useRef(false)
  const saveTimer = useRef<number | null>(null)

  // ---- library scan ----------------------------------------------------
  const scan = useCallback(async () => {
    setLoading(true)
    try {
      const top = await bridge.fs.list(ROOT)
      const images = top.filter(isImage).sort((a, b) => b.mtime - a.mtime)
      const dirs = top.filter((e) => e.kind === 'dir').slice(0, MAX_ALBUMS)
      const found: Album[] = []
      for (const dir of dirs) {
        try {
          const sub = await bridge.fs.list(dir.path)
          const subImages = sub.filter(isImage).sort((a, b) => b.mtime - a.mtime)
          if (subImages.length) found.push({ name: dir.name, path: dir.path, files: subImages })
        } catch {
          /* unreadable folder — skip it */
        }
      }
      setFiles(images)
      setAlbums(found)
    } catch (err) {
      setFiles([])
      setAlbums([])
      notify({
        title: 'Could not read Pictures',
        body: err instanceof Error ? err.message : 'Unknown error',
        kind: 'warn',
        appId: 'photos',
        banner: false,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void scan()
  }, [scan])

  const visible = useMemo(() => {
    if (view === 'favourites') return files.filter((f) => favourites.includes(f.path))
    if (view === 'all') return files
    return albums.find((a) => a.path === view)?.files ?? []
  }, [view, files, favourites, albums])

  // ---- thumbnail queue (bounded concurrency + bounded batch) ------------
  const thumbKey = useMemo(
    () =>
      visible
        .slice(0, previewCap)
        .map((f) => f.path)
        .join('|'),
    [visible, previewCap],
  )
  useEffect(() => {
    let cancelled = false
    const pending = thumbKey ? thumbKey.split('|') : []
    let cursor = 0
    const worker = async () => {
      while (!cancelled) {
        const next = cursor
        cursor += 1
        if (next >= pending.length) return
        const path = pending[next]
        let url: string | null = null
        try {
          url = await bridge.fs.readDataUrl(path)
        } catch {
          url = null
        }
        if (cancelled || !url) continue
        const resolved = url
        setThumbs((prev) => (prev[path] ? prev : { ...prev, [path]: resolved }))
      }
    }
    void Promise.all(Array.from({ length: THUMB_WORKERS }, () => worker()))
    return () => {
      cancelled = true
    }
  }, [thumbKey])

  // ---- favourites (persisted) ------------------------------------------
  useEffect(() => {
    let cancelled = false
    void bridge.config
      .get<string[] | null>(CONFIG_KEY, null)
      .then((stored) => {
        if (!cancelled && Array.isArray(stored)) setFavourites(stored.filter((p) => typeof p === 'string'))
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) loadedRef.current = true
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
    void bridge.config.set(CONFIG_KEY, favRef.current).catch(() => undefined)
  }, [])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      flush()
    }, SAVE_DEBOUNCE)
  }, [flush])

  const toggleFavourite = useCallback(
    (path: string) => {
      setFavourites((prev) => {
        const next = prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
        favRef.current = next
        return next
      })
      scheduleSave()
    },
    [scheduleSave],
  )

  useEffect(() => () => flush(), [flush])

  // ---- actions ---------------------------------------------------------
  const importPhoto = useCallback(async () => {
    const picked = await bridge.fs.pickImage().catch(() => null)
    if (!picked) {
      if (!isNative) {
        notify({
          title: 'Native host needed',
          body: 'The web preview ships its own sample pictures instead.',
          kind: 'info',
          appId: 'photos',
          banner: false,
        })
      }
      return
    }
    const dest = `${ROOT}/${basename(picked)}`
    try {
      await bridge.fs.copy(picked, dest)
      await scan()
      notify({ title: 'Imported', body: basename(picked), kind: 'success', appId: 'photos', banner: false })
    } catch (err) {
      notify({
        title: 'Import failed',
        body: err instanceof Error ? err.message : 'Unknown error',
        kind: 'error',
        appId: 'photos',
      })
    }
  }, [scan])

  const setAsWallpaper = useCallback(async (path: string) => {
    try {
      await theme.setCustomWallpaper(path)
      notify({ title: 'Wallpaper updated', body: basename(path), kind: 'success', appId: 'photos', banner: false })
    } catch (err) {
      notify({
        title: 'Could not set wallpaper',
        body: err instanceof Error ? err.message : 'Unknown error',
        kind: 'error',
        appId: 'photos',
      })
    }
  }, [])

  const removePhoto = useCallback(
    async (path: string) => {
      try {
        await bridge.fs.trash(path)
      } catch {
        await bridge.fs.remove(path).catch(() => undefined)
      }
      setFiles((prev) => prev.filter((f) => f.path !== path))
      setAlbums((prev) => prev.map((a) => ({ ...a, files: a.files.filter((f) => f.path !== path) })))
      if (favRef.current.includes(path)) {
        const next = favRef.current.filter((p) => p !== path)
        favRef.current = next
        setFavourites(next)
        scheduleSave()
      }
      setIndex(null)
      notify({ title: 'Moved to Trash', body: basename(path), kind: 'info', appId: 'photos', banner: false })
    },
    [scheduleSave],
  )

  // ---- viewer ----------------------------------------------------------
  const openAt = (i: number) => {
    setIndex(i)
    setZoom(1)
    setRotate(0)
  }

  const step = useCallback(
    (delta: number) => {
      setIndex((current) => {
        if (current === null || !visible.length) return current
        return (current + delta + visible.length) % visible.length
      })
      setZoom(1)
      setRotate(0)
    },
    [visible.length],
  )

  const current = index !== null ? visible[index] ?? null : null
  const currentPath = current?.path ?? null

  useEffect(() => {
    if (!currentPath || thumbs[currentPath]) return
    let cancelled = false
    void bridge.fs
      .readDataUrl(currentPath)
      .catch(() => null)
      .then((url) => {
        if (!cancelled && url) setThumbs((prev) => (prev[currentPath] ? prev : { ...prev, [currentPath]: url }))
      })
    return () => {
      cancelled = true
    }
  }, [currentPath, thumbs])

  useEffect(() => {
    if (index === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIndex(null)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(8, z * 1.25))
      else if (e.key === '-') setZoom((z) => Math.max(0.25, z / 1.25))
      else if (e.key.toLowerCase() === 'r') setRotate((r) => (r + 90) % 360)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, step])

  // ---- intents ---------------------------------------------------------
  useEffect(() => {
    if (args.intent === 'favourites') setView('favourites')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const viewTitle = view === 'all' ? 'All Photos' : view === 'favourites' ? 'Favourites' : basename(view)
  const favCount = files.filter((f) => favourites.includes(f.path)).length
  const isFav = current ? favourites.includes(current.path) : false

  return (
    <div className="relative flex h-full min-h-0" data-photos-app data-photos-count={visible.length}>
      <div className="sidebar flex w-[188px] shrink-0 flex-col p-2">
        <div className="section-title">Library</div>
        <button type="button" className="side-item" data-active={view === 'all'} data-photos-album="all" onClick={() => setView('all')}>
          <Images size={15} />
          <span className="truncate">All Photos</span>
          <span className="ml-auto text-[11px] text-faint">{files.length}</span>
        </button>
        <button
          type="button"
          className="side-item"
          data-active={view === 'favourites'}
          data-photos-album="favourites"
          onClick={() => setView('favourites')}
        >
          <Heart size={15} />
          <span className="truncate">Favourites</span>
          <span className="ml-auto text-[11px] text-faint">{favCount}</span>
        </button>
        <div className="section-title mt-2">Folders</div>
        {albums.map((album) => (
          <button
            key={album.path}
            type="button"
            className="side-item"
            data-active={view === album.path}
            data-photos-album={album.name}
            onClick={() => setView(album.path)}
          >
            <FolderOpen size={15} />
            <span className="truncate">{album.name}</span>
            <span className="ml-auto text-[11px] text-faint">{album.files.length}</span>
          </button>
        ))}
        {!albums.length && !loading ? <div className="px-2 py-1 text-[11px] text-faint">No sub-folders</div> : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-2" style={{ borderColor: 'var(--line)' }}>
          <div className="text-[13px] font-semibold">{viewTitle}</div>
          <div className="text-[11px] text-faint">
            {visible.length} {visible.length === 1 ? 'item' : 'items'}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" className="btn !h-[26px] !px-2 text-[12px]" data-photos-action="refresh" onClick={() => void scan()}>
              <RotateCw size={12} /> Refresh
            </button>
            <button type="button" className="btn !h-[26px] !px-2 text-[12px]" data-photos-action="import" onClick={() => void importPhoto()}>
              <Upload size={12} /> Import
            </button>
          </div>
        </div>

        {loading && !visible.length ? (
          <div className="grid flex-1 place-items-center text-[12px] text-muted">Reading {ROOT}…</div>
        ) : visible.length ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div
              className="grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-2"
              data-photos-grid
            >
              {visible.map((file, i) => (
                <button
                  key={file.path}
                  type="button"
                  className="relative aspect-square overflow-hidden rounded-[10px] border transition-transform hover:scale-[1.02]"
                  style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}
                  data-photos-thumb={file.path}
                  title={`${basename(file.path)} · ${fileSize(file.size)}`}
                  onClick={() => openAt(i)}
                >
                  {thumbs[file.path] ? (
                    <img src={thumbs[file.path]} alt={basename(file.path)} className="h-full w-full object-cover" draggable={false} />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-muted">
                      <ImageIcon size={20} />
                    </span>
                  )}
                  {favourites.includes(file.path) ? (
                    <Heart size={13} className="absolute right-1.5 top-1.5 drop-shadow" style={{ color: '#fff' }} fill="currentColor" />
                  ) : null}
                </button>
              ))}
            </div>
            {visible.length > previewCap ? (
              <div className="flex items-center justify-center py-4">
                <button
                  type="button"
                  className="btn !h-[28px] !px-3 text-[12px]"
                  data-photos-action="more-previews"
                  onClick={() => setPreviewCap((c) => c + THUMB_BATCH)}
                >
                  Load {Math.min(THUMB_BATCH, visible.length - previewCap)} more previews
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid flex-1 place-items-center p-6">
            <EmptyState
              icon={ImageIcon}
              title={view === 'favourites' ? 'No favourites yet' : 'No photos here'}
              hint={
                view === 'favourites'
                  ? 'Open a photo and tap the heart to keep it close.'
                  : `Put pictures in ${ROOT} or use Import.`
              }
            />
          </div>
        )}
      </div>

      {current ? (
        <div
          className="absolute inset-0 z-[27000] flex flex-col"
          style={{ background: 'rgba(6,8,14,0.93)' }}
          data-photos-viewer
          data-photos-index={index ?? 0}
          data-photos-zoom={zoom.toFixed(2)}
          data-photos-rotate={rotate}
          data-photos-fav={isFav ? 'true' : 'false'}
        >
          <div className="flex items-center gap-1.5 px-3 py-2 text-white">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{basename(current.path)}</div>
              <div className="truncate text-[11px] text-white/55">
                {(index ?? 0) + 1} of {visible.length} · {fileSize(current.size)}
              </div>
            </div>
            <button
              type="button"
              className="icon-btn !text-white/85"
              title="Zoom out"
              aria-label="Zoom out"
              data-photos-action="zoom-out"
              onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}
            >
              <ZoomOut size={15} />
            </button>
            <button
              type="button"
              className="icon-btn !text-white/85"
              title="Zoom in"
              aria-label="Zoom in"
              data-photos-action="zoom-in"
              onClick={() => setZoom((z) => Math.min(8, z * 1.25))}
            >
              <ZoomIn size={15} />
            </button>
            <button
              type="button"
              className="icon-btn !text-white/85"
              title="Rotate"
              aria-label="Rotate"
              data-photos-action="rotate"
              onClick={() => setRotate((r) => (r + 90) % 360)}
            >
              <RotateCw size={15} />
            </button>
            <button
              type="button"
              className="icon-btn !text-white/85"
              title="Favourite"
              aria-label="Favourite"
              data-photos-action="favourite"
              data-active={isFav ? 'true' : 'false'}
              onClick={() => toggleFavourite(current.path)}
            >
              <Heart size={15} style={isFav ? { color: 'var(--warn)' } : undefined} fill={isFav ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              className="icon-btn !text-white/85"
              title="Set as wallpaper"
              aria-label="Set as wallpaper"
              data-photos-action="wallpaper"
              onClick={() => void setAsWallpaper(current.path)}
            >
              <Wallpaper size={15} />
            </button>
            <button
              type="button"
              className="icon-btn !text-white/85 hover:!text-[var(--danger)]"
              title="Move to Trash"
              aria-label="Move to Trash"
              data-photos-action="delete"
              onClick={() => void removePhoto(current.path)}
            >
              <Trash2 size={15} />
            </button>
            <button
              type="button"
              className="icon-btn !text-white/85"
              title="Close"
              aria-label="Close viewer"
              data-photos-action="close"
              onClick={() => setIndex(null)}
            >
              <X size={16} />
            </button>
          </div>

          <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden px-14">
            <button
              type="button"
              className="icon-btn !absolute !left-3 !top-1/2 !-translate-y-1/2 !text-white/85"
              title="Previous"
              aria-label="Previous photo"
              data-photos-action="prev"
              onClick={() => step(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            {thumbs[current.path] ? (
              <img
                src={thumbs[current.path]}
                alt={basename(current.path)}
                className="max-h-full max-w-full select-none object-contain transition-transform duration-150"
                style={{ transform: `scale(${zoom}) rotate(${rotate}deg)` }}
                draggable={false}
              />
            ) : (
              <div className="text-[12px] text-white/60">Loading preview…</div>
            )}
            <button
              type="button"
              className="icon-btn !absolute !right-3 !top-1/2 !-translate-y-1/2 !text-white/85"
              title="Next"
              aria-label="Next photo"
              data-photos-action="next"
              onClick={() => step(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="flex items-center justify-center gap-3 py-2 text-[11px] text-white/60">
            <span data-photos-zoom-label>{Math.round(zoom * 100)}%</span>
            {rotate ? <span>{rotate}°</span> : null}
            <span>{fileSize(current.size)}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default PhotosApp
