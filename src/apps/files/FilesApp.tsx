import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  Copy,
  Download,
  FileArchive,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Home,
  Image as ImageIcon,
  Info,
  Loader2,
  Music2,
  Pencil,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import type { DirEntry } from '../../../shared/bridge'
import type { AppProps } from '../../core/apps/types'
import { bridge } from '../../core/ipc/bridge'
import { bus, EVT, type AppArgsEvent } from '../../core/bus'
import { contextMenu } from '../../core/contextMenu'
import { quickLook } from '../../core/quickLook'
import { dialogs } from '../../core/dialogs'
import { clipboardHistory } from '../../core/clipboard'
import { EmptyState } from '../../ui/controls'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif'])
const TEXT_EXT = new Set(['txt', 'md', 'json', 'ts', 'tsx', 'js', 'jsx', 'css', 'html', 'csv', 'log', 'yml', 'yaml', 'xml', 'ini', 'gitignore'])
const MEDIA_EXT = new Set(['mp3', 'wav', 'flac', 'mp4', 'mkv', 'mov', 'webm'])

export const TAGS = [
  { id: 'red', color: '#ff5f57', label: 'Red' },
  { id: 'orange', color: '#ff9f43', label: 'Orange' },
  { id: 'yellow', color: '#f5c542', label: 'Yellow' },
  { id: 'green', color: '#2ecf7f', label: 'Green' },
  { id: 'blue', color: '#4f8cff', label: 'Blue' },
  { id: 'purple', color: '#a06bff', label: 'Purple' },
]

interface PaneState {
  path: string
  history: string[]
  index: number
  entries: DirEntry[]
  selected: string | null
  loading: boolean
  error: string | null
}

interface Favorite {
  id: string
  label: string
  path: string
  icon: typeof Home
}

const FAVORITES: Favorite[] = [
  { id: 'home', label: 'Home', path: '~', icon: Home },
  { id: 'desktop', label: 'Desktop', path: '~/Desktop', icon: FolderOpen },
  { id: 'documents', label: 'Documents', path: '~/Documents', icon: FileText },
  { id: 'downloads', label: 'Downloads', path: '~/Downloads', icon: Download },
  { id: 'pictures', label: 'Pictures', path: '~/Pictures', icon: ImageIcon },
  { id: 'music', label: 'Music', path: '~/Music', icon: Music2 },
  { id: 'videos', label: 'Videos', path: '~/Videos', icon: Video },
  { id: 'projects', label: 'Projects', path: '~/Projects', icon: Folder },
]

function makePane(path: string): PaneState {
  return { path, history: [path], index: 0, entries: [], selected: null, loading: true, error: null }
}

function parentOf(path: string): string {
  const clean = path.replace(/\/+$/, '')
  const slash = clean.lastIndexOf('/')
  if (slash < 0) return clean
  if (slash === 0) return '/'
  const up = clean.slice(0, slash)
  return /^[A-Za-z]:$/.test(up) ? `${up}/` : up
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(ms: number): string {
  const d = new Date(ms)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

function entryIcon(entry: DirEntry) {
  if (entry.kind === 'dir') return { icon: Folder, tint: 'var(--accent)' }
  if (IMAGE_EXT.has(entry.ext)) return { icon: ImageIcon, tint: '#2ecf7f' }
  if (MEDIA_EXT.has(entry.ext)) return { icon: Music2, tint: '#a06bff' }
  if (TEXT_EXT.has(entry.ext)) return { icon: FileText, tint: '#4f8cff' }
  return { icon: FileText, tint: 'var(--text-faint)' }
}

/** Right-hand preview inspector: metadata + image/text preview. */
function Inspector({
  entry,
  tags,
  onToggleTag,
  onClose,
  onOpen,
}: {
  entry: DirEntry
  tags: string[]
  onToggleTag: (tagId: string) => void
  onClose: () => void
  onOpen: () => void
}) {
  const [image, setImage] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setImage(null)
    setText(null)
    setError(null)
    setBusy(true)
    const run = async () => {
      try {
        if (entry.kind === 'dir') return
        if (IMAGE_EXT.has(entry.ext)) {
          const data = await bridge.fs.readDataUrl(entry.path)
          if (!cancelled) setImage(data)
        } else if (TEXT_EXT.has(entry.ext)) {
          const content = await bridge.fs.readText(entry.path, 60_000)
          if (!cancelled) setText(content)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [entry.path, entry.ext, entry.kind])

  const { icon: Icon, tint } = entryIcon(entry)

  return (
    <div className="flex w-[264px] shrink-0 flex-col" style={{ borderLeft: '1px solid var(--line)' }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--line)' }}>
        <span className="flex items-center gap-1.5 text-[12px] font-medium">
          <Info size={13} className="text-muted" />
          Preview
        </span>
        <button type="button" className="icon-btn !h-[22px] !w-[22px]" onClick={onClose} aria-label="Close preview">
          <X size={13} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div
          className="grid h-[132px] w-full shrink-0 place-items-center rounded-[12px]"
          style={{ background: 'var(--hover)', border: '1px solid var(--line)' }}
        >
          {image ? (
            <img src={image} alt={entry.name} className="max-h-full max-w-full rounded-[10px] object-contain" />
          ) : busy ? (
            <Loader2 size={20} className="animate-spin text-faint" />
          ) : (
            <Icon size={38} style={{ color: tint }} />
          )}
        </div>

        <div>
          <div className="break-words text-[13px] font-medium">{entry.name}</div>
          <div className="mt-0.5 break-all text-[11px] text-faint">{entry.path}</div>
        </div>

        {error ? <div className="text-[11px]" style={{ color: 'var(--danger)' }}>{error}</div> : null}

        <div className="space-y-1.5 text-[11.5px]">
          <Row label="Kind" value={entry.kind === 'dir' ? 'Folder' : entry.ext ? `${entry.ext.toUpperCase()} file` : 'File'} />
          <Row label="Size" value={entry.kind === 'dir' ? '—' : formatSize(entry.size)} />
          <Row label="Modified" value={formatDate(entry.mtime)} />
        </div>

        <div>
          <div className="section-title !mb-1.5 flex items-center gap-1.5">
            <Tag size={11} /> Tags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((tag) => {
              const active = tags.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  type="button"
                  title={tag.label}
                  aria-label={`Toggle ${tag.label} tag`}
                  className="h-[16px] w-[16px] rounded-full transition-transform hover:scale-110"
                  style={{
                    background: tag.color,
                    boxShadow: active ? '0 0 0 2px var(--panel), 0 0 0 3.5px var(--text-muted)' : 'none',
                    opacity: active ? 1 : 0.55,
                  }}
                  onClick={() => onToggleTag(tag.id)}
                />
              )
            })}
          </div>
        </div>

        {text !== null ? (
          <div>
            <div className="section-title !mb-1.5">Contents</div>
            <pre
              className="mono max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-[10px] p-2 text-[11px] leading-relaxed"
              style={{ background: 'var(--hover)', color: 'var(--text-muted)' }}
            >
              {text}
            </pre>
          </div>
        ) : null}

        <button type="button" className="btn mt-auto justify-center" onClick={onOpen}>
          Open
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-faint">{label}</span>
      <span className="truncate text-right">{value}</span>
    </div>
  )
}

/** One dual-pane browser. */
export function FilesApp({ windowId, args }: AppProps) {
  const initialPath = typeof args.path === 'string' && args.path ? args.path : '~'
  const [panes, setPanes] = useState<PaneState[]>(() => [makePane(initialPath), makePane('~')])
  const [active, setActive] = useState(0)
  const [home, setHome] = useState<string | null>(null)
  const [tagMap, setTagMap] = useState<Record<string, string[]>>({})
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [inspect, setInspect] = useState<DirEntry | null>(null)
  const [query, setQuery] = useState('')
  const saveTagsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** entry-list containers, so keyboard focus can follow a click */
  const listRefs = useRef<Array<HTMLDivElement | null>>([])

  const resolve = useCallback((p: string) => (home ? p.replace(/^~/, home) : p), [home])
  const display = useCallback(
    (p: string) => (home && p.startsWith(home) ? `~${p.slice(home.length)}` : p),
    [home],
  )

  // ---- boot: home dir + persisted tags -------------------------------------
  useEffect(() => {
    void bridge.fs.home().then(setHome).catch(() => setHome(null))
    void bridge.config
      .get<Record<string, string[]>>('files.tags', {})
      .then((map) => setTagMap(map && typeof map === 'object' ? map : {}))
      .catch(() => undefined)
  }, [])

  const persistTags = useCallback((next: Record<string, string[]>) => {
    setTagMap(next)
    if (saveTagsTimer.current) clearTimeout(saveTagsTimer.current)
    saveTagsTimer.current = setTimeout(() => void bridge.config.set('files.tags', next), 300)
  }, [])

  const load = useCallback(
    async (paneIndex: number, path: string, history?: { list: string[]; index: number }) => {
      setPanes((prev) =>
        prev.map((pane, i) => (i === paneIndex ? { ...pane, path, loading: true, error: null } : pane)),
      )
      try {
        const entries = await bridge.fs.list(resolve(path))
        setPanes((prev) =>
          prev.map((pane, i) =>
            i === paneIndex
              ? {
                  ...pane,
                  path,
                  entries,
                  loading: false,
                  error: null,
                  selected: null,
                  history: history ? history.list : [...pane.history.slice(0, pane.index + 1), path],
                  index: history ? history.index : pane.index + 1,
                }
              : pane,
          ),
        )
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        setPanes((prev) =>
          prev.map((pane, i) => (i === paneIndex ? { ...pane, loading: false, entries: [], error: message } : pane)),
        )
      }
    },
    [resolve],
  )

  useEffect(() => {
    if (!home) return
    void load(0, panes[0].path)
    void load(1, panes[1].path)
    // only re-run once home resolves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home])

  // ---- reacting to Spotlight / desktop shortcut arguments -------------------
  useEffect(() => {
    const off = bus.on<AppArgsEvent>(EVT.APP_ARGS, (event) => {
      if (event.windowId !== windowId) return
      const target = typeof event.args.path === 'string' ? event.args.path : null
      if (!target) return
      setActive(0)
      void load(0, target)
    })
    return off
  }, [windowId, load])

  const navigate = (paneIndex: number, path: string) => void load(paneIndex, path)
  const back = (paneIndex: number) => {
    const pane = panes[paneIndex]
    if (pane.index <= 0) return
    const target = pane.history[pane.index - 1]
    void load(paneIndex, target, { list: pane.history, index: pane.index - 1 })
  }
  const forward = (paneIndex: number) => {
    const pane = panes[paneIndex]
    if (pane.index >= pane.history.length - 1) return
    const target = pane.history[pane.index + 1]
    void load(paneIndex, target, { list: pane.history, index: pane.index + 1 })
  }
  const up = (paneIndex: number) => {
    const pane = panes[paneIndex]
    void load(paneIndex, parentOf(pane.path))
  }

  const newFolder = async (paneIndex: number) => {
    const pane = panes[paneIndex]
    const base = resolve(pane.path).replace(/\/+$/, '')
    let name = 'New Folder'
    let n = 1
    const existing = new Set(pane.entries.map((e) => e.name))
    while (existing.has(name)) {
      n += 1
      name = `New Folder ${n}`
    }
    try {
      await bridge.fs.mkdir(`${base}/${name}`)
      bus.emit(EVT.TOAST, { text: `Created ${name}`, kind: 'success' })
      void load(paneIndex, pane.path)
    } catch (e) {
      bus.emit(EVT.TOAST, { text: e instanceof Error ? e.message : 'Could not create folder', kind: 'error' })
    }
  }

  const removeEntry = async (paneIndex: number, entry: DirEntry) => {
    const ok = await dialogs.confirm({
      title: 'Move to Trash',
      message: `Move “${entry.name}” to the trash?`,
      detail: 'Removed items go to the OS trash when one is available, otherwise they are deleted.',
      confirmLabel: 'Move to Trash',
      danger: true,
      icon: Trash2,
    })
    if (!ok) return
    try {
      await bridge.fs.trash(entry.path)
      if (inspect?.path === entry.path) setInspect(null)
      bus.emit(EVT.TOAST, { text: `Moved ${entry.name} to trash`, kind: 'success' })
      void load(paneIndex, panes[paneIndex].path)
    } catch (e) {
      bus.emit(EVT.TOAST, { text: e instanceof Error ? e.message : 'Delete failed', kind: 'error' })
    }
  }

  const removeSelected = async (paneIndex: number) => {
    const pane = panes[paneIndex]
    if (!pane.selected) return
    const target = pane.entries.find((e) => e.path === pane.selected)
    if (!target) return
    await removeEntry(paneIndex, target)
  }

  const renameEntry = async (paneIndex: number, entry: DirEntry) => {
    const next = await dialogs.prompt({
      title: 'Rename',
      message: `Rename “${entry.name}”`,
      defaultValue: entry.name,
      placeholder: 'New name',
      confirmLabel: 'Rename',
      icon: Pencil,
    })
    if (!next || next === entry.name) return
    try {
      await bridge.fs.move(entry.path, `${parentOf(entry.path)}/${next}`)
      bus.emit(EVT.TOAST, { text: `Renamed to ${next}`, kind: 'success' })
      void load(paneIndex, panes[paneIndex].path)
    } catch (e) {
      bus.emit(EVT.TOAST, { text: e instanceof Error ? e.message : 'Rename failed', kind: 'error' })
    }
  }

  const copyPath = async (path: string) => {
    try {
      await bridge.clipboard.writeText(path)
      clipboardHistory.noteWrite(path)
      bus.emit(EVT.TOAST, { text: 'Path copied to clipboard', kind: 'success' })
    } catch {
      bus.emit(EVT.TOAST, { text: 'Could not copy the path', kind: 'error' })
    }
  }

  const compressEntry = async (paneIndex: number, entry: DirEntry) => {
    const dest = `${parentOf(entry.path)}/${entry.name.replace(/[\\/]+$/, '')}.zip`
    bus.emit(EVT.TOAST, { text: `Compressing ${entry.name}…` })
    const res = await bridge.fs.zip([entry.path], dest)
    bus.emit(
      EVT.TOAST,
      res.ok ? { text: `Created ${dest.split('/').pop()}`, kind: 'success' } : { text: res.error ?? 'Compression failed', kind: 'error' },
    )
    void load(paneIndex, panes[paneIndex].path)
  }

  const extractEntry = async (paneIndex: number, entry: DirEntry) => {
    const dest = `${parentOf(entry.path)}/${entry.name.replace(/\.zip$/i, '')}`
    bus.emit(EVT.TOAST, { text: `Extracting ${entry.name}…` })
    const res = await bridge.fs.unzip(entry.path, dest)
    bus.emit(
      EVT.TOAST,
      res.ok ? { text: `Extracted to ${dest.split('/').pop()}`, kind: 'success' } : { text: res.error ?? 'Extraction failed', kind: 'error' },
    )
    void load(paneIndex, panes[paneIndex].path)
  }

  const openEntry = (paneIndex: number, entry: DirEntry) => {
    if (entry.kind === 'dir') {
      navigate(paneIndex, entry.path)
      return
    }
    setInspect(entry)
  }

  /** Select + act on an entry (shared by right-click and keyboard). */
  const selectEntry = (paneIndex: number, entry: DirEntry) => {
    setActive(paneIndex)
    setPanes((prev) => prev.map((p, i) => (i === paneIndex ? { ...p, selected: entry.path } : p)))
    if (entry.kind === 'file') setInspect(entry)
    // keep keyboard focus on the list so Space / Enter / Delete keep working
    listRefs.current[paneIndex]?.focus()
  }

  const entryMenu = (paneIndex: number, entry: DirEntry, x: number, y: number) => {
    selectEntry(paneIndex, entry)
    const isZip = /\.zip$/i.test(entry.name)
    contextMenu.open(
      [
        { label: entry.kind === 'dir' ? 'Open Folder' : 'Open With Default App', onSelect: () => openEntry(paneIndex, entry) },
        { label: 'Quick Look', shortcut: 'Space', onSelect: () => quickLook.open(entry.path) },
        { separator: true },
        { label: 'Open in System Viewer', disabled: entry.kind === 'dir', onSelect: () => void bridge.fs.openWith(entry.path).catch(() => undefined) },
        { label: 'Reveal in File Manager', onSelect: () => void bridge.fs.reveal(entry.path) },
        { separator: true },
        { label: 'Rename…', icon: Pencil, onSelect: () => void renameEntry(paneIndex, entry) },
        { label: 'Copy Path', icon: Copy, onSelect: () => void copyPath(entry.path) },
        { separator: true },
        { label: 'Compress to ZIP', icon: FileArchive, onSelect: () => void compressEntry(paneIndex, entry) },
        ...(isZip ? [{ label: 'Extract Here', icon: FileArchive, onSelect: () => void extractEntry(paneIndex, entry) }] : []),
        { separator: true },
        { label: 'Move to Trash', icon: Trash2, danger: true, onSelect: () => void removeEntry(paneIndex, entry) },
      ],
      { x, y },
      entry.name,
    )
  }

  const toggleTag = (path: string, tagId: string) => {
    const current = tagMap[path] ?? []
    const next = current.includes(tagId) ? current.filter((t) => t !== tagId) : [...current, tagId]
    const map = { ...tagMap }
    if (next.length) map[path] = next
    else delete map[path]
    persistTags(map)
  }

  const onKeyDown = (e: RKeyboardEvent<HTMLDivElement>, paneIndex: number) => {
    const pane = panes[paneIndex]
    if (e.key === 'Enter' && pane.selected) {
      const entry = pane.entries.find((x) => x.path === pane.selected)
      if (entry) openEntry(paneIndex, entry)
    } else if (e.key === ' ') {
      if (pane.selected) {
        e.preventDefault()
        quickLook.toggle(pane.selected)
      }
    } else if (e.key === 'Backspace') {
      e.preventDefault()
      if (pane.path !== '~' && pane.path !== '/') up(paneIndex)
    } else if (e.key === 'Delete') {
      e.preventDefault()
      void removeSelected(paneIndex)
    } else if (e.key === 'F2' && pane.selected) {
      e.preventDefault()
      const entry = pane.entries.find((x) => x.path === pane.selected)
      if (entry) void renameEntry(paneIndex, entry)
    }
  }

  /** Right-click on empty space: folder-level actions. */
  const backgroundMenu = (paneIndex: number, x: number, y: number) => {
    setActive(paneIndex)
    contextMenu.open(
      [
        { label: 'New Folder', icon: FolderPlus, onSelect: () => void newFolder(paneIndex) },
        { separator: true },
        { label: 'Reveal in File Manager', onSelect: () => void bridge.fs.reveal(resolve(panes[paneIndex].path)) },
        { label: 'Copy Folder Path', icon: Copy, onSelect: () => void copyPath(resolve(panes[paneIndex].path)) },
        { separator: true },
        { label: 'Refresh', icon: RefreshCw, onSelect: () => void load(paneIndex, panes[paneIndex].path) },
      ],
      { x, y },
    )
  }

  const visibleEntries = useMemo(() => {
    const pane = panes[active]
    let list = pane.entries
    if (filterTag) list = list.filter((e) => (tagMap[e.path] ?? []).includes(filterTag))
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((e) => e.name.toLowerCase().includes(q))
    }
    return list
  }, [panes, active, filterTag, tagMap, query])

  const activePane = panes[active]

  return (
    <div className="flex h-full w-full min-h-0">
      {/* sidebar */}
      <div className="sidebar">
        <div className="side-title !pt-0">Favourites</div>
        {FAVORITES.map((fav) => {
          const Icon = fav.icon
          const isActive = display(activePane.path) === fav.path
          return (
            <button
              key={fav.id}
              type="button"
              className="side-item"
              data-active={isActive ? 'true' : 'false'}
              onClick={() => navigate(active, fav.path)}
            >
              <Icon size={15} />
              <span className="truncate">{fav.label}</span>
            </button>
          )
        })}

        <div className="side-title">Tags</div>
        {TAGS.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className="side-item"
            data-active={filterTag === tag.id ? 'true' : 'false'}
            onClick={() => setFilterTag(filterTag === tag.id ? null : tag.id)}
          >
            <span className="h-[10px] w-[10px] rounded-full" style={{ background: tag.color }} />
            <span className="truncate">{tag.label}</span>
          </button>
        ))}
        {filterTag ? (
          <button type="button" className="side-item !text-faint" onClick={() => setFilterTag(null)}>
            <X size={13} />
            Clear filter
          </button>
        ) : null}

        <div className="side-title">This system</div>
        <button type="button" className="side-item" onClick={() => navigate(active, '~')}>
          <HardDrive size={15} />
          <span className="truncate">AuraOS Disk</span>
        </button>
      </div>

      {/* panes */}
      <div className="flex min-w-0 flex-1">
        {panes.map((pane, paneIndex) => {
          const isActive = paneIndex === active
          const entries = isActive ? visibleEntries : pane.entries
          return (
            <div
              key={paneIndex}
              className="flex min-w-0 flex-1 flex-col"
              style={{
                borderRight: paneIndex === 0 ? '1px solid var(--line)' : undefined,
                background: isActive ? 'rgb(var(--accent-rgb) / 0.05)' : 'transparent',
              }}
              onPointerDown={() => setActive(paneIndex)}
            >
              {/* pane toolbar */}
              <div className="flex items-center gap-1 px-2 py-1.5" style={{ borderBottom: '1px solid var(--line)' }}>
                <button
                  type="button"
                  className="icon-btn !h-[24px] !w-[24px]"
                  disabled={pane.index <= 0}
                  data-disabled={pane.index <= 0 ? 'true' : undefined}
                  onClick={() => back(paneIndex)}
                  title="Back"
                >
                  <ArrowLeft size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn !h-[24px] !w-[24px]"
                  disabled={pane.index >= pane.history.length - 1}
                  data-disabled={pane.index >= pane.history.length - 1 ? 'true' : undefined}
                  onClick={() => forward(paneIndex)}
                  title="Forward"
                >
                  <ArrowRight size={14} />
                </button>
                <button type="button" className="icon-btn !h-[24px] !w-[24px]" onClick={() => up(paneIndex)} title="Enclosing folder">
                  <ArrowUp size={14} />
                </button>
                <button type="button" className="icon-btn !h-[24px] !w-[24px]" onClick={() => void load(paneIndex, pane.path)} title="Refresh">
                  <RefreshCw size={13} />
                </button>
                <button type="button" className="icon-btn !h-[24px] !w-[24px]" onClick={() => void newFolder(paneIndex)} title="New folder">
                  <FolderPlus size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn !h-[24px] !w-[24px]"
                  onClick={() => void removeSelected(paneIndex)}
                  title="Delete"
                  disabled={!pane.selected}
                  data-disabled={!pane.selected ? 'true' : undefined}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* breadcrumb + search */}
              <div className="flex items-center gap-2 px-2 py-1.5" style={{ borderBottom: '1px solid var(--line)' }}>
                <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-[12px]">
                  {display(pane.path)
                    .split('/')
                    .filter((seg, i, arr) => seg.length > 0 || i === 0)
                    .map((seg, i, arr) => {
                      const target = arr.slice(0, i + 1).join('/') || '/'
                      return (
                        <span key={`${seg}-${i}`} className="flex min-w-0 items-center gap-0.5">
                          {i > 0 ? <ChevronRight size={11} className="shrink-0 text-faint" /> : null}
                          <button
                            type="button"
                            className="truncate rounded px-1 py-0.5 hover:bg-[var(--hover)]"
                            onClick={() => navigate(paneIndex, target)}
                          >
                            {seg || 'AuraOS'}
                          </button>
                        </span>
                      )
                    })}
                </div>
                {isActive ? (
                  <div className="relative w-[130px] shrink-0">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
                    <input
                      className="field !h-[24px] !pl-7 text-[11.5px]"
                      placeholder="Filter"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                ) : null}
              </div>

              {/* entries */}
              <div
                className="min-h-0 flex-1 overflow-y-auto p-1.5"
                tabIndex={0}
                ref={(el) => {
                  listRefs.current[paneIndex] = el
                }}
                onKeyDown={(e) => onKeyDown(e, paneIndex)}
                onPointerDown={() => setActive(paneIndex)}
                onContextMenu={(e) => {
                  if (e.target !== e.currentTarget) return
                  e.preventDefault()
                  backgroundMenu(paneIndex, e.clientX, e.clientY)
                }}
              >
                {pane.loading ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 size={18} className="animate-spin text-faint" />
                  </div>
                ) : pane.error ? (
                  <EmptyState icon={Folder} title="Cannot open this location" hint={pane.error} />
                ) : entries.length === 0 ? (
                  <EmptyState
                    icon={Folder}
                    title={filterTag || query ? 'No matching items' : 'This folder is empty'}
                    hint={filterTag || query ? 'Try clearing the filter' : 'Drag files here in a future release'}
                  />
                ) : (
                  entries.map((entry) => {
                    const { icon: Icon, tint } = entryIcon(entry)
                    const isSelected = pane.selected === entry.path
                    const entryTags = tagMap[entry.path] ?? []
                    return (
                      <div
                        key={entry.path}
                        className="list-row"
                        data-selected={isSelected ? 'true' : 'false'}
                        onClick={() => selectEntry(paneIndex, entry)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          entryMenu(paneIndex, entry, e.clientX, e.clientY)
                        }}
                        onDoubleClick={() => openEntry(paneIndex, entry)}
                      >
                        <Icon size={16} style={{ color: tint }} className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-[12.5px]">{entry.name}</span>
                        {entryTags.length ? (
                          <span className="flex shrink-0 items-center gap-1">
                            {entryTags.map((tagId) => {
                              const tag = TAGS.find((t) => t.id === tagId)
                              return tag ? (
                                <span key={tagId} className="h-[7px] w-[7px] rounded-full" style={{ background: tag.color }} />
                              ) : null
                            })}
                          </span>
                        ) : null}
                        <span className="w-[74px] shrink-0 text-right text-[11px] text-faint">
                          {entry.kind === 'dir' ? '—' : formatSize(entry.size)}
                        </span>
                        <span className="hidden w-[112px] shrink-0 text-right text-[11px] text-faint xl:block">
                          {formatDate(entry.mtime)}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>

              {/* status bar */}
              <div
                className="flex items-center justify-between px-3 py-1 text-[11px] text-faint"
                style={{ borderTop: '1px solid var(--line)' }}
              >
                <span>{entries.length} items</span>
                <span className="truncate">{pane.selected ? pane.selected.split('/').pop() : ''}</span>
              </div>
            </div>
          )
        })}
      </div>

      {inspect ? (
        <Inspector
          entry={inspect}
          tags={tagMap[inspect.path] ?? []}
          onToggleTag={(tagId) => toggleTag(inspect.path, tagId)}
          onClose={() => setInspect(null)}
          onOpen={() => {
            if (inspect.kind === 'dir') navigate(active, inspect.path)
          }}
        />
      ) : null}
    </div>
  )
}

export default FilesApp
