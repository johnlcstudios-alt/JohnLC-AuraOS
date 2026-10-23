import {
  AppWindow,
  Calculator,
  Download,
  FileArchive,
  FileText,
  FileQuestion,
  Folder,
  FolderOpen,
  Globe,
  Home,
  Image as ImageIcon,
  Music2,
  Terminal,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { appList, launchApp } from '../apps/registry'
import { SETTINGS_SECTIONS } from '../../apps/settings/sections'
import { actions } from '../actions'
import { evaluate } from '../calc'
import { bridge } from '../ipc/bridge'
import type { DirEntry } from '../../../shared/bridge'

export type SearchGroup =
  | 'Calculate'
  | 'Applications'
  | 'Files'
  | 'Commands'
  | 'Settings'
  | 'Web'
  | 'Places'

export interface SearchResult {
  id: string
  title: string
  subtitle: string
  group: SearchGroup
  icon: LucideIcon
  tint?: [string, string]
  score: number
  /** absolute path that Space can Quick Look */
  previewPath?: string
  run: () => void | Promise<void>
}

/**
 * Fuzzy matcher: exact > prefix > substring > subsequence, with a streak bonus
 * so "tm" ranks "Task Manager" above "System Settings".
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  if (!q) return 0
  if (t === q) return 1000
  if (t.startsWith(q)) return 820 - t.length * 0.5
  const idx = t.indexOf(q)
  if (idx >= 0) return 620 - idx * 3 - t.length * 0.2

  let ti = 0
  let score = 0
  let streak = 0
  let last = -2
  for (const ch of q) {
    let found = -1
    for (let i = ti; i < t.length; i += 1) {
      if (t[i] === ch) {
        found = i
        break
      }
    }
    if (found < 0) return null
    streak = found === last + 1 ? streak + 1 : 0
    score += 12 + streak * 9 - Math.min(found, 24)
    last = found
    ti = found + 1
  }
  return Math.max(2, score)
}

interface Place {
  id: string
  title: string
  path: string
  icon: LucideIcon
  keywords: string[]
}

const PLACES: Place[] = [
  { id: 'home', title: 'Home', path: '~', icon: Home, keywords: ['home', 'folder', 'user'] },
  { id: 'desktop', title: 'Desktop', path: '~/Desktop', icon: FolderOpen, keywords: ['desktop'] },
  { id: 'documents', title: 'Documents', path: '~/Documents', icon: FileText, keywords: ['documents', 'docs'] },
  { id: 'downloads', title: 'Downloads', path: '~/Downloads', icon: Download, keywords: ['downloads'] },
  { id: 'pictures', title: 'Pictures', path: '~/Pictures', icon: ImageIcon, keywords: ['pictures', 'photos', 'images'] },
  { id: 'music', title: 'Music', path: '~/Music', icon: Music2, keywords: ['music', 'audio'] },
  { id: 'projects', title: 'Projects', path: '~/Projects', icon: Folder, keywords: ['projects', 'code', 'repos'] },
]

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif', 'ico', 'heic'])
const VIDEO_EXT = new Set(['mp4', 'mkv', 'mov', 'webm', 'avi'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'])
const ARCHIVE_EXT = new Set(['zip', 'tar', 'gz', '7z', 'rar', 'bz2', 'xz'])
const CODE_EXT = new Set(['ts', 'tsx', 'js', 'jsx', 'css', 'html', 'json', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'sh', 'ps1', 'yml', 'yaml', 'toml'])
const TEXT_EXT = new Set(['txt', 'md', 'csv', 'log', 'ini', 'xml'])

export function iconForEntry(entry: Pick<DirEntry, 'kind' | 'ext'>): { icon: LucideIcon; tint: string } {
  if (entry.kind === 'dir') return { icon: Folder, tint: 'var(--accent)' }
  const ext = entry.ext
  if (IMAGE_EXT.has(ext)) return { icon: ImageIcon, tint: '#2ecf7f' }
  if (VIDEO_EXT.has(ext)) return { icon: Video, tint: '#ff7a7a' }
  if (AUDIO_EXT.has(ext)) return { icon: Music2, tint: '#a06bff' }
  if (ARCHIVE_EXT.has(ext)) return { icon: FileArchive, tint: '#f5c542' }
  if (CODE_EXT.has(ext)) return { icon: Terminal, tint: '#4f8cff' }
  if (TEXT_EXT.has(ext)) return { icon: FileText, tint: '#4f8cff' }
  return { icon: FileQuestion, tint: 'var(--text-faint)' }
}

function parentOf(path: string): string {
  const clean = path.replace(/\/+$/, '')
  const slash = clean.lastIndexOf('/')
  if (slash <= 0) return clean
  const up = clean.slice(0, slash)
  return /^[A-Za-z]:$/.test(up) ? `${up}/` : up
}

/** Commands whose titles are not useful to surface in search. */
const HIDDEN_COMMANDS = new Set(['app.quit', 'spotlight.open', 'commandPalette.open'])

function commandResults(q: string): SearchResult[] {
  const out: SearchResult[] = []
  for (const def of actions.all()) {
    if (HIDDEN_COMMANDS.has(def.id)) continue
    let score = fuzzyScore(q, def.title)
    for (const kw of def.keywords ?? []) {
      const kwScore = fuzzyScore(q, kw)
      if (kwScore !== null) score = Math.max(score ?? kwScore, kwScore - 35)
    }
    if (score !== null && score > 0) {
      out.push({
        id: `cmd-${def.id}`,
        title: def.title,
        subtitle: def.subtitle ?? `${def.category} command`,
        group: 'Commands',
        icon: def.icon ?? AppWindow,
        score: score + 12,
        run: () => actions.run(def.id),
      })
    }
  }
  return out
}

const WEB_RESULT_ID = 'web-search'

function webResult(q: string): SearchResult {
  return {
    id: WEB_RESULT_ID,
    title: `Search the web for “${q}”`,
    subtitle: 'Open in your default browser',
    group: 'Web',
    icon: Globe,
    score: 1,
    run: () => void bridge.app.openExternal(`https://duckduckgo.com/?q=${encodeURIComponent(q)}`).catch(() => undefined),
  }
}

function calcResult(q: string): SearchResult | null {
  const calc = evaluate(q)
  if (!calc) return null
  return {
    id: 'calc',
    title: calc.display,
    subtitle: `${calc.expression} = ${calc.display} · copy result`,
    group: 'Calculate',
    icon: Calculator,
    score: 100_000,
    run: async () => {
      await bridge.clipboard.writeText(calc.display)
      const { clipboardHistory } = await import('../clipboard')
      clipboardHistory.noteWrite(calc.display)
    },
  }
}

/**
 * Synchronous universal search: apps, registered commands, settings panes,
 * places, an inline calculator and a web-search fallback.
 * File results come from the async `searchFiles`.
 */
export function searchEverything(query: string, limit = 12): SearchResult[] {
  const q = query.trim()
  if (!q) return []

  const results: SearchResult[] = []

  const calc = calcResult(q)
  if (calc) results.push(calc)

  for (const app of appList()) {
    let score = fuzzyScore(q, app.name)
    for (const kw of app.keywords) {
      const kwScore = fuzzyScore(q, kw)
      if (kwScore !== null) score = Math.max(score ?? kwScore, kwScore - 40)
    }
    if (score !== null && score > 0) {
      results.push({
        id: `app-${app.id}`,
        title: app.name,
        subtitle: app.subtitle,
        group: 'Applications',
        icon: app.icon,
        tint: app.tint,
        score: score + 60,
        run: () => {
          launchApp(app.id)
        },
      })
    }
  }

  results.push(...commandResults(q))

  for (const section of SETTINGS_SECTIONS) {
    let score = fuzzyScore(q, section.name)
    for (const kw of section.keywords) {
      const kwScore = fuzzyScore(q, kw)
      if (kwScore !== null) score = Math.max(score ?? kwScore, kwScore - 30)
    }
    if (score !== null && score > 0) {
      results.push({
        id: `setting-${section.id}`,
        title: section.name,
        subtitle: 'Settings',
        group: 'Settings',
        icon: section.icon,
        score,
        run: () => {
          launchApp('settings', { section: section.id })
        },
      })
    }
  }

  for (const place of PLACES) {
    let score = fuzzyScore(q, place.title)
    for (const kw of place.keywords) {
      const kwScore = fuzzyScore(q, kw)
      if (kwScore !== null) score = Math.max(score ?? kwScore, kwScore - 25)
    }
    if (score !== null && score > 0) {
      results.push({
        id: `place-${place.id}`,
        title: place.title,
        subtitle: place.path,
        group: 'Places',
        icon: place.icon,
        score,
        run: () => {
          launchApp('files', { path: place.path })
        },
      })
    }
  }

  results.push(webResult(q))

  return orderResults(results).slice(0, limit)
}

/** The display/nav order of the result groups. */
export const GROUP_ORDER: SearchGroup[] = [
  'Calculate',
  'Applications',
  'Files',
  'Commands',
  'Settings',
  'Web',
  'Places',
]

/** Sort by group (per GROUP_ORDER) then score, so sections read top-down. */
export function orderResults(list: SearchResult[]): SearchResult[] {
  return [...list].sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group)
    const gb = GROUP_ORDER.indexOf(b.group)
    if (ga !== gb) return ga - gb
    return b.score - a.score
  })
}

/**
 * Asynchronous filename search across the home directory. Best-effort: any
 * bridge error resolves to an empty list rather than breaking Spotlight.
 */
export async function searchFiles(query: string, max = 6): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  try {
    const home = await bridge.fs.home()
    const entries = await bridge.fs.search(home, q, { maxResults: max, maxDepth: 5, includeDirs: true })
    return entries.slice(0, max).map((entry) => {
      const { icon } = iconForEntry(entry)
      return {
        id: `file-${entry.path}`,
        title: entry.name,
        subtitle: parentOf(entry.path),
        group: 'Files' as const,
        icon,
        score: 0,
        previewPath: entry.path,
        run: () => {
          launchApp('files', { path: entry.kind === 'dir' ? entry.path : parentOf(entry.path) })
        },
      }
    })
  } catch {
    return []
  }
}

export { parentOf }
